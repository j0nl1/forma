// This function runs in Chromium. Its result contains data, never executable source.
export function captureSlide(index) {
  const stage = document.querySelector("deck-stage");
  const root = stage.slides[index];
  const origin = root.getBoundingClientRect();
  const objects = [],
    warnings = [];
  let rasterIndex = 0;
  const rect = (r) => ({
    x: r.x - origin.x,
    y: r.y - origin.y,
    w: r.width,
    h: r.height,
  });
  const color = (value) => {
    const parts = value
      .match(/^rgba?\(([^)]+)\)$/)?.[1]
      .split(/[,\s/]+/)
      .map(Number);
    if (!parts) return null;
    return {
      color: parts
        .slice(0, 3)
        .map((n) => Math.round(n).toString(16).padStart(2, "0"))
        .join(""),
      transparency: (1 - (parts[3] ?? 1)) * 100,
    };
  };
  const raster = (element, reason) => {
    const id = `${index}-${rasterIndex++}`;
    element.setAttribute("data-codex-pptx-raster", id);
    objects.push({
      kind: "image",
      id,
      root: element === root,
      ...rect(element.getBoundingClientRect()),
      alt:
        element.getAttribute("alt") ||
        element.getAttribute("aria-label") ||
        reason,
    });
    if (reason !== "Image") warnings.push(reason);
  };
  const text = (node, style, opacity) => {
    const range = document.createRange();
    const lines = [];
    let offset = 0;
    // Measure rendered lines so balanced headings and authored wrapping survive conversion.
    for (const char of node.textContent) {
      range.setStart(node, offset);
      offset += char.length;
      range.setEnd(node, offset);
      const box = range.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      let line = lines.at(-1);
      if (!line || Math.abs(line.y - box.y) > 1) {
        line = {
          text: "",
          x: box.x,
          y: box.y,
          right: box.right,
          h: box.height,
        };
        lines.push(line);
      }
      line.text += char;
      line.right = Math.max(line.right, box.right);
    }
    for (const line of lines) {
      let value = line.text;
      if (!/pre|break-spaces/.test(style.whiteSpace))
        value = value.replace(/\s+/g, " ");
      if (!value.trim()) continue;
      if (style.textTransform === "uppercase") value = value.toUpperCase();
      if (style.textTransform === "lowercase") value = value.toLowerCase();
      const paint = color(style.color);
      if (!paint) continue;
      objects.push({
        kind: "text",
        text: value,
        x: line.x - origin.x,
        y: line.y - origin.y,
        w: line.right - line.x,
        h: line.h,
        fontFace: style.fontFamily
          .split(",")[0]
          .trim()
          .replace(/^['"]|['"]$/g, ""),
        fontSize: parseFloat(style.fontSize),
        bold: Number(style.fontWeight) >= 600 || style.fontWeight === "bold",
        italic: style.fontStyle === "italic",
        underline: style.textDecorationLine.includes("underline"),
        strike: style.textDecorationLine.includes("line-through"),
        charSpacing: parseFloat(style.letterSpacing) || 0,
        color: paint.color,
        transparency: 100 - (100 - paint.transparency) * opacity,
        hyperlink: /^(https?:|mailto:)/i.test(
          node.parentElement.closest("a[href]")?.href ?? "",
        )
          ? { url: node.parentElement.closest("a[href]").href }
          : undefined,
      });
    }
  };
  const visit = (element, inheritedOpacity = 1) => {
    const style = getComputedStyle(element),
      box = element.getBoundingClientRect();
    if (
      style.display === "none" ||
      element.matches("[data-notes],script,style,link,template")
    )
      return;
    if (style.visibility === "hidden" || !box.width || !box.height) return;
    const opacity = inheritedOpacity * Number(style.opacity);
    if (!opacity) return;
    const pseudo = ["::before", "::after"].some((name) => {
      const s = getComputedStyle(element, name);
      return !["none", "normal"].includes(s.content) && s.display !== "none";
    });
    const complex =
      !color(style.color) ||
      !color(style.backgroundColor) ||
      element.shadowRoot ||
      ["SVG", "CANVAS", "VIDEO", "IFRAME"].includes(element.tagName) ||
      style.backgroundImage !== "none" ||
      style.boxShadow !== "none" ||
      style.textShadow !== "none" ||
      style.transform !== "none" ||
      style.filter !== "none" ||
      style.clipPath !== "none" ||
      style.maskImage !== "none" ||
      style.mixBlendMode !== "normal" ||
      pseudo ||
      parseFloat(style.borderRadius) > 0 ||
      style.writingMode !== "horizontal-tb" ||
      style.direction === "rtl" ||
      (element === root &&
        [...root.querySelectorAll("*")].some(
          (child) => getComputedStyle(child).zIndex !== "auto",
        )) ||
      style.textTransform === "capitalize" ||
      (element.tagName === "LI" &&
        style.listStyleType !== "none" &&
        style.listStylePosition === "inside") ||
      (element !== root &&
        /hidden|clip|scroll|auto/.test(style.overflow) &&
        (element.scrollWidth > element.clientWidth ||
          element.scrollHeight > element.clientHeight));
    if (complex)
      return raster(
        element,
        `${element.localName} retained as an image to preserve CSS, graphics or media appearance.`,
      );
    if (element.tagName === "IMG") return raster(element, "Image");
    const borders = ["Top", "Right", "Bottom", "Left"].map(
      (side) =>
        `${style[`border${side}Width`]} ${style[`border${side}Style`]} ${style[`border${side}Color`]}`,
    );
    if (
      new Set(borders).size > 1 ||
      (parseFloat(style.borderTopWidth) && style.borderTopStyle !== "solid")
    )
      return raster(
        element,
        `${element.localName} retained as an image to preserve its border.`,
      );
    const fill = color(style.backgroundColor),
      stroke = color(style.borderTopColor);
    if ((fill && fill.transparency < 100) || parseFloat(style.borderTopWidth))
      objects.push({
        kind: "shape",
        ...rect(box),
        fill: fill && {
          ...fill,
          transparency: 100 - (100 - fill.transparency) * opacity,
        },
        line: {
          ...(stroke || { color: "000000", transparency: 100 }),
          transparency:
            stroke && parseFloat(style.borderTopWidth)
              ? 100 - (100 - stroke.transparency) * opacity
              : 100,
          width: parseFloat(style.borderTopWidth),
        },
      });
    // List markers are outside the text node ranges and need their own native object.
    if (
      element.tagName === "LI" &&
      style.listStyleType !== "none" &&
      style.listStylePosition === "outside"
    ) {
      const siblings = [...element.parentElement.children].filter(
        (n) => n.tagName === "LI",
      );
      const ordered = element.parentElement.tagName === "OL";
      const ordinal =
        Number(element.getAttribute("value")) ||
        (Number(element.parentElement.getAttribute("start")) || 1) +
          siblings.indexOf(element);
      const supported = ["disc", "circle", "square", "decimal"].includes(
        style.listStyleType,
      );
      if (!supported)
        return raster(
          element,
          "List retained as an image to preserve its marker.",
        );
      const fontSize = parseFloat(style.fontSize);
      objects.push({
        kind: "text",
        text: ordered
          ? `${ordinal}.`
          : { disc: "•", circle: "◦", square: "▪" }[style.listStyleType],
        x: box.x - origin.x - fontSize * 1.2,
        y: box.y - origin.y,
        w: fontSize * 1.1,
        h: parseFloat(style.lineHeight) || fontSize * 1.2,
        fontFace: style.fontFamily.split(",")[0].replace(/['"]/g, "").trim(),
        fontSize,
        color: color(style.color)?.color || "000000",
        transparency: (1 - opacity) * 100,
      });
    }
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text(child, style, opacity);
      else if (child.nodeType === Node.ELEMENT_NODE) visit(child, opacity);
    }
  };
  visit(root);
  const source = document.getElementById("speaker-notes");
  let indexedNotes = [];
  if (source) {
    indexedNotes = JSON.parse(source.textContent);
    if (
      !Array.isArray(indexedNotes) ||
      indexedNotes.some((n) => typeof n !== "string")
    )
      throw new Error("Speaker notes must be an array of strings.");
    if (indexedNotes.length !== stage.slides.length)
      warnings.push("Speaker note count differs from the source slide count.");
  }
  const notes =
    root.getAttribute("data-speaker-notes") ??
    root.querySelector("[data-notes]")?.textContent ??
    indexedNotes[index];
  return {
    objects,
    notes: notes ?? "",
    warnings,
    width: origin.width,
    height: origin.height,
    animations:
      root.querySelectorAll("[data-anim]").length +
      Number(root.hasAttribute("data-anim")),
  };
}
