import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const run = promisify(execFile);
const maximumBytes = 128 * 1024 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function seconds(value) {
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const clock = value.match(/^(?:(\d+):)?(\d{2}):(\d{2}(?:\.\d+)?)$/);
  return clock && Number(clock[2]) < 60 && Number(clock[3]) < 60
    ? Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
    : NaN;
}

export function pptxMediaSettings(object) {
  const marked = object.trimStart != null;
  const fragment = new URL(object.src).hash.slice(1);
  const temporal = new URLSearchParams(fragment).get("t");
  let start = 0,
    end = null,
    fragmentStart = 0,
    fragmentEnd = null;
  if (temporal != null) {
    const values = temporal.replace(/^npt:/, "").split(",");
    if (values.length > 2)
      throw new Error("PowerPoint media has an invalid temporal fragment.");
    fragmentStart = values[0] ? seconds(values[0]) : 0;
    fragmentEnd = values[1] ? seconds(values[1]) : null;
    if (
      !Number.isFinite(fragmentStart) ||
      (fragmentEnd != null &&
        (!Number.isFinite(fragmentEnd) || fragmentEnd <= fragmentStart))
    )
      throw new Error(
        "PowerPoint media has an invalid temporal fragment range.",
      );
  }
  if (marked) {
    start = Number(object.trimStart);
    end = object.trimEnd == null ? null : Number(object.trimEnd);
  }
  const rate = Number(
    marked ? (object.authoredPlaybackRate ?? 1) : (object.playbackRate ?? 1),
  );
  // These markers are the existing audio-export opt-in. VideoSprite mutes its
  // native element while its authored audio remains enabled for export.
  const gain = Number(
    marked
      ? (object.authoredVolume ?? object.volume ?? 1)
      : object.muted
        ? 0
        : (object.volume ?? 1),
  );
  let loop = marked || Boolean(object.loop);
  // Chromium seeks to a #t start and pauses once at its end on a 250ms timer.
  // Subsequent play() resumes beyond that boundary; VideoSprite's markers,
  // by contrast, describe a periodic interval rather than a one-shot pause.
  const ended =
    object.ended ||
    (Number.isFinite(object.duration) &&
      object.duration > 0 &&
      object.currentTime >= object.duration);
  const phase = marked
    ? start
    : ended
      ? 0
      : object.autoplay
        ? fragmentStart
        : Number(object.currentTime ?? fragmentStart);
  const fragmentBoundary =
    marked || fragmentEnd == null
      ? null
      : !ended && phase < fragmentEnd
        ? "first-playback-trim"
        : "past-boundary";
  if (fragmentBoundary === "first-playback-trim") {
    end = fragmentEnd;
    loop = false;
  }
  if (
    ![start, phase, rate, gain].every(Number.isFinite) ||
    start < 0 ||
    phase < 0 ||
    (end != null && (!Number.isFinite(end) || end <= start)) ||
    rate < 1 / 16 ||
    rate > 16 ||
    gain < 0 ||
    (!marked && gain > 1)
  )
    throw new Error(
      "PowerPoint media needs a valid nonnegative source range, rate between 1/16 and 16, and nonnegative gain (HTML volume must be between 0 and 1).",
    );
  return {
    start,
    end,
    phase,
    rate,
    gain,
    loop,
    fragmentEnd: marked ? null : fragmentEnd,
    fragmentBoundary,
    preservesPitch: marked || object.preservesPitch !== false,
    trigger: object.autoplay ? "automatic" : "on-click",
  };
}

async function tool(name, args, timeout) {
  try {
    return await run(name, args, {
      timeout,
      maxBuffer: 1024 * 1024,
      killSignal: "SIGKILL",
    });
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(
        `PowerPoint media playback settings require local ${name}; install FFmpeg to export this adjusted source.`,
        { cause: error },
      );
    throw new Error(
      `PowerPoint media ${name} failed while preparing its local playback copy: ${(error.stderr || error.message).slice(0, 1200)}`,
      { cause: error },
    );
  }
}

function tempo(rate) {
  const filters = [];
  while (rate > 2) {
    filters.push("atempo=2");
    rate /= 2;
  }
  while (rate < 0.5) {
    filters.push("atempo=0.5");
    rate *= 2;
  }
  if (rate !== 1) filters.push(`atempo=${rate}`);
  return filters;
}

export async function preparePptxPlayback(bytes, extn, object) {
  const settings = pptxMediaSettings(object);
  let outputFrameRate = null;
  const result = (embedded, extension, duration, changes = []) => ({
    bytes: embedded,
    extn: extension,
    playback: {
      embeddedSource: changes.length ? "derived" : "original",
      sourceStart: settings.start,
      sourceEnd: settings.end,
      initialPosition: settings.phase,
      playbackRate: settings.rate,
      preservesPitch: settings.preservesPitch,
      gain: settings.gain,
      fragmentEnd: settings.fragmentEnd,
      fragmentBoundary: settings.fragmentBoundary,
      loop: settings.loop,
      trigger: settings.trigger,
      duration,
      outputFrameRate,
      changes,
      sourceSha256: hash(bytes),
      embeddedSha256: hash(embedded),
      sourceBytes: bytes.length,
      embeddedBytes: embedded.length,
    },
  });
  if (
    settings.start === 0 &&
    settings.end == null &&
    settings.phase === 0 &&
    settings.rate === 1 &&
    settings.gain === 1
  )
    return result(bytes, extn, object.duration ?? null);
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "studio-pptx-media-"),
  );
  try {
    const input = path.join(directory, `source.${extn}`);
    await fs.writeFile(input, bytes);
    const { stdout } = await tool(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-show_entries",
        "format=duration:stream=codec_type,duration,width,height,sample_rate,r_frame_rate,avg_frame_rate",
        "-of",
        "json",
        input,
      ],
      30000,
    );
    const probe = JSON.parse(stdout),
      video = probe.streams.find((stream) => stream.codec_type === "video"),
      audio = probe.streams.find((stream) => stream.codec_type === "audio"),
      sourceDuration = Number(
        probe.format?.duration ?? video?.duration ?? audio?.duration,
      );
    if (
      !Number.isFinite(sourceDuration) ||
      sourceDuration <= 0 ||
      (object.mediaType === "video" ? !video : !audio)
    )
      throw new Error(
        "PowerPoint media playback adjustment requires a finite, decodable local source.",
      );
    if (
      audio &&
      (!Number.isFinite(Number(audio.sample_rate)) ||
        Number(audio.sample_rate) <= 0)
    )
      throw new Error(
        "PowerPoint media playback adjustment requires a valid audio sample rate.",
      );
    if (
      video &&
      (video.width > 8192 ||
        video.height > 8192 ||
        video.width * video.height > 33554432)
    )
      throw new Error(
        "PowerPoint media playback adjustment exceeds the 8192-pixel / 32-megapixel frame limit.",
      );
    const end = settings.end ?? sourceDuration;
    if (
      end > sourceDuration + 0.05 ||
      settings.start >= end ||
      settings.phase >= end
    )
      throw new Error(
        "PowerPoint media source range or initial position lies outside its decoded duration.",
      );
    settings.end = Math.min(end, sourceDuration);
    const duration =
      (settings.end - (settings.loop ? settings.start : settings.phase)) /
      settings.rate;
    if (duration <= 0 || duration > 3600)
      throw new Error(
        "PowerPoint media playback adjustment must produce at most one hour per playback cycle.",
      );
    const changes = [];
    if (
      settings.start > 0 ||
      settings.end < sourceDuration - 0.001 ||
      settings.phase > settings.start
    )
      changes.push("source-range");
    if (settings.rate !== 1) changes.push("playback-rate");
    if (audio && settings.gain !== 1) changes.push("volume");
    if (!changes.length) return result(bytes, extn, duration);
    if (video && object.mediaType === "video") {
      const frameRate = (value) => {
        const [numerator, denominator = 1] = String(value)
          .split("/")
          .map(Number);
        return numerator / denominator;
      };
      const sourceRate =
        frameRate(video.r_frame_rate) || frameRate(video.avg_frame_rate);
      if (!Number.isFinite(sourceRate) || sourceRate <= 0)
        throw new Error(
          "PowerPoint media playback adjustment requires a valid video frame rate.",
        );
      outputFrameRate = Math.min(120, Math.max(1, sourceRate * settings.rate));
    }
    const ranges =
      settings.loop && settings.phase > settings.start
        ? [
            [settings.phase, settings.end],
            [settings.start, settings.phase],
          ]
        : [[settings.phase, settings.end]];
    const filters = [];
    const tracks =
      object.mediaType === "video" ? (audio ? ["v", "a"] : ["v"]) : ["a"];
    for (const track of tracks) {
      for (const [index, [from, to]] of ranges.entries())
        filters.push(
          `[0:${track}:0]${track === "v" ? "trim" : "atrim"}=start=${from}:end=${to},${track === "v" ? "setpts" : "asetpts"}=PTS-STARTPTS[${track}${index}]`,
        );
      const source = ranges.length === 1 ? `[${track}0]` : `[${track}joined]`;
      if (ranges.length > 1)
        filters.push(
          `${ranges.map((_, index) => `[${track}${index}]`).join("")}concat=n=${ranges.length}:v=${track === "v" ? 1 : 0}:a=${track === "a" ? 1 : 0}${source}`,
        );
      const adjustment =
        track === "v"
          ? [
              `setpts=PTS/${settings.rate}`,
              "pad=ceil(iw/2)*2:ceil(ih/2)*2",
              // setpts changes timestamps but older FFmpeg retains the input
              // frame duration. Explicit resampling prevents CFR from dropping
              // the end of sped-up clips; bound high-rate/VFR output to 120 fps.
              `fps=${outputFrameRate}`,
            ]
          : [
              ...(settings.preservesPitch
                ? tempo(settings.rate)
                : [
                    `asetrate=${Math.round(Number(audio.sample_rate) * settings.rate)}`,
                    `aresample=${audio.sample_rate}`,
                  ]),
              `volume=${settings.gain}`,
              "apad",
              `atrim=duration=${duration}`,
            ];
      filters.push(`${source}${adjustment.join(",")}[${track}out]`);
    }
    const extension = object.mediaType === "video" ? "mp4" : "wav",
      output = path.join(directory, `playback.${extension}`);
    const codecs =
      object.mediaType === "video"
        ? [
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            ...(audio ? ["-c:a", "aac", "-b:a", "192k"] : []),
          ]
        : ["-c:a", "pcm_s16le"];
    await tool(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-n",
        "-protocol_whitelist",
        "file",
        "-threads",
        "2",
        "-i",
        input,
        "-filter_complex_threads",
        "1",
        "-filter_complex",
        filters.join(";"),
        ...tracks.flatMap((track) => ["-map", `[${track}out]`]),
        ...codecs,
        "-threads",
        "2",
        "-t",
        String(duration),
        "-fs",
        String(maximumBytes),
        output,
      ],
      120000,
    );
    const stat = await fs.stat(output);
    if (!stat.size || stat.size >= maximumBytes)
      throw new Error(
        "PowerPoint adjusted media exceeds the 128 MiB output limit.",
      );
    const verified = await tool(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-show_entries",
        "format=duration:stream=codec_type,duration",
        "-of",
        "json",
        output,
      ],
      30000,
    );
    const encoded = JSON.parse(verified.stdout);
    const durations = [
      encoded.format?.duration,
      ...tracks.map(
        (track) =>
          encoded.streams?.find(
            (stream) =>
              stream.codec_type === (track === "v" ? "video" : "audio"),
          )?.duration,
      ),
    ].map(Number);
    if (
      durations.some(
        (value) =>
          !Number.isFinite(value) ||
          value <= 0 ||
          Math.abs(value - duration) >
            Math.max(0.05, 1 / (outputFrameRate || 100)),
      )
    )
      throw new Error(
        "PowerPoint adjusted media did not preserve its requested playback duration; no partial copy was embedded.",
      );
    return result(await fs.readFile(output), extension, duration, changes);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
