import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { temporary } from "./helpers.mjs";
import {
  compileAudioSchedule,
  audioGainAt,
  addScheduledWindow,
} from "../packages/runtime/src/browser/audio-plan.js";
import { compileComposition } from "../packages/runtime/src/browser/composition-model.js";
import { mixScheduledAudio } from "../packages/media/src/lib/scheduled-audio.mjs";
import { createAudioExport } from "../packages/media/src/lib/audio.mjs";

const ffmpeg = (args) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
const window = (playbackStart, playbackEnd, localStart, localEnd) => ({
  playbackStart,
  playbackEnd,
  localStart,
  localEnd,
  rate: (localEnd - localStart) / (playbackEnd - playbackStart),
});
const clip = (overrides = {}) => ({
  id: "sound",
  kind: "audio",
  duration: 1,
  media: { src: "tone.wav", sourceDuration: 1 },
  windows: [window(0, 1, 0, 1)],
  ...overrides,
});
const plan = (clips, duration = 1) => ({ duration, clips });
const stereo = (values) =>
  Float32Array.from(values.flatMap((value) => [value, value]));
function accumulate(schedule, stems, initial) {
  const mixed = initial ?? new Float32Array(schedule.samples * 2);
  for (const item of schedule.clips)
    for (const part of item.windows)
      addScheduledWindow(
        schedule,
        item,
        part,
        stems[part.speed] ?? stems.default,
        mixed,
        item.sourceDuration,
      );
  return Array.from(mixed.filter((_, index) => index % 2 === 0));
}

test("sample boundaries are half-open and independent of video frame rate", () => {
  const schedule = compileAudioSchedule(
    plan([clip({ duration: 0.3, windows: [window(0.15, 0.45, 0, 0.3)] })]),
    { sampleRate: 10 },
  );
  assert.deepEqual(
    [schedule.clips[0].windows[0].first, schedule.clips[0].windows[0].last],
    [2, 5],
  );
  assert.deepEqual(
    accumulate(schedule, { default: stereo(Array(10).fill(1)) }),
    [0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
  );
  const short = compileAudioSchedule(
    plan([clip({ duration: 0.3, windows: [window(0.15, 0.45, 0, 0.3)] })]),
    { start: 0.25, duration: 0.4, sampleRate: 10 },
  );
  assert.deepEqual(
    accumulate(short, { default: stereo(Array(10).fill(1)) }),
    [1, 1, 0, 0],
  );
});

test("piecewise retiming preserves clip-local source phase, loops and export offsets", () => {
  const sound = clip({
    duration: 2,
    media: { src: "tone.wav", sourceDuration: 1, playbackRate: 1, loop: true },
    windows: [window(0, 0.5, 0, 1), window(0.5, 1.5, 1, 2)],
  });
  const schedule = compileAudioSchedule(plan([sound], 1.5), { sampleRate: 4 });
  assert.deepEqual(
    accumulate(schedule, { 2: stereo([10, 20]), 1: stereo([1, 2, 3, 4]) }),
    [10, 20, 1, 2, 3, 4],
  );
  const short = compileAudioSchedule(plan([sound], 1.5), {
    start: 0.75,
    duration: 0.5,
    sampleRate: 4,
  });
  assert.deepEqual(accumulate(short, { 1: stereo([1, 2, 3, 4]) }), [2, 3]);
  const noLoop = compileAudioSchedule(
    plan([{ ...sound, media: { ...sound.media, loop: false } }], 1.5),
    { sampleRate: 4 },
  );
  assert.deepEqual(
    accumulate(noLoop, { 2: stereo([10, 20]), 1: stereo([1, 2, 3, 4]) }),
    [10, 20, 0, 0, 0, 0],
  );
});

test("fades, interpolated envelopes and explicit bus gains multiply at local clip time", () => {
  const schedule = compileAudioSchedule(
    plan([
      clip({
        media: {
          src: "tone.wav",
          sourceDuration: 1,
          gain: 2,
          fadeIn: 0.5,
          fadeOut: 0.5,
          volumeEnvelope: [
            { time: 0.25, value: 0.5 },
            { time: 0.75, value: 1 },
          ],
          bus: "music",
        },
      }),
    ]),
    { sampleRate: 8, busConfig: { buses: [{ id: "music", gain: 0.25 }] } },
  );
  const sound = schedule.clips[0];
  assert.equal(audioGainAt(sound, 0), 0);
  assert.equal(audioGainAt(sound, 0.25), 0.125);
  assert.equal(audioGainAt(sound, 0.5), 0.375);
  assert.equal(audioGainAt(sound, 0.75), 0.25);
  assert.equal(audioGainAt(sound, 1), 0);
  assert.throws(
    () =>
      compileAudioSchedule(
        plan([clip({ media: { src: "tone.wav", bus: "missing" } })]),
        { busConfig: { buses: [] } },
      ),
    /unknown bus/,
  );
  assert.equal(
    compileAudioSchedule(
      plan([clip({ media: { src: "tone.wav", bus: "music" } })]),
    ).clips[0].busGain,
    1,
  );
});

test("declared audio shares an unclipped accumulator with legacy media", () => {
  const schedule = compileAudioSchedule(plan([clip()]), { sampleRate: 2 });
  assert.deepEqual(
    accumulate(
      schedule,
      { default: stereo([-0.75, -0.75]) },
      stereo([1.25, 1.25]),
    ),
    [0.5, 0.5],
  );
  const skipped = compileAudioSchedule(
    plan([
      clip({ kind: "video", media: { src: "tone.wav", audio: false } }),
      clip({ id: "muted", media: { src: "tone.wav", gain: 0 } }),
    ]),
  );
  assert.equal(skipped.clips.length, 0);
});

test("invalid source spans, windows, gains and envelopes fail before decoding", () => {
  for (const media of [
    { loop: true },
    { playbackRate: 0 },
    { playbackRate: 17 },
    { gain: -1 },
    { fadeOut: 2 },
    { sourceDuration: 0 },
    {
      volumeEnvelope: [
        { time: 0, value: 1 },
        { time: 0, value: 2 },
      ],
    },
  ])
    assert.throws(
      () =>
        compileAudioSchedule(
          plan([clip({ media: { src: "tone.wav", ...media } })]),
        ),
      /Scheduled audio/,
    );
  assert.throws(
    () =>
      compileAudioSchedule(
        plan([clip({ windows: [{ ...window(0, 1, 0, 1), rate: 2 }] })]),
      ),
    /windows/,
  );
});

function rms(samples, from, to) {
  const subset = samples.subarray(
    Math.round(from * 48000) * 2,
    Math.round(to * 48000) * 2,
  );
  return Math.sqrt(
    subset.reduce((sum, value) => sum + value * value, 0) / subset.length,
  );
}
function power(samples, from, to, frequency) {
  let real = 0,
    imaginary = 0,
    count = 0;
  for (
    let frame = Math.round(from * 48000);
    frame < Math.round(to * 48000);
    frame++
  ) {
    real +=
      samples[frame * 2] * Math.cos((2 * Math.PI * frequency * count) / 48000);
    imaginary +=
      samples[frame * 2] * Math.sin((2 * Math.PI * frequency * count) / 48000);
    count++;
  }
  return Math.hypot(real, imaginary) / count;
}
async function tone(t) {
  const directory = await temporary(t),
    file = path.join(directory, "tone.wav");
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=2",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    file,
  ]);
  return { directory, file };
}

test("real decoding preserves pitch across authored retiming and applies local envelopes to subranges", async (t) => {
  const { directory, file } = await tone(t);
  const composition = compileComposition({
    scenes: [
      { name: "quick", dur: 1, nat: 2 },
      { name: "slow", dur: 1, nat: 1 },
    ],
    clips: [
      {
        id: "tone",
        kind: "audio",
        timeBasis: "authored",
        start: 0,
        duration: 3,
        track: 0,
        media: {
          src: "tone.wav",
          sourceStart: 0.5,
          sourceDuration: 1,
          playbackRate: 1,
          loop: true,
          fadeIn: 0.5,
          volumeEnvelope: [
            { time: 0, value: 0.5 },
            { time: 3, value: 1 },
          ],
        },
      },
    ],
  });
  const assets = new Map([["tone.wav", { file }]]),
    stems = new Map();
  const result = await mixScheduledAudio({
    plan: composition,
    start: 0,
    duration: 2,
    directory,
    assets,
    stems,
    ensureAsset: async () => {},
  });
  assert.equal(result.used, 2);
  assert.ok(
    power(result.mixed, 0.3, 0.7, 440) >
      power(result.mixed, 0.3, 0.7, 880) * 20,
  );
  assert.ok(
    power(result.mixed, 1.2, 1.6, 440) >
      power(result.mixed, 1.2, 1.6, 220) * 20,
  );
  const subrange = await mixScheduledAudio({
    plan: composition,
    start: 1.25,
    duration: 0.5,
    directory,
    assets,
    stems,
    ensureAsset: async () => {},
  });
  assert.deepEqual(
    subrange.mixed,
    result.mixed.slice(1.25 * 48000 * 2, 1.75 * 48000 * 2),
  );
  assert.ok(rms(result.mixed, 0, 0.1) < rms(result.mixed, 0.3, 0.4) * 0.5);
});

test("one final mux retains legacy level when declared tracks overlap or are disabled", async (t) => {
  const { directory, file } = await tone(t);
  const src = `data:audio/wav;base64,${(await fs.readFile(file)).toString("base64")}`;
  const source = path.join(directory, "source.mp4");
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=s=32x32:r=10:d=1",
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    source,
  ]);
  const render = async (name, declaredPlan, audio = "auto") => {
    const video = path.join(directory, name);
    await fs.copyFile(source, video);
    const job = createAudioExport({ format: "mp4", audio, declaredPlan });
    try {
      await job.snapshot(null);
      await job.record(
        null,
        [{ id: 1, source: 0, src, start: 0, end: 1, speed: 1, volume: 1 }],
        0,
        1,
      );
      const result = await job.mix(null, video, {
        start: 0,
        duration: 1,
        compositionDuration: 1,
      });
      if (!result.audio) return { result };
      const bytes = ffmpeg([
        "-i",
        video,
        "-map",
        "0:a:0",
        "-f",
        "f32le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "pipe:1",
      ]);
      return {
        result,
        pcm: new Float32Array(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        ),
      };
    } finally {
      await job.dispose();
    }
  };
  const legacy = await render("legacy.mp4");
  const combined = await render(
    "combined.mp4",
    plan([clip({ media: { src, sourceDuration: 1 } })]),
  );
  assert.equal(combined.result.audioTracks, 2);
  assert.equal(combined.result.audioSegments, 2);
  assert.ok(
    Math.abs(rms(combined.pcm, 0.2, 0.8) / rms(legacy.pcm, 0.2, 0.8) - 2) <
      0.03,
  );
  const disabled = await render(
    "disabled.mp4",
    plan([clip({ media: { src, sourceDuration: 1 } })]),
    "none",
  );
  assert.equal(disabled.result.audio, false);
});

test("declared snapshots reject remote sources and source ranges beyond the asset", async (t) => {
  const job = createAudioExport({
    format: "mp4",
    audio: "auto",
    declaredPlan: plan([
      clip({ media: { src: "https://example.com/tone.wav" } }),
    ]),
  });
  try {
    await assert.rejects(job.snapshot(null), /loopback/);
  } finally {
    await job.dispose();
  }
  const { directory, file } = await tone(t);
  await assert.rejects(
    mixScheduledAudio({
      plan: plan([
        clip({
          media: { src: "tone.wav", sourceStart: 1.5, sourceDuration: 1 },
        }),
      ]),
      start: 0,
      duration: 1,
      directory,
      assets: new Map([["tone.wav", { file }]]),
      stems: new Map(),
      ensureAsset: async () => {},
    }),
    /range exceeds/,
  );
});

test("decoded PCM trims source offsets and remaining spans at exact sample boundaries", async (t) => {
  const directory = await temporary(t),
    raw = path.join(directory, "step.pcm"),
    file = path.join(directory, "step.wav");
  const input = new Float32Array(48000 * 2);
  for (let frame = 0; frame < 48000; frame++)
    input[frame * 2] = input[frame * 2 + 1] = frame < 24000 ? 0.125 : 0.5;
  await fs.writeFile(raw, Buffer.from(input.buffer));
  ffmpeg([
    "-f",
    "f32le",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-i",
    raw,
    "-c:a",
    "pcm_f32le",
    file,
  ]);
  const scheduled = plan(
    [
      clip({
        media: {
          src: "step.wav",
          sourceStart: 0.5,
          gain: 0.5,
          fadeIn: 0.1,
          bus: "voice",
        },
        windows: [{ ...window(0.15, 1.15, 0, 1), rate: 1 }],
      }),
    ],
    1.15,
  );
  const result = await mixScheduledAudio({
    plan: scheduled,
    start: 0,
    duration: 1.15,
    busConfig: { buses: [{ id: "voice", gain: 0.5 }] },
    directory,
    assets: new Map([["step.wav", { file }]]),
    stems: new Map(),
    ensureAsset: async () => {},
  });
  const at = (time) => result.mixed[Math.round(time * 48000) * 2];
  assert.equal(at(0.15 - 1 / 48000), 0);
  assert.equal(at(0.15), 0);
  assert.ok(Math.abs(at(0.2) - 0.0625) < 1e-7, String(at(0.2)));
  assert.equal(at(0.25), 0.125);
  assert.equal(at(0.65 - 1 / 48000), 0.125);
  assert.equal(at(0.65), 0);
});

test("audio cancellation aborts source fetching and rejects every export entry point", async () => {
  let received;
  const requestStarted = new Promise((resolve) => (received = resolve));
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "audio/wav" });
    response.write("incomplete source");
    received();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const controller = new AbortController();
  const job = createAudioExport({
    format: "mp4",
    audio: "auto",
    signal: controller.signal,
    declaredPlan: plan([
      clip({
        media: { src: `http://127.0.0.1:${server.address().port}/tone.wav` },
      }),
    ]),
  });
  try {
    const pending = job.snapshot(null);
    await requestStarted;
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    await assert.rejects(job.snapshot(null), { name: "AbortError" });
    await assert.rejects(job.record(null, [], 0, 1), { name: "AbortError" });
    await assert.rejects(
      job.mix(null, "unused.mp4", {
        start: 0,
        duration: 1,
        compositionDuration: 1,
      }),
      { name: "AbortError" },
    );
    await assert.rejects(
      mixScheduledAudio({
        plan: plan([clip()]),
        start: 0,
        duration: 1,
        signal: controller.signal,
      }),
      { name: "AbortError" },
    );
  } finally {
    await job.dispose();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
