import { tracksFor } from "./pptx-motion-effects.mjs";

// A repeat reset has two values at the same time. Keep the preceding cycle's
// endpoint separate from the next cycle's start instead of interpolating them.
export const cycleDuration = (entry) =>
  entry.duration * (entry.autoReverse ? 2 : 1);

export function composedProgress(
  entry,
  schedule,
  stepIndex,
  time,
  side = "after",
) {
  if (schedule.stepIndex < stepIndex) return 1;
  if (schedule.stepIndex > stepIndex) return null;
  const cycle = cycleDuration(entry),
    elapsed = time - schedule.start;
  if (elapsed <= 0) return 0;
  if (elapsed >= cycle * entry.repeat) return 1;
  const phase = elapsed / cycle;
  if (Math.abs(phase - Math.round(phase)) < 1e-10)
    return side === "before" ? 1 : 0;
  return phase - Math.floor(phase);
}

export function repeatedCompositionPlan(steps, component, slide) {
  let samples = 0,
    segments = 0;
  const windows = new Map();
  for (const [stepIndex, step] of steps.entries()) {
    const items = step.items.filter(({ entry }) => component.ids.has(entry.id));
    if (!items.length) continue;
    const duration = step.duration,
      repeat = 1,
      boundaries = new Set([0, duration]);
    let estimatedSamples = 2;
    for (const { entry, start } of items) {
      const cycle = cycleDuration(entry);
      for (let iteration = 1; iteration < entry.repeat; iteration++) {
        const reset = start + iteration * cycle;
        if (reset >= duration) break;
        boundaries.add(reset);
      }
      const tracks = entry.tracks ?? tracksFor(entry, slide).tracks;
      const offsets = new Set(
        [...tracks.values()].flatMap((track) =>
          track.map(([offset]) => offset),
        ),
      );
      const extra = tracks.has("rotation") || tracks.has("scale") ? 101 : 0;
      const iterations = Math.min(
        entry.repeat,
        Math.max(0, Math.ceil((duration - start) / cycle)),
      );
      estimatedSamples += iterations * (offsets.size + extra);
    }
    const sorted = [...boundaries].sort((a, b) => a - b);
    const parts = sorted
      .slice(1)
      .map((end, index) => ({ start: sorted[index], end }));
    segments += parts.length * component.cohorts.length;
    samples += (estimatedSamples + parts.length * 2) * component.cohorts.length;
    windows.set(stepIndex, { duration, repeat, parts });
  }
  const repeated = component.entries.some((entry) => entry.repeat > 1);
  return {
    windows,
    issue:
      repeated && (segments > 256 || samples > 32768)
        ? "composed repeated timing exceeds 256 native segments or 32768 sampled time points"
        : null,
  };
}
