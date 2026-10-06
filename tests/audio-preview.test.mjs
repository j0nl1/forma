import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { createAudioPreview } from "../packages/runtime/src/browser/audio-plan.js";

const makePlan = (
  media = {},
  windows = [
    { playbackStart: 0, playbackEnd: 1, localStart: 0, localEnd: 1, rate: 1 },
  ],
  duration = 1,
) => ({
  duration,
  clips: [
    {
      id: "sound",
      kind: "audio",
      duration: windows.at(-1).localEnd,
      media: { src: "tone.wav", sourceStart: 1, sourceDuration: 2, ...media },
      windows,
    },
  ],
});
function fakeContext() {
  const sources = [],
    gains = [];
  const context = {
    currentTime: 10,
    sampleRate: 10,
    destination: {},
    createBufferSource() {
      const source = {
        connected: [],
        starts: [],
        stops: [],
        disconnected: false,
        playbackRate: { setValueAtTime: (...args) => (source.rate = args) },
        connect: (node) => source.connected.push(node),
        disconnect: () => (source.disconnected = true),
        start: (...args) => source.starts.push(args),
        stop: (...args) => source.stops.push(args),
      };
      sources.push(source);
      return source;
    },
    createGain() {
      const gain = {
        connected: [],
        disconnected: false,
        gain: { setValueCurveAtTime: (...args) => (gain.curve = args) },
        connect: (node) => gain.connected.push(node),
        disconnect: () => (gain.disconnected = true),
      };
      gains.push(gain);
      return gain;
    },
  };
  return { context, sources, gains };
}

test("preview schedules piecewise native playback rates, source-loop offsets and shared gains", async () => {
  const { context, sources, gains } = fakeContext();
  const loads = [];
  const preview = createAudioPreview({
    context,
    loadSource: async (src, options) => {
      loads.push({ src, options });
      return { duration: 4 };
    },
  });
  const plan = makePlan(
    {
      playbackRate: 2,
      loop: true,
      gain: 2,
      bus: "music",
      fadeIn: 1,
      volumeEnvelope: [
        { time: 0, value: 0 },
        { time: 2, value: 1 },
      ],
    },
    [
      {
        playbackStart: 0,
        playbackEnd: 0.5,
        localStart: 0,
        localEnd: 1,
        rate: 2,
      },
      {
        playbackStart: 0.5,
        playbackEnd: 1.5,
        localStart: 1,
        localEnd: 2,
        rate: 1,
      },
    ],
    1.5,
  );
  const result = await preview.start(plan, {
    time: 0.3,
    busConfig: { buses: [{ id: "music", gain: 0.5 }] },
  });
  assert.equal(loads.length, 1);
  assert.equal(loads[0].options.context, context);
  assert.equal(result.scheduledWindows, 2);
  assert.equal(result.flags[0].kind, "audio_preview_pitch");
  assert.equal(sources[0].loop, true);
  assert.deepEqual([sources[0].loopStart, sources[0].loopEnd], [1, 3]);
  assert.deepEqual(sources[0].starts[0], [10.02, 2.2]);
  assert.deepEqual(sources[0].rate, [4, 10.02]);
  assert.deepEqual(sources[1].starts[0], [10.219999999999999, 1]);
  assert.equal(sources[1].rate[0], 2);
  assert.ok(Math.abs(gains[0].curve[0][0] - 0.18) < 1e-7);
  assert.ok(Math.abs(gains[0].curve[0].at(-1) - 0.5) < 1e-7);
  assert.equal(sources[0].connected[0], gains[0]);
  assert.equal(gains[0].connected[0], context.destination);
  context.currentTime = 10.42;
  assert.ok(Math.abs(preview.currentTime() - 0.7) < 1e-8);
  assert.ok(Math.abs(preview.pause() - 0.7) < 1e-8);
  assert.equal(preview.playing, false);
  assert.ok(
    sources.every((source) => source.disconnected && source.stops.length === 2),
  );
  assert.ok(gains.every((gain) => gain.disconnected));
});

test("nonlooping preview stops at the selected source span and rescheduling disconnects the former graph", async () => {
  const { context, sources } = fakeContext();
  const preview = createAudioPreview({
    context,
    loadSource: async () => ({ duration: 3 }),
  });
  const plan = makePlan({ sourceDuration: 0.5 });
  const first = await preview.start(plan);
  assert.equal(first.flags.length, 0);
  assert.deepEqual(sources[0].starts[0], [10.02, 1]);
  assert.deepEqual(sources[0].stops[0], [10.52]);
  await preview.start(plan, { time: 0.2 });
  assert.equal(sources[0].disconnected, true);
  assert.deepEqual(sources[1].starts[0], [10.02, 1.2]);
  await preview.start(plan, { time: 0.6 });
  assert.equal(preview.playing, false);
  assert.equal(sources[1].disconnected, true);
  const end = await preview.start(plan, { time: 1 });
  assert.equal(end.scheduledWindows, 0);
});

test("stop aborts pending adapters and never schedules a stale graph", async () => {
  const { context, sources } = fakeContext();
  let finish, signal;
  const preview = createAudioPreview({
    context,
    loadSource: async (_, options) => {
      signal = options.signal;
      return new Promise((resolve) => (finish = resolve));
    },
  });
  const pending = preview.start(makePlan());
  preview.stop();
  assert.equal(signal.aborted, true);
  finish({ duration: 4 });
  assert.equal((await pending).cancelled, true);
  assert.equal(sources.length, 0);
});

test("preview rejects remote sources and invalid decoded ranges without implicit fetching", async () => {
  const { context, sources } = fakeContext();
  let loads = 0;
  const preview = createAudioPreview({
    context,
    loadSource: async () => {
      loads++;
      return { duration: 2 };
    },
  });
  await assert.rejects(
    preview.start(makePlan({ src: "https://example.com/tone.wav" })),
    /local/,
  );
  assert.equal(loads, 0);
  await assert.rejects(preview.start(makePlan()), /range exceeds/);
  assert.equal(sources.length, 0);
  assert.throws(
    () => createAudioPreview({ loadSource: () => {} }),
    /explicit AudioContext/,
  );
});

test("Chromium OfflineAudioContext renders the shared sample schedule with envelopes and bus gains", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const source = await fs.readFile(
      new URL("../packages/runtime/src/browser/audio-plan.js", import.meta.url),
      "utf8",
    );
    const result = await page.evaluate(async (moduleSource) => {
      const { createAudioPreview } = await import(
        `data:text/javascript;base64,${btoa(moduleSource)}`
      );
      const context = new OfflineAudioContext(2, 48000 * 1.2, 48000);
      const buffer = context.createBuffer(2, 48000, 48000);
      buffer.getChannelData(0).fill(0.5);
      buffer.getChannelData(1).fill(0.5);
      const preview = createAudioPreview({
        context,
        loadSource: async () => buffer,
      });
      const plan = {
        duration: 1,
        clips: [
          {
            id: "sound",
            kind: "audio",
            duration: 0.5,
            media: {
              src: "tone.wav",
              sourceDuration: 0.5,
              gain: 0.5,
              fadeIn: 0.1,
              fadeOut: 0.1,
              bus: "voice",
              volumeEnvelope: [
                { time: 0, value: 1 },
                { time: 0.5, value: 0.5 },
              ],
            },
            windows: [
              {
                playbackStart: 0.15,
                playbackEnd: 0.65,
                localStart: 0,
                localEnd: 0.5,
                rate: 1,
              },
            ],
          },
        ],
      };
      const schedule = await preview.start(plan, {
        busConfig: { buses: [{ id: "voice", gain: 0.5 }] },
      });
      const output = await context.startRendering();
      const samples = output.getChannelData(0);
      const at = (time) => samples[Math.round(time * 48000)];
      return {
        schedule,
        before: at(0.17 - 1 / 48000),
        first: at(0.17),
        fade: at(0.22),
        body: at(0.37),
        fadeOut: at(0.62),
        after: at(0.67),
        right: output.getChannelData(1)[Math.round(0.37 * 48000)],
      };
    }, source);
    assert.equal(result.schedule.scheduledWindows, 1);
    assert.equal(result.before, 0);
    assert.ok(Math.abs(result.first) < 1e-6);
    assert.ok(Math.abs(result.fade - 0.059375) < 1e-5);
    assert.ok(Math.abs(result.body - 0.1) < 1e-5);
    assert.ok(Math.abs(result.fadeOut - 0.034375) < 1e-5);
    assert.equal(result.after, 0);
    assert.equal(result.right, result.body);
  } finally {
    await browser.close();
  }
});
