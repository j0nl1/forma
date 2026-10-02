import { html } from "./files.mjs";
import { gradientPaint } from "./figma-paint-gradients.mjs";
import { imagePaint } from "./figma-paint-images.mjs";
const modes = new Set([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);
export function paintList(paints = [], warn = () => {}, kind = "fill") {
  if (!Array.isArray(paints)) {
    warn(`${kind} paints must be an array`);
    return [];
  }
  return paints.filter((paint) => {
    if (paint?.visible === false) return false;
    if (!paint || typeof paint !== "object") {
      warn(`invalid ${kind} paint`);
      return false;
    }
    return true;
  });
}
export function visiblePaints(node, warn = () => {}) {
  return paintList(node.fillPaints ?? node.backgroundPaints ?? [], warn);
}
export function paintBlend(value, warn) {
  if (!value || value === "PASS_THROUGH") return "normal";
  const mode = String(value).toLowerCase().replaceAll("_", "-");
  if (modes.has(mode)) return mode;
  warn(`unsupported paint blend mode ${String(value)}; normal fallback`);
  return "normal";
}
export function paintLayers(
  doc,
  paints,
  { id, w, h, color, vector, warnings, kind = "fill" },
) {
  const warn = (message) => warnings.push(`${id}: ${message}`);
  const layers = [],
    defs = [];
  for (const paint of paintList(paints, warn, kind)) {
    const opacity = Number.isFinite(paint.opacity)
      ? Math.min(1, Math.max(0, paint.opacity))
      : 1;
    const layer = { blend: paintBlend(paint.blendMode, warn) };
    if (paint.boundVariables && Object.keys(paint.boundVariables).length)
      warn("paint variable bindings need resolution and visual review");
    if (paint.type === "SOLID") {
      if (!paint.color) {
        warn(`SOLID ${kind} color missing`);
        continue;
      }
      layer.solid = color(paint.color, opacity);
      layer.css = `linear-gradient(${layer.solid},${layer.solid})`;
      layer.svg = layer.solid;
    } else if (
      [
        "GRADIENT_LINEAR",
        "GRADIENT_RADIAL",
        "GRADIENT_ANGULAR",
        "GRADIENT_DIAMOND",
      ].includes(paint.type)
    ) {
      if (vector && paint.type !== "GRADIENT_LINEAR") {
        warn(
          `unsupported vector ${kind} ${paint.type}; visual review required`,
        );
        continue;
      }
      const gradient = gradientPaint(paint, { w, h, color, opacity, warn });
      if (!gradient) continue;
      layer.css = gradient.css;
      if (vector) {
        const key = `codex-figma-paint-${id.replace(/[^\w-]/g, "-")}-${kind}-${layers.length}`;
        defs.push(
          `<linearGradient id="${key}" gradientUnits="userSpaceOnUse" x1="${gradient.start[0]}" y1="${gradient.start[1]}" x2="${gradient.end[0]}" y2="${gradient.end[1]}">${gradient.stops.map((s) => `<stop offset="${s.position}" stop-color="${html(s.color)}"/>`).join("")}</linearGradient>`,
        );
        layer.svg = `url(#${key})`;
      }
    } else if (paint.type === "IMAGE") {
      if (vector) {
        warn(`unsupported vector ${kind} IMAGE; visual review required`);
        continue;
      }
      layer.css = imagePaint(paint, { doc, w, h, opacity, warn });
      if (!layer.css) continue;
    } else {
      warn(`unsupported ${kind} ${String(paint.type ?? "unknown")}`);
      continue;
    }
    layers.push(layer);
  }
  return { layers, defs: defs.length ? `<defs>${defs.join("")}</defs>` : "" };
}
export function nodePaints(doc, node, options) {
  const { id, vector, warnings } = options;
  const { layers, defs } = paintLayers(
    doc,
    node.fillPaints ?? node.backgroundPaints ?? [],
    options,
  );
  const declarations = [],
    warn = (message) => warnings.push(`${id}: ${message}`);
  const overall = paintBlend(node.blendMode, warn);
  if (overall !== "normal") declarations.push(`mix-blend-mode:${overall}`);
  else if (layers.length === 1 && layers[0].blend !== "normal")
    declarations.push(`mix-blend-mode:${layers[0].blend}`);
  let textColor = "inherit";
  if (!vector) {
    if (layers.length === 1 && layers[0].solid) {
      if (node.type === "TEXT") textColor = layers[0].solid;
      else declarations.push(`background:${layers[0].solid}`);
    } else if (layers.length) {
      const topFirst = [...layers].reverse();
      declarations.push(
        `background-image:${topFirst.map((l) => l.css).join(",")}`,
        `background-blend-mode:${topFirst.map((l) => l.blend).join(",")}`,
      );
      if (node.type === "TEXT") {
        declarations.push(
          "background-clip:text",
          "-webkit-background-clip:text",
        );
        textColor = "transparent";
      }
    }
  }
  return {
    declarations,
    textColor,
    defs,
    layers,
  };
}
