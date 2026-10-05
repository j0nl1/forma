import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { temporary } from "./helpers.mjs";
import {
  checkAudio,
  planAudio,
  measureAudio,
  assembleAudio,
} from "../skills/studio-design/scripts/source-to-audio.mjs";
import * as legacy from "../skills/studio-design/scripts/podcast.mjs";

const hash = (data) => createHash("sha256").update(data).digest("hex");
const writeJSON = (file, value) => fs.writeFile(file, JSON.stringify(value));
const ffmpeg = (args) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);

async function fixture(t) {
  const dir = await temporary(t);
  const source = "The fictional pilot recorded six late collections.\n";
  await fs.writeFile(path.join(dir, "source.md"), source);
  const episode = {
    schemaVersion: 1,
    language: "en",
    timing: { wordsPerMinute: 150, targetSeconds: 2, toleranceSeconds: 0.05 },
    speakers: [{ id: "host", label: "Host" }],
    sources: [
      {
        id: "doc",
        path: "source.md",
        sha256: hash(source),
        anchors: [{ id: "p1", locator: "paragraph 1", text: source.trim() }],
      },
    ],
    segments: [
      {
        id: "s1",
        speaker: "host",
        kind: "content",
        text: "The fictional pilot recorded six late collections.",
        references: [{ source: "doc", anchor: "p1" }],
      },
      {
        id: "s2",
        speaker: "host",
        kind: "transition",
        text: "What could the next test tell us?",
        references: [],
      },
    ],
  };
  const episodeFile = path.join(dir, "episode.json");
  const clipsFile = path.join(dir, "clips.json");
  await writeJSON(episodeFile, episode);
  const checked = await checkAudio(episodeFile);
  await fs.mkdir(path.join(dir, "clips"));
  const clips = { schemaVersion: 1, clips: [] };
  for (let i = 0; i < 2; i++) {
    const relative = `clips/s${i + 1}.wav`;
    ffmpeg([
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${i ? 880 : 440}:sample_rate=48000:duration=${i ? 0.65 : 0.35}`,
      "-c:a",
      "pcm_s16le",
      path.join(dir, relative),
    ]);
    clips.clips.push({
      segmentId: `s${i + 1}`,
      path: relative,
      renderHash: checked.segments[i].renderHash,
      sha256: hash(await fs.readFile(path.join(dir, relative))),
    });
  }
  await writeJSON(clipsFile, clips);
  return { dir, episode, episodeFile, clips, clipsFile, checked };
}

test("audio planning remains an estimate and decoded clips disclose a missed duration target", async (t) => {
  const { episodeFile, clipsFile } = await fixture(t);
  const plan = await planAudio(episodeFile);
  const measured = await measureAudio(episodeFile, clipsFile);
  assert.ok(plan.estimatedSeconds > 1);
  assert.ok(Math.abs(measured.actualSeconds - 1) < 0.002);
  assert.equal(measured.timing.targetSeconds, 2);
  assert.equal(measured.timing.withinTolerance, false);
  assert.ok(measured.timing.deviationSeconds < -0.99);
});

test("generic and legacy audio entry points preserve CLI and API behavior", async (t) => {
  const { episodeFile, clipsFile, dir } = await fixture(t);
  const expected = await planAudio(episodeFile);
  assert.deepEqual(
    await legacy.checkPodcast(episodeFile),
    await checkAudio(episodeFile),
  );
  assert.deepEqual(await legacy.planPodcast(episodeFile), expected);
  assert.deepEqual(
    await legacy.measurePodcast(episodeFile, clipsFile),
    await measureAudio(episodeFile, clipsFile),
  );
  const assembled = await legacy.assemblePodcast(
    episodeFile,
    clipsFile,
    path.join(dir, "legacy.wav"),
  );
  assert.equal(assembled.actualSeconds, 1);
  for (const name of ["source-to-audio.mjs", "podcast.mjs"]) {
    const script = fileURLToPath(
      new URL(`../skills/studio-design/scripts/${name}`, import.meta.url),
    );
    const result = spawnSync(process.execPath, [script, "plan", episodeFile], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), expected);
    const invalid = spawnSync(
      process.execPath,
      [script, "plan", episodeFile, "--clips", clipsFile],
      {
        encoding: "utf8",
      },
    );
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Usage:/);
  }
});

test("assembled audio preserves complete clips in script order without padding to target", async (t) => {
  const { dir, episodeFile, clipsFile } = await fixture(t);
  const output = path.join(dir, "episode.wav");
  const result = await assembleAudio(episodeFile, clipsFile, output);
  const decoded = ffmpeg([
    "-i",
    output,
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
  const samples = new Float32Array(
    decoded.buffer.slice(
      decoded.byteOffset,
      decoded.byteOffset + decoded.byteLength,
    ),
  );
  const power = (from, to, frequency) => {
    let real = 0,
      imaginary = 0;
    const slice = samples.subarray(
      Math.round(from * 48000),
      Math.round(to * 48000),
    );
    for (let i = 0; i < slice.length; i++) {
      const angle = (2 * Math.PI * frequency * i) / 48000;
      real += slice[i] * Math.cos(angle);
      imaginary += slice[i] * Math.sin(angle);
    }
    return Math.hypot(real, imaginary) / slice.length;
  };
  assert.ok(Math.abs(samples.length / 48000 - 1) < 0.002);
  assert.ok(power(0.05, 0.25, 440) > power(0.05, 0.25, 880) * 10);
  assert.ok(power(0.45, 0.85, 880) > power(0.45, 0.85, 440) * 10);
  assert.equal(result.timing.withinTolerance, false);
  const original = await fs.readFile(output);
  await assert.rejects(assembleAudio(episodeFile, clipsFile, output));
  assert.deepEqual(await fs.readFile(output), original);
});

test("audio assembly rejects missing, corrupt, or stale clips without publishing partial episodes", async (t) => {
  const { dir, episode, episodeFile, clips, clipsFile } = await fixture(t);
  const output = path.join(dir, "failed.wav");
  await writeJSON(clipsFile, { ...clips, clips: clips.clips.slice(0, 1) });
  await assert.rejects(assembleAudio(episodeFile, clipsFile, output));
  await assert.rejects(fs.stat(output), { code: "ENOENT" });
  await writeJSON(clipsFile, clips);
  const broken = Buffer.from("This is not decodable audio.");
  await fs.writeFile(path.join(dir, clips.clips[1].path), broken);
  clips.clips[1].sha256 = hash(broken);
  await writeJSON(clipsFile, clips);
  await assert.rejects(assembleAudio(episodeFile, clipsFile, output));
  await assert.rejects(fs.stat(output), { code: "ENOENT" });
  episode.segments[0].text =
    "The fictional pilot recorded seven late collections.";
  await writeJSON(episodeFile, episode);
  await assert.rejects(measureAudio(episodeFile, clipsFile));
});

test("source references and hashes reject changed evidence before audio assembly", async (t) => {
  const { dir, episode, episodeFile } = await fixture(t);
  episode.segments[0].references[0].anchor = "missing";
  await writeJSON(episodeFile, episode);
  await assert.rejects(checkAudio(episodeFile));
  episode.segments[0].references[0].anchor = "p1";
  await writeJSON(episodeFile, episode);
  await fs.writeFile(path.join(dir, "source.md"), "Different source evidence.");
  await assert.rejects(checkAudio(episodeFile));
});

test("audio sources, clips, and outputs stay contained, including symlink paths", async (t) => {
  const { dir, episode, episodeFile, clips, clipsFile } = await fixture(t);
  const outside = await temporary(t);
  await fs.copyFile(
    path.join(dir, "source.md"),
    path.join(outside, "source.md"),
  );
  await fs.symlink(outside, path.join(dir, "outside"));
  episode.sources[0].path = "outside/source.md";
  await writeJSON(episodeFile, episode);
  await assert.rejects(checkAudio(episodeFile));
  episode.sources[0].path = "source.md";
  await writeJSON(episodeFile, episode);
  await fs.copyFile(
    path.join(dir, clips.clips[0].path),
    path.join(outside, "clip.wav"),
  );
  clips.clips[0].path = "outside/clip.wav";
  await writeJSON(clipsFile, clips);
  await assert.rejects(measureAudio(episodeFile, clipsFile));
  clips.clips[0].path = "clips/s1.wav";
  await writeJSON(clipsFile, clips);
  await assert.rejects(
    assembleAudio(episodeFile, clipsFile, path.join(outside, "escaped.wav")),
  );
  await assert.rejects(
    assembleAudio(episodeFile, clipsFile, "outside/escaped.wav"),
  );
  await assert.rejects(fs.stat(path.join(outside, "escaped.wav")), {
    code: "ENOENT",
  });
});

test("audio decoder refuses import playlists that would read another local file", async (t) => {
  const { dir, episodeFile, clips, clipsFile } = await fixture(t);
  const playlist = "ffconcat version 1.0\nfile 's1.wav'\n";
  await fs.writeFile(path.join(dir, "clips", "import.ffconcat"), playlist);
  clips.clips[0].path = "clips/import.ffconcat";
  clips.clips[0].sha256 = hash(playlist);
  await writeJSON(clipsFile, clips);
  const output = path.join(dir, "playlist.wav");
  await assert.rejects(assembleAudio(episodeFile, clipsFile, output));
  await assert.rejects(fs.stat(output), { code: "ENOENT" });
});

test("audio MP3 delivery reports duration measured from its decoded final audio", async (t) => {
  const { dir, episode, episodeFile, clipsFile } = await fixture(t);
  episode.timing.targetSeconds = 1;
  await writeJSON(episodeFile, episode);
  const output = path.join(dir, "episode.mp3");
  const result = await assembleAudio(episodeFile, clipsFile, output);
  const decoded = ffmpeg([
    "-i",
    output,
    "-map",
    "0:a:0",
    "-f",
    "s16le",
    "-ar",
    "48000",
    "-ac",
    "1",
    "pipe:1",
  ]);
  const seconds = decoded.length / (48000 * 2);
  assert.ok(Math.abs(seconds - 1) < 0.002);
  assert.ok(Math.abs(result.actualSeconds - seconds) < 0.0001);
  assert.equal(result.timing.withinTolerance, true);
  assert.equal(result.sha256, hash(await fs.readFile(output)));
});

async function speechFixture(t, { silence = false } = {}) {
  const value = await fixture(t);
  const duration = 4;
  for (let clip = 0; clip < 2; clip++) {
    const pcm = Buffer.alloc(duration * 48000 * 2);
    for (let n = 0; n < pcm.length / 2; n++) {
      const time = n / 48000;
      const envelope =
        Math.min(1, time / 0.02, (duration - time) / 0.02) *
        (0.3 + 0.7 * Math.sin(3 * Math.PI * time) ** 2);
      const frequency = clip ? 220 : 120;
      let sample =
        (clip ? 0.22 : 0.025) *
        envelope *
        (Math.sin(2 * Math.PI * frequency * time) +
          0.4 * Math.sin(4 * Math.PI * frequency * time) +
          0.2 * Math.sin(6 * Math.PI * frequency * time));
      // A bounded sharp attack tests limiting independently of average speech level.
      if (!clip && Math.abs(time - 1.2) < 0.0003) sample = 0.98;
      pcm.writeInt16LE(silence && clip ? 0 : Math.round(sample * 32767), n * 2);
    }
    const raw = path.join(value.dir, `voice-${clip}.pcm`);
    await fs.writeFile(raw, pcm);
    const destination = path.join(value.dir, value.clips.clips[clip].path);
    await fs.rm(destination);
    ffmpeg([
      "-f",
      "s16le",
      "-ar",
      "48000",
      "-ac",
      "1",
      "-i",
      raw,
      "-c:a",
      "pcm_s16le",
      destination,
    ]);
    value.clips.clips[clip].sha256 = hash(await fs.readFile(destination));
  }
  await writeJSON(value.clipsFile, value.clips);
  return value;
}

test("speech leveling equalizes distinct voice-like levels and verifies encoded MP3 peaks without changing timing", async (t) => {
  const { dir, episodeFile, clipsFile } = await speechFixture(t);
  const output = path.join(dir, "leveled.mp3");
  const result = await assembleAudio(episodeFile, clipsFile, output, {
    levelSpeech: true,
  });
  assert.equal(result.leveling.verified, true);
  assert.ok(
    result.segments[1].leveling.before.integratedLufs -
      result.segments[0].leveling.before.integratedLufs >
      15,
  );
  assert.ok(result.leveling.spreadLu < 1);
  assert.ok(result.leveling.output.truePeakDb <= -2);
  assert.ok(Math.abs(result.actualSeconds - 8) < 0.0001);
  const decoded = ffmpeg([
    "-i",
    output,
    "-f",
    "s16le",
    "-ar",
    "48000",
    "-ac",
    "1",
    "pipe:1",
  ]);
  assert.equal(decoded.length, 8 * 48000 * 2);
  const energy = (from, to, frequency) => {
    let real = 0,
      imaginary = 0;
    for (let n = Math.round(from * 48000); n < Math.round(to * 48000); n++) {
      const value = decoded.readInt16LE(n * 2);
      const angle = (2 * Math.PI * frequency * n) / 48000;
      real += value * Math.cos(angle);
      imaginary += value * Math.sin(angle);
    }
    return Math.hypot(real, imaginary);
  };
  assert.ok(energy(0.5, 1, 120) > energy(0.5, 1, 220) * 10);
  assert.ok(energy(4.5, 5, 220) > energy(4.5, 5, 120) * 10);
  // Check time alignment independently of duration; a delayed-and-padded filter would fail.
  const original = await fs.readFile(path.join(dir, "voice-0.pcm"));
  const correlations = [];
  for (let shift = -24; shift <= 24; shift++) {
    let sum = 0;
    for (let n = 2000; n < 14000; n++)
      sum += original.readInt16LE(n * 2) * decoded.readInt16LE((n + shift) * 2);
    correlations.push({ shift, sum });
  }
  correlations.sort((a, b) => b.sum - a.sum);
  assert.ok(Math.abs(correlations[0].shift) <= 1);
  const independent = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      output,
      "-af",
      "ebur128=peak=true",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  assert.equal(independent.status, 0);
  const truePeak = Number(
    independent.stderr.match(/True peak:\s*Peak:\s*(-?[\d.]+) dBFS/)[1],
  );
  assert.ok(truePeak <= -2);
  assert.equal(result.leveling.checks.sampleCountPreserved, true);
  await assert.rejects(
    assembleAudio(episodeFile, clipsFile, output, { levelSpeech: true }),
  );
});

test("speech leveling preserves digital silence and refuses unverifiable short non-silent clips", async (t) => {
  const { dir, episodeFile, clipsFile } = await speechFixture(t, {
    silence: true,
  });
  const result = await assembleAudio(
    episodeFile,
    clipsFile,
    "with-silence.wav",
    { levelSpeech: true, targetLufs: -21, truePeakDb: -3 },
  );
  assert.equal(result.segments[1].leveling.status, "digital-silence-preserved");
  assert.equal(result.segments[1].leveling.after.integratedLufs, null);
  assert.equal(result.leveling.verified, true);
  assert.equal(result.actualSeconds, 8);
  const short = await fixture(t);
  const output = path.join(short.dir, "unverifiable.wav");
  await assert.rejects(
    assembleAudio(short.episodeFile, short.clipsFile, output, {
      levelSpeech: true,
    }),
    /cannot be measured/,
  );
  await assert.rejects(fs.stat(output), { code: "ENOENT" });
  await assert.rejects(
    assembleAudio(episodeFile, clipsFile, path.join(dir, "bad.wav"), {
      targetLufs: -19,
    }),
    /require levelSpeech/,
  );
  await assert.rejects(
    assembleAudio(episodeFile, clipsFile, path.join(dir, "bad.wav"), {
      levelSpeech: true,
      truePeakDb: 1,
    }),
    /truePeakDb/,
  );
});
