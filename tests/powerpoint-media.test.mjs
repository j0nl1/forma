import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { temporary, root } from "./helpers.mjs";
import { unzipSync, strFromU8 } from "fflate";
import { serve } from "../skills/studio-design/scripts/preview.mjs";
import { exportArtifact } from "../skills/studio-design/scripts/export.mjs";
import { withPage } from "../skills/studio-design/scripts/lib/browser.mjs";
import {
  pptxMediaSettings,
  preparePptxPlayback,
} from "../skills/studio-design/scripts/lib/pptx-media-playback.mjs";

const run = promisify(execFile);
const base = {
  src: "http://127.0.0.1/clip.mp4",
  mediaType: "video",
  currentTime: 0,
  playbackRate: 1,
  preservesPitch: true,
  volume: 1,
  loop: false,
  muted: false,
  duration: 2,
};
const ffmpeg = (args) =>
  run(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-threads", "1", ...args],
    { encoding: "buffer", maxBuffer: 16 * 1024 * 1024, timeout: 30000 },
  );
async function clip(t) {
  const dir = await temporary(t),
    file = path.join(dir, "source.mp4");
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=96x64:r=20:d=1",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=96x64:r=20:d=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=48000:duration=1",
    "-filter_complex_threads",
    "1",
    "-filter_complex",
    "[0:v][1:v]concat=n=2:v=1:a=0[v];[2:a][3:a]concat=n=2:v=0:a=1[a]",
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    file,
  ]);
  return { dir, file, bytes: await fs.readFile(file) };
}
async function audio(file, start = null, duration = null) {
  const { stdout } = await ffmpeg([
    "-i",
    file,
    ...(start == null ? [] : ["-ss", String(start)]),
    ...(duration == null ? [] : ["-t", String(duration)]),
    "-vn",
    "-ac",
    "1",
    "-ar",
    "48000",
    "-f",
    "f32le",
    "pipe:1",
  ]);
  const samples = Array.from({ length: stdout.length / 4 }, (_, i) =>
    stdout.readFloatLE(i * 4),
  );
  const middle = samples.slice(2400, -2400);
  let crossings = 0;
  for (let i = 1; i < middle.length; i++)
    if (middle[i - 1] <= 0 && middle[i] > 0) crossings++;
  return {
    rms: Math.sqrt(
      middle.reduce((sum, value) => sum + value * value, 0) / middle.length,
    ),
    frequency: (crossings * 48000) / middle.length,
    duration: samples.length / 48000,
  };
}
async function pixel(file, time) {
  const { stdout } = await ffmpeg([
    "-ss",
    String(time),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "scale=1:1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  return [...stdout];
}

test("PowerPoint media settings preserve existing marked-audio semantics and validate explicit source intervals", () => {
  const marked = pptxMediaSettings({
    ...base,
    muted: true,
    playbackRate: 1,
    trimStart: 1,
    trimEnd: 1.8,
    authoredPlaybackRate: 2,
    authoredVolume: 0.25,
  });
  assert.deepEqual(
    [marked.start, marked.end, marked.rate, marked.gain, marked.loop],
    [1, 1.8, 2, 0.25, true],
  );
  const fragment = pptxMediaSettings({
    ...base,
    src: `${base.src}#t=npt:00:01,00:01.8`,
    muted: true,
    currentTime: 1,
  });
  assert.deepEqual(
    [
      fragment.start,
      fragment.end,
      fragment.phase,
      fragment.fragmentEnd,
      fragment.gain,
    ],
    [0, 1.8, 1, 1.8, 0],
  );
  for (const changed of [
    { playbackRate: 0 },
    { volume: -1 },
    { trimStart: 1, trimEnd: 0.5 },
    { src: `${base.src}#t=bad,2` },
  ])
    assert.throws(
      () => pptxMediaSettings({ ...base, ...changed }),
      /valid|range/,
    );
});

test("PowerPoint keeps unmodified media snapshots byte-identical without a processing dependency", async () => {
  const bytes = Buffer.from(
    "A snapshot already validated by the media container reader",
  );
  const result = await preparePptxPlayback(bytes, "mp4", {
    ...base,
    loop: true,
  });
  assert.equal(result.bytes, bytes);
  assert.equal(result.playback.embeddedSource, "original");
  assert.equal(result.playback.sourceSha256, result.playback.embeddedSha256);
  assert.equal(result.playback.loop, true);
  const ended = await preparePptxPlayback(bytes, "mp4", {
    ...base,
    currentTime: 2,
    ended: true,
  });
  assert.equal(ended.bytes, bytes);
  assert.equal(ended.playback.initialPosition, 0);
});

test("PowerPoint playback copies encode the authored range, speed, pitch and gain in real media bytes", async (t) => {
  const { dir, file, bytes } = await clip(t);
  const result = await preparePptxPlayback(bytes, "mp4", {
    ...base,
    muted: true,
    trimStart: 1,
    trimEnd: 1.8,
    authoredPlaybackRate: 2,
    authoredVolume: 0.25,
  });
  const output = path.join(dir, "adjusted.mp4");
  await fs.writeFile(output, result.bytes);
  assert.deepEqual(await fs.readFile(file), bytes);
  assert.equal(result.playback.embeddedSource, "derived");
  assert.deepEqual(result.playback.changes, [
    "source-range",
    "playback-rate",
    "volume",
  ]);
  const color = await pixel(output, 0.15),
    sound = await audio(output);
  assert.ok(color[2] > 200 && color[0] < 30, color.join(","));
  assert.ok(Math.abs(sound.duration - 0.4) < 0.05, JSON.stringify(sound));
  assert.ok(Math.abs(sound.frequency - 880) < 20, JSON.stringify(sound));
  assert.ok(sound.rms > 0.018 && sound.rms < 0.027, JSON.stringify(sound));
  const muted = await preparePptxPlayback(bytes, "mp4", {
    ...base,
    muted: true,
  });
  const silent = path.join(dir, "muted.mp4");
  await fs.writeFile(silent, muted.bytes);
  assert.equal((await audio(silent)).rms, 0);
});

test("PowerPoint loop copies retain the initial position and the complete subsequent cycle", async (t) => {
  const { dir, bytes } = await clip(t);
  const result = await preparePptxPlayback(bytes, "mp4", {
    ...base,
    loop: true,
    currentTime: 0.6,
  });
  const output = path.join(dir, "phase.mp4");
  await fs.writeFile(output, result.bytes);
  const first = await pixel(output, 0.1),
    middle = await pixel(output, 0.7),
    last = await pixel(output, 1.7);
  assert.ok(first[0] > 200 && first[2] < 30);
  assert.ok(middle[2] > 200 && middle[0] < 30);
  assert.ok(last[0] > 200 && last[2] < 30);
  assert.equal(result.playback.duration, 2);
  const shifted = await preparePptxPlayback(bytes, "mp4", {
    ...base,
    playbackRate: 2,
    preservesPitch: false,
  });
  const shiftedFile = path.join(dir, "pitched.mp4");
  await fs.writeFile(shiftedFile, shifted.bytes);
  const { stdout } = await ffmpeg([
    "-i",
    shiftedFile,
    "-t",
    "0.4",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "48000",
    "-f",
    "f32le",
    "pipe:1",
  ]);
  let crossings = 0;
  for (let i = 4; i < stdout.length; i += 4)
    if (stdout.readFloatLE(i - 4) <= 0 && stdout.readFloatLE(i) > 0)
      crossings++;
  assert.ok(Math.abs(crossings / (stdout.length / 4 / 48000) - 880) < 25);
});

test("PowerPoint exports adjusted playable bytes beside editable builds and explicit native-loop diagnostics", async (t) => {
  const { dir, file, bytes } = await clip(t);
  await fs.cp(
    path.join(root, "skills/studio-design/assets/starters"),
    path.join(dir, "starters"),
    { recursive: true },
  );
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Authored media playback</title><style>body{margin:0}section{background:white;padding:30px}h1{font:28px Arial}</style></head><body><deck-stage width="800" height="500"><section><h1 data-anim="fade-in">Editable heading</h1><video width="192" height="128" src="source.mp4" muted data-codex-exportable-video-play-start="0.5" data-codex-exportable-video-play-end="1.5" data-codex-exportable-video-play-speed="2" data-codex-exportable-video-volume="0.25"></video></section></deck-stage><script src="starters/deck.js"></script></body></html>';
  await fs.writeFile(path.join(dir, "index.html"), html);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const output = path.join(dir, "playback.pptx"),
    result = await exportArtifact("pptx", url, output),
    zip = unzipSync(await fs.readFile(output)),
    slide = strFromU8(zip["ppt/slides/slide1.xml"]);
  assert.equal(result.mediaObjects, 1);
  assert.equal(result.rasterObjects, 1);
  assert.equal(result.nativeAnimations, 1);
  assert.equal(result.mediaPlayback[0].embeddedSource, "derived");
  assert.deepEqual(
    [
      result.mediaPlayback[0].sourceStart,
      result.mediaPlayback[0].sourceEnd,
      result.mediaPlayback[0].playbackRate,
      result.mediaPlayback[0].gain,
    ],
    [0.5, 1.5, 2, 0.25],
  );
  assert.match(slide, /<a:t>Editable heading<\/a:t>/);
  assert.match(slide, /<p:video><p:cMediaNode/);
  assert.equal((slide.match(/<p:pic>/g) || []).length, 2);
  assert.equal(result.mediaPlayback[0].activation, "poster-click");
  assert.equal(result.mediaPlayback[0].posterObjects, 1);
  assert.match(slide, /<p:cMediaNode vol="100000" mute="0"/);
  assert.match(slide, /repeatCount="indefinite"/);
  assert.match(slide, /nodeType="mainSeq"/);
  const ids = [...slide.matchAll(/<p:cTn\b[^>]*\bid="(\d+)"/g)].map(
    (match) => match[1],
  );
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("video playback ran only once"),
    ),
  );
  const payload = Object.entries(zip).find(([name]) =>
      name.endsWith(".mp4"),
    )[1],
    extracted = path.join(dir, "embedded.mp4");
  await fs.writeFile(extracted, payload);
  const { stdout: frames } = await ffmpeg([
    "-i",
    extracted,
    "-vf",
    "scale=1:1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  // The complete decoded sequence must contain both halves at the authored
  // boundary; checking one monochrome source interval misses lost motion.
  assert.equal(frames.length / 3, 20);
  for (let frame = 0; frame < 20; frame++) {
    const [red, , blue] = frames.subarray(frame * 3, frame * 3 + 3);
    assert.ok(
      frame < 10 ? red > 200 && blue < 30 : blue > 200 && red < 30,
      `Unexpected color at frame ${frame}`,
    );
  }
  const first = await audio(extracted, 0, 0.24),
    last = await audio(extracted, 0.26, 0.24),
    sound = await audio(extracted);
  assert.ok(Math.abs(sound.duration - 0.5) < 0.05);
  assert.ok(Math.abs(first.frequency - 440) < 20, JSON.stringify(first));
  assert.ok(Math.abs(last.frequency - 880) < 20, JSON.stringify(last));
  for (const part of [first, last])
    assert.ok(part.rms > 0.018 && part.rms < 0.027, JSON.stringify(part));
  assert.deepEqual(await fs.readFile(file), bytes);
  assert.equal(await fs.readFile(path.join(dir, "index.html"), "utf8"), html);
});

test("PowerPoint source positions distinguish Chromium's one-shot fragment pause from ordinary loops and ended restarts", async (t) => {
  const { dir, bytes } = await clip(t);
  await fs.writeFile(
    path.join(dir, "index.html"),
    '<!doctype html><html lang="en"><title>Media source positions</title><video muted loop src="source.mp4#t=0.2,0.7"></video></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url, async (page) => {
    page.setDefaultTimeout(8000);
    await page.waitForFunction(() => {
      const video = document.querySelector("video");
      return video.readyState >= 2 && !video.seeking;
    });
    const state = () =>
      page.evaluate(() => {
        const video = document.querySelector("video");
        return {
          src: video.currentSrc,
          currentTime: video.currentTime,
          duration: video.duration,
          ended: video.ended,
          loop: video.loop,
        };
      });
    assert.equal((await state()).currentTime, 0.2);
    const initial = { ...base, ...(await state()) };
    const firstPlayback = await preparePptxPlayback(bytes, "mp4", initial);
    assert.equal(
      firstPlayback.playback.fragmentBoundary,
      "first-playback-trim",
    );
    assert.equal(firstPlayback.playback.loop, false);
    assert.ok(Math.abs(firstPlayback.playback.duration - 0.5) < 0.001);
    const output = path.join(dir, "fragment.mp4");
    await fs.writeFile(output, firstPlayback.bytes);
    assert.ok(Math.abs((await audio(output)).duration - 0.5) < 0.05);
    await page.evaluate(async () => {
      const video = document.querySelector("video");
      await video.play();
    });
    await page.waitForFunction(() => document.querySelector("video").paused);
    const paused = await state();
    assert.ok(paused.currentTime >= 0.7 && paused.currentTime < 1.2);
    assert.equal(paused.ended, false);
    assert.equal(
      pptxMediaSettings({ ...base, ...paused }).fragmentBoundary,
      "past-boundary",
    );
    await page.evaluate(async () => {
      const video = document.querySelector("video");
      video.loop = false;
      await video.play();
    });
    await page.waitForFunction(() => document.querySelector("video").ended);
    assert.equal(pptxMediaSettings({ ...base, ...(await state()) }).phase, 0);
    await page.evaluate(async () => {
      const video = document.querySelector("video");
      await video.play();
      video.pause();
    });
    assert.ok((await state()).currentTime < 0.5);
    await page.evaluate(() => {
      document.querySelector("video").currentTime = 0.1;
    });
    await page.waitForFunction(() => !document.querySelector("video").seeking);
    assert.equal(pptxMediaSettings({ ...base, ...(await state()) }).phase, 0.1);
    await page.evaluate(async () => {
      const video = document.querySelector("video");
      const ready = new Promise((resolve) =>
        video.addEventListener("loadeddata", resolve, { once: true }),
      );
      video.src = "source.mp4";
      await ready;
      video.loop = true;
      video.currentTime = 1.8;
      await video.play();
    });
    await page.waitForFunction(
      () => document.querySelector("video").currentTime < 0.5,
    );
    await page.evaluate(() => document.querySelector("video").pause());
    const settings = pptxMediaSettings({ ...base, ...(await state()) });
    assert.equal(settings.start, 0);
    assert.equal(settings.end, null);
    assert.equal(settings.loop, true);
    assert.equal(settings.fragmentEnd, null);
  });
});

test("PowerPoint slower playback keeps the full color sequence and pitch-aligned audio", async (t) => {
  const { dir, bytes } = await clip(t);
  const result = await preparePptxPlayback(bytes, "mp4", {
    ...base,
    trimStart: 0.5,
    trimEnd: 1.5,
    authoredPlaybackRate: 0.5,
  });
  const output = path.join(dir, "slower.mp4");
  await fs.writeFile(output, result.bytes);
  assert.equal(result.playback.duration, 2);
  assert.equal(result.playback.outputFrameRate, 10);
  const { stdout } = await ffmpeg([
    "-i",
    output,
    "-vf",
    "scale=1:1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  assert.equal(stdout.length / 3, 20);
  for (let frame = 0; frame < 20; frame++) {
    const [red, , blue] = stdout.subarray(frame * 3, frame * 3 + 3);
    assert.ok(
      frame < 10 ? red > 200 && blue < 30 : blue > 200 && red < 30,
      `Unexpected color at frame ${frame}`,
    );
  }
  const first = await audio(output, 0.2, 0.6),
    last = await audio(output, 1.2, 0.6),
    sound = await audio(output);
  assert.ok(Math.abs(sound.duration - 2) < 0.05);
  assert.ok(Math.abs(first.frequency - 440) < 10);
  assert.ok(Math.abs(last.frequency - 880) < 10);
});

test("PowerPoint audio-only copies retain real gain and reject source ranges beyond the snapshot", async (t) => {
  const { dir, file } = await clip(t);
  const source = path.join(dir, "source.wav");
  await ffmpeg(["-i", file, "-vn", "-c:a", "pcm_s16le", source]);
  const bytes = await fs.readFile(source);
  const result = await preparePptxPlayback(bytes, "wav", {
    ...base,
    mediaType: "audio",
    src: base.src.replace("mp4", "wav"),
    currentTime: 1,
    volume: 0.5,
  });
  const output = path.join(dir, "adjusted.wav");
  await fs.writeFile(output, result.bytes);
  const sound = await audio(output);
  assert.equal(result.extn, "wav");
  assert.equal(result.playback.outputFrameRate, null);
  assert.ok(Math.abs(sound.duration - 1) < 0.05);
  assert.ok(Math.abs(sound.frequency - 880) < 10);
  assert.ok(sound.rms > 0.04 && sound.rms < 0.05);
  await assert.rejects(
    preparePptxPlayback(bytes, "wav", {
      ...base,
      mediaType: "audio",
      trimStart: 1,
      trimEnd: 3,
    }),
    /outside its decoded duration/,
  );
  assert.deepEqual(await fs.readFile(source), bytes);
});

test(
  "real Impress media changes color beside an editable fading heading with one native cover",
  { skip: process.env.STUDIO_TEST_IMPRESS !== "1" },
  async (t) => {
    const { dir } = await clip(t);
    await fs.cp(
      path.join(root, "skills/studio-design/assets/starters"),
      path.join(dir, "starters"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(dir, "index.html"),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Native media playback regression</title><style>body{margin:0}section{background:#333;padding:30px}h1{font:32px Arial;color:white;margin:0}</style></head><body><deck-stage width="1280" height="720"><section><h1>Playback preparation</h1></section><section><h1 data-anim="fade-in" data-anim-trigger="after" data-anim-duration="1200">Editable media playback</h1><video width="672" height="384" style="position:absolute;left:288px;top:144px" src="source.mp4" muted autoplay data-codex-exportable-video-play-start="0.5" data-codex-exportable-video-play-end="1.5" data-codex-exportable-video-play-speed="0.5" data-codex-exportable-video-volume="0"></video></section></deck-stage><script src="starters/deck.js"></script></body></html>`,
    );
    const { server, url } = await serve(dir, 0);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const output = path.join(dir, "media-playback.pptx"),
      result = await exportArtifact("pptx", url, output),
      zip = unzipSync(await fs.readFile(output)),
      slide = strFromU8(zip["ppt/slides/slide2.xml"]);
    assert.equal(result.mediaObjects, 1);
    assert.equal(result.rasterObjects, 0);
    assert.equal(result.nativeAnimations, 1);
    assert.match(slide, /<a:t>Editable media playback<\/a:t>/);
    assert.equal((slide.match(/<p:pic>/g) || []).length, 1);
    const { stdout } = await run(
      "/usr/bin/python3",
      [path.join(root, "tests/powerpoint-media-impress.py"), output, dir],
      { timeout: 45000, maxBuffer: 1024 * 1024 },
    );
    const { version, samples } = JSON.parse(stdout);
    t.diagnostic(`Media playback consumer: ${version}`);
    const visible = samples.filter((sample) =>
      sample.background.every((channel) => Math.abs(channel - 51) < 3),
    );
    const red = visible.findIndex(
        ({ video }) => video[0] > 200 && video[2] < 30,
      ),
      blue = visible.findIndex(({ video }) => video[2] > 200 && video[0] < 30);
    assert.ok(
      red >= 0 && blue > red,
      `Expected real red-to-blue playback: ${JSON.stringify(visible)}`,
    );
    const mediaSlide = visible.filter(
      ({ video }) =>
        (video[0] > 200 && video[2] < 30) || (video[2] > 200 && video[0] < 30),
    );
    assert.ok(mediaSlide.some((sample) => sample.headingWhitePixels < 100));
    assert.ok(mediaSlide.some((sample) => sample.headingWhitePixels > 2000));
  },
);

test(
  "real Impress manual video retains its printed cover and starts only on its native click",
  { skip: process.env.STUDIO_TEST_IMPRESS !== "1" },
  async (t) => {
    const { dir } = await clip(t);
    await fs.cp(
      path.join(root, "skills/studio-design/assets/starters"),
      path.join(dir, "starters"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(dir, "index.html"),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Manual media activation regression</title><style>body{margin:0}section{background:#333;padding:30px}h1{font:32px Arial;color:white;margin:0}</style></head><body><deck-stage width="1280" height="720"><section><h1>Playback preparation</h1></section><section><h1 data-anim="fade-in" data-anim-trigger="after" data-anim-duration="1200">Editable media playback</h1><video width="672" height="384" style="position:absolute;left:288px;top:144px" src="source.mp4" muted></video></section></deck-stage><script src="starters/deck.js"></script></body></html>`,
    );
    const { server, url } = await serve(dir, 0);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const output = path.join(dir, "manual-media.pptx"),
      result = await exportArtifact("pptx", url, output),
      zip = unzipSync(await fs.readFile(output)),
      slide = strFromU8(zip["ppt/slides/slide2.xml"]);
    assert.equal(result.mediaObjects, 1);
    assert.equal(result.rasterObjects, 1);
    assert.equal(result.nativeAnimations, 1);
    assert.equal(result.mediaPlayback[0].activation, "poster-click");
    assert.equal(result.mediaPlayback[0].posterObjects, 1);
    assert.equal((slide.match(/<p:pic>/g) || []).length, 2);
    assert.equal((slide.match(/<p14:media\b/g) || []).length, 1);
    assert.equal(
      Object.keys(zip).filter((name) => /^ppt\/media\/.*\.png$/.test(name))
        .length,
      1,
    );
    assert.match(slide, /nodeType="interactiveSeq"/);
    assert.match(slide, /cmd="stop"/);
    assert.match(slide, /cmd="playFrom\(0\.0\)"/);
    const ids = [...slide.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map(
      (match) => match[1],
    );
    assert.equal(new Set(ids).size, ids.length);
    const { stdout } = await run(
      "/usr/bin/python3",
      [
        path.join(root, "tests/powerpoint-media-impress.py"),
        output,
        dir,
        "--manual",
      ],
      { timeout: 45000, maxBuffer: 1024 * 1024 },
    );
    const { version, samples, after, printRGB } = JSON.parse(stdout);
    t.diagnostic(`Manual media consumer: ${version}`);
    const red = ({ video }) => video[0] > 200 && video[2] < 30;
    const blue = ({ video }) => video[2] > 200 && video[0] < 30;
    const firstCover = samples.findIndex(red);
    assert.ok(
      firstCover >= 0,
      `The resting cover never appeared: ${JSON.stringify(samples)}`,
    );
    const resting = samples.slice(firstCover);
    assert.ok(
      resting.at(-1).time - resting[0].time > 2,
      "The cover must remain still beyond the whole source duration.",
    );
    assert.ok(
      resting.every(red),
      `Manual video changed before its click: ${JSON.stringify(resting)}`,
    );
    assert.ok(resting.some((sample) => sample.headingWhitePixels < 100));
    assert.ok(resting.some((sample) => sample.headingWhitePixels > 2000));
    const playingRed = after.findIndex(red),
      playingBlue = after.findIndex(blue);
    assert.ok(
      playingRed >= 0 && playingBlue > playingRed,
      `Click did not start real playback: ${JSON.stringify(after)}`,
    );
    assert.ok(
      printRGB[0] > 200 && printRGB[2] < 30,
      `Printed cover differs from the source frame: ${printRGB}`,
    );
  },
);
