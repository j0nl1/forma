import { affineTracks } from "./pptx-motion-affine.mjs";
import {
  effectFrames,
  effectOptions,
} from "../../../runtime/src/browser/slides/deck-effects.js";

export const families = new Set([
  "appear",
  "disappear",
  "fade",
  "fly",
  "float",
  "zoom",
  "spin",
  "grow",
  "shrink",
  "pulse",
  "teeter",
  "path",
  "bounce",
]);
export const centered = new Set([
  "zoom",
  "spin",
  "grow",
  "shrink",
  "pulse",
  "teeter",
]);
// Native filter names are enumerated by Microsoft, not inferred from CSS:
// https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/a96dab70-2e72-4319-928d-0eb4b275ce58
export function nativeFilter({ family, direction }) {
  if (family === "wipe")
    return `wipe(${{ left: "right", right: "left", top: "down", bottom: "up" }[direction]})`;
  if (family === "split")
    return `barn(in${direction === "vertical" ? "Vertical" : "Horizontal"})`;
  if (family === "random-bars") return `randombar(${direction})`;
  if (family === "checkerboard")
    return `checkerboard(${direction === "horizontal" ? "across" : "down"})`;
  if (["blinds", "box", "circle", "diamond", "plus"].includes(family))
    return `${family}(${direction})`;
  if (family === "strips")
    return `strips(${direction.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())})`;
  if (family === "wheel") return "wheel(1)";
  if (["wedge", "dissolve"].includes(family)) return family;
  return null;
}
function ease(time, kind = "ease") {
  // Invert CSS cubic-bezier(.25,.1,.25,1) before sampling. Native keyframes
  // retain this sampled curve when applications discard the OOXML tmFilter.
  let low = 0,
    high = 1;
  const cubic = (t, a, b) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  const [x1, y1, x2, y2] =
    kind === "ease-in"
      ? [0.42, 0, 1, 1]
      : kind === "ease-out"
        ? [0, 0, 0.58, 1]
        : [0.25, 0.1, 0.25, 1];
  for (let iteration = 0; iteration < 30; iteration++) {
    const midpoint = (low + high) / 2;
    if (cubic(midpoint, x1, x2) < time) low = midpoint;
    else high = midpoint;
  }
  return cubic((low + high) / 2, y1, y2);
}
function interpolate(track, progress) {
  const next = track.findIndex(([offset]) => offset >= progress);
  if (next <= 0) return track[0][1];
  const [before, after] = [track[next - 1], track[next]];
  let ratio = (progress - before[0]) / (after[0] - before[0]);
  if (before[2] && before[2] !== "linear") ratio = ease(ratio, before[2]);
  return before[1] + (after[1] - before[1]) * ratio;
}
export function tracksFor(entry, slide) {
  const filter = nativeFilter(entry);
  if (filter) {
    // Impress's rectangular-clip optimization repaints new minus old bounds,
    // which is empty for a shrinking rectangle. An animated rotation of one
    // OOXML angular unit (1/60000 degree) avoids that optimization without
    // changing the clip direction. Static group rotation does not suffice.
    // https://github.com/LibreOffice/core/blob/master/canvas/source/tools/canvascustomspritehelper.cxx
    // https://github.com/LibreOffice/core/blob/master/basegfx/source/range/b2xrange.cxx
    const clipRotation =
      filter === "box(out)" && entry.kind === "exit" ? 1 / 60000 : 0;
    return {
      tracks: new Map(
        clipRotation
          ? [
              [
                "rotation",
                [
                  [0, clipRotation],
                  [1, clipRotation],
                ],
              ],
            ]
          : [],
      ),
      sampled: false,
      filter,
      clipRotation,
    };
  }
  const rect = entry.geometry;
  const geometry = {
    width: slide.width,
    height: slide.height,
    fly: (direction) =>
      ({
        left: [-Math.max(0, rect.x + rect.w), 0],
        right: [Math.max(0, slide.width - rect.x), 0],
        top: [0, -Math.max(0, rect.y + rect.h)],
        bottom: [0, Math.max(0, slide.height - rect.y)],
      })[direction],
  };
  const frames = effectFrames({ ...entry, opacity: 1 }, geometry);
  const tracks = new Map();
  const add = (key, offset, value, easing) => {
    if (!tracks.has(key)) tracks.set(key, []);
    tracks.get(key).push([offset, value, easing]);
  };
  for (const [index, frame] of frames.entries()) {
    const offset = frame.offset ?? index / (frames.length - 1);
    if (frame.opacity !== undefined)
      add("style.opacity", offset, frame.opacity, frame.easing);
    if (frame.rotate !== undefined)
      add("rotation", offset, parseFloat(frame.rotate), frame.easing);
    if (frame.scale !== undefined)
      add("scale", offset, Number(frame.scale), frame.easing);
    if (frame.translate !== undefined) {
      const values = frame.translate.split(" ").map(parseFloat);
      add("ppt_x", offset, values[0] / slide.width, frame.easing);
      add("ppt_y", offset, values[1] / slide.height, frame.easing);
    }
  }
  const globalEase = effectOptions(entry, 0).easing === "ease";
  const sampled =
    (globalEase ||
      frames.some((frame) => frame.easing && frame.easing !== "linear")) &&
    tracks.size > 0;
  if (sampled)
    for (const [key, track] of tracks) {
      const samples = Math.max(1, Math.min(100, Math.floor(entry.duration)));
      tracks.set(
        key,
        Array.from({ length: samples + 1 }, (_, index) => [
          index / samples,
          index === 0
            ? track[0][1]
            : index === samples
              ? track.at(-1)[1]
              : interpolate(
                  track,
                  globalEase ? ease(index / samples) : index / samples,
                ),
        ]),
      );
    }
  if (entry.autoReverse)
    for (const [key, track] of tracks) {
      tracks.set(key, [
        ...track.map(([offset, value]) => [offset / 2, value]),
        ...track
          .slice(0, -1)
          .reverse()
          .map(([offset, value]) => [1 - offset / 2, value]),
      ]);
    }
  return { tracks: affineTracks(entry, tracks, slide), sampled };
}
