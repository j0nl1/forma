import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createAudioExport, readAudioTracks } from "./audio.mjs";

export function videoOptions(options = {}) {
  const value = {
    fps: 30,
    crf: 18,
    deviceScaleFactor: 2,
    bridgeGlobal: "codexTimeline",
    captureParam: "capture",
    audio: "auto",
    ...options,
  };
  for (const key of [
    "fps",
    "crf",
    "deviceScaleFactor",
    "startMs",
    "endMs",
    "width",
    "height",
    "duration",
  ])
    if (value[key] !== undefined) value[key] = Number(value[key]);
  if (!Number.isInteger(value.fps) || value.fps < 1 || value.fps > 60)
    throw new Error("fps must be an integer between 1 and 60");
  if (!["auto", "none"].includes(value.audio))
    throw new Error("audio must be auto or none");
  if (!Number.isInteger(value.crf) || value.crf < 0 || value.crf > 51)
    throw new Error("crf must be an integer between 0 and 51");
  if (
    !Number.isFinite(value.deviceScaleFactor) ||
    value.deviceScaleFactor < 1 ||
    value.deviceScaleFactor > 3
  )
    throw new Error("deviceScaleFactor must be between 1 and 3");
  if (
    !/^[A-Za-z_$][\w$]*$/.test(value.bridgeGlobal) ||
    !/^[\w-]+$/.test(value.captureParam)
  )
    throw new Error("Invalid bridge global or capture parameter");
  if (
    value.hideSelectors &&
    (!Array.isArray(value.hideSelectors) ||
      value.hideSelectors.some((s) => typeof s !== "string" || s.length > 512))
  )
    throw new Error("hideSelectors must be an array of CSS selectors");
  if (
    value.resetTransformSelector &&
    typeof value.resetTransformSelector !== "string"
  )
    throw new Error("resetTransformSelector must be a CSS selector");
  return value;
}
export async function renderVideo(page, errors, output, temporary, options) {
  const { fps, crf, deviceScaleFactor, bridgeGlobal } = options;
  const flags = [];
  try {
    const ready = await page.waitForFunction(
      (name) => {
        const bridge = window[name];
        return !!(
          bridge &&
          (typeof bridge.seek === "function" ||
            typeof bridge.setTime === "function")
        );
      },
      bridgeGlobal,
      { timeout: 8000, polling: 50 },
    );
    await ready.dispose();
  } catch (error) {
    if (error.name !== "TimeoutError") throw error;
    throw new Error(
      `The timeline bridge window.${bridgeGlobal} did not initialize within 8 seconds. Expose seek() or setTime() and duration, or configure bridgeGlobal to match the page.`,
    );
  }
  const bridge = await page.evaluate((name) => {
    const b = window[name];
    if (!b || (typeof b.seek !== "function" && typeof b.setTime !== "function"))
      return null;
    return {
      duration: b.duration,
      width: b.width,
      height: b.height,
      captureActive:
        b.captureActive === undefined ? undefined : !!b.captureActive,
    };
  }, bridgeGlobal);
  const duration = options.duration ?? bridge?.duration;
  if (!bridge || !Number.isFinite(duration) || duration < 0 || duration > 300)
    throw new Error(
      "A timeline bridge with duration 0..300 seconds is required",
    );
  const width = options.width ?? bridge.width,
    height = options.height ?? bridge.height;
  for (const dimension of [width, height])
    if (
      !Number.isInteger(dimension) ||
      dimension < 2 ||
      dimension > 4096 ||
      dimension % 2
    )
      throw new Error("Video dimensions must be even integers from 2 to 4096");
  if (width * height * deviceScaleFactor ** 2 > 67108864)
    throw new Error("Supersampled capture exceeds 64 million pixels");
  const start = options.startMs ?? 0,
    end = options.endMs ?? duration * 1000;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end > duration * 1000 ||
    (duration > 0 && end <= start) ||
    (duration === 0 && (start !== 0 || end !== 0))
  )
    throw new Error("Export interval must be within the composition duration");
  if (!duration)
    flags.push({
      kind: "zero_duration",
      message: "The composition has zero duration; one frame is exported",
    });
  if (await page.locator("[data-codex-exportable-video-duration]").count()) {
    try {
      await page.waitForFunction(
        () =>
          document.querySelector("[data-codex-exportable-video-duration]")
            .dataset.codexFontsInlined === "true",
        null,
        { timeout: 8000 },
      );
    } catch {
      flags.push({
        kind: "fonts_timeout",
        message: "Font embedding did not finish before capture",
      });
    }
    const warning = await page
      .locator("[data-codex-exportable-video-duration]")
      .getAttribute("data-codex-font-warning");
    if (warning) flags.push({ kind: "fonts_incomplete", message: warning });
  }
  await page.setViewportSize({ width, height });
  const captureActive = await page.evaluate(
    ({
      hideSelectors = [],
      resetTransformSelector,
      captureActive,
      width,
      height,
    }) => {
      document.documentElement.setAttribute("data-capture", "");
      captureActive ??=
        !!document.querySelector(".cd-motion[data-capture],motion-stage") ||
        [...document.querySelectorAll("[data-stage-chrome]")].some(
          (node) => getComputedStyle(node).display === "none",
        );
      if (captureActive) return true;
      const style = document.createElement("style");
      style.textContent =
        "html,body{margin:0;width:100%;height:100%;overflow:hidden}";
      if (hideSelectors.length || resetTransformSelector) {
        style.textContent += "*{transition:none!important}";
        for (const selector of hideSelectors) {
          document.querySelector(selector);
          style.textContent += `${selector}{display:none!important}`;
        }
        if (resetTransformSelector) {
          const nodes = document.querySelectorAll(resetTransformSelector);
          const declarations = Object.entries({
            transform: "none",
            "box-shadow": "none",
            width: `${width}px`,
            height: `${height}px`,
          }).map(([property, value]) => `${property}:${value}!important`);
          style.textContent += `${resetTransformSelector}{${declarations.join(";")}}`;
          const parent = nodes[0]?.parentElement;
          if (parent) {
            parent.style.setProperty("align-items", "flex-start", "important");
            parent.style.setProperty(
              "justify-content",
              "flex-start",
              "important",
            );
            parent.style.setProperty("overflow", "visible", "important");
          }
        }
        document.documentElement.style.background = "transparent";
        document.body.style.background = "transparent";
      }
      document.head.append(style);
      void document.body.offsetWidth;
      return false;
    },
    { ...options, captureActive: bridge.captureActive, width, height },
  );
  try {
    await page.waitForFunction(() => document.fonts.status === "loaded", null, {
      timeout: 8000,
    });
  } catch {
    flags.push({
      kind: "fonts_timeout",
      message: "Fonts did not finish loading before capture",
    });
  }
  const ext = path.extname(output).slice(1).toLowerCase();
  const scale = `scale=${width}:${height}:flags=lanczos,setsar=1`;
  const codec =
    ext === "mp4"
      ? [
          "-vf",
          scale,
          "-c:v",
          "libx264",
          "-crf",
          String(crf),
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
        ]
      : ext === "webm"
        ? ["-vf", scale, "-c:v", "libvpx-vp9", "-crf", String(crf), "-b:v", "0"]
        : ext === "gif"
          ? [
              "-filter_complex",
              `[0:v]${scale},split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=sierra2_4a`,
            ]
          : null;
  if (!codec) throw new Error("Video output must be .mp4, .webm, or .gif");
  const encoder = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-n",
      "-filter_complex_threads",
      "1",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "-framerate",
      String(fps),
      "-i",
      "pipe:0",
      ...codec,
      "-f",
      ext,
      temporary,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let diagnostic = "",
    failure;
  encoder.stderr.on("data", (d) => {
    diagnostic = (diagnostic + d).slice(-6000);
  });
  encoder.on("error", (e) => {
    failure = e;
  });
  encoder.stdin.on("error", (e) => {
    failure = e;
  });
  const completion = new Promise((resolve) =>
    encoder.on("close", (code) => resolve(code)),
  );
  const frames = Math.max(1, Math.ceil(((end - start) / 1000) * fps));
  const audioJob = createAudioExport({ format: ext, audio: options.audio });
  let mediaState, audioResult;
  let previousHash,
    duplicates = 0;
  try {
    if (options.audio !== "none")
      mediaState = await page.evaluateHandle(() => ({
        ids: new WeakMap(),
        next: 0,
      }));
    for (let i = 0; i < frames; i++) {
      if (failure) throw failure;
      await page.evaluate(
        async ({ name, time }) => {
          const b = window[name];
          b.setPlaying?.(false);
          if (b.seek) await b.seek(time);
          else await b.setTime(time);
          // A React commit changes a video's desired frame synchronously,
          // but decoding happens later. Capture only after the seek completes.
          const visibleVideos = [
            ...document.querySelectorAll("video[data-codex-video-target]"),
          ].filter(
            (video) =>
              video.getBoundingClientRect().width &&
              getComputedStyle(video).visibility !== "hidden",
          );
          await Promise.all(
            visibleVideos.map(async (video) => {
              video.pause();
              const target = Number(video.dataset.codexVideoTarget);
              await new Promise((resolve, reject) => {
                const events = [
                  "loadedmetadata",
                  "loadeddata",
                  "seeked",
                  "canplay",
                  "timeupdate",
                  "error",
                ];
                const clean = () => {
                  clearTimeout(timer);
                  events.forEach((event) =>
                    video.removeEventListener(event, check),
                  );
                };
                const check = () => {
                  if (video.error) {
                    clean();
                    reject(
                      new Error(
                        `Nested video could not load (media error ${video.error.code})`,
                      ),
                    );
                  } else if (
                    video.readyState >= 2 &&
                    Math.abs(video.currentTime - target) > 0.001
                  ) {
                    video.currentTime = target;
                  } else if (video.readyState >= 2 && !video.seeking) {
                    clean();
                    resolve();
                  }
                };
                const timer = setTimeout(() => {
                  clean();
                  reject(
                    new Error(
                      `Nested video did not decode its requested frame at ${target.toFixed(3)} seconds`,
                    ),
                  );
                }, 8000);
                events.forEach((event) => video.addEventListener(event, check));
                check();
              });
            }),
          );
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          // Chromium can drop a paused video's decoded-frame submission while
          // the newly visible surface awaits its previous frame acknowledgement.
          // After that paint, requesting a video frame retries surface submission.
          // Do not await the callback: held or quantized source frames may not
          // emit another callback. Keep the timeline paused throughout capture.
          const frameRequests = visibleVideos.map((video) => [
            video,
            video.requestVideoFrameCallback(() => {}),
          ]);
          try {
            if (frameRequests.length)
              await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              );
          } finally {
            for (const [video, id] of frameRequests)
              video.cancelVideoFrameCallback(id);
          }
        },
        { name: bridgeGlobal, time: start / 1000 + i / fps },
      );
      if (errors.length) throw new Error(errors.join("; "));
      if (mediaState) {
        const tracks = await page.evaluate(readAudioTracks, {
          state: mediaState,
          bridgeGlobal,
        });
        await audioJob.record(
          page,
          tracks,
          start / 1000 + i / fps,
          Math.min(end / 1000, start / 1000 + (i + 1) / fps),
        );
      }
      const png = await page.screenshot({ type: "png" });
      const hash = createHash("sha256").update(png).digest("hex");
      if (hash === previousHash) duplicates++;
      previousHash = hash;
      if (encoder.exitCode !== null)
        throw new Error(`FFmpeg exited early: ${diagnostic}`);
      if (!encoder.stdin.write(png))
        await Promise.race([
          once(encoder.stdin, "drain"),
          completion.then(() => {
            throw new Error(`FFmpeg stopped: ${diagnostic}`);
          }),
        ]);
    }
    encoder.stdin.end();
    const code = await completion;
    if (failure || code !== 0)
      throw new Error(`FFmpeg failed: ${failure?.message ?? diagnostic}`);
    audioResult = await audioJob.mix(page, temporary, {
      start: start / 1000,
      duration: frames / fps,
      compositionDuration: Math.max(duration, frames / fps),
    });
  } catch (error) {
    // FFmpeg can be blocked probing an empty input pipe before frame zero.
    // Closing stdin and killing this owned child guarantees failure cleanup.
    encoder.stdin.destroy();
    encoder.kill("SIGKILL");
    await completion;
    throw error;
  } finally {
    await audioJob.dispose();
    await mediaState?.dispose();
  }
  if (frames >= 8 && duplicates > frames * 0.85)
    flags.push({
      kind: "duplicate_frames",
      message:
        "Most consecutive frames were identical; verify the timeline or expected hold",
    });
  if (
    !captureActive &&
    !options.hideSelectors?.length &&
    !options.resetTransformSelector
  )
    flags.push({
      kind: "capture_mode_off",
      message:
        "No recognized capture mode or CSS fallback; check the exported framing",
    });
  return {
    frames,
    fps,
    duration: (end - start) / 1000,
    width,
    height,
    startMs: start,
    endMs: end,
    deviceScaleFactor,
    crf,
    audio: audioResult.audio,
    audioTracks: audioResult.audioTracks,
    audioSegments: audioResult.audioSegments,
    flags: [...flags, ...audioResult.flags],
  };
}
