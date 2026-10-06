import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary, root } from "./helpers.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";
import {
  audioTimeline,
  createAudioExport,
} from "../packages/media/src/lib/audio.mjs";
import { videoOptions } from "../packages/media/src/lib/video.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";

const ffmpeg = (args) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
function audioSamples(file) {
  const bytes = ffmpeg([
    "-i",
    file,
    "-map",
    "0:a:0",
    "-f",
    "f32le",
    "-ar",
    "48000",
    "-ac",
    "1",
    "pipe:1",
  ]);
  return new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
}
function rms(samples, from, to) {
  const slice = samples.subarray(
    Math.round(from * 48000),
    Math.round(to * 48000),
  );
  return Math.sqrt(slice.reduce((sum, n) => sum + n * n, 0) / slice.length);
}
function power(samples, from, to, frequency) {
  const slice = samples.subarray(
    Math.round(from * 48000),
    Math.round(to * 48000),
  );
  let cosine = 0,
    sine = 0;
  for (let i = 0; i < slice.length; i++) {
    const angle = (2 * Math.PI * frequency * i) / 48000;
    cosine += slice[i] * Math.cos(angle);
    sine += slice[i] * Math.sin(angle);
  }
  return Math.hypot(cosine, sine) / slice.length;
}
function streams(file) {
  return JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name",
      "-of",
      "json",
      file,
    ]),
  ).streams;
}
async function setup(t, tracks) {
  const dir = await temporary(t);
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=0.5",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=48000:duration=0.5",
    "-filter_complex",
    "[0:a][1:a]concat=n=2:v=0:a=1",
    "-c:a",
    "pcm_s16le",
    path.join(dir, "tone.wav"),
  ]);
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=160x100:r=10:d=1",
    "-i",
    path.join(dir, "tone.wav"),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    path.join(dir, "clip.mp4"),
  ]);
  ffmpeg([
    "-i",
    path.join(dir, "clip.mp4"),
    "-c:v",
    "copy",
    "-an",
    path.join(dir, "quiet.mp4"),
  ]);
  const document = `<!doctype html><html lang="en"><body style="margin:0">
    <div id="art" style="width:160px;height:100px;background:blue"></div>
    <audio src="tone.wav" data-codex-exportable-video-play-start="0" data-codex-exportable-video-play-end="1"></audio>
    <script>
      const tracks = ${JSON.stringify(tracks)};
      if(tracks.some(s=>s.blob)) window.sourceBlob = URL.createObjectURL(new Blob([
        Uint8Array.from(atob(${JSON.stringify((await fs.readFile(path.join(dir, "tone.wav"))).toString("base64"))}), c=>c.charCodeAt(0))
      ],{type:"audio/wav"}));
      const nodes = new Map();
      const art = document.getElementById("art");
      window.codexTimeline = { duration:1,width:160,height:100,root:art,
        setPlaying(){},seek(t) {
          art.style.background = t < 0.5 ? "blue" : "red";
          for(let i=0;i<tracks.length;i++) {
            const spec = tracks[i];
            const active = t >= (spec.from ?? 0) && t < (spec.to ?? 2);
            let node = nodes.get(i);
            if(!active) { if(node){ node.remove(); if(spec.blob) URL.revokeObjectURL(node.src); nodes.delete(i); } continue; }
            if(!node) {
              node = document.createElement(spec.tag ?? "audio");
              node.src = spec.blob ? window.sourceBlob : spec.src;
              node.muted = true;
              node.preload = "auto";
              node.setAttribute("data-codex-exportable-video-play-start",spec.start ?? 0);
              node.setAttribute("data-codex-exportable-video-play-end",spec.end ?? 1);
              node.setAttribute("data-codex-exportable-video-play-speed",spec.speed ?? 1);
              if(spec.tag === "video") {node.style.width="160px";node.style.height="100px";}
              nodes.set(i,node); art.append(node);
            }
            node.volume = spec.volume ?? 1;
            if(spec.fade) node.volume = t < 0.5 ? 0 : 1;
          }
        }
      };
      codexTimeline.seek(0);
    </script>
  </body></html>`;
  await fs.writeFile(path.join(dir, "index.html"), document);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url };
}
const encode = (dir, url, name, options = {}) =>
  exportArtifact("video", url, path.join(dir, name), {
    fps: 10,
    deviceScaleFactor: 1,
    ...options,
  });

test("audio intervals join continuous identity/config and preserve gaps and changes", () => {
  const timeline = audioTimeline();
  const track = {
    id: 0,
    src: "http://127.0.0.1/tone.wav",
    start: 0,
    end: 1,
    speed: 1,
    volume: 1,
  };
  timeline.record([track], 0, 0.1);
  timeline.record([track], 0.1, 0.2);
  timeline.record([], 0.2, 0.3);
  timeline.record([track], 0.3, 0.4);
  timeline.record([{ ...track, volume: 0.5 }], 0.4, 0.5);
  assert.deepEqual(
    timeline.segments.map((s) => [s.from, s.to, s.volume]),
    [
      [0, 0.2, 1],
      [0.3, 0.4, 1],
      [0.4, 0.5, 0.5],
    ],
  );
  for (const change of [
    { speed: 0 },
    { speed: -1 },
    { start: -1 },
    { end: 0 },
    { volume: NaN },
    { src: "" },
  ]) {
    assert.throws(
      () => timeline.record([{ ...track, ...change }], 0.5, 0.6),
      /Marked audio/,
    );
  }
  assert.equal(videoOptions().audio, "auto");
  assert.equal(videoOptions({ audio: "none" }).audio, "none");
  assert.throws(() => videoOptions({ audio: "pretend" }), /audio/);
});

test("audio source snapshots reject remote and file URLs before fetching", async () => {
  for (const src of ["https://example.com/private.mp4", "file:///etc/passwd"]) {
    const job = createAudioExport({ format: "mp4", audio: "auto" });
    try {
      await assert.rejects(
        job.record(
          null,
          [{ id: 0, src, start: 0, end: 1, speed: 1, volume: 1 }],
          0,
          1,
        ),
        /loopback HTTP/,
      );
    } finally {
      await job.dispose();
    }
  }
});

test("slow and fast tempo chains preserve pitch instead of shifting the source frequency", async (t) => {
  const { dir, url } = await setup(t, [
    { src: "tone.wav", start: 0, end: 0.5, speed: 0.25 },
  ]);
  const slow = await encode(dir, url, "slow.mp4");
  const samples = audioSamples(slow.output);
  assert.ok(power(samples, 0.2, 0.4, 440) > 0.02);
  assert.ok(power(samples, 0.2, 0.4, 110) < 0.002);
  const html = await fs.readFile(path.join(dir, "index.html"), "utf8");
  await fs.writeFile(
    path.join(dir, "fast.html"),
    html.replace('"speed":0.25', '"speed":4'),
  );
  const fast = await encode(dir, url + "fast.html", "fast.webm");
  const quick = audioSamples(fast.output);
  assert.ok(power(quick, 0.2, 0.4, 440) > 0.02);
  assert.ok(power(quick, 0.2, 0.4, 1760) < 0.002);
});

test("marked video audio loops its source range at speed, survives native mute and preserves sub-range phase", async (t) => {
  const { dir, url } = await setup(t, [
    { tag: "video", src: "clip.mp4", start: 0.25, end: 0.75, speed: 2 },
  ]);
  const full = await encode(dir, url, "full.mp4");
  assert.equal(full.audio, true);
  assert.equal(full.audioTracks, 1);
  assert.equal(full.audioSegments, 1);
  assert.deepEqual(
    streams(full.output).map((s) => s.codec_type),
    ["video", "audio"],
  );
  const samples = audioSamples(full.output);
  for (const [from, to, frequency] of [
    [0.02, 0.08, 440],
    [0.17, 0.22, 880],
    [0.28, 0.33, 440],
    [0.42, 0.46, 880],
  ]) {
    assert.ok(
      power(samples, from, to, frequency) >
        power(samples, from, to, frequency === 440 ? 880 : 440) * 4,
    );
  }
  const part = await encode(dir, url, "part.webm", {
    startMs: 200,
    endMs: 800,
  });
  assert.equal(part.audio, true);
  assert.equal(
    streams(part.output).find((s) => s.codec_type === "audio").codec_name,
    "opus",
  );
  const short = audioSamples(part.output);
  assert.ok(power(short, 0.01, 0.04, 880) > power(short, 0.01, 0.04, 440) * 4);
  assert.ok(power(short, 0.09, 0.13, 440) > power(short, 0.09, 0.13, 880) * 4);
});

test("mix adds multiple clips while frame-grid mounting and gain changes gate their sound", async (t) => {
  const { dir, url } = await setup(t, [
    { src: "tone.wav", start: 0, end: 0.5, volume: 0.5, from: 0.2, to: 0.8 },
    {
      src: "tone.wav",
      start: 0.5,
      end: 1,
      volume: 0.5,
      from: 0.2,
      to: 0.8,
      fade: true,
    },
  ]);
  const result = await encode(dir, url, "mixed.mp4");
  assert.equal(result.audioTracks, 2);
  const samples = audioSamples(result.output);
  assert.ok(rms(samples, 0.04, 0.15) < 0.001);
  assert.ok(power(samples, 0.29, 0.39, 440) > 0.015);
  assert.ok(power(samples, 0.29, 0.39, 880) < 0.003);
  assert.ok(power(samples, 0.59, 0.69, 440) > 0.015);
  assert.ok(power(samples, 0.59, 0.69, 880) > 0.015);
  assert.ok(rms(samples, 0.87, 0.97) < 0.001);
});

test("blob media is captured before removal revokes it and embedded data media remains portable", async (t) => {
  const { dir, url } = await setup(t, [
    { src: "tone.wav", blob: true, from: 0, to: 0.5 },
  ]);
  const blob = await encode(dir, url, "blob.mp4");
  assert.equal(blob.audio, true);
  const samples = audioSamples(blob.output);
  assert.ok(rms(samples, 0.1, 0.3) > 0.03);
  assert.ok(rms(samples, 0.65, 0.9) < 0.001);
  const data =
    "data:audio/wav;base64," +
    (await fs.readFile(path.join(dir, "tone.wav"))).toString("base64");
  const html = await fs.readFile(path.join(dir, "index.html"), "utf8");
  await fs.writeFile(
    path.join(dir, "data.html"),
    html
      .replace('"blob":true', '"blob":false')
      .replace(
        '"src":"tone.wav"',
        JSON.stringify("src") + ":" + JSON.stringify(data),
      ),
  );
  const embedded = await encode(dir, url + "data.html", "data.mp4");
  assert.equal(embedded.audio, true);
  assert.ok(rms(audioSamples(embedded.output), 0.1, 0.3) > 0.03);
});

test("silent option, video without sound, out-of-root media and GIF do not invent audio", async (t) => {
  const { dir, url } = await setup(t, [{ src: "tone.wav" }]);
  const silent = await encode(dir, url, "silent.mp4", { audio: "none" });
  assert.equal(silent.audio, false);
  assert.equal(
    streams(silent.output).some((s) => s.codec_type === "audio"),
    false,
  );
  const gif = await encode(dir, url, "clip.gif", { fps: 2 });
  assert.equal(gif.audio, false);
  assert.ok(gif.flags.some((f) => f.kind === "audio_unsupported"));
  const html = await fs.readFile(path.join(dir, "index.html"), "utf8");
  await fs.writeFile(
    path.join(dir, "quiet.html"),
    html.replace('"src":"tone.wav"', '"src":"quiet.mp4"'),
  );
  const quiet = await encode(dir, url + "quiet.html", "quiet.webm");
  assert.equal(quiet.audio, false);
  assert.equal(
    streams(quiet.output).some((s) => s.codec_type === "audio"),
    false,
  );
  await fs.writeFile(
    path.join(dir, "empty.html"),
    html.replace('[{"src":"tone.wav"}]', "[]"),
  );
  const outside = await encode(dir, url + "empty.html", "outside.mp4");
  assert.equal(outside.audio, false);
});

test(
  "invalid marked ranges and undecodable audio fail without leaving a result or partial video",
  { timeout: 10000 },
  async (t) => {
    const { dir, url } = await setup(t, [{ src: "tone.wav", end: 0 }]);
    await assert.rejects(encode(dir, url, "invalid.mp4"), /Marked audio/);
    assert.equal(
      (await fs.readdir(dir)).some((name) => name.startsWith("invalid.mp4")),
      false,
    );
    const html = await fs.readFile(path.join(dir, "index.html"), "utf8");
    await fs.writeFile(path.join(dir, "broken.bin"), "This is not audio.");
    await fs.writeFile(
      path.join(dir, "broken.html"),
      html
        .replace('"end":0', '"end":1')
        .replace('"src":"tone.wav"', '"src":"broken.bin"'),
    );
    await assert.rejects(
      encode(dir, url + "broken.html", "broken.mp4"),
      /ffprobe/,
    );
    assert.equal(
      (await fs.readdir(dir)).some((name) => name.startsWith("broken.mp4")),
      false,
    );
  },
);

test("local editor exports and downloads a real audio stream with an explicit mute switch", async (t) => {
  const { dir } = await setup(t, []);
  const runtime = path.join(
    root,
    "packages/runtime/src/browser/animations.jsx",
  );
  await fs.writeFile(
    path.join(dir, "entry.jsx"),
    `
    import React from "react"; import {createRoot} from "react-dom/client";
    import {CompositionStage} from ${JSON.stringify(runtime)};
    createRoot(document.getElementById("root")).render(<CompositionStage width={160} height={100} autoplay={false}
      scenes={window.CODEX_SCENES} playback={window.CODEX_PLAYBACK} source={true}>
      <div>A sound, retained.</div><audio src="tone.wav" muted data-codex-exportable-video-play-start="0" data-codex-exportable-video-play-end="1"/>
    </CompositionStage>);
  `,
  );
  await bundle(path.join(dir, "entry.jsx"), path.join(dir, "sound.js"));
  // Keep the source service's scene literal plain and declarative.
  await fs.writeFile(
    path.join(dir, "sound.html"),
    '<!doctype html><html lang="en"><body style="margin:0"><div id="root"></div><script>window.CODEX_SCENES=\'[{"name":"Sound","dur":1}]\';window.CODEX_PLAYBACK=\'{"mode":"times","count":1}\';</script><script src="sound.js"></script></body></html>',
  );
  const { server, url } = await serve(dir, 0, { motionFile: "sound.html" });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url + "sound.html", async (page) => {
    await page
      .getByRole("status")
      .filter({ hasText: "Source connected" })
      .waitFor();
    await page
      .getByRole("button", { name: "Export video", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("checkbox", { name: "Include marked media audio" })
        .isChecked(),
      true,
    );
    await page.getByLabel("Video fps").fill("2");
    await page.getByLabel("Capture scale").fill("1");
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Render and download", exact: true })
      .click();
    const download = await pending;
    const file = path.join(dir, "download.mp4");
    await download.saveAs(file);
    assert.equal(
      streams(file).some((s) => s.codec_type === "audio"),
      true,
    );
    await page
      .getByRole("checkbox", { name: "Include marked media audio" })
      .uncheck();
    const second = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Render and download", exact: true })
      .click();
    const muted = await second;
    const quiet = path.join(dir, "download-muted.mp4");
    await muted.saveAs(quiet);
    assert.equal(
      streams(quiet).some((s) => s.codec_type === "audio"),
      false,
    );
    await page.getByLabel("Video format").selectOption("gif");
    assert.equal(
      await page
        .getByRole("checkbox", { name: "Include marked media audio" })
        .isDisabled(),
      true,
    );
  });
});
