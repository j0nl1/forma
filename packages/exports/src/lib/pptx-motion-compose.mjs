import {
  compositingFamilies,
  compositingIssue,
  cohortOpacity,
} from "./pptx-motion-compositing.mjs";
import { buildSteps } from "../../../runtime/src/browser/deck-effects.js";
import {
  composedProgress,
  cycleDuration,
  repeatedCompositionPlan,
} from "./pptx-motion-repeat.mjs";

// Impress ignores child transforms while an ancestor group is animated. Keep
// editable artwork in disjoint sibling groups and compose the supported affine
// transforms on each group instead. Masks and group alpha need a compositor.
const supported = new Set(["spin", "grow", "shrink", "teeter", "path"]);
const identity = [1, 0, 0, 1, 0, 0];
const multiply = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
function value(track, progress, fallback) {
  if (!track) return fallback;
  const index = track.findIndex(([time]) => time >= progress);
  if (index === 0) return track[0][1];
  if (index < 0) return track.at(-1)[1];
  const [left, right] = [track[index - 1], track[index]];
  return (
    left[1] +
    ((right[1] - left[1]) * (progress - left[0])) / (right[0] - left[0])
  );
}
function bounds(objects) {
  const boxes = objects.map((object) => {
    const angle = ((object.rotate ?? 0) * Math.PI) / 180;
    const w =
        Math.abs(object.w * Math.cos(angle)) +
        Math.abs(object.h * Math.sin(angle)),
      h =
        Math.abs(object.w * Math.sin(angle)) +
        Math.abs(object.h * Math.cos(angle));
    return {
      x: object.x + object.w / 2 - w / 2,
      y: object.y + object.h / 2 - h / 2,
      w,
      h,
    };
  });
  const x = Math.min(...boxes.map((box) => box.x)),
    y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((box) => box.x + box.w)) - x,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - y,
  };
}

export function composedTargets(entries, objects, slide) {
  const byId = new Map(entries.map((entry) => [entry.id, entry])),
    links = new Map(entries.map((entry) => [entry.id, new Set()]));
  for (const object of objects) {
    const ids = object.animIds ?? [];
    if (ids.length < 2) continue;
    for (const id of ids)
      for (const other of ids) if (other !== id) links.get(id)?.add(other);
  }
  const seen = new Set(),
    components = [];
  for (const [id, neighbors] of links) {
    if (!neighbors.size || seen.has(id)) continue;
    const ids = new Set(),
      pending = [id];
    while (pending.length) {
      const next = pending.pop();
      if (ids.has(next)) continue;
      ids.add(next);
      seen.add(next);
      pending.push(...(links.get(next) ?? []));
    }
    const members = [...ids].map((id) => byId.get(id));
    const component = { ids, entries: members, cohorts: [] };
    if (members.some((entry) => !entry))
      component.issue = "nested animation metadata is incomplete";
    else if (
      members.some(
        (entry) =>
          !supported.has(entry.family) &&
          !compositingFamilies.has(entry.family),
      )
    )
      component.issue =
        "nested masks, visibility, or group opacity require compositing beyond native affine transforms";
    else if (members.length > 8)
      component.issue =
        "nested animation exceeds the eight composed build limit";
    else {
      // Split at unrelated paint so exported stacking order never changes.
      let previous = -2;
      for (const [index, object] of objects.entries()) {
        const chain = (object.animIds ?? []).filter((id) => ids.has(id));
        if (!chain.length) continue;
        const key = chain.join("/");
        let cohort = component.cohorts.at(-1);
        if (index !== previous + 1 || cohort?.key !== key) {
          cohort = { id: `composed-${id}-${index}`, key, chain, objects: [] };
          component.cohorts.push(cohort);
        }
        cohort.objects.push(object);
        previous = index;
      }
      if (component.cohorts.length > 32)
        component.issue =
          "nested animation exceeds the 32 editable artwork group limit";
      for (const cohort of component.cohorts)
        cohort.geometry = bounds(cohort.objects);
    }
    if (
      !component.issue &&
      members.some(
        (entry) =>
          !entry.geometry ||
          ["x", "y", "w", "h"].some(
            (key) => !Number.isFinite(entry.geometry[key]),
          ),
      )
    )
      component.issue = "the target has no captured motion geometry";
    if (!component.issue) component.issue = compositingIssue(component, slide);
    if (!component.issue) {
      const plan = repeatedCompositionPlan(
        buildSteps(entries),
        component,
        slide,
      );
      component.windows = plan.windows;
      component.issue = plan.issue;
    }
    components.push(component);
  }
  return components;
}

function composedValues(
  cohort,
  scheduled,
  entries,
  stepIndex,
  time,
  side,
  slide,
) {
  let matrix = identity,
    rotation = 0,
    scale = 1;
  for (const id of [...cohort.chain].reverse()) {
    const schedule = scheduled.get(id),
      entry = schedule.entry;
    const progress = composedProgress(entry, schedule, stepIndex, time, side);
    if (progress === null) continue;
    const angle = value(entry.tracks.get("rotation"), progress, 0),
      size = value(entry.tracks.get("scale"), progress, 1),
      dx = value(entry.tracks.get("ppt_x"), progress, 0) * slide.width,
      dy = value(entry.tracks.get("ppt_y"), progress, 0) * slide.height,
      cx = entry.geometry.x + entry.geometry.w / 2,
      cy = entry.geometry.y + entry.geometry.h / 2,
      c = Math.cos((angle * Math.PI) / 180) * size,
      s = Math.sin((angle * Math.PI) / 180) * size;
    matrix = multiply(matrix, [
      c,
      s,
      -s,
      c,
      cx + dx - c * cx + s * cy,
      cy + dy - s * cx - c * cy,
    ]);
    rotation += angle;
    scale *= size;
  }
  const center = [
    cohort.geometry.x + cohort.geometry.w / 2,
    cohort.geometry.y + cohort.geometry.h / 2,
  ];
  return {
    ppt_x:
      (matrix[0] * center[0] + matrix[2] * center[1] + matrix[4] - center[0]) /
      slide.width,
    ppt_y:
      (matrix[1] * center[0] + matrix[3] * center[1] + matrix[5] - center[1]) /
      slide.height,
    rotation,
    scale,
    ...(cohort.chain.some((id) => entries.get(id).family === "fade")
      ? {
          "style.opacity": cohortOpacity(cohort, entries, (entry) => ({
            progress: composedProgress(
              entry,
              scheduled.get(entry.id),
              stepIndex,
              time,
              side,
            ),
          })),
        }
      : {}),
  };
}

function sampleTimes(component, scheduled, stepIndex, duration) {
  const offsets = new Set([0, duration]);
  for (const entry of component.entries) {
    const schedule = scheduled.get(entry.id);
    if (schedule.stepIndex !== stepIndex) continue;
    const cycle = cycleDuration(entry);
    for (let iteration = 0; iteration < entry.repeat; iteration++) {
      const start = schedule.start + iteration * cycle;
      if (start >= duration) break;
      const add = (offset) => {
        const time = start + cycle * offset;
        if (time <= duration) offsets.add(time);
      };
      if (entry.tracks.has("rotation") || entry.tracks.has("scale"))
        for (let sample = 0; sample <= 100; sample++) add(sample / 100);
      for (const track of entry.tracks.values())
        for (const [offset] of track) add(offset);
    }
  }
  return [...offsets].sort((a, b) => a - b);
}

function simplify(track) {
  const result = [];
  for (const point of track) {
    result.push(point);
    while (result.length >= 3) {
      const [a, b, c] = result.slice(-3);
      const expected = a[1] + ((c[1] - a[1]) * (b[0] - a[0])) / (c[0] - a[0]);
      if (
        Math.abs(expected - b[1]) >
        1e-10 * Math.max(1, Math.abs(a[1]), Math.abs(b[1]), Math.abs(c[1]))
      )
        break;
      result.splice(result.length - 2, 1);
    }
  }
  return result;
}

export function composeSteps(steps, components, slide) {
  const scheduled = new Map();
  for (const [stepIndex, step] of steps.entries())
    for (const item of step.items)
      scheduled.set(item.entry.id, { ...item, stepIndex });
  const entries = new Map([...scheduled].map(([id, item]) => [id, item.entry]));
  return steps.map((step, stepIndex) => {
    const items = [...step.items];
    for (const component of components.filter((value) => !value.issue)) {
      const window = component.windows.get(stepIndex);
      if (!window) continue;
      const offsets = sampleTimes(
        component,
        scheduled,
        stepIndex,
        window.duration,
      );
      for (const cohort of component.cohorts) {
        const segments = window.parts.map(({ start, end }) => {
          const keys = ["ppt_x", "ppt_y", "rotation", "scale"];
          if (cohort.chain.some((id) => entries.get(id).family === "fade"))
            keys.push("style.opacity");
          const tracks = new Map(keys.map((key) => [key, []]));
          const times = [
            ...new Set([
              start,
              ...offsets.filter((time) => time > start && time < end),
              end,
            ]),
          ];
          for (const time of times) {
            const values = composedValues(
              cohort,
              scheduled,
              entries,
              stepIndex,
              time,
              time === end ? "before" : "after",
              slide,
            );
            for (const [key, track] of tracks)
              track.push([(time - start) / (end - start), values[key]]);
          }
          for (const [key, track] of tracks) tracks.set(key, simplify(track));
          return { start, duration: end - start, tracks };
        });
        items.push({
          start: 0,
          entry: {
            targets: cohort.targets,
            segments,
            duration: window.duration,
            repeat: window.repeat,
            autoReverse: false,
            kind: "path",
            trigger: stepIndex ? "click" : "after",
          },
        });
      }
    }
    return { ...step, items };
  });
}
