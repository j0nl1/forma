import { paintList } from "./paints.mjs";
const weight = (value, warn) => {
  if (value == null) return 0;
  if (!Number.isFinite(value) || value < 0) {
    warn("invalid stroke weight; zero fallback");
    return 0;
  }
  return value;
};
export function strokeAlignment(node, fallback, warn) {
  const align = node.strokeAlign ?? fallback;
  if (["INSIDE", "CENTER", "OUTSIDE"].includes(align)) return align;
  warn(`unsupported stroke alignment ${String(align)}; ${fallback} fallback`);
  return fallback;
}
export function boxStroke(node, { id, color, vector, warnings }) {
  const declarations = [],
    shadows = [];
  const warn = (message) => warnings.push(`${id}: ${message}`);
  if (vector) return { declarations, shadows };
  const paints = paintList(node.strokePaints ?? [], warn, "stroke");
  if (!paints.length) return { declarations, shadows };
  if (node.type === "TEXT") {
    if (node.strokeWeight > 0 || node.strokeGeometry?.length)
      warn(
        "text stroke requires resolved glyph geometry; visual review required",
      );
    return { declarations, shadows };
  }
  let last;
  for (const paint of paints) {
    if (paint.type === "SOLID" && paint.color) last = paint;
    else
      warn(
        `unsupported box stroke ${String(paint.type ?? "unknown")}; visual review required`,
      );
    if (
      paint.blendMode &&
      !["NORMAL", "PASS_THROUGH"].includes(paint.blendMode)
    )
      warn("box stroke blend needs visual review");
    if (paint.boundVariables && Object.keys(paint.boundVariables).length)
      warn("stroke variable bindings need resolution and visual review");
  }
  if (!last) return { declarations, shadows };
  if (paints.length > 1)
    warn(
      "box stroke uses the last visible solid paint; layer approximation needs visual review",
    );
  const opacity = Number.isFinite(last.opacity)
    ? Math.min(1, Math.max(0, last.opacity))
    : 1;
  const ink = color(last.color, opacity),
    size = weight(node.strokeWeight, warn);
  const dashed = Array.isArray(node.dashPattern) && node.dashPattern.length > 0;
  if (dashed)
    warn(
      "box dash pattern uses a CSS dashed approximation; exact lengths need visual review",
    );
  else if (node.dashPattern != null && !Array.isArray(node.dashPattern))
    warn("invalid dash pattern; solid fallback");
  const independent = node.borderStrokeWeightsIndependent === true;
  if (independent) {
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const sideWeight = weight(
        node[`border${side}Weight`] ?? node[`stroke${side}Weight`] ?? size,
        warn,
      );
      if (sideWeight)
        declarations.push(
          `border-${side.toLowerCase()}:${sideWeight}px ${dashed ? "dashed" : "solid"} ${ink}`,
        );
    }
    if (!node.bordersTakeSpace)
      warn(
        "independent borders may offset absolute children; visual review required",
      );
  } else if (size) {
    const align = strokeAlignment(node, "INSIDE", warn);
    if (dashed)
      declarations.push(
        `outline:${size}px dashed ${ink}`,
        `outline-offset:${align === "INSIDE" ? -size : align === "CENTER" ? -size / 2 : 0}px`,
      );
    else {
      if (align !== "OUTSIDE")
        shadows.push(
          `inset 0 0 0 ${align === "CENTER" ? size / 2 : size}px ${ink}`,
        );
      if (align !== "INSIDE")
        shadows.push(`0 0 0 ${align === "CENTER" ? size / 2 : size}px ${ink}`);
    }
    if (node.bordersTakeSpace)
      warn(
        "uniform bordersTakeSpace needs layout resolution and visual review",
      );
  }
  return { declarations, shadows };
}
