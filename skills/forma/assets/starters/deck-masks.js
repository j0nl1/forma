// Gradient geometry follows the authored reveal directions. Animation drives a numeric property.
const progress = "var(--codex-deck-progress)";
const fraction = (size) => `calc(${progress} * ${size})`;
const layer = (angle, stops, repeating = false) =>
  `${repeating ? "repeating-" : ""}linear-gradient(${angle}deg, ${stops})`;
const black = "#000",
  clear = "transparent";
export function maskStyles(variant) {
  let image, size, position;
  const axis = variant.endsWith("vertical") ? 90 : 180;
  if (variant === "wheel")
    image = `conic-gradient(${black} 0deg ${fraction("1turn")}, ${clear} ${fraction("1turn")} 1turn)`;
  else if (variant === "wedge") {
    const near = fraction("180deg"),
      far = `calc(360deg - ${progress} * 180deg)`;
    image = `conic-gradient(${black} 0deg ${near},${clear} ${near} ${far},${black} ${far} 360deg)`;
  } else if (variant.startsWith("split-")) {
    const near = fraction("50%"),
      far = `calc(100% - ${progress} * 50%)`;
    image = layer(
      axis,
      `${black} 0 ${near},${clear} ${near} ${far},${black} ${far} 100%`,
    );
  } else if (variant.startsWith("blinds-")) {
    const stop = fraction("12px");
    image = layer(axis, `${black} 0 ${stop},${clear} ${stop} 12px`, true);
  } else if (variant.startsWith("random-bars-")) {
    image = [
      [0, 4, 0.5],
      [4, 5, 0],
      [9, 4, 0.75],
      [13, 4, 0.25],
    ]
      .map(([start, width, delay]) => {
        const end = `calc(${start}px + clamp(0, (${progress} - ${delay}) * 4, 1) * ${width}px)`;
        return layer(
          axis,
          `${clear} 0 ${start}px,${black} ${start}px ${end},${clear} ${end} 17px`,
          true,
        );
      })
      .join(",");
  } else if (variant === "box-in" || variant === "diamond-in")
    image = (variant === "box-in" ? [0, 90, 180, 270] : [45, 135, 225, 315])
      .map((angle) =>
        layer(
          angle,
          `${black} 0 ${fraction("50%")},${clear} ${fraction("50%")}`,
        ),
      )
      .join(",");
  else if (variant.startsWith("circle-")) {
    const stop =
      variant === "circle-in"
        ? `calc((1 - ${progress}) * 100%)`
        : fraction("100%");
    image = `radial-gradient(circle farthest-corner at 50% 50%,${variant === "circle-in" ? clear : black} 0 ${stop},${variant === "circle-in" ? black : clear} ${stop})`;
  } else if (variant === "plus-out") {
    const near = `calc(50% - ${progress} * 50%)`,
      far = `calc(50% + ${progress} * 50%)`;
    image = [90, 180]
      .map((angle) =>
        layer(
          angle,
          `${clear} 0 ${near},${black} ${near} ${far},${clear} ${far}`,
        ),
      )
      .join(",");
  } else if (variant === "plus-in") {
    const near = fraction("50%"),
      far = `calc(100% - ${progress} * 50%)`;
    image = [
      [270, near, near],
      [0, far, near],
      [90, far, far],
      [180, near, far],
    ]
      .map(
        ([angle, x, y]) =>
          `conic-gradient(from ${angle}deg at ${x} ${y},${black} 0 90deg,${clear} 90deg 360deg)`,
      )
      .join(",");
  } else if (variant.startsWith("strips-")) {
    const angle = {
      "strips-down-right": 135,
      "strips-down-left": 225,
      "strips-up-right": 45,
      "strips-up-left": 315,
    }[variant];
    image = layer(
      angle,
      `${black} 0 ${fraction("100%")},${clear} ${fraction("100%")}`,
    );
  } else if (variant.startsWith("checkerboard-")) {
    const stops = [
      fraction("100%"),
      `calc(clamp(0, (${progress} - 0.15) / 0.85, 1) * 100%)`,
    ];
    image = stops
      .map(
        (stop, index) =>
          `conic-gradient(from 270deg at ${axis === 90 ? `${(index + 1) * 12}px ${stop}` : `${stop} ${(index + 1) * 12}px`},${black} 0 90deg,${clear} 90deg 360deg)`,
      )
      .join(",");
    size = axis === 90 ? "24px 100%,24px 100%" : "100% 24px,100% 24px";
  } else if (variant === "dissolve") {
    const radii = [
      fraction("8px"),
      `calc(clamp(0, (${progress} - .25) * 1.4, 1) * 10px)`,
    ];
    image = radii
      .map(
        (r) =>
          `radial-gradient(circle at 50% 50%,${black} 0 ${r},${clear} ${r})`,
      )
      .join(",");
    size = "11px 11px,14px 14px";
    position = "0 0,4px 7px";
  }
  return { image, size, position };
}
export function installMaskRules() {
  if (document.getElementById("codex-deck-effects"))
    return (
      document.getElementById("codex-deck-effects").dataset.masks === "true"
    );
  let supported = false;
  try {
    if (CSS.registerProperty) {
      CSS.registerProperty({
        name: "--codex-deck-progress",
        syntax: "<number>",
        inherits: false,
        initialValue: "0",
      });
      supported = true;
    }
  } catch (error) {
    supported = error.name === "InvalidModificationError";
  }
  const variants = [
    "wheel",
    "wedge",
    "dissolve",
    ...["split", "blinds", "random-bars", "checkerboard"].flatMap((name) =>
      ["horizontal", "vertical"].map((axis) => `${name}-${axis}`),
    ),
    ...["box", "diamond"].map((name) => `${name}-in`),
    ...["circle", "plus"].flatMap((name) =>
      ["in", "out"].map((dir) => `${name}-${dir}`),
    ),
    ...["down-right", "down-left", "up-right", "up-left"].map(
      (dir) => `strips-${dir}`,
    ),
  ];
  const rule = (variant) => {
    const { image, size, position } = maskStyles(variant);
    return `deck-stage:not([noscale]) [data-deck-anim-mask="${variant}"]{mask-image:${image};-webkit-mask-image:${image};${size ? `mask-size:${size};-webkit-mask-size:${size};` : ""}${position ? `mask-position:${position};-webkit-mask-position:${position};` : ""}}`;
  };
  const style = document.createElement("style");
  style.id = "codex-deck-effects";
  style.dataset.masks = String(supported);
  style.textContent = `@media screen{deck-stage:not([noscale]) [data-deck-anim-hidden]{visibility:hidden!important;opacity:0!important}${supported ? variants.map(rule).join("\n") : ""}}`;
  document.head.append(style);
  return supported;
}
