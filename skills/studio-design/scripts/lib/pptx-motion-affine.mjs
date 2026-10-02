// CSS individual transforms compose translate, rotate, scale, then transform.
// WAAPI replaces only the individual properties present in its keyframes.
// https://www.w3.org/TR/css-transforms-2/#ctm
const identity = [1, 0, 0, 1, 0, 0];
const multiply = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const translate = (x, y) => [1, 0, 0, 1, x, y];
const point = (matrix, x, y) => [
  matrix[0] * x + matrix[2] * y + matrix[4],
  matrix[1] * x + matrix[3] * y + matrix[5],
];
function inverse(matrix) {
  const [a, b, c, d, e, f] = matrix,
    determinant = a * d - b * c;
  return [d, -b, -c, a, c * f - d * e, b * e - a * f].map(
    (value) => value / determinant,
  );
}
function at(track, offset, fallback) {
  if (!track) return fallback;
  const index = track.findIndex(([time]) => time >= offset);
  if (index === 0) return track[0][1];
  if (index < 0) return track.at(-1)[1];
  const [left, right] = [track[index - 1], track[index]];
  return (
    left[1] + ((offset - left[0]) / (right[0] - left[0])) * (right[1] - left[1])
  );
}
function matrixFor(basis, rotate, scale, translation) {
  const radians = (rotate * Math.PI) / 180,
    cosine = Math.cos(radians) * scale,
    sine = Math.sin(radians) * scale;
  return [
    basis.parent,
    translate(basis.origin.x, basis.origin.y),
    translate(...translation),
    [cosine, sine, -sine, cosine, 0, 0],
    basis.transform,
    translate(-basis.origin.x, -basis.origin.y),
  ].reduce(multiply, identity);
}

/** Convert authored local keyframes to deltas on the already placed native group.
 * Its children retain their editable base geometry. Moving the group's center
 * alongside rotation/scale preserves an arbitrary CSS transform origin.
 */
export function affineTracks(entry, tracks, slide) {
  const transformKeys = ["ppt_x", "ppt_y", "rotation", "scale"];
  if (!transformKeys.some((key) => tracks.has(key))) return tracks;
  const rect = entry.geometry;
  const basis = entry.animationBasis ?? {
    parent: identity,
    transform: identity,
    origin: {
      x: rect.x + (entry.transformOrigin?.x ?? rect.w / 2),
      y: rect.y + (entry.transformOrigin?.y ?? rect.h / 2),
    },
    translate: [0, 0],
    rotate: 0,
    scale: 1,
  };
  const original = matrixFor(basis, basis.rotate, basis.scale, basis.translate),
    undo = inverse(original),
    center = [rect.x + rect.w / 2, rect.y + rect.h / 2];
  const offsets = new Set(
    transformKeys.flatMap((key) =>
      (tracks.get(key) ?? []).map(([time]) => time),
    ),
  );
  // A rotating off-center pivot follows an arc even when its angle is linear.
  if (tracks.has("rotation"))
    for (let sample = 0; sample <= 100; sample++) offsets.add(sample / 100);
  const result = new Map(tracks),
    x = [],
    y = [],
    rotation = [],
    scale = [];
  for (const offset of [...offsets].sort((a, b) => a - b)) {
    const angle = at(tracks.get("rotation"), offset, basis.rotate),
      size = at(tracks.get("scale"), offset, basis.scale),
      position = [
        at(tracks.get("ppt_x"), offset, basis.translate[0] / slide.width) *
          slide.width,
        at(tracks.get("ppt_y"), offset, basis.translate[1] / slide.height) *
          slide.height,
      ];
    const delta = multiply(matrixFor(basis, angle, size, position), undo),
      moved = point(delta, ...center);
    x.push([offset, (moved[0] - center[0]) / slide.width]);
    y.push([offset, (moved[1] - center[1]) / slide.height]);
    rotation.push([offset, angle - basis.rotate]);
    scale.push([offset, size / basis.scale]);
  }
  for (const [key, values] of [
    ["ppt_x", x],
    ["ppt_y", y],
  ]) {
    if (tracks.has(key) || values.some(([, value]) => Math.abs(value) > 1e-9))
      result.set(key, values);
  }
  if (tracks.has("rotation")) result.set("rotation", rotation);
  if (tracks.has("scale")) result.set("scale", scale);
  return result;
}
