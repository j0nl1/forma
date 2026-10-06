import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { object } from "./podcast-model.mjs";

const rawInput = (file) => [
  "-f",
  "s16le",
  "-ar",
  "48000",
  "-ac",
  "1",
  "-i",
  file,
];
const fields = {
  integratedLufs: "input_i",
  truePeakDb: "input_tp",
  loudnessRangeLu: "input_lra",
  thresholdLufs: "input_thresh",
};
export function speechProfile(options = {}) {
  object(options, ["levelSpeech", "targetLufs", "truePeakDb"], "audio options");
  if (
    options.levelSpeech !== undefined &&
    typeof options.levelSpeech !== "boolean"
  )
    throw new Error("levelSpeech must be a boolean");
  if (!options.levelSpeech) {
    if (options.targetLufs !== undefined || options.truePeakDb !== undefined)
      throw new Error("Loudness targets require levelSpeech");
    return null;
  }
  const targetLufs = options.targetLufs ?? -19;
  const truePeakDb = options.truePeakDb ?? -2;
  if (!Number.isFinite(targetLufs) || targetLufs < -36 || targetLufs > -9)
    throw new Error("targetLufs must be in [-36, -9]");
  if (!Number.isFinite(truePeakDb) || truePeakDb < -8 || truePeakDb > -1)
    throw new Error("truePeakDb must be in [-8, -1]");
  return {
    preset: "mono-speech-experiment",
    targetLufs,
    truePeakDb,
    internalTruePeakDb: truePeakDb - 1,
    loudnessRangeLu: 11,
    loudnessToleranceLu: 1,
    codecHeadroomDb: 1,
  };
}
function filter(profile, extra = "") {
  return `loudnorm=I=${profile.targetLufs}:TP=${profile.internalTruePeakDb}:LRA=${profile.loudnessRangeLu}:dual_mono=false:print_format=json${extra}`;
}
export async function loudnessMetrics(file, profile, run) {
  const { stderr } = await run([
    "-loglevel",
    "info",
    "-nostats",
    ...rawInput(file),
    "-af",
    filter(profile),
    "-f",
    "null",
    "-",
  ]);
  const match = stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) throw new Error("FFmpeg did not return loudness measurements");
  const values = JSON.parse(match[0]);
  const metrics = {};
  for (const [key, field] of Object.entries(fields)) {
    const value = Number(values[field]);
    if (values[field] === "-inf") metrics[key] = null;
    else if (Number.isFinite(value)) metrics[key] = value;
    else throw new Error(`Invalid loudness measurement: ${field}`);
  }
  return {
    ...metrics,
    offsetDb: Number.isFinite(Number(values.target_offset))
      ? Number(values.target_offset)
      : null,
  };
}
async function isDigitalSilence(file) {
  for await (const bytes of createReadStream(file))
    for (const byte of bytes) if (byte !== 0) return false;
  return true;
}
export async function levelSpeechClip(input, output, profile, run) {
  const before = await loudnessMetrics(input, profile, run);
  if (before.integratedLufs === null) {
    if (!(await isDigitalSilence(input)))
      throw new Error(
        "Speech loudness cannot be measured; use a longer audible coherent clip or raw assembly",
      );
    await fs.copyFile(input, output, fs.constants.COPYFILE_EXCL);
    return {
      status: "digital-silence-preserved",
      before,
      after: before,
      passes: 0,
    };
  }
  const size = (await fs.stat(input)).size;
  let offset = before.offsetDb ?? 0;
  for (let pass = 1; pass <= 3; pass++) {
    if (pass > 1) await fs.rm(output);
    const parameters = `:measured_I=${before.integratedLufs}:measured_TP=${before.truePeakDb}:measured_LRA=${before.loudnessRangeLu}:measured_thresh=${before.thresholdLufs}:offset=${offset}:linear=true`;
    await run([
      ...rawInput(input),
      "-af",
      `${filter(profile, parameters)},aresample=48000`,
      "-ar",
      "48000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      "-f",
      "s16le",
      output,
    ]);
    if ((await fs.stat(output)).size !== size)
      throw new Error(
        "Speech leveling changed the decoded sample count; no output published",
      );
    const after = await loudnessMetrics(output, profile, run);
    if (
      after.integratedLufs !== null &&
      after.truePeakDb !== null &&
      Math.abs(after.integratedLufs - profile.targetLufs) <=
        profile.loudnessToleranceLu &&
      after.truePeakDb <= profile.internalTruePeakDb + 0.05
    )
      return { status: "leveled", before, after, passes: pass };
    if (after.integratedLufs === null) break;
    offset += profile.targetLufs - after.integratedLufs;
    if (!Number.isFinite(offset) || Math.abs(offset) > 99) break;
  }
  throw new Error(
    "Speech leveling could not verify the requested loudness and peak targets within three passes; no output published",
  );
}
export async function verifyLeveledOutput(file, segments, profile, run) {
  const size = (await fs.stat(file)).size;
  const ranges = [];
  let offset = 0;
  for (const segment of segments) {
    const bytes = Math.round(segment.actualSeconds * 48000) * 2;
    if (segment.leveling.status !== "digital-silence-preserved") {
      const slice = `${file}.${ranges.length}.verification.pcm`;
      const input = await fs.open(file, "r");
      const output = await fs.open(slice, "wx");
      try {
        let remaining = bytes;
        let position = offset;
        const buffer = Buffer.alloc(Math.min(65536, bytes));
        while (remaining) {
          const { bytesRead } = await input.read(
            buffer,
            0,
            Math.min(buffer.length, remaining),
            position,
          );
          if (!bytesRead) throw new Error("Encoded speech output lost samples");
          await output.write(buffer.subarray(0, bytesRead));
          position += bytesRead;
          remaining -= bytesRead;
        }
      } finally {
        await input.close();
        await output.close();
      }
      try {
        ranges.push({
          id: segment.id,
          ...(await loudnessMetrics(slice, profile, run)),
        });
      } finally {
        await fs.rm(slice, { force: true });
      }
    }
    offset += bytes;
  }
  if (size !== offset)
    throw new Error(
      "Encoded speech output changed the decoded sample count; no output published",
    );
  const output = await loudnessMetrics(file, profile, run);
  const levels = ranges.map((item) => item.integratedLufs);
  const verifiable =
    levels.length > 0 &&
    levels.every(Number.isFinite) &&
    Number.isFinite(output.integratedLufs) &&
    Number.isFinite(output.truePeakDb);
  const spreadLu = verifiable
    ? Math.max(...levels) - Math.min(...levels)
    : null;
  const checks = {
    sampleCountPreserved: true,
    measurableSpeech: verifiable,
    peakCeilingMet: verifiable && output.truePeakDb <= profile.truePeakDb,
    targetLoudnessMet:
      verifiable &&
      Math.abs(output.integratedLufs - profile.targetLufs) <=
        profile.loudnessToleranceLu,
    segmentTargetsMet:
      verifiable &&
      levels.every(
        (level) =>
          Math.abs(level - profile.targetLufs) <= profile.loudnessToleranceLu,
      ),
    consistencyMet: verifiable && spreadLu <= profile.loudnessToleranceLu * 2,
  };
  return {
    output,
    segments: ranges,
    spreadLu,
    checks,
    verified: Object.values(checks).every(Boolean),
  };
}
