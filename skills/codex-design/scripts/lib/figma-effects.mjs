import { html } from "./files.mjs";
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
export function nodeEffects(node, { id, color, alpha, warnings }) {
  const declarations = [],
    boxes = [],
    drops = [],
    blurs = [],
    backdrop = [],
    inner = [];
  const warn = (message) => warnings.push(`${id}: ${message}`);
  if (node.effects != null && !Array.isArray(node.effects))
    warn("effects must be an array; visual review required");
  for (const effect of Array.isArray(node.effects) ? node.effects : []) {
    if (effect?.visible === false) continue;
    if (!effect || typeof effect !== "object") {
      warn("invalid effect; visual review required");
      continue;
    }
    const radius = Math.max(0, number(effect.radius));
    if (
      effect.blendMode &&
      effect.blendMode !== "NORMAL" &&
      effect.blendMode !== "PASS_THROUGH"
    )
      warn(`effect blend mode ${effect.blendMode} needs visual review`);
    if (effect.boundVariables && Object.keys(effect.boundVariables).length)
      warn("effect variable bindings need resolution and visual review");
    if (["DROP_SHADOW", "INNER_SHADOW"].includes(effect.type)) {
      if (!effect.color || !effect.offset) {
        warn(`incomplete ${effect.type}; color and offset are required`);
        continue;
      }
      const x = number(effect.offset.x),
        y = number(effect.offset.y),
        spread = number(effect.spread),
        paint = color(effect.color);
      if (alpha) {
        if (spread)
          warn(`${effect.type} spread on text/vector needs visual review`);
        if (effect.type === "DROP_SHADOW")
          drops.unshift(`drop-shadow(${x}px ${y}px ${radius}px ${paint})`);
        else inner.push({ x, y, radius, paint });
      } else
        boxes.unshift(
          `${effect.type === "INNER_SHADOW" ? "inset " : ""}${x}px ${y}px ${radius}px ${spread}px ${paint}`,
        );
      if (effect.showShadowBehindNode === true)
        warn("shadow behind translucent geometry needs visual review");
    } else if (
      ["LAYER_BLUR", "FOREGROUND_BLUR", "BACKGROUND_BLUR"].includes(effect.type)
    ) {
      if (effect.blurType && effect.blurType !== "NORMAL") {
        warn(`${effect.blurType} blur needs visual review`);
        continue;
      }
      (effect.type === "BACKGROUND_BLUR" ? backdrop : blurs).push(
        `blur(${radius}px)`,
      );
    } else
      warn(
        `unsupported effect ${String(effect.type ?? "unknown")}; visual review required`,
      );
  }
  let defs = "",
    innerFilter = "";
  if (inner.length) {
    const key = "codex-figma-inner-" + id.replace(/[^\w-]/g, "-");
    const primitives = inner
      .map(({ x, y, radius, paint }, index) => {
        const cut = `cut-${index}`,
          ink = `ink-${index}`,
          shade = `shade-${index}`,
          composite = `layer-${index}`;
        return `<feGaussianBlur in="SourceAlpha" stdDeviation="${radius / 2}" result="blur-${index}"/><feOffset in="blur-${index}" dx="${x}" dy="${y}" result="offset-${index}"/><feComposite in="SourceAlpha" in2="offset-${index}" operator="out" result="${cut}"/><feFlood flood-color="${html(paint)}" result="${ink}"/><feComposite in="${ink}" in2="${cut}" operator="in" result="${shade}"/><feMerge result="${composite}"><feMergeNode in="${index ? `layer-${index - 1}` : "SourceGraphic"}"/><feMergeNode in="${shade}"/></feMerge>`;
      })
      .join("");
    defs = `<svg aria-hidden="true" width="0" height="0" style="position:absolute;pointer-events:none"><defs><filter id="${key}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">${primitives}</filter></defs></svg>`;
    innerFilter = `url(#${key})`;
  }
  if (boxes.length) declarations.push(`box-shadow:${boxes.join(",")}`);
  const filters = [innerFilter, ...drops, ...blurs].filter(Boolean);
  if (filters.length) declarations.push(`filter:${filters.join(" ")}`);
  if (backdrop.length)
    declarations.push(`backdrop-filter:${backdrop.join(" ")}`);
  return { declarations, defs };
}
