import { tracksFor } from "./pptx-motion-effects.mjs";

// CSS opacity composites the complete group before blending with its backdrop.
// https://www.w3.org/TR/compositing-1/#groupcompositing
// Native group opacity preserves this, but Impress drops independent child
// motion. Disjoint artwork cohorts can instead receive the product of opacity
// tracks without introducing the extra backdrop contribution seen at overlaps.
export const compositingFamilies = new Set(["fade", "wipe"]);

function extent(track, fallback) {
  const values = track?.map(([, value]) => value) ?? [fallback];
  return [Math.min(...values), Math.max(...values)];
}

function value(track, progress, fallback = 1) {
  if (!track) return fallback;
  const at = Math.max(0, Math.min(1, progress ?? 0));
  const index = track.findIndex(([time]) => time >= at);
  if (index === 0) return track[0][1];
  if (index < 0) return track.at(-1)[1];
  const [left, right] = [track[index - 1], track[index]];
  return (
    left[1] + ((at - left[0]) / (right[0] - left[0])) * (right[1] - left[1])
  );
}

function envelope(cohort, entries, slide) {
  let box = { ...cohort.geometry };
  // The chain is deepest first. Interval bounds deliberately include every
  // phase combination, including intermediate repeat resets and click holds.
  for (const id of cohort.chain) {
    const entry = entries.get(id);
    const tracks = tracksFor(entry, slide).tracks;
    const [x0, x1] = extent(tracks.get("ppt_x"), 0).map((x) => x * slide.width);
    const [y0, y1] = extent(tracks.get("ppt_y"), 0).map(
      (y) => y * slide.height,
    );
    const [s0, s1] = extent(tracks.get("scale"), 1);
    const rotation = extent(tracks.get("rotation"), 0);
    const cx = entry.geometry.x + entry.geometry.w / 2;
    const cy = entry.geometry.y + entry.geometry.h / 2;
    let xs, ys;
    if (rotation.some((angle) => Math.abs(angle) > 1e-8)) {
      // A circle is conservative for every rotation, rather than trusting
      // discrete samples to catch a short overlap between sampled angles.
      const radius =
        Math.max(
          ...[box.x, box.x + box.w].flatMap((x) =>
            [box.y, box.y + box.h].map((y) => Math.hypot(x - cx, y - cy)),
          ),
        ) * Math.max(Math.abs(s0), Math.abs(s1));
      xs = [-radius, radius];
      ys = [-radius, radius];
    } else {
      xs = [box.x - cx, box.x + box.w - cx].flatMap((x) => [x * s0, x * s1]);
      ys = [box.y - cy, box.y + box.h - cy].flatMap((y) => [y * s0, y * s1]);
    }
    const x = cx + Math.min(...xs) + x0;
    const y = cy + Math.min(...ys) + y0;
    box = {
      x,
      y,
      w: cx + Math.max(...xs) + x1 - x,
      h: cy + Math.max(...ys) + y1 - y,
    };
  }
  // Avoid treating touching anti-aliased edges as separated paint.
  return { x: box.x - 2, y: box.y - 2, w: box.w + 4, h: box.h + 4 };
}

function intersects(a, b) {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/** Classify only representations demonstrated in an actual presentation client.
 * Call after cohort geometry is known, before allocating any native groups.
 */
export function compositingIssue(component, slide) {
  const entries = new Map(component.entries.map((entry) => [entry.id, entry]));
  for (const entry of component.entries.filter(
    (entry) => entry.family === "wipe",
  )) {
    const cohorts = component.cohorts.filter((cohort) =>
      cohort.chain.includes(entry.id),
    );
    if (cohorts.length !== 1 || cohorts[0].chain[0] !== entry.id)
      return "an ancestor mask with independently moving descendants needs group compositing";
    const cohort = cohorts[0];
    if (cohort.chain.slice(1).some((id) => entries.get(id).family !== "path"))
      return "nested native masks currently require translation-only ancestors";
    if (entry.repeat !== 1 || entry.autoReverse)
      return "nested native masks require one forward playback";
    if (
      ["x", "y", "w", "h"].some(
        (key) => Math.abs(cohort.geometry[key] - entry.geometry[key]) > 1,
      )
    )
      return "the mask's editable artwork does not fill its authored clipping bounds";
    cohort.maskEntryId = entry.id;
  }
  for (const entry of component.entries.filter(
    (entry) => entry.family === "fade",
  )) {
    const cohorts = component.cohorts.filter((cohort) =>
      cohort.chain.includes(entry.id),
    );
    const bounds = cohorts.map((cohort) => envelope(cohort, entries, slide));
    for (let index = 0; index < bounds.length; index++)
      for (let other = index + 1; other < bounds.length; other++)
        if (intersects(bounds[index], bounds[other]))
          return "the opacity group's independently moving paint envelopes overlap; per-artwork alpha would change compositing";
  }
  return null;
}

/** Repeat/click-aware phase is provided by the shared motion scheduler. */
export function cohortOpacity(cohort, entries, phaseForEntry) {
  let opacity = 1;
  for (const id of cohort.chain) {
    const entry = entries.get(id);
    if (entry.family !== "fade") continue;
    const { progress } = phaseForEntry(entry);
    opacity *= value(entry.tracks.get("style.opacity"), progress);
  }
  return opacity;
}

export function cohortInitialState(cohort, entries) {
  const entrance = (family) =>
    cohort.chain.some((id) => {
      const entry = entries.get(id);
      return entry.family === family && entry.kind === "entrance";
    });
  return {
    opacity: entrance("fade") ? 0 : 1,
    visibility: entrance("wipe") ? "hidden" : "visible",
  };
}

/** Immediate root children establish pending entrances before the first click.
 * These share the existing timing writer's ID allocator and do not own a click.
 */
export function compositingInitialNodes(components, nextId) {
  const nodes = [];
  for (const component of components.filter((item) => !item.issue)) {
    const entries = new Map(
      component.entries.map((entry) => [entry.id, entry]),
    );
    for (const cohort of component.cohorts) {
      const initial = cohortInitialState(cohort, entries);
      for (const target of cohort.targets ?? []) {
        if (!/^\d+$/.test(String(target)))
          throw new Error("Invalid native compositing target.");
        for (const [attribute, content] of [
          ...(initial.opacity === 0
            ? [["style.opacity", '<p:fltVal val="0"/>']]
            : []),
          ...(initial.visibility === "hidden"
            ? [["style.visibility", '<p:strVal val="hidden"/>']]
            : []),
        ])
          nodes.push(
            `<p:set><p:cBhvr><p:cTn id="${nextId()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${target}"/></p:tgtEl><p:attrNameLst><p:attrName>${attribute}</p:attrName></p:attrNameLst></p:cBhvr><p:to>${content}</p:to></p:set>`,
          );
      }
    }
  }
  return nodes.join("");
}
