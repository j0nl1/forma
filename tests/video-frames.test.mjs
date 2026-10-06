import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary } from "./helpers.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";

test("encoded nested videos present visible entries and held source frames", async (t) => {
  const dir = await temporary(t);
  // Concurrent retained surfaces make the paused-video submission race frequent.
  // Each hidden blue frame is followed by an entry that must decode and paint red.
  const columns = 6,
    rows = 5,
    frames = 120,
    fps = 60;
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=160x100:r=10:d=0.5",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=160x100:r=10:d=0.5",
    "-filter_complex",
    "[0:v][1:v]concat=n=2:v=1:a=0",
    "-c:v",
    "libx264",
    "-g",
    "1",
    "-pix_fmt",
    "yuv420p",
    path.join(dir, "clip.mp4"),
  ]);
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html>
    <html lang="en"><style>
    html,body{margin:0;background:white}
    main{display:grid;grid-template-columns:repeat(${columns},80px)}
    video{width:80px;height:80px;object-fit:cover}
    </style><main>${Array.from(
      { length: columns * rows },
      () =>
        '<div><video src="clip.mp4" muted preload="auto" data-codex-video-target="0"></video></div>',
    ).join("")}</main><script>
    const videos = [...document.querySelectorAll("video")];
    const held = new URLSearchParams(location.search).has("held");
    window.codexTimeline = {
      duration: ${frames / fps}, width: ${columns * 80}, height: ${rows * 80}, captureActive: true,
      seek(time) {
        const visible = held || Math.round(time * ${fps}) % 2 === 1;
        for (const video of videos) {
          video.parentElement.style.visibility = visible ? "visible" : "hidden";
          const target = visible ? (held ? .06 : 0) : .9;
          video.dataset.codexVideoTarget = target;
          if (video.readyState >= 2 && Math.abs(video.currentTime - target) > .001)
            video.currentTime = target;
        }
      }
    };
    </script></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const held of [false, true]) {
    // 60ms remains inside the source's first 100ms frame. It must also finish
    // when repeated seeks do not produce another video-frame callback.
    const output = path.join(dir, held ? "held.mp4" : "entries.mp4");
    const expectedFrames = held ? 8 : frames;
    const result = await exportArtifact(
      "video",
      url + (held ? "?held" : ""),
      output,
      {
        fps: held ? 10 : fps,
        ...(held ? { endMs: 800 } : {}),
        deviceScaleFactor: 1,
        audio: "none",
      },
    );
    assert.equal(result.frames, expectedFrames);
    const pixels = execFileSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      output,
      "-vf",
      `scale=${columns}:${rows}:flags=neighbor,format=rgb24`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ]);
    assert.equal(pixels.length, expectedFrames * columns * rows * 3);
    const stale = [];
    for (
      let frame = held ? 0 : 1;
      frame < expectedFrames;
      frame += held ? 1 : 2
    ) {
      for (let tile = 0; tile < columns * rows; tile++) {
        const offset = (frame * columns * rows + tile) * 3;
        if (pixels[offset] <= pixels[offset + 2] + 100)
          stale.push({
            frame,
            tile,
            rgb: [...pixels.subarray(offset, offset + 3)],
          });
      }
    }
    assert.equal(
      stale.length,
      0,
      `Every ${held ? "held frame" : "visible entry"} must use decoded red; ${stale.length} stale tiles, first: ${JSON.stringify(stale.slice(0, 3))}`,
    );
  }
});
