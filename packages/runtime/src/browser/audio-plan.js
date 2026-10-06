// Pure scheduling shared by browser diagnostics and offline audio rendering.
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const requireNumber = (value, label, min = 0, max = Infinity) => {
  if (!finite(value) || value < min || value > max)
    throw new Error(
      `Scheduled audio ${label} must be finite and within ${min}..${max}`,
    );
  return value;
};
const sampleBoundary = (time, rate) => Math.ceil(time * rate - 1e-7);

export function compileAudioSchedule(
  plan,
  { start = 0, duration = plan?.duration, sampleRate = 48000, busConfig } = {},
) {
  requireNumber(start, "export start");
  requireNumber(duration, "export duration", Number.MIN_VALUE);
  requireNumber(sampleRate, "sample rate", 1, 192000);
  if (!plan || !Array.isArray(plan.clips))
    throw new Error("Scheduled audio needs a compiled composition plan");
  const buses = new Map();
  if (busConfig !== undefined) {
    if (!busConfig || !Array.isArray(busConfig.buses))
      throw new Error("Scheduled audio busConfig needs a buses array");
    for (const bus of busConfig.buses) {
      if (!bus || typeof bus.id !== "string" || !bus.id || buses.has(bus.id))
        throw new Error("Scheduled audio buses need unique IDs");
      buses.set(bus.id, requireNumber(bus.gain ?? 1, "bus gain", 0, 16));
    }
  }
  const samples = Math.ceil(duration * sampleRate),
    clips = [];
  for (const clip of plan.clips) {
    if (!["audio", "video"].includes(clip.kind) || clip.media?.audio === false)
      continue;
    const media = clip.media;
    if (!media || typeof media.src !== "string" || !media.src)
      throw new Error("Scheduled audio clip needs a media source");
    const gain = requireNumber(media.gain ?? 1, "gain", 0, 16);
    const playbackRate = requireNumber(
      media.playbackRate ?? 1,
      "playback rate",
      Number.MIN_VALUE,
      16,
    );
    const sourceStart = requireNumber(media.sourceStart ?? 0, "source start");
    const sourceDuration =
      media.sourceDuration === undefined
        ? undefined
        : requireNumber(media.sourceDuration, "source span", Number.MIN_VALUE);
    if (media.loop && sourceDuration === undefined)
      throw new Error("Scheduled audio looping needs an explicit source span");
    const clipDuration = requireNumber(
      clip.duration,
      "clip duration",
      Number.MIN_VALUE,
    );
    const fadeIn = requireNumber(media.fadeIn ?? 0, "fade in", 0, clipDuration);
    const fadeOut = requireNumber(
      media.fadeOut ?? 0,
      "fade out",
      0,
      clipDuration,
    );
    const envelope = media.volumeEnvelope ?? [];
    if (!Array.isArray(envelope))
      throw new Error("Scheduled audio envelope needs an array");
    let previous = -1;
    for (const point of envelope) {
      requireNumber(point.time, "envelope time", 0, clipDuration);
      requireNumber(point.value, "envelope value", 0, 16);
      if (point.time <= previous)
        throw new Error(
          "Scheduled audio envelope times must strictly increase",
        );
      previous = point.time;
    }
    if (
      media.bus !== undefined &&
      busConfig !== undefined &&
      !buses.has(media.bus)
    )
      throw new Error(`Scheduled audio references unknown bus: ${media.bus}`);
    if (!Array.isArray(clip.windows))
      throw new Error("Scheduled audio needs compiled clip windows");
    const windows = [];
    let previousEnd = -1;
    for (const window of clip.windows) {
      const from = requireNumber(window.playbackStart, "window start"),
        to = requireNumber(window.playbackEnd, "window end");
      const rate = requireNumber(window.rate, "window rate", Number.MIN_VALUE);
      requireNumber(window.localStart, "local start", 0, clipDuration);
      requireNumber(window.localEnd, "local end", 0, clipDuration);
      if (
        to <= from ||
        from < previousEnd ||
        window.localEnd <= window.localStart ||
        Math.abs((to - from) * rate - (window.localEnd - window.localStart)) >
          1e-6
      )
        throw new Error(
          "Scheduled audio windows must be ordered positive linear intervals",
        );
      previousEnd = to;
      const first = Math.max(0, sampleBoundary(from - start, sampleRate));
      const last = Math.min(samples, sampleBoundary(to - start, sampleRate));
      const speed = requireNumber(
        playbackRate * rate,
        "effective playback rate",
        Number.MIN_VALUE,
      );
      if (last > first) windows.push({ ...window, first, last, speed });
    }
    if (windows.length && gain && (buses.get(media.bus) ?? 1))
      clips.push({
        id: clip.id,
        src: media.src,
        sourceStart,
        sourceDuration,
        playbackRate,
        loop: media.loop === true,
        duration: clipDuration,
        gain,
        busGain: buses.get(media.bus) ?? 1,
        fadeIn,
        fadeOut,
        envelope: envelope.map((point) => ({ ...point })),
        windows,
      });
  }
  return { start, duration, sampleRate, samples, clips };
}

export function audioGainAt(clip, localTime) {
  let envelope = 1;
  const points = clip.envelope;
  if (points.length) {
    const right = points.findIndex((point) => point.time >= localTime);
    if (right === 0) envelope = points[0].value;
    else if (right === -1) envelope = points.at(-1).value;
    else {
      const before = points[right - 1],
        after = points[right];
      envelope =
        before.value +
        ((after.value - before.value) * (localTime - before.time)) /
          (after.time - before.time);
    }
  }
  return (
    clip.gain *
    clip.busGain *
    envelope *
    (clip.fadeIn ? Math.min(1, Math.max(0, localTime / clip.fadeIn)) : 1) *
    (clip.fadeOut
      ? Math.min(1, Math.max(0, (clip.duration - localTime) / clip.fadeOut))
      : 1)
  );
}

// Add into the caller's accumulator; clipping belongs to the single final mix.
export function addScheduledWindow(
  schedule,
  clip,
  window,
  pcm,
  mixed,
  sourceDuration,
  channels = 2,
) {
  const frameCount = pcm.length / channels;
  const loopDuration = sourceDuration / window.speed;
  for (let frame = window.first; frame < window.last; frame++) {
    const time = schedule.start + frame / schedule.sampleRate;
    const localTime =
      window.localStart + (time - window.playbackStart) * window.rate;
    const sourceTime = localTime * clip.playbackRate;
    if (!clip.loop && sourceTime >= sourceDuration) continue;
    const phase = clip.loop
      ? (localTime / window.rate) % loopDuration
      : localTime / window.rate;
    const sourceFrame = Math.min(
      frameCount - 1,
      Math.floor(phase * schedule.sampleRate + 1e-7),
    );
    if (sourceFrame < 0) continue;
    const gain = audioGainAt(clip, localTime);
    for (let channel = 0; channel < channels; channel++)
      mixed[frame * channels + channel] +=
        pcm[sourceFrame * channels + channel] * gain;
  }
}

function previewSource(source) {
  const url = new URL(source, "http://localhost/");
  if (/^data:(audio|video)\//i.test(source) || url.protocol === "blob:") return;
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Audio preview sources must be local, audio/video data, or blob URLs",
    );
}

// The caller owns user-gesture context creation/resume and local source decoding.
// No AudioContext or network operation is created implicitly by this renderer.
export function createAudioPreview({ context, loadSource }) {
  if (
    !context ||
    typeof context.createBufferSource !== "function" ||
    typeof context.createGain !== "function" ||
    typeof loadSource !== "function"
  )
    throw new Error(
      "Audio preview needs an explicit AudioContext and loadSource adapter",
    );
  const nodes = new Set();
  let generation = 0,
    controller,
    active;
  const position = () =>
    active
      ? Math.min(
          active.duration,
          Math.max(
            active.time,
            active.time + context.currentTime - active.startTime,
          ),
        )
      : 0;
  const disconnect = (entry) => {
    entry.source.onended = null;
    entry.source.disconnect();
    entry.gain.disconnect();
    nodes.delete(entry);
  };
  const stop = () => {
    const time = position();
    generation++;
    controller?.abort();
    controller = undefined;
    for (const entry of [...nodes]) {
      try {
        entry.source.stop();
      } catch {
        /* A stopped or naturally ended source needs only disconnection. */
      }
      disconnect(entry);
    }
    active = undefined;
    return time;
  };
  return {
    get playing() {
      return !!active && nodes.size > 0;
    },
    currentTime: position,
    stop,
    pause: stop,
    async start(plan, { time = 0, busConfig } = {}) {
      stop();
      requireNumber(time, "preview time", 0, plan?.duration);
      if (time === plan.duration)
        return { time, scheduledWindows: 0, flags: [] };
      const token = generation;
      controller = new AbortController();
      const signal = controller.signal;
      const schedule = compileAudioSchedule(plan, {
        start: time,
        duration: plan.duration - time,
        sampleRate: context.sampleRate,
        busConfig,
      });
      const buffers = new Map();
      try {
        for (const clip of schedule.clips) {
          previewSource(clip.src);
          if (!buffers.has(clip.src))
            buffers.set(
              clip.src,
              await loadSource(clip.src, { context, signal }),
            );
          if (signal.aborted || token !== generation)
            return { time, scheduledWindows: 0, cancelled: true, flags: [] };
        }
        const startTime = context.currentTime + 0.02;
        active = { time, startTime, duration: plan.duration };
        let scheduledWindows = 0,
          changesPitch = false;
        for (const clip of schedule.clips) {
          const buffer = buffers.get(clip.src);
          if (
            !buffer ||
            !finite(buffer.duration) ||
            buffer.duration <= clip.sourceStart
          )
            throw new Error(
              "Audio preview source needs a decoded AudioBuffer with a finite remaining duration",
            );
          const span =
            clip.sourceDuration ?? buffer.duration - clip.sourceStart;
          if (
            clip.sourceStart + span >
            buffer.duration + 1 / context.sampleRate
          )
            throw new Error(
              "Audio preview source range exceeds the decoded asset",
            );
          for (const window of clip.windows) {
            const globalTime = time + window.first / schedule.sampleRate;
            const localTime =
              window.localStart +
              (globalTime - window.playbackStart) * window.rate;
            const sourceLocal = localTime * clip.playbackRate;
            if (!clip.loop && sourceLocal >= span) continue;
            const frames = Math.min(
              window.last - window.first,
              clip.loop
                ? Infinity
                : Math.ceil(
                    ((span - sourceLocal) / window.speed) * schedule.sampleRate,
                  ),
            );
            if (!(frames > 0)) continue;
            const when = startTime + window.first / schedule.sampleRate;
            const length = frames / schedule.sampleRate;
            const offset =
              clip.sourceStart + (clip.loop ? sourceLocal % span : sourceLocal);
            const source = context.createBufferSource(),
              gain = context.createGain();
            const entry = { source, gain };
            nodes.add(entry);
            source.buffer = buffer;
            source.playbackRate.setValueAtTime(window.speed, when);
            source.loop = clip.loop;
            source.loopStart = clip.sourceStart;
            source.loopEnd = clip.sourceStart + span;
            const curve = new Float32Array(frames + 1);
            for (let frame = 0; frame <= frames; frame++)
              curve[frame] = audioGainAt(
                clip,
                localTime + (frame / schedule.sampleRate) * window.rate,
              );
            gain.gain.setValueCurveAtTime(curve, when, length);
            source.connect(gain);
            gain.connect(context.destination);
            source.onended = () => disconnect(entry);
            source.start(when, offset);
            source.stop(when + length);
            changesPitch ||= window.speed !== 1;
            scheduledWindows++;
          }
        }
        if (!scheduledWindows) active = undefined;
        return {
          time,
          startTime,
          endTime: startTime + plan.duration - time,
          scheduledWindows,
          flags: changesPitch
            ? [
                {
                  kind: "audio_preview_pitch",
                  message:
                    "Web Audio preview changes pitch with playback rate; offline export preserves pitch with FFmpeg atempo",
                },
              ]
            : [],
        };
      } catch (error) {
        if (token === generation) stop();
        if (
          signal.aborted &&
          token !== generation &&
          error.name === "AbortError"
        )
          return { time, scheduledWindows: 0, cancelled: true, flags: [] };
        throw error;
      }
    },
  };
}
