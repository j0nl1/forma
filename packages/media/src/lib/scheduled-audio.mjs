import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  compileAudioSchedule,
  addScheduledWindow,
} from "../../../runtime/src/browser/audio-plan.js";

const run = promisify(execFile);
export function tempoFilters(speed) {
  const filters = [];
  while (speed > 2) {
    filters.push("atempo=2");
    speed /= 2;
  }
  while (speed < 0.5) {
    filters.push("atempo=0.5");
    speed *= 2;
  }
  if (speed !== 1) filters.push(`atempo=${speed}`);
  return filters;
}

export async function mixScheduledAudio({
  plan,
  busConfig,
  start,
  duration,
  directory,
  assets,
  stems,
  ensureAsset,
  mixed,
  signal,
}) {
  signal?.throwIfAborted();
  const schedule = compileAudioSchedule(plan, { start, duration, busConfig });
  let used = 0;
  for (const clip of schedule.clips) {
    signal?.throwIfAborted();
    await ensureAsset(clip.src);
    const asset = assets.get(clip.src);
    if (asset.duration === undefined) {
      const { stdout } = await run(
        "ffprobe",
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file",
          "-show_entries",
          "stream=codec_type,duration:format=duration",
          "-of",
          "json",
          asset.file,
        ],
        { maxBuffer: 1048576, timeout: 30000, signal },
      );
      const info = JSON.parse(stdout),
        stream = info.streams.find((item) => item.codec_type === "audio");
      asset.audible = !!stream;
      asset.duration = Number(stream?.duration ?? info.format?.duration);
    }
    if (!asset.audible) continue;
    if (!Number.isFinite(asset.duration) || asset.duration <= clip.sourceStart)
      throw new Error(
        "Scheduled audio source has no finite remaining duration",
      );
    const sourceDuration =
      clip.sourceDuration ?? asset.duration - clip.sourceStart;
    if (clip.sourceStart + sourceDuration > asset.duration + 1 / 48000)
      throw new Error("Scheduled audio source range exceeds the decoded asset");
    mixed ??= new Float32Array(schedule.samples * 2);
    for (const window of clip.windows) {
      const key = JSON.stringify([
        "declared",
        clip.src,
        clip.sourceStart,
        sourceDuration,
        window.speed,
      ]);
      if (!stems.has(key)) {
        const file = path.join(directory, `stem-${stems.size}.pcm`);
        const length = sourceDuration / window.speed;
        const filters = [
          `atrim=start=${clip.sourceStart}:end=${clip.sourceStart + sourceDuration}`,
          "asetpts=PTS-STARTPTS",
          ...tempoFilters(window.speed),
          "aresample=48000",
          "aformat=sample_fmts=flt:channel_layouts=stereo",
          "apad",
          `atrim=duration=${length}`,
        ].join(",");
        await run(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-n",
            "-protocol_whitelist",
            "file",
            "-i",
            asset.file,
            "-map",
            "0:a:0",
            "-vn",
            "-af",
            filters,
            "-t",
            String(length),
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "-ar",
            "48000",
            "-ac",
            "2",
            file,
          ],
          { maxBuffer: 1048576, timeout: 120000, signal },
        );
        const bytes = await fs.readFile(file),
          view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
          pcm = new Float32Array(bytes.length / 4);
        for (let i = 0; i < pcm.length; i++)
          pcm[i] = view.getFloat32(i * 4, true);
        if (!pcm.length)
          throw new Error(
            "Scheduled audio source interval did not decode any samples",
          );
        stems.set(key, pcm);
      }
      addScheduledWindow(
        schedule,
        clip,
        window,
        stems.get(key),
        mixed,
        sourceDuration,
      );
      used++;
    }
  }
  return { mixed, used };
}
