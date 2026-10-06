import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary } from "./helpers.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";

test("delayed timeline bridge initialization retains final metadata and actual seeked MP4 frames", async (t) => {
  const dir = await temporary(t);
  await fs.writeFile(
    path.join(dir, "index.html"),
    '<!doctype html><html lang="en"><head><meta name="codex-fixed-sheet" content="off"><title>Delayed timeline bridge</title></head><body style="margin:0;background:gray"><script>window.delayedClock={duration:0,width:2,height:2};setTimeout(()=>{window.delayedClock={duration:0.4,width:160,height:120,setPlaying(){},setTime(t){document.body.style.background=t<0.2?"red":"blue";}};},1000);</script></body></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const output = path.join(dir, "delayed.mp4");
  const result = await exportArtifact("video", url, output, {
    bridgeGlobal: "delayedClock",
    fps: 5,
    deviceScaleFactor: 1,
    audio: "none",
  });
  assert.equal(result.width, 160);
  assert.equal(result.height, 120);
  assert.equal(result.duration, 0.4);
  assert.equal(result.frames, 2);
  const pixels = [
    ...execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      output,
      "-vf",
      "format=rgb24,crop=1:1:80:60",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ]),
  ];
  assert.equal(pixels.length, 6);
  assert.ok(pixels[0] > pixels[2] + 100, "The first actual frame is red");
  assert.ok(pixels[5] > pixels[3] + 100, "The second actual frame is blue");
});

test("missing timeline bridge fails after a finite readiness deadline with a named actionable error and no output", async (t) => {
  const dir = await temporary(t);
  await fs.writeFile(
    path.join(dir, "index.html"),
    '<!doctype html><html lang="en"><head><meta name="codex-fixed-sheet" content="off"><title>Missing timeline bridge</title></head><body>No timeline bridge</body></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const output = path.join(dir, "missing.mp4");
  const started = performance.now();
  await assert.rejects(
    exportArtifact("video", url, output, {
      bridgeGlobal: "missingClock",
      audio: "none",
    }),
    /window\.missingClock.*8 seconds.*seek\(\).*setTime\(\)/,
  );
  assert.ok(
    performance.now() - started >= 8000,
    "Initialization gets its full readiness window",
  );
  assert.deepEqual((await fs.readdir(dir)).sort(), ["index.html"]);
});
