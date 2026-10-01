// Authored time and playback time are separate axes. Editing a section's
// playback length must never truncate its authored choreography.
export const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

export const Easing = { linear: (t) => t };
for (const [name, power] of Object.entries({ Quad: 2, Cubic: 3, Quart: 4 })) {
  Easing[`easeIn${name}`] = (t) => t ** power;
  Easing[`easeOut${name}`] = (t) => 1 - (1 - t) ** power;
  Easing[`easeInOut${name}`] = (t) =>
    t < 0.5 ? (2 * t) ** power / 2 : 1 - (2 * (1 - t)) ** power / 2;
}
Easing.easeInSine = (t) => 1 - Math.cos((t * Math.PI) / 2);
Easing.easeOutSine = (t) => Math.sin((t * Math.PI) / 2);
Easing.easeInExpo = (t) => (t === 0 ? 0 : 2 ** (10 * (t - 1)));
Easing.easeOutExpo = (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));
Easing.easeInBack = (t) => t * t * (2.70158 * t - 1.70158);
Easing.easeOutBack = (t) => 1 + (t - 1) ** 2 * (2.70158 * (t - 1) + 1.70158);
for (const name of ["Sine", "Expo", "Back"]) {
  Easing[`easeInOut${name}`] = (t) =>
    t < 0.5
      ? Easing[`easeIn${name}`](2 * t) / 2
      : 0.5 + Easing[`easeOut${name}`](2 * t - 1) / 2;
}
Easing.easeOutElastic = (t) =>
  t === 0 || t === 1
    ? t
    : 1 + 2 ** (-10 * t) * Math.sin(((10 * t - 0.75) * 2 * Math.PI) / 3);
Easing.easeInOutBack = (t) => {
  const overshoot = 1.70158 * 1.525;
  return t < 0.5
    ? ((2 * t) ** 2 * ((overshoot + 1) * 2 * t - overshoot)) / 2
    : ((2 * t - 2) ** 2 * ((overshoot + 1) * (2 * t - 2) + overshoot) + 2) / 2;
};

export function interpolate(input, output, ease = Easing.linear) {
  if (
    input.length < 2 ||
    input.length !== output.length ||
    !input.every((n, i) => Number.isFinite(n) && (!i || n >= input[i - 1])) ||
    !output.every(Number.isFinite)
  )
    throw new Error(
      "Tween ranges must have matching, increasing numeric stops",
    );
  return (time) => {
    if (time <= input[0]) return output[0];
    for (let i = 1; i < input.length; i++)
      if (time < input[i]) {
        const progress = (time - input[i - 1]) / (input[i] - input[i - 1]);
        const curve =
          (Array.isArray(ease) ? ease[i - 1] : ease) || Easing.linear;
        return output[i - 1] + (output[i] - output[i - 1]) * curve(progress);
      }
    return output.at(-1);
  };
}
export function animate({
  from = 0,
  to = 1,
  start = 0,
  end = 1,
  ease = Easing.easeInOutCubic,
}) {
  return (time) =>
    time <= start
      ? from
      : time >= end
        ? to
        : from + (to - from) * ease((time - start) / (end - start));
}

export function parseScenes(raw) {
  if (typeof raw === "string" && raw.length > 16384)
    throw new Error("Scene data exceeds 16 KiB");
  const scenes = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(scenes) || !scenes.length || scenes.length > 50)
    throw new Error("Use between 1 and 50 scenes");
  for (const scene of scenes) {
    if (
      !scene ||
      typeof scene.name !== "string" ||
      !scene.name.trim() ||
      !Number.isFinite(scene.dur) ||
      scene.dur <= 0 ||
      scene.dur > 300 ||
      (scene.nat !== undefined &&
        (!Number.isFinite(scene.nat) || scene.nat <= 0)) ||
      (scene.desc !== undefined && typeof scene.desc !== "string")
    )
      throw new Error(
        "Scenes need a name, positive duration, and optional description/authored length",
      );
  }
  return scenes.map((scene) => ({ ...scene }));
}
export function parsePlayback(raw = { mode: "loop" }) {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (value?.mode === "loop") return { mode: "loop" };
  if (
    value?.mode === "times" &&
    Number.isInteger(value.count) &&
    value.count >= 1 &&
    value.count <= 100
  )
    return { mode: "times", count: value.count };
  throw new Error("Playback must loop or repeat 1..100 times");
}
export function deriveScenes(raw) {
  const scenes = parseScenes(raw),
    cues = Object.create(null),
    sections = [];
  let playback = 0,
    authored = 0;
  for (const scene of scenes) {
    const natural = scene.nat ?? scene.dur;
    if (!Object.hasOwn(cues, scene.name)) cues[scene.name] = authored;
    sections.push({
      ...scene,
      natural,
      start: playback,
      authoredStart: authored,
    });
    playback += scene.dur;
    authored += natural;
  }
  return {
    scenes,
    sections,
    cues,
    duration: playback,
    authoredTotal: authored,
  };
}
export function authoredTime(derived, time) {
  time = clamp(time, 0, derived.duration);
  const section =
    derived.sections.find((s) => time < s.start + s.dur) ??
    derived.sections.at(-1);
  return (
    section.authoredStart +
    clamp((time - section.start) / section.dur) * section.natural
  );
}
export function retimeScene(scenes, index, duration) {
  const next = parseScenes(scenes);
  if (!next[index]) throw new Error("Unknown section");
  next[index] = {
    ...next[index],
    nat: next[index].nat ?? next[index].dur,
    dur: duration,
  };
  return parseScenes(next);
}
export function advancePlayback(time, elapsed, duration, playback, passes = 0) {
  const next = time + elapsed;
  const crossed = Math.floor(next / duration);
  const completed = passes + crossed;
  if (playback.mode === "times" && completed >= playback.count)
    return { time: duration, passes: completed, playing: false };
  return { time: next % duration, passes: completed, playing: true };
}
