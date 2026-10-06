import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { localUrl } from "../../../core/src/lib/files.mjs";
import { compileAudioSchedule } from "../../../runtime/src/browser/audio-plan.js";
import { mixScheduledAudio, tempoFilters } from "./scheduled-audio.mjs";

const run = promisify(execFile),
  rate = 48000,
  channels = 2;

// Called in the page after its synchronous seek. Muted native playback is
// deliberate for VideoSprite; the export marker is the audio opt-in.
export function readAudioTracks({ state, bridgeGlobal }) {
  const bridge = window[bridgeGlobal];
  const root =
    bridge.root ??
    document.querySelector(
      "[data-codex-exportable-video-duration],motion-stage",
    ) ??
    document.body;
  state.sources ??= new Map();
  return [
    ...root.querySelectorAll(
      "video[data-codex-exportable-video-play-start],audio[data-codex-exportable-video-play-start]",
    ),
  ].map((media) => {
    if (!state.ids.has(media)) state.ids.set(media, state.next++);
    const src = media.getAttribute("src")
      ? media.src
      : media.currentSrc || media.querySelector("source")?.src;
    const fresh = !state.sources.has(src);
    if (fresh) state.sources.set(src, state.sources.size);
    return {
      id: state.ids.get(media),
      source: state.sources.get(src),
      ...(fresh ? { src } : {}),
      start: Number(
        media.getAttribute("data-codex-exportable-video-play-start"),
      ),
      end: Number(media.getAttribute("data-codex-exportable-video-play-end")),
      speed: Number(
        media.getAttribute("data-codex-exportable-video-play-speed") || 1,
      ),
      volume: Number(
        media.getAttribute("data-codex-exportable-video-volume") ??
          media.volume,
      ),
    };
  });
}

export function audioTimeline() {
  const segments = [];
  const sources = new Map();
  let previous = new Map();
  return {
    segments,
    record(tracks, from, to) {
      const next = new Map();
      for (const track of tracks) {
        if (
          typeof track.src !== "string" ||
          !track.src ||
          ![track.start, track.end, track.speed, track.volume].every(
            Number.isFinite,
          ) ||
          track.start < 0 ||
          track.end <= track.start ||
          track.speed <= 0 ||
          track.volume < 0
        ) {
          throw new Error(
            "Marked audio needs a source, a positive source interval/speed and a nonnegative volume",
          );
        }
        if (!track.volume || !(to > from)) continue;
        if (!sources.has(track.src)) sources.set(track.src, sources.size);
        const key = JSON.stringify([
          track.id,
          sources.get(track.src),
          track.start,
          track.end,
          track.speed,
          track.volume,
        ]);
        const existing = previous.get(key);
        if (existing && Math.abs(existing.to - from) < 0.000001) {
          existing.to = to;
          next.set(key, existing);
        } else {
          const segment = { ...track, from, to };
          segments.push(segment);
          next.set(key, segment);
        }
      }
      previous = next;
    },
  };
}

export function createAudioExport({
  format,
  audio,
  declaredPlan,
  busConfig,
  signal,
}) {
  const timeline = audioTimeline(),
    assets = new Map(),
    references = new Map();
  let directory;
  const ensureAsset = async (page, source) => {
    signal?.throwIfAborted();
    if (assets.has(source)) return;
    directory ??= await fs.mkdtemp(path.join(os.tmpdir(), "forma-audio-"));
    const file = path.join(directory, `source-${assets.size}.media`);
    await saveAsset(page, source, file, signal);
    assets.set(source, { file });
  };
  return {
    async snapshot(page) {
      signal?.throwIfAborted();
      if (audio === "none" || format === "gif" || !declaredPlan) return;
      for (const clip of compileAudioSchedule(declaredPlan, { busConfig })
        .clips)
        await ensureAsset(page, clip.src);
    },
    async record(page, tracks, from, to) {
      signal?.throwIfAborted();
      if (audio === "none") return;
      tracks = tracks.map((track) => {
        if (track.src !== undefined) references.set(track.source, track.src);
        return { ...track, src: track.src ?? references.get(track.source) };
      });
      timeline.record(tracks, from, to);
      if (format === "gif" || !(to > from)) return;
      for (const track of tracks) {
        if (!track.volume || assets.has(track.src)) continue;
        // Snapshot while the node exists: unmounting a scene may revoke a blob.
        await ensureAsset(page, track.src);
      }
    },
    mix: (page, video, timing) =>
      mixVideoAudio(page, timeline.segments, video, format, timing, {
        directory,
        assets,
        declaredPlan: audio === "none" ? undefined : declaredPlan,
        busConfig,
        signal,
      }),
    dispose: () =>
      directory
        ? fs.rm(directory, { recursive: true, force: true })
        : Promise.resolve(),
  };
}

async function saveAsset(page, source, file, signal) {
  signal?.throwIfAborted();
  source = new URL(source, page?.url?.()).href;
  const url = new URL(source);
  if (url.protocol === "blob:") {
    const data = await page.evaluate(async (source) => {
      const blob = await (await fetch(source)).blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () =>
          reject(new Error("Embedded audio could not be read"));
        reader.readAsDataURL(blob);
      });
    }, source);
    signal?.throwIfAborted();
    await fs.writeFile(file, Buffer.from(data, "base64"));
    return;
  }
  let current = source;
  for (let redirect = 0; redirect <= 5; redirect++) {
    if (url.protocol !== "data:") localUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal:
        signal && typeof AbortSignal.any === "function"
          ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
          : (signal ?? AbortSignal.timeout(30000)),
    });
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.has("location")
    ) {
      await response.body?.cancel();
      current = new URL(response.headers.get("location"), current).href;
      // Redirects must retain the local boundary even from an embedded asset.
      localUrl(current);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Audio source returned HTTP ${response.status}`);
    }
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(file, { flags: "wx" }),
      { signal },
    );
    return;
  }
  throw new Error("Audio source has too many redirects");
}

// Decode each distinct source range/speed once, then loop by absolute timeline
// phase. This avoids a filter graph with one input for every captured frame.
export async function mixVideoAudio(
  page,
  segments,
  video,
  format,
  { start, duration, compositionDuration },
  cache,
) {
  const signal = cache?.signal;
  signal?.throwIfAborted();
  const declared = cache?.declaredPlan;
  const scheduled = declared
    ? compileAudioSchedule(declared, {
        start,
        duration,
        busConfig: cache?.busConfig,
      })
    : null;
  if (!segments.length && !scheduled?.clips.length)
    return { audio: false, audioTracks: 0, audioSegments: 0, flags: [] };
  if (format === "gif")
    return {
      audio: false,
      audioTracks: 0,
      audioSegments: 0,
      flags: [
        {
          kind: "audio_unsupported",
          message:
            "GIF cannot carry scheduled or marked media audio; choose MP4 or WebM to retain it",
        },
      ],
    };
  const directory =
    cache?.directory ??
    (await fs.mkdtemp(path.join(os.tmpdir(), "forma-audio-")));
  const ownsDirectory = !cache?.directory;
  const assets = cache?.assets ?? new Map(),
    stems = new Map();
  const samples = Math.ceil(duration * rate);
  let mixed;
  let used = 0;
  try {
    for (const segment of segments) {
      signal?.throwIfAborted();
      if (!assets.has(segment.src)) {
        const file = path.join(directory, `source-${assets.size}.media`);
        await saveAsset(page, segment.src, file, signal);
        assets.set(segment.src, { file });
      }
      const asset = assets.get(segment.src);
      if (asset.audible === undefined) {
        const { stdout } = await run(
          "ffprobe",
          [
            "-v",
            "error",
            "-protocol_whitelist",
            "file",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "json",
            asset.file,
          ],
          { maxBuffer: 1048576, timeout: 30000, signal },
        );
        asset.audible = JSON.parse(stdout).streams.some(
          (s) => s.codec_type === "audio",
        );
      }
      if (!asset.audible) continue;
      mixed ??= new Float32Array(samples * channels);
      const key = JSON.stringify([
        segment.src,
        segment.start,
        segment.end,
        segment.speed,
      ]);
      const loop = (segment.end - segment.start) / segment.speed;
      if (!stems.has(key)) {
        const file = path.join(directory, `stem-${stems.size}.pcm`);
        const length = Math.min(loop, compositionDuration);
        const filters = [
          `atrim=start=${segment.start}:end=${segment.end}`,
          "asetpts=PTS-STARTPTS",
          ...tempoFilters(segment.speed),
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
            String(rate),
            "-ac",
            String(channels),
            file,
          ],
          { maxBuffer: 1048576, signal },
        );
        const bytes = await fs.readFile(file);
        const view = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        );
        const pcm = new Float32Array(bytes.length / 4);
        for (let i = 0; i < pcm.length; i++)
          pcm[i] = view.getFloat32(i * 4, true);
        if (!pcm.length)
          throw new Error("Audio source interval did not decode any samples");
        stems.set(key, pcm);
      }
      const pcm = stems.get(key),
        frameCount = pcm.length / channels;
      const first = Math.max(0, Math.round((segment.from - start) * rate));
      const last = Math.min(samples, Math.round((segment.to - start) * rate));
      for (let i = first; i < last; i++) {
        const globalTime = start + i / rate;
        const phase = (globalTime % loop) * rate;
        const sourceFrame = Math.min(
          frameCount - 1,
          Math.floor(phase + 0.0000001),
        );
        for (let c = 0; c < channels; c++)
          mixed[i * channels + c] +=
            pcm[sourceFrame * channels + c] * segment.volume;
      }
      used++;
    }
    if (scheduled?.clips.length) {
      const result = await mixScheduledAudio({
        plan: declared,
        busConfig: cache?.busConfig,
        start,
        duration,
        directory,
        assets,
        stems,
        mixed,
        signal,
        ensureAsset: async (source) => {
          if (assets.has(source)) return;
          const file = path.join(directory, `source-${assets.size}.media`);
          await saveAsset(page, source, file, signal);
          assets.set(source, { file });
        },
      });
      mixed = result.mixed;
      used += result.used;
    }
    if (!used)
      return { audio: false, audioTracks: 0, audioSegments: 0, flags: [] };
    const raw = Buffer.alloc(mixed.length * 4);
    for (let i = 0; i < mixed.length; i++)
      raw.writeFloatLE(Math.max(-1, Math.min(1, mixed[i])), i * 4);
    const audio = path.join(directory, "mix.pcm"),
      muxed = path.join(directory, `mixed.${format}`);
    await fs.writeFile(audio, raw);
    await run(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-n",
        "-i",
        video,
        "-f",
        "f32le",
        "-ar",
        String(rate),
        "-ac",
        String(channels),
        "-i",
        audio,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        format === "mp4" ? "aac" : "libopus",
        "-b:a",
        format === "mp4" ? "192k" : "128k",
        "-t",
        String(duration),
        ...(format === "mp4" ? ["-movflags", "+faststart"] : []),
        "-f",
        format,
        muxed,
      ],
      { maxBuffer: 1048576, signal },
    );
    signal?.throwIfAborted();
    await fs.copyFile(muxed, video);
    return {
      audio: true,
      audioTracks: stems.size,
      audioSegments: used,
      flags: [],
    };
  } finally {
    if (ownsDirectory) await fs.rm(directory, { recursive: true, force: true });
  }
}
