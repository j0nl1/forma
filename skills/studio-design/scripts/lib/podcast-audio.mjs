import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import {
  speechProfile,
  levelSpeechClip,
  loudnessMetrics,
  verifyLeveledOutput,
} from "./podcast-level.mjs";
import { safeFile, contained } from "./files.mjs";
import {
  object,
  hash,
  sha256,
  readData,
  boundedBytes,
  relativePath,
  maxSeconds,
  timingResult,
} from "./podcast-model.mjs";

const run = promisify(execFile);
const sampleRate = 48000;
const bytesPerSecond = sampleRate * 2;
const maxPcmBytes = maxSeconds * bytesPerSecond;
async function ffmpeg(arguments_) {
  try {
    return await run(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", ...arguments_],
      { timeout: 120000, killSignal: "SIGKILL", maxBuffer: 1048576 },
    );
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(
        "FFmpeg is required to decode and assemble podcast clips",
      );
    throw new Error(
      `FFmpeg failed or exceeded the 120-second processing limit: ${error.stderr?.trim() || error.message}`,
    );
  }
}
async function decode(input, output) {
  await ffmpeg([
    "-xerror",
    "-protocol_whitelist",
    "file",
    "-format_whitelist",
    "wav,mp3,flac,ogg,mov,aac,aiff,matroska",
    "-i",
    input,
    "-map",
    "0:a:0",
    "-vn",
    "-ar",
    String(sampleRate),
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    "-f",
    "s16le",
    "-fs",
    String(maxPcmBytes + 2),
    output,
  ]);
  const { size } = await fs.stat(output);
  if (!size || size % 2 || size > maxPcmBytes)
    throw new Error("Clip did not decode within the 7200-second audio limit");
  return size / bytesPerSecond;
}
async function destination(root, output) {
  if (typeof output !== "string" || !output || /\0/.test(output))
    throw new Error("A local output path is required");
  if (!path.isAbsolute(output)) relativePath(output);
  const full = contained(root, path.resolve(root, output));
  const parent = await fs.realpath(path.dirname(full));
  contained(root, parent);
  const final = path.join(parent, path.basename(full));
  if (![".mp3", ".wav"].includes(path.extname(final).toLowerCase()))
    throw new Error("Podcast output must be MP3 or WAV");
  try {
    await fs.lstat(final);
    throw new Error(`Output already exists: ${final}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return final;
}
export async function inspectClips(loaded, manifestFile, output, options = {}) {
  const { root, episode, report } = loaded;
  const profile = speechProfile(options);
  if (profile && output === undefined)
    throw new Error("Speech leveling requires assembly with an output file");
  const manifestPath = await safeFile(
    root,
    relativePath(path.relative(root, path.resolve(manifestFile))),
  );
  const manifest = await readData(manifestPath);
  object(manifest, ["schemaVersion", "clips"], "clip manifest");
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.clips))
    throw new Error("Clip manifest needs schemaVersion 1 and clips");
  if (manifest.clips.length !== episode.segments.length)
    throw new Error(
      "Clip manifest must contain exactly one clip for every segment",
    );
  const clips = new Map();
  for (const clip of manifest.clips) {
    object(clip, ["segmentId", "path", "renderHash", "sha256"], "clip");
    const segment = report.segments.find(({ id }) => id === clip.segmentId);
    if (!segment || clips.has(clip.segmentId))
      throw new Error(`Unknown or duplicate clip segment: ${clip.segmentId}`);
    hash(clip.renderHash, "Clip renderHash");
    hash(clip.sha256, "Clip sha256");
    if (clip.renderHash !== segment.renderHash)
      throw new Error(`Stale clip renderHash: ${clip.segmentId}`);
    clips.set(clip.segmentId, clip);
  }
  const outputFile =
    output === undefined ? undefined : await destination(root, output);
  // Encoding temporary files beside the destination permits atomic no-replace publication.
  const directory = await fs.mkdtemp(
    path.join(
      outputFile ? path.dirname(outputFile) : os.tmpdir(),
      ".studio-podcast-",
    ),
  );
  const measured = [];
  const combined = path.join(directory, "episode.pcm");
  const rawCombined = path.join(directory, "unleveled.pcm");
  let actualSeconds = 0;
  try {
    for (let index = 0; index < report.segments.length; index++) {
      const segment = report.segments[index];
      const clip = clips.get(segment.id);
      const source = await safeFile(root, relativePath(clip.path));
      const bytes = await boundedBytes(source, 128 * 1024 * 1024);
      if (sha256(bytes) !== clip.sha256)
        throw new Error(`Clip hash mismatch: ${segment.id}`);
      const snapshot = path.join(directory, `clip-${index}.media`);
      const pcm = path.join(directory, `clip-${index}.pcm`);
      await fs.writeFile(snapshot, bytes, { flag: "wx" });
      const seconds = await decode(snapshot, pcm);
      actualSeconds += seconds;
      if (actualSeconds > maxSeconds)
        throw new Error("Decoded episode exceeds 7200 seconds");
      let leveling;
      let selectedPcm = pcm;
      if (profile) {
        await pipeline(
          createReadStream(pcm),
          createWriteStream(rawCombined, { flags: index ? "a" : "wx" }),
        );
        selectedPcm = path.join(directory, `leveled-${index}.pcm`);
        leveling = await levelSpeechClip(pcm, selectedPcm, profile, ffmpeg);
      }
      measured.push({
        id: segment.id,
        actualSeconds: seconds,
        sha256: clip.sha256,
        renderHash: clip.renderHash,
        ...(leveling ? { leveling } : {}),
      });
      if (outputFile)
        await pipeline(
          createReadStream(selectedPcm),
          createWriteStream(combined, { flags: index ? "a" : "wx" }),
        );
      await fs.rm(snapshot);
      await fs.rm(pcm);
      if (profile) await fs.rm(selectedPcm);
    }
    let outputHash;
    let levelingReport;
    if (outputFile) {
      const extension = path.extname(outputFile).toLowerCase();
      const encoded = path.join(directory, `encoded${extension}`);
      let gainDb = 0;
      const verification = path.join(directory, "verification.pcm");
      for (let attempt = 1; attempt <= (profile ? 3 : 1); attempt++) {
        if (attempt > 1) {
          await fs.rm(encoded);
          await fs.rm(verification);
        }
        await ffmpeg([
          "-f",
          "s16le",
          "-ar",
          String(sampleRate),
          "-ac",
          "1",
          "-i",
          combined,
          ...(gainDb ? ["-af", `volume=${gainDb}dB`] : []),
          "-map_metadata",
          "-1",
          "-c:a",
          extension === ".mp3" ? "libmp3lame" : "pcm_s16le",
          ...(extension === ".mp3" ? ["-b:a", "128k"] : []),
          encoded,
        ]);
        actualSeconds = await decode(encoded, verification);
        if (!profile) break;
        const validation = await verifyLeveledOutput(
          verification,
          measured,
          profile,
          ffmpeg,
        );
        levelingReport = {
          profile,
          before: await loudnessMetrics(rawCombined, profile, ffmpeg),
          ...validation,
          encodingPasses: attempt,
          finalGainDb: gainDb,
        };
        if (validation.verified) break;
        if (attempt === 3 || !validation.checks.measurableSpeech)
          throw new Error(
            "Encoded speech output did not meet verified loudness, consistency and peak targets; no output published",
          );
        const peakGain =
          profile.truePeakDb - validation.output.truePeakDb - 0.2;
        const loudnessGain =
          profile.targetLufs - validation.output.integratedLufs;
        gainDb += Math.min(loudnessGain, peakGain);
      }
      const digest = createHash("sha256");
      for await (const chunk of createReadStream(encoded)) digest.update(chunk);
      outputHash = digest.digest("hex");
      await fs.link(encoded, outputFile);
    }
    return {
      actualSeconds,
      segments: measured,
      timing: timingResult(actualSeconds, episode.timing),
      ...(outputFile ? { outputFile, sha256: outputHash } : {}),
      ...(levelingReport ? { leveling: levelingReport } : {}),
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
