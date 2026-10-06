import { html } from "../../../core/src/lib/files.mjs";
import { decodePathData } from "../render/geometry.mjs";

export const isIconFont = (node) =>
  node.type === "TEXT" &&
  /font ?awesome|material (icons|symbols)|icomoon|glyphicons?|ionicons/i.test(
    node.fontName?.family ?? "",
  );
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const dimension = (value) =>
  Math.abs(value - Math.round(value)) < 0.0001
    ? Math.round(value)
    : value.toFixed(3);
function solidColor(node) {
  if (!Array.isArray(node.fillPaints)) return undefined;
  const paint = node.fillPaints.find(
    (paint) => paint.visible !== false && paint.type === "SOLID" && paint.color,
  );
  if (!paint) return undefined;
  const c = paint.color,
    channels = [c.r, c.g, c.b, c.a ?? 1, paint.opacity ?? 1];
  if (!channels.every(finite)) return undefined;
  return `rgba(${channels
    .slice(0, 3)
    .map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255))
    .join(",")},${Math.max(0, Math.min(1, channels[3] * channels[4]))})`;
}

// Generated icons occupy an SVG flow box; raw imported text keeps its separate rich paint renderer.
export function iconComponent(
  doc,
  node,
  { warnings = [], boundText = false } = {},
) {
  if (boundText || !isIconFont(node)) return null;
  const warn = (message) =>
    warnings.push(
      `${node.guid?.sessionID ?? "?"}:${node.guid?.localID ?? "?"}: ${message}`,
    );
  const w = node.size?.x,
    h = node.size?.y;
  if (!finite(w) || !finite(h) || w <= 0 || h <= 0) {
    warn(
      "icon font has no positive finite SVG dimensions; literal text fallback",
    );
    return null;
  }
  const glyphs = node.derivedTextData?.glyphs;
  if (!Array.isArray(glyphs) || !glyphs.length) {
    warn("icon font has no saved glyph paths; literal text fallback");
    return null;
  }
  const paths = [];
  for (const glyph of glyphs) {
    const bytes = doc.blobs?.[glyph?.commandsBlob]?.bytes;
    if (
      !bytes ||
      !(Array.isArray(bytes) || ArrayBuffer.isView(bytes)) ||
      !finite(glyph.position?.x) ||
      !finite(glyph.position?.y) ||
      !finite(glyph.fontSize) ||
      glyph.fontSize <= 0 ||
      (glyph.rotation != null && !finite(glyph.rotation))
    ) {
      warn(
        "icon font glyph has unresolved geometry or placement; path omitted",
      );
      continue;
    }
    try {
      const d = decodePathData(bytes)
        .replace(/^\s*(?:Z\s*)+/, "")
        .trim()
        .replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, (coordinate) =>
          String(Number(Number(coordinate).toFixed(3))),
        );
      if (!d) continue;
      const transform = `translate(${dimension(glyph.position.x)} ${dimension(glyph.position.y)}) scale(${dimension(glyph.fontSize)} ${dimension(-glyph.fontSize)})${glyph.rotation ? ` rotate(${dimension((glyph.rotation * 180) / Math.PI)})` : ""}`;
      paths.push(
        `<path transform="${html(transform)}" d="${html(d)}" fill="currentColor"/>`,
      );
    } catch (error) {
      warn(`icon font glyph path: ${error.message}`);
    }
  }
  if (!paths.length) {
    warn("icon font has no usable saved glyph paths; literal text fallback");
    return null;
  }
  const color = solidColor(node);
  return {
    markup: `<svg width="${dimension(w)}" height="${dimension(h)}" viewBox="0 0 ${dimension(w)} ${dimension(h)}" fill="none">${paths.join("")}</svg>`,
    style: color ? { color } : {},
  };
}
