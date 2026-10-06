import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createFrameController } from "../packages/runtime/src/browser/motion/motion-frame.js";
import { temporary } from "./helpers.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";

test("frame completion rejects stale paints, changed participants, detached roots and hung renderers", async () => {
  const root = { isConnected: true };
  let time;
  const controller = createFrameController({
    seek: (t) => (time = t),
    root: () => root,
  });
  let release;
  const undo = controller.register("delayed", async (ctx) => {
    await new Promise((r) => (release = r));
    ctx.commit(() => (time = 99));
  });
  const first = controller.begin(0);
  const pending = controller.complete(first);
  const second = controller.begin(0.2);
  release();
  await assert.rejects(pending, /superseded|Stale/);
  assert.equal(time, 0.2);
  undo();
  assert.throws(() => controller.verify(second), /Stale/);
  controller.register("hung", () => new Promise(() => {}));
  const hung = controller.begin(0.3);
  await assert.rejects(
    controller.complete(hung, { timeoutMs: 20 }),
    /did not complete/,
  );
  root.isConnected = false;
  assert.throws(() => controller.verify(controller.begin(0.4)), /detached/);
  controller.dispose();
  assert.throws(() => controller.begin(1), /Invalid/);
});

async function fixture(t, body) {
  const dir = await temporary(t);
  const animations = fileURLToPath(
    new URL(
      "../packages/runtime/src/browser/motion/animations.jsx",
      import.meta.url,
    ),
  );
  await fs.writeFile(
    path.join(dir, "main.jsx"),
    `import React from 'react';import {createRoot} from 'react-dom/client';import {Stage,useFrameRenderer,useTime,VideoSprite} from ${JSON.stringify(animations)};${body}createRoot(document.getElementById('root')).render(<Stage width={160} height={120} duration={.4} autoplay={false}><Artwork/></Stage>);`,
  );
  await bundle(path.join(dir, "main.jsx"), path.join(dir, "app.js"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    '<!doctype html><html lang="en"><head><meta name="codex-fixed-sheet" content="off"><title>Async frame</title></head><body><div id="root"></div><script src="app.js"></script></body></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  return { dir, url, server };
}

test("real Stage export awaits async canvas and a required image introduced after a seek", async (t) => {
  const { dir, url, server } = await fixture(
    t,
    `function Artwork(){const time=useTime(),ref=React.useRef();useFrameRenderer(async ctx=>{await new Promise(r=>setTimeout(r,100));ctx.commit(()=>{const c=ref.current.getContext('2d');c.fillStyle=ctx.time<.2?'red':'blue';c.fillRect(0,0,160,120);});},{id:'canvas'});return <><canvas ref={ref} width={160} height={120}/>{time>=.2&&<img srcSet='/late.svg 1x' style={{position:'absolute',left:0,top:0,width:20,height:20}}/>}</>;}`,
  );
  const handler = server.listeners("request")[0];
  server.removeAllListeners("request");
  server.on("request", (req, res) => {
    if (req.url === "/late.svg")
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "image/svg+xml" });
        res.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="lime"/></svg>',
        );
      }, 250);
    else handler(req, res);
  });
  const output = path.join(dir, "async.mp4");
  const progress = [];
  const result = await exportArtifact("video", url, output, {
    fps: 5,
    deviceScaleFactor: 1,
    audio: "none",
    onProgress: (p) => progress.push(p),
  });
  assert.equal(result.frames, 2);
  assert.ok(result.diagnostics.phases.seekAndRenderMs >= 200);
  assert.deepEqual(
    progress.filter((p) => p.phase === "capture").map((p) => p.frame),
    [1, 2],
  );
  const pixels = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    output,
    "-vf",
    "format=rgb24,crop=1:1:80:60",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  assert.equal(pixels.length, 6);
  assert.ok(pixels[0] > pixels[2] + 100);
  assert.ok(pixels[5] > pixels[3] + 100);
  const corner = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    output,
    "-vf",
    "format=rgb24,crop=1:1:5:5",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  assert.ok(
    corner[4] > corner[3] + 100 && corner[4] > corner[5] + 100,
    "Late image decoded in the second frame",
  );
});

test("hung frame completion and cancellation publish no output and clean temporary files", async (t) => {
  const { dir, url } = await fixture(
    t,
    `function Artwork(){useFrameRenderer(()=>new Promise(()=>{}),{id:'hung'});return <div/>;}`,
  );
  await assert.rejects(
    exportArtifact("video", url, path.join(dir, "hung.mp4"), {
      fps: 5,
      deviceScaleFactor: 1,
      audio: "none",
      frameTimeoutMs: 30,
    }),
    /did not complete/,
  );
  const abort = new AbortController();
  setTimeout(() => abort.abort(new Error("User cancelled")), 300);
  await assert.rejects(
    exportArtifact("video", url, path.join(dir, "cancel.mp4"), {
      signal: abort.signal,
      fps: 5,
      deviceScaleFactor: 1,
      audio: "none",
    }),
  );
  assert.deepEqual((await fs.readdir(dir)).sort(), [
    "app.js",
    "index.html",
    "main.jsx",
  ]);
});

test("paused preview redraws changed props and rejects a delayed paint from the previous source", async (t) => {
  const { dir, url } = await fixture(
    t,
    `function Artwork(){const ref=React.useRef(),[color,setColor]=React.useState('red');window.changeColor=setColor;useFrameRenderer(async ctx=>{if(color==='red')await new Promise(r=>window.releaseRed=r);ctx.commit(()=>{const c=ref.current.getContext('2d');c.fillStyle=color;c.fillRect(0,0,160,120);});},{id:'preview-source'});return <canvas ref={ref} width={160} height={120}/>;}`,
  );
  const { withPage } = await import("../packages/media/src/lib/browser.mjs");
  await withPage(url, async (page) => {
    await page.waitForFunction(() => window.releaseRed);
    await page.evaluate(() => window.changeColor("blue"));
    await page.waitForFunction(
      () =>
        document
          .querySelector("canvas")
          .getContext("2d")
          .getImageData(80, 60, 1, 1).data[2] === 255,
    );
    await page.evaluate(async () => {
      window.releaseRed();
      await new Promise((r) => setTimeout(r, 30));
    });
    assert.deepEqual(
      await page.evaluate(() => [
        ...document
          .querySelector("canvas")
          .getContext("2d")
          .getImageData(80, 60, 1, 1).data,
      ]),
      [0, 0, 255, 255],
    );
  });
});

test("fast PNG capture matches standard decoded pixels and preserves supersampling", async (t) => {
  const { dir, url } = await fixture(
    t,
    `function Artwork(){const ref=React.useRef();useFrameRenderer(ctx=>ctx.commit(()=>{const c=ref.current.getContext('2d');c.fillStyle=ctx.time<.2?'red':'blue';c.fillRect(0,0,160,120);c.fillStyle='white';c.fillRect(11,13,37,29);}),{id:'fast-art'});return <canvas ref={ref} width={160} height={120}/>;}`,
  );
  const results = [];
  for (const [captureMethod, deviceScaleFactor] of [
    ["standard", 1],
    ["fast", 1],
    ["standard", 2],
    ["fast", 2],
  ]) {
    const output = path.join(dir, `${captureMethod}-${deviceScaleFactor}.mp4`);
    const result = await exportArtifact("video", url, output, {
      captureMethod,
      deviceScaleFactor,
      fps: 5,
      audio: "none",
    });
    results.push({
      result,
      pixels: execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        output,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ]),
    });
  }
  assert.deepEqual(results[1].pixels, results[0].pixels);
  assert.equal(results[1].result.captureMethod, "fast");
  assert.deepEqual(results[3].pixels, results[2].pixels);
  assert.equal(results[3].result.captureMethod, "fast");
  assert.equal(
    results[3].result.flags.some((f) => f.kind === "fast_capture_fallback"),
    false,
  );
});

test("fast capture retains paused nested video surface frames", async (t) => {
  const { dir, url } = await fixture(
    t,
    `function Artwork(){return <VideoSprite src="/clip.mp4" start={0} end={.4} style={{position:'absolute',inset:0,width:160,height:120}}/>;}`,
  );
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=160x120:r=5:d=0.2",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=160x120:r=5:d=0.2",
    "-filter_complex",
    "[0:v][1:v]concat=n=2:v=1:a=0",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    path.join(dir, "clip.mp4"),
  ]);
  const pixels = [];
  for (const captureMethod of ["standard", "fast"]) {
    const output = path.join(dir, `nested-${captureMethod}.mp4`);
    await exportArtifact("video", url, output, {
      captureMethod,
      deviceScaleFactor: 1,
      fps: 5,
      audio: "none",
    });
    pixels.push(
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        output,
        "-vf",
        "format=rgb24,crop=1:1:80:60",
        "-f",
        "rawvideo",
        "pipe:1",
      ]),
    );
  }
  assert.deepEqual(pixels[1], pixels[0]);
  assert.equal(pixels[1].length, 6);
  assert.ok(pixels[1][0] > pixels[1][2] + 100);
  assert.ok(pixels[1][5] > pixels[1][3] + 100);
});
