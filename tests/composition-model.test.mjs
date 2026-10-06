import test from "node:test";
import assert from "node:assert/strict";
import {
  parseClipDocument,
  compileComposition,
  clipFrame,
  playbackTime,
  moveClip,
} from "../packages/core/src/timeline/composition-model.js";
import { authoredTime } from "../packages/core/src/timeline/motion-model.js";

const scenes = [
  { name: "Same", dur: 2, nat: 4 },
  { name: "Same", dur: 4, nat: 2 },
];
const clip = (id, extras = {}) => ({
  id,
  kind: "visual",
  timeBasis: "authored",
  start: 0,
  duration: 1,
  track: 0,
  ...extras,
});
const document = (clips) => ({ schemaVersion: 1, clips });
const code = (expected) => (error) =>
  error.name === "CompositionError" && error.code === expected;

test("authored clip windows preserve each native section rate and exact inverse", () => {
  const input = [clip("crossing", { start: 3, duration: 2 })];
  const plan = compileComposition({ scenes, clips: input });
  assert.equal(plan.duration, 6);
  assert.equal(plan.authoredTotal, 6);
  assert.equal(plan.cues.Same, 0);
  assert.deepEqual(plan.clips[0].windows, [
    {
      sectionIndex: 0,
      authoredStart: 3,
      authoredEnd: 4,
      playbackStart: 1.5,
      playbackEnd: 2,
      localStart: 0,
      localEnd: 1,
      rate: 2,
    },
    {
      sectionIndex: 1,
      authoredStart: 4,
      authoredEnd: 5,
      playbackStart: 2,
      playbackEnd: 4,
      localStart: 1,
      localEnd: 2,
      rate: 0.5,
    },
  ]);
  for (const time of [0, 0.2, 1.5, 2, 2.000001, 3.2, 5.8, 6])
    assert.ok(
      Math.abs(playbackTime(plan, authoredTime(plan, time)) - time) < 1e-12,
    );
  assert.equal(playbackTime(plan, -5), 0);
  assert.equal(playbackTime(plan, 50), 6);
  assert.equal(clipFrame(plan, "crossing", 1.5).visible, true);
  assert.equal(clipFrame(plan, "crossing", 2).localTime, 1);
  assert.equal(clipFrame(plan, "crossing", 3).localTime, 1.5);
  assert.equal(clipFrame(plan, "crossing", 3).progress, 0.75);
  assert.equal(clipFrame(plan, "crossing", 4).visible, false);
  assert.equal(clipFrame(plan, "crossing", -1).visible, false);
  assert.equal(Object.isFrozen(plan.clips[0].windows[0]), true);
  input[0].start = 0;
  assert.equal(plan.clips[0].start, 3);
});
test("playback clips remain in playback time while references resolve to target ends", () => {
  const decimal = compileComposition({
    scenes: [{ name: "Decimal", dur: 0.3 }],
    clips: [clip("decimal", { start: 0.1, duration: 0.2 })],
  });
  assert.equal(decimal.clips[0].end, 0.3);
  assert.equal(clipFrame(decimal, "decimal", 0.3).visible, false);
  const plan = compileComposition({
    scenes,
    clips: [
      clip("follow", {
        timeBasis: "playback",
        start: { after: "first", offset: -0.5 },
      }),
      clip("first", { timeBasis: "playback", start: 1, duration: 2 }),
    ],
  });
  assert.equal(plan.clips[0].start, 2.5);
  assert.equal(clipFrame(plan, "first", 2).localTime, 1);
  assert.equal(clipFrame(plan, "follow", 3).progress, 0.5);
  assert.equal(plan.clips[1].windows[1].rate, 1);
  assert.equal(plan.clips[1].windows[1].authoredEnd, 4.5);
  assert.equal(clipFrame(plan, "first", 6).visible, false);
});
test("references diagnose duplicate IDs, missing targets, cycles and ambiguous domains", () => {
  const compile = (clips) => compileComposition({ scenes, clips });
  assert.throws(() => compile([clip("a"), clip("a")]), code("DUPLICATE_ID"));
  assert.throws(
    () => compile([clip("a", { start: { after: "missing", offset: 0 } })]),
    code("MISSING_REFERENCE"),
  );
  assert.throws(
    () =>
      compile([
        clip("a", { start: { after: "b", offset: 0 } }),
        clip("b", { start: { after: "a", offset: 0 } }),
      ]),
    code("REFERENCE_CYCLE"),
  );
  assert.throws(
    () =>
      compile([
        clip("a"),
        clip("b", { timeBasis: "playback", start: { after: "a", offset: 0 } }),
      ]),
    code("CROSS_TIME_BASIS"),
  );
  assert.throws(
    () =>
      compile([clip("a", { start: { after: "b", offset: -3 } }), clip("b")]),
    code("CLIP_OUT_OF_RANGE"),
  );
  assert.throws(
    () => compile([clip("a", { start: 5.5 })]),
    code("CLIP_OUT_OF_RANGE"),
  );
});
test("clip JSON is bounded, typed, immutable and never evaluates input", () => {
  assert.throws(
    () => parseClipDocument('{"schemaVersion":1,"schemaVersion":1,"clips":[]}'),
    code("DUPLICATE_FIELD"),
  );
  assert.throws(
    () =>
      parseClipDocument(
        '{"schemaVersion":1,"schema\\u0056ersion":1,"clips":[]}',
      ),
    code("DUPLICATE_FIELD"),
  );
  assert.throws(
    () => parseClipDocument('{"schemaVersion":1,"clips":[]} trailing()'),
    code("INVALID_JSON"),
  );
  assert.throws(
    () => parseClipDocument(" ".repeat(1048577)),
    code("DOCUMENT_TOO_LARGE"),
  );
  assert.throws(
    () =>
      parseClipDocument(
        document(Array.from({ length: 501 }, (_, index) => clip(`c${index}`))),
      ),
    code("CLIP_COUNT"),
  );
  assert.throws(
    () => parseClipDocument({ schemaVersion: 2, clips: [] }),
    code("SCHEMA_VERSION"),
  );
  for (const extras of [
    { duration: NaN },
    { duration: Infinity },
    { track: 256 },
    { timeBasis: "scene" },
    { start: -1 },
    { kind: "script" },
    { params: { run: () => {} } },
    { scenes },
  ])
    assert.throws(() => parseClipDocument(document([clip("bad", extras)])));
  let calls = 0;
  const accessor = {
    schemaVersion: 1,
    get clips() {
      calls++;
      return [];
    },
  };
  assert.throws(() => parseClipDocument(accessor), code("INVALID_JSON"));
  assert.equal(calls, 0);
  const cycle = {};
  cycle.self = cycle;
  assert.throws(
    () => parseClipDocument(document([clip("a", { params: cycle })])),
    code("INVALID_JSON"),
  );
  const caption = parseClipDocument(
    document([
      clip("caption", {
        kind: "caption",
        text: "</script><script>run()</script>",
      }),
    ]),
  );
  assert.equal(caption.clips[0].text.includes("run()"), true);
  assert.equal(Object.isFrozen(caption.clips[0]), true);
  assert.throws(
    () => parseClipDocument(document([clip("caption", { kind: "caption" })])),
    code("INVALID_CAPTION"),
  );
  const moved = moveClip(caption, "caption", 1);
  assert.equal(moved.clips[0].start, 1);
  assert.equal(caption.clips[0].start, 0);
  assert.throws(() => moveClip(caption, "unknown", 0), code("UNKNOWN_CLIP"));
});
test("typed media derives deterministic loop and hold source times without selecting a clock", () => {
  const plan = compileComposition({
    scenes,
    clips: [
      clip("sound", {
        kind: "audio",
        duration: 5,
        media: {
          src: "audio/tone.wav",
          sourceStart: 2,
          sourceDuration: 3,
          playbackRate: 2,
          loop: true,
          gain: 0.5,
          fadeIn: 1,
          volumeEnvelope: [
            { time: 0, value: 0 },
            { time: 2, value: 1 },
          ],
          bus: "music",
        },
      }),
      clip("video", {
        kind: "video",
        timeBasis: "playback",
        duration: 5,
        media: {
          src: "video/shot.mp4",
          sourceStart: 2,
          sourceDuration: 3,
          playbackRate: 2,
          audio: false,
        },
      }),
    ],
  });
  assert.equal(clipFrame(plan, "sound", 1).sourceTime, 3);
  assert.equal(clipFrame(plan, "sound", -1).sourceTime, 2);
  assert.equal(clipFrame(plan, "video", 1).sourceTime, 4);
  assert.equal(clipFrame(plan, "video", 4).sourceTime, 5);
  for (const media of [
    { src: "https://example.com/audio.wav" },
    { src: "//example.com/a" },
    { src: "a", loop: true },
    { src: "a", playbackRate: 0 },
    { src: "a", fadeOut: 2 },
    { src: "a", gain: 17 },
    {
      src: "a",
      volumeEnvelope: [
        { time: 0, value: 1 },
        { time: 0, value: 2 },
      ],
    },
  ])
    assert.throws(() =>
      parseClipDocument(document([clip("bad", { kind: "audio", media })])),
    );
});
