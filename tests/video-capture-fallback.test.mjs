import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary } from "./helpers.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";

async function capture(t, active, fallbackOptions = true) {
  const dir = await temporary(t);
  const source = `<!doctype html><html lang="en"><head><meta name="codex-fixed-sheet" content="off"><title>Capture framing fallback</title><style>
    html{background:cyan}body{margin:${active ? "16px" : "0"};width:${active ? "120px" : "240px"};height:${active ? "88px" : "200px"};background:magenta}
    .legacy-parent{display:flex;align-items:center;justify-content:center;overflow:hidden;width:${active ? "120px" : "240px"};height:${active ? "88px" : "200px"}}
    .legacy-art{position:relative;flex-shrink:0;width:80px${active ? "" : "!important"};height:40px${active ? "" : "!important"};transform:scale(.5)${active ? "" : "!important"};box-shadow:inset 0 0 0 8px black${active ? "" : "!important"}}
    #paint{position:absolute;inset:0 32px 0 0;background:red;${active ? "" : "transition:background-color 60s"}}
    .export-chrome{position:fixed;top:0;left:0;width:24px;height:24px;background:yellow;display:block!important}
    </style></head><body><div class="legacy-parent"><div class="legacy-art" data-export-reset><div id="paint"></div></div></div><div class="export-chrome"></div><script>
    window.legacyClock={width:160,height:120,duration:.4,captureActive:${active},setPlaying(){},setTime(t){document.querySelector(".legacy-parent").innerHTML='<div class="legacy-art" data-export-reset><div id="paint"></div></div>';document.getElementById("paint").style.backgroundColor=t<.2?"red":"blue";}};
    </script></body></html>`;
  const input = path.join(dir, "index.html");
  await fs.writeFile(input, source);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const output = path.join(dir, active ? "active.mp4" : "fallback.mp4");
  const result = await exportArtifact("video", url, output, {
    bridgeGlobal: "legacyClock",
    fps: 5,
    deviceScaleFactor: 1,
    audio: "none",
    ...(fallbackOptions
      ? {
          hideSelectors: [".export-chrome"],
          resetTransformSelector: ".legacy-art[data-export-reset]",
        }
      : {}),
  });
  assert.equal(result.frames, 2);
  assert.equal(result.width, 160);
  assert.equal(result.height, 120);
  assert.equal(await fs.readFile(input, "utf8"), source);
  const bytes = execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    output,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  assert.equal(bytes.length, 160 * 120 * 3 * 2);
  const pixel = (frame, x, y) => [
    ...bytes.subarray(
      (frame * 160 * 120 + y * 160 + x) * 3,
      (frame * 160 * 120 + y * 160 + x) * 3 + 3,
    ),
  ];
  if (process.env.CODEX_CAPTURE_VIDEO_FALLBACK) {
    const root = process.env.CODEX_CAPTURE_VIDEO_FALLBACK;
    await fs.mkdir(root, { recursive: true });
    const name = active
      ? fallbackOptions
        ? "active"
        : "active-default"
      : "fallback";
    await fs.copyFile(output, path.join(root, name + ".mp4"));
    await fs.copyFile(input, path.join(root, name + ".html"));
    await fs.writeFile(
      path.join(root, name + ".json"),
      JSON.stringify(
        {
          result,
          samples: Array.from({ length: 2 }, (_, frame) => ({
            frame,
            origin: pixel(frame, 8, 8),
            farPaint: pixel(frame, 120, 60),
            gap: pixel(frame, 144, 60),
            shadow: pixel(frame, 154, 60),
            activePaint: pixel(frame, 64, 60),
            outside: pixel(frame, 42, 46),
            root: pixel(frame, 8, 80),
            activeShadow: pixel(frame, 94, 60),
          })),
        },
        null,
        2,
      ),
    );
  }
  return { pixel, result };
}
const red = (p) => p[0] > 200 && p[1] < 30 && p[2] < 30;
const blue = (p) => p[2] > 200 && p[0] < 30 && p[1] < 30;
const white = (p) => p.every((value) => value > 225);

test("inactive capture fallback restores custom selector sizing, top-left framing, hidden chrome, shadows, backgrounds and nontransitioning encoded frames", async (t) => {
  const { pixel, result } = await capture(t, false);
  for (const [frame, color] of [
    [0, red],
    [1, blue],
  ]) {
    assert.ok(
      color(pixel(frame, 8, 8)),
      `Frame ${frame} starts at the top-left without chrome: ${pixel(frame, 8, 8)}`,
    );
    assert.ok(
      color(pixel(frame, 120, 60)),
      `Frame ${frame} fills the requested dimensions without a transition: ${pixel(frame, 120, 60)}`,
    );
    assert.ok(
      white(pixel(frame, 144, 60)),
      "Transparent artwork retains the cleared page background",
    );
    assert.ok(
      white(pixel(frame, 154, 60)),
      "The authored inset shadow is removed",
    );
  }
  assert.ok(!result.flags.some((flag) => flag.kind === "capture_mode_off"));
});

test("an active capture bridge preserves authored layout and ignores configured framing fallback", async (t) => {
  for (const fallbackOptions of [true, false]) {
    const { pixel, result } = await capture(t, true, fallbackOptions);
    for (const [frame, color] of [
      [0, red],
      [1, blue],
    ]) {
      assert.ok(
        color(pixel(frame, 64, 60)),
        "The authored scaled art retains its position",
      );
      const chrome = pixel(frame, 8, 8),
        outside = pixel(frame, 42, 46),
        root = pixel(frame, 8, 80),
        shadow = pixel(frame, 94, 60);
      assert.ok(
        chrome[0] > 200 && chrome[1] > 200 && chrome[2] < 30,
        "Configured chrome remains visible",
      );
      assert.ok(
        outside[0] > 200 && outside[1] < 30 && outside[2] > 200,
        "Authored body margin and background remain",
      );
      assert.ok(
        root[0] < 30 && root[1] > 200 && root[2] > 200,
        "The authored root background remains",
      );
      assert.ok(
        shadow.every((value) => value < 30),
        "The authored shadow remains",
      );
    }
    assert.ok(!result.flags.some((flag) => flag.kind === "capture_mode_off"));
  }
});
