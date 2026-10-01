export const IMAGE_STATE_FILE = "image-slots.state.json";
export const IMAGE_LEGACY_FILE = ".image-slots.state.json";
export const IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
];
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function imageValue(value) {
  if (typeof value === "string") value = { u: value };
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid image slot value.");
  if (
    Object.keys(value).some((key) => !["u", "s", "x", "y", "alt"].includes(key))
  )
    throw new Error("Unknown image slot field.");
  if (
    value.u !== undefined &&
    (typeof value.u !== "string" ||
      !/^data:image\/[a-z\d.+-]+[;,]/i.test(value.u) ||
      value.u.includes("\0"))
  )
    throw new Error("Stored images must use image data URLs.");
  for (const key of ["s", "x", "y"])
    if (value[key] !== undefined && !Number.isFinite(value[key]))
      throw new Error("Image framing must use finite numbers.");
  if (value.alt !== undefined && typeof value.alt !== "string")
    throw new Error("Image alt text must be a string.");
  return {
    ...(value.u ? { u: value.u } : {}),
    s: clamp(value.s ?? 1, 1, 5),
    x: value.x ?? 0,
    y: value.y ?? 0,
    ...(value.alt !== undefined ? { alt: value.alt } : {}),
  };
}
export function imageSlots(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Image state must be an object keyed by slot id.");
  const result = Object.create(null);
  for (const [id, entry] of Object.entries(value)) {
    if (!id || id.length > 256 || id.includes("\0"))
      throw new Error("Invalid image slot id.");
    result[id] = imageValue(entry);
  }
  return result;
}
export function readableImageSlots(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Image state must be an object keyed by slot id.");
  const slots = Object.create(null),
    errors = [];
  for (const [id, entry] of Object.entries(value)) {
    try {
      Object.assign(slots, imageSlots({ [id]: entry }));
    } catch {
      errors.push(id);
    }
  }
  return { slots, errors };
}
export function framing(iw, ih, fw, fh, fit, view) {
  if (![iw, ih, fw, fh].every((value) => Number.isFinite(value) && value > 0))
    return null;
  const base =
    fit === "contain" ? Math.min(fw / iw, fh / ih) : Math.max(fw / iw, fh / ih);
  const s = clamp(view.s ?? 1, 1, 5),
    width = iw * base * s,
    height = ih * base * s;
  const mx = Math.max(0, (width / fw - 1) * 50),
    my = Math.max(0, (height / fh - 1) * 50);
  const x = clamp(view.x ?? 0, -mx, mx),
    y = clamp(view.y ?? 0, -my, my);
  return { s, x, y, width, height, mx, my, base, fw, fh };
}
export function zoomAt(view, factor, cursor) {
  const s = clamp(view.s * factor, 1, 5),
    ratio = s / view.s;
  return {
    s,
    x: cursor.x + (view.x - cursor.x) * ratio,
    y: cursor.y + (view.y - cursor.y) * ratio,
  };
}
export function resizeCorner(start, point) {
  const sx = start.corner.includes("e") ? 1 : -1,
    sy = start.corner.includes("s") ? 1 : -1;
  const anchor = {
    x: start.cx - (sx * start.width) / 2,
    y: start.cy - (sy * start.height) / 2,
  };
  const diagonal = Math.hypot(start.width, start.height),
    unit = {
      x: (sx * start.width) / diagonal,
      y: (sy * start.height) / diagonal,
    };
  const projection =
    (point.x - anchor.x) * unit.x + (point.y - anchor.y) * unit.y;
  const s = clamp((start.s * projection) / diagonal, 1, 5),
    length = (diagonal * s) / start.s;
  return {
    s,
    x: ((anchor.x + (unit.x * length) / 2) / start.fw) * 100 - 50,
    y: ((anchor.y + (unit.y * length) / 2) / start.fh) * 100 - 50,
  };
}
