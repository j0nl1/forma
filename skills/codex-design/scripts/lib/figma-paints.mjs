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
export function visiblePaints(node, warn = () => {}) {
  const paints = node.fillPaints ?? node.backgroundPaints ?? [];
  if (!Array.isArray(paints)) {
    warn("fill paints must be an array");
    return [];
  }
  return paints.filter((p) => {
    if (p?.visible === false) return false;
    if (!p || typeof p !== "object") {
      warn("invalid fill paint");
      return false;
    }
    return true;
  });
}
export function nodePaints(doc, node, { id, w, h, color, vector, warnings }) {
  const warn = (message) => warnings.push(`${id}: ${message}`);
  const layers = [],
    declarations = [],
    defs = [];
  const blend = (value) => {
    if (!value || value === "PASS_THROUGH") return "normal";
    const mode = String(value).toLowerCase().replaceAll("_", "-");
    if (modes.has(mode)) return mode;
    warn(`unsupported paint blend mode ${String(value)}; normal fallback`);
    return "normal";
  };
  for (const paint of visiblePaints(node, warn)) {
    const opacity = Number.isFinite(paint.opacity)
      ? Math.min(1, Math.max(0, paint.opacity))
      : 1;
    const layer = { blend: blend(paint.blendMode) };
    if (paint.boundVariables && Object.keys(paint.boundVariables).length)
      warn("paint variable bindings need resolution and visual review");
    if (paint.type === "SOLID") {
      if (!paint.color) {
        warn("SOLID fill color missing");
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
        warn(`unsupported vector fill ${paint.type}; visual review required`);
        continue;
      }
      const gradient = gradientPaint(paint, { w, h, color, opacity, warn });
      if (!gradient) continue;
      layer.css = gradient.css;
      if (vector) {
        const key = `codex-figma-paint-${id.replace(/[^\w-]/g, "-")}-${layers.length}`;
        defs.push(
          `<linearGradient id="${key}" gradientUnits="userSpaceOnUse" x1="${gradient.start[0]}" y1="${gradient.start[1]}" x2="${gradient.end[0]}" y2="${gradient.end[1]}">${gradient.stops.map((s) => `<stop offset="${s.position}" stop-color="${html(s.color)}"/>`).join("")}</linearGradient>`,
        );
        layer.svg = `url(#${key})`;
      }
    } else if (paint.type === "IMAGE") {
      if (vector) {
        warn("unsupported vector fill IMAGE; visual review required");
        continue;
      }
      layer.css = imagePaint(paint, { doc, w, h, opacity, warn });
      if (!layer.css) continue;
    } else {
      warn(`unsupported fill ${String(paint.type ?? "unknown")}`);
      continue;
    }
    layers.push(layer);
  }
  const overall = blend(node.blendMode);
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
    defs: defs.length ? `<defs>${defs.join("")}</defs>` : "",
    layers,
  };
}
