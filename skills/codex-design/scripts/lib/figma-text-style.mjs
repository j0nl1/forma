const finite = (value) => typeof value === "number" && Number.isFinite(value);
export function typography(node, warn, defaults = true) {
  const css = [];
  const meta = node.derivedTextData?.fontMetaData?.[0];
  const style = String(node.fontName?.style ?? "");
  const weights = [
    [/thin/i, 100],
    [/extra\s?light|ultra\s?light/i, 200],
    [/semi\s?bold|demi\s?bold/i, 600],
    [/extra\s?bold|ultra\s?bold/i, 800],
    [/light/i, 300],
    [/medium/i, 500],
    [/bold/i, 700],
    [/black|heavy/i, 900],
  ];
  const weight = finite(node.fontWeight)
    ? node.fontWeight
    : finite(meta?.fontWeight)
      ? meta.fontWeight
      : (weights.find(([pattern]) => pattern.test(style))?.[1] ?? 400);
  if (node.fontName?.family != null || defaults)
    css.push(
      `font-family:${JSON.stringify(String(node.fontName?.family ?? "sans-serif"))},sans-serif`,
    );
  if (node.fontName || node.fontWeight != null || meta || defaults)
    css.push(
      `font-weight:${Math.max(1, Math.min(1000, weight))}`,
      `font-style:${/italic|oblique/i.test(style) || meta?.fontStyle === "ITALIC" ? "italic" : "normal"}`,
    );
  if (node.fontSize != null || defaults) {
    if (node.fontSize != null && (!finite(node.fontSize) || node.fontSize <= 0))
      warn("invalid font size; default 16px");
    css.push(
      `font-size:${finite(node.fontSize) && node.fontSize > 0 ? node.fontSize : 16}px`,
    );
  }
  const align = {
    LEFT: "left",
    RIGHT: "right",
    CENTER: "center",
    JUSTIFIED: "justify",
  };
  if (node.textAlignHorizontal != null) {
    if (!align[node.textAlignHorizontal])
      warn(`unsupported text alignment ${String(node.textAlignHorizontal)}`);
    css.push(`text-align:${align[node.textAlignHorizontal] ?? "left"}`);
  }
  for (const [key, property, units] of [
    ["lineHeight", "line-height", { PIXELS: "px", PERCENT: "%", RAW: "" }],
    ["letterSpacing", "letter-spacing", { PIXELS: "px", PERCENT: "em" }],
  ]) {
    const input = node[key];
    if (!input) continue;
    if (input.units === "AUTO" && key === "lineHeight") {
      css.push("line-height:normal");
      continue;
    }
    if (
      !finite(input.value) ||
      !Object.hasOwn(units, input.units) ||
      (key === "lineHeight" && input.value < 0)
    ) {
      warn(`unsupported ${key} units or value; visual review required`);
      continue;
    }
    css.push(
      `${property}:${key === "letterSpacing" && input.units === "PERCENT" ? input.value / 100 : input.value}${units[input.units]}`,
    );
  }
  const decoration = {
    NONE: "none",
    UNDERLINE: "underline",
    STRIKETHROUGH: "line-through",
  };
  if (node.textDecoration != null) {
    if (decoration[node.textDecoration])
      css.push(`text-decoration:${decoration[node.textDecoration]}`);
    else warn(`unsupported text decoration ${String(node.textDecoration)}`);
  }
  const casing = {
    ORIGINAL: "none",
    UPPER: "uppercase",
    LOWER: "lowercase",
    TITLE: "capitalize",
  };
  if (node.textCase != null) {
    if (casing[node.textCase])
      css.push(`text-transform:${casing[node.textCase]}`);
    else warn(`unsupported text case ${String(node.textCase)}`);
  }
  const features = node.toggledOnOTFeatures;
  if (Array.isArray(features)) {
    const valid = features.filter(
      (tag) => typeof tag === "string" && /^[A-Z0-9]{4}$/.test(tag),
    );
    if (valid.length !== features.length)
      warn("invalid OpenType feature tag; ignored");
    const direct = valid.filter((tag) => tag !== "SUPS");
    if (direct.length)
      css.push(
        `font-feature-settings:${direct.map((tag) => `"${tag.toLowerCase()}" 1`).join(",")}`,
      );
  } else if (features != null) warn("OpenType features must be an array");
  if (node.fontVariantCaps === "SMALL" || features?.includes?.("SMCP"))
    css.push("font-variant-caps:small-caps");
  if (
    ["SUPER", "SUB"].includes(node.fontVariantPosition) ||
    (Array.isArray(features) && features.includes("SUPS"))
  )
    css.push(
      `vertical-align:${node.fontVariantPosition === "SUPER" || (Array.isArray(features) && features.includes("SUPS")) ? "super" : "sub"}`,
      "font-size:0.72em",
    );
  if (node.fontVariations != null) {
    if (!Array.isArray(node.fontVariations))
      warn("font variations must be an array");
    else {
      const axes = [];
      for (const variation of node.fontVariations) {
        const tag = Number.isInteger(variation?.axisTag)
          ? [24, 16, 8, 0]
              .map((shift) =>
                String.fromCharCode((variation.axisTag >>> shift) & 255),
              )
              .join("")
          : "";
        if (!/^[A-Za-z0-9]{4}$/.test(tag) || !finite(variation?.value)) {
          warn("invalid font variation; ignored");
          continue;
        }
        axes.push(`"${tag}" ${variation.value}`);
      }
      if (axes.length) css.push(`font-variation-settings:${axes.join(",")}`);
    }
  }
  for (const key of [
    "leadingTrim",
    "textAlignVertical",
    "paragraphSpacing",
    "paragraphIndent",
    "textTruncation",
    "maxLines",
  ])
    if (
      node[key] != null &&
      node[key] !== "NONE" &&
      node[key] !== "TOP" &&
      node[key] !== 0
    )
      warn(`${key} needs text layout and visual review`);
  return css;
}
