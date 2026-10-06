import path from "node:path";
import { chromiumCapture } from "../adapters/chromium-capture.mjs";
import { ffmpegEncoder } from "../adapters/ffmpeg-encoder.mjs";
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
    captureMethod: "standard",
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
  if (
    value.frameTimeoutMs !== undefined &&
    (!Number.isFinite(value.frameTimeoutMs) ||
      value.frameTimeoutMs < 1 ||
      value.frameTimeoutMs > 60000)
  )
    throw new Error("frameTimeoutMs must be between 1 and 60000");
  if (value.onProgress !== undefined && typeof value.onProgress !== "function")
    throw new Error("onProgress must be a function");
  if (!Number.isInteger(value.fps) || value.fps < 1 || value.fps > 60)
    throw new Error("fps must be an integer between 1 and 60");
  if (!["standard", "fast"].includes(value.captureMethod))
    throw new Error("captureMethod must be standard or fast");
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
// Wait only on listeners owned by this blocked write; never attach a reaction
// to the long-lived completion promise for every frame.
function waitForDrain(stream, encoder, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.off("drain", drain);
      stream.off("error", error);
      encoder.off("close", close);
      signal?.removeEventListener("abort", abort);
    };
    const drain = () => {
      cleanup();
      resolve();
    };
    const error = (value) => {
      cleanup();
      reject(value);
    };
    const close = () => error(new Error("FFmpeg stopped during frame write"));
    const abort = () =>
      error(signal.reason ?? new Error("Video export aborted"));
    stream.once("drain", drain);
    stream.once("error", error);
    encoder.once("close", close);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else if (
      encoder.exitCode !== null ||
      encoder.signalCode !== null ||
      stream.destroyed
    )
      close();
  });
}
export async function renderVideo(
  page,
  errors,
  output,
  temporary,
  options,
  { capture = chromiumCapture, encode = ffmpegEncoder } = {},
) {
  options.signal?.throwIfAborted();
  const started = performance.now();
  const phases = {
    seekAndRenderMs: 0,
    captureMs: 0,
    encodeWaitMs: 0,
    audioMs: 0,
  };
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
    if (b?.compositionError) throw new Error(b.compositionError);
    if (!b || (typeof b.seek !== "function" && typeof b.setTime !== "function"))
      return null;
    return {
      devicePixelRatio: window.devicePixelRatio,
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
    {
      hideSelectors: options.hideSelectors,
      resetTransformSelector: options.resetTransformSelector,
      captureActive: bridge.captureActive,
      width,
      height,
    },
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
  const declaredPlan =
    options.audioPlan ??
    (await page.evaluate(
      (name) => window[name].audioPlan ?? null,
      bridgeGlobal,
    ));
  const encoder = encode({ fps, codec, ext, temporary });
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
  const audioJob = createAudioExport({
    format: ext,
    audio: options.audio,
    declaredPlan,
    busConfig: options.audioBuses,
    signal: options.signal,
  });
  const abortEncoder = () => {
    encoder.stdin.destroy();
    encoder.kill("SIGKILL");
  };
  options.signal?.addEventListener("abort", abortEncoder, { once: true });
  let mediaState, audioResult, captureHandle;
  let previousHash,
    duplicates = 0;
  try {
    captureHandle = await capture(page, {
      method: options.captureMethod,
      width,
      height,
      scale: deviceScaleFactor,
    });
    await audioJob.snapshot?.(page);
    if (options.audio !== "none")
      mediaState = await page.evaluateHandle(() => ({
        ids: new WeakMap(),
        next: 0,
      }));
    for (let i = 0; i < frames; i++) {
      options.signal?.throwIfAborted();
      if (failure) throw failure;
      const seekStarted = performance.now();
      const { token, visibleVideoCount } = await page.evaluate(
        async ({ name, time, frameTimeoutMs }) => {
          const b = window[name];
          if (b.compositionError) throw new Error(b.compositionError);
          b.setPlaying?.(false);
          let token;
          if (b.beginFrame) token = await b.beginFrame(time);
          else if (b.seek) await b.seek(time);
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
          if (visibleVideos.length)
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
          // A seek can introduce an image after initial page readiness.
          const images = [
            ...(b.root ?? document).querySelectorAll("img"),
          ].filter(
            (image) =>
              (image.currentSrc ||
                image.src ||
                image.srcset ||
                image.closest("picture")?.querySelector("source[srcset]")) &&
              image.getBoundingClientRect().width &&
              getComputedStyle(image).visibility !== "hidden",
          );
          let timer;
          try {
            await Promise.race([
              Promise.all([
                document.fonts.ready,
                ...images.map((image) => image.decode()),
              ]),
              new Promise((_, reject) => {
                timer = setTimeout(
                  () =>
                    reject(
                      new Error("Required frame assets did not become ready"),
                    ),
                  frameTimeoutMs,
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
          // Dependent canvas/GPU work runs after decoded media surfaces are ready.
          if (token)
            await b.completeFrame(token, { timeoutMs: frameTimeoutMs });
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          if (token) b.verifyFrame(token);
          return { token, visibleVideoCount: visibleVideos.length };
        },
        {
          name: bridgeGlobal,
          time: start / 1000 + i / fps,
          frameTimeoutMs: options.frameTimeoutMs ?? 8000,
        },
      );
      phases.seekAndRenderMs += performance.now() - seekStarted;
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
      options.signal?.throwIfAborted();
      const captureStarted = performance.now();
      // The first snapshot submits newly visible paused-video surfaces. Capture
      // again after its acknowledgement so an older retained surface is not encoded.
      if (visibleVideoCount) {
        await captureHandle.capture();
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(resolve)),
        );
      }
      const png = await captureHandle.capture();
      if (token)
        await page.evaluate(
          ({ name, token }) => window[name].verifyFrame(token),
          { name: bridgeGlobal, token },
        );
      phases.captureMs += performance.now() - captureStarted;
      const hash = createHash("sha256").update(png).digest("hex");
      if (hash === previousHash) duplicates++;
      previousHash = hash;
      if (encoder.exitCode !== null)
        throw new Error(`FFmpeg exited early: ${diagnostic}`);
      const writeStarted = performance.now();
      if (!encoder.stdin.write(png))
        await waitForDrain(encoder.stdin, encoder, options.signal);
      phases.encodeWaitMs += performance.now() - writeStarted;
      options.onProgress?.({
        phase: "capture",
        frame: i + 1,
        frames,
        time: start / 1000 + i / fps,
        elapsedMs: performance.now() - started,
      });
    }
    encoder.stdin.end();
    const code = await completion;
    if (failure || code !== 0)
      throw new Error(`FFmpeg failed: ${failure?.message ?? diagnostic}`);
    options.signal?.throwIfAborted();
    const audioStarted = performance.now();
    options.onProgress?.({
      phase: "audio",
      frame: frames,
      frames,
      elapsedMs: performance.now() - started,
    });
    audioResult = await audioJob.mix(page, temporary, {
      start: start / 1000,
      duration: frames / fps,
      compositionDuration: Math.max(duration, frames / fps),
    });
    phases.audioMs = performance.now() - audioStarted;
    options.signal?.throwIfAborted();
  } catch (error) {
    // FFmpeg can be blocked probing an empty input pipe before frame zero.
    // Closing stdin and killing this owned child guarantees failure cleanup.
    encoder.stdin.destroy();
    encoder.kill("SIGKILL");
    await completion;
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abortEncoder);
    await audioJob.dispose();
    await mediaState?.dispose();
    flags.push(...(captureHandle?.flags ?? []));
    await captureHandle?.close();
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
    captureMethod: captureHandle?.method ?? options.captureMethod,
    diagnostics: {
      phases,
      totalMs: performance.now() - started,
      duplicateFrames: duplicates,
    },
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
