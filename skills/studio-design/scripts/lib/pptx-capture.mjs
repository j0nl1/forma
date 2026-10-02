// This function runs in Chromium. Its result contains data, never executable source.
export function captureSlide(index) {
  const stage = document.querySelector("deck-stage");
  const root = stage.slides[index];
  const origin = root.getBoundingClientRect();
  const objects = [],
    warnings = [];
  let rasterIndex = 0;
  const elements = [root, ...root.querySelectorAll("*")];
  const sourceIds = new Map(
    elements.map((element, ordinal) => [element, `pptx-${index}-${ordinal}`]),
  );
  for (const [element, id] of sourceIds)
    element.setAttribute("data-codex-pptx-source", id);
  const membership = (element) => {
    const ancestors = [];
    for (
      let current = element;
      current && sourceIds.has(current);
      current = current.parentElement
    )
      ancestors.push(current);
    return {
      sourceId: sourceIds.get(element),
      sourceAncestors: ancestors.slice(1).map((node) => sourceIds.get(node)),
      animIds: ancestors
        .filter((node) => node.hasAttribute("data-anim"))
        .map((node) => sourceIds.get(node)),
    };
  };
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
  const raster = (element, reason, layer = "subtree") => {
    const id = `${index}-${rasterIndex++}`;
    element.setAttribute("data-codex-pptx-raster", id);
    const box = element.getBoundingClientRect();
    const contained =
      box.left >= origin.left &&
      box.top >= origin.top &&
      box.right <= origin.right &&
      box.bottom <= origin.bottom;
    objects.push({
      kind: "image",
      ...membership(element),
      descendantSourceIds:
        layer === "subtree"
          ? [...element.querySelectorAll("*")].map((child) =>
              sourceIds.get(child),
            )
          : [],
      flattenedAnimationIds:
        layer === "subtree"
          ? [...element.querySelectorAll("[data-anim]")].map((child) =>
              sourceIds.get(child),
            )
          : [],
      layer,
      id,
      root: element === root,
      ...(contained &&
      reason === "Image" &&
      getComputedStyle(element).boxShadow === "none"
        ? rect(element.getBoundingClientRect())
        : contained &&
            layer === "paint" &&
            getComputedStyle(element).boxShadow === "none"
          ? rect(element.getBoundingClientRect())
          : { x: 0, y: 0, w: origin.width, h: origin.height }),
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
        ...membership(node.parentElement),
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
    const radii = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map(
      (corner) => style[`border${corner}Radius`],
    );
    const hasRadius = radii.some((radius) => parseFloat(radius) > 0);
    const clips = /hidden|clip|scroll|auto/.test(
      `${style.overflowX} ${style.overflowY}`,
    );
    const complex =
      !color(style.color) ||
      element.shadowRoot ||
      ["SVG", "CANVAS", "IFRAME"].includes(element.tagName) ||
      style.textShadow !== "none" ||
      (parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== "none") ||
      parseFloat(style.webkitTextStrokeWidth) > 0 ||
      style.webkitTextFillColor !== style.color ||
      (["VIDEO", "AUDIO"].includes(element.tagName) &&
        (style.boxShadow !== "none" ||
          box.left < origin.left ||
          box.top < origin.top ||
          box.right > origin.right ||
          box.bottom > origin.bottom)) ||
      [style.transform, style.translate, style.rotate, style.scale].some(
        (value) => value && value !== "none",
      ) ||
      style.filter !== "none" ||
      style.backdropFilter !== "none" ||
      style.clipPath !== "none" ||
      style.maskImage !== "none" ||
      style.mixBlendMode !== "normal" ||
      pseudo ||
      (clips && hasRadius && element.childNodes.length > 0) ||
      (Number(style.opacity) < 1 && element.childNodes.length > 0) ||
      style.backgroundClip === "text" ||
      style.webkitBackgroundClip === "text" ||
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
        clips &&
        (element.scrollWidth > element.clientWidth ||
          element.scrollHeight > element.clientHeight));
    if (complex)
      return raster(
        element,
        `${element.localName} retained as an image to preserve CSS, graphics or media appearance.`,
      );
    if (element.tagName === "IMG") return raster(element, "Image");
    if (["VIDEO", "AUDIO"].includes(element.tagName)) {
      if (
        !element.currentSrc &&
        !element.src &&
        !element.querySelector("source[src]")
      ) {
        raster(
          element,
          `${element.localName} has no playable source and is retained as static artwork.`,
        );
        return;
      }
      const id = `${index}-${rasterIndex++}`;
      element.setAttribute("data-codex-pptx-raster", id);
      objects.push({
        kind: "media",
        ...membership(element),
        id,
        root: false,
        ...rect(box),
        mediaType: element.localName,
        src:
          element.currentSrc ||
          element.src ||
          element.querySelector("source")?.src ||
          "",
        currentTime: element.currentTime,
        duration: Number.isFinite(element.duration) ? element.duration : null,
        playbackRate: element.playbackRate,
        volume: element.volume,
        muted: element.muted,
        loop: element.loop,
        autoplay: element.autoplay,
        controls: element.controls,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        videoWidth: element.videoWidth || 0,
        videoHeight: element.videoHeight || 0,
        decorated:
          hasRadius ||
          style.backgroundImage !== "none" ||
          style.boxShadow !== "none" ||
          parseFloat(style.borderTopWidth) > 0 ||
          opacity < 1,
        trim:
          element.hasAttribute("data-codex-exportable-video-play-start") ||
          element.hasAttribute("data-codex-exportable-video-play-end") ||
          /#t=/.test(element.currentSrc || element.src || ""),
      });
      return;
    }
    const borders = ["Top", "Right", "Bottom", "Left"].map(
      (side) =>
        `${style[`border${side}Width`]} ${style[`border${side}Style`]} ${style[`border${side}Color`]}`,
    );
    const painted =
      !color(style.backgroundColor) ||
      style.backgroundImage !== "none" ||
      style.boxShadow !== "none" ||
      hasRadius ||
      new Set(borders).size > 1 ||
      (parseFloat(style.borderTopWidth) && style.borderTopStyle !== "solid");
    const fill = color(style.backgroundColor),
      stroke = color(style.borderTopColor);
    if (painted) {
      raster(
        element,
        `${element.localName} background retained as an image to preserve CSS paint; foreground content is exported separately.`,
        "paint",
      );
    } else if (
      (fill && fill.transparency < 100) ||
      parseFloat(style.borderTopWidth)
    ) {
      objects.push({
        kind: "shape",
        ...membership(element),
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
    }
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
        ...membership(element),
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
  const composited = elements.some((element) => {
    const style = getComputedStyle(element);
    return style.mixBlendMode !== "normal" || style.backdropFilter !== "none";
  });
  if (composited)
    raster(
      root,
      "Slide retained as an image because blend or backdrop effects depend on surrounding artwork.",
    );
  else visit(root);
  // Audio without a rendered control still needs an embedded source. Keep its
  // control off the slide so it does not change the authored composition.
  for (const element of root.querySelectorAll("audio")) {
    let hiddenAncestor = false;
    for (
      let parent = element.parentElement;
      parent && parent !== root;
      parent = parent.parentElement
    ) {
      const style = getComputedStyle(parent);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      )
        hiddenAncestor = true;
    }
    if (hiddenAncestor) continue;
    if (
      !element.currentSrc &&
      !element.src &&
      !element.querySelector("source[src]")
    )
      continue;
    if (
      objects.some(
        (object) =>
          object.sourceId === sourceIds.get(element) && object.kind === "media",
      )
    )
      continue;
    if (
      getComputedStyle(element).display !== "none" &&
      element.getBoundingClientRect().width > 0
    ) {
      warnings.push(
        "Audio inside flattened artwork remains static because its surrounding CSS could not be separated safely.",
      );
      continue;
    }
    objects.push({
      kind: "media",
      ...membership(element),
      hidden: true,
      mediaType: "audio",
      x: -32,
      y: 0,
      w: 24,
      h: 24,
      src:
        element.currentSrc ||
        element.src ||
        element.querySelector("source")?.src ||
        "",
      currentTime: element.currentTime,
      playbackRate: element.playbackRate,
      volume: element.volume,
      muted: element.muted,
      loop: element.loop,
      autoplay: element.autoplay,
    });
  }
  for (const element of root.querySelectorAll("video")) {
    if (
      !element.currentSrc &&
      !element.src &&
      !element.querySelector("source[src]")
    )
      continue;
    if (
      !objects.some(
        (object) =>
          object.sourceId === sourceIds.get(element) && object.kind === "media",
      )
    )
      warnings.push(
        "Video inside flattened or hidden artwork remains a static image; its surrounding CSS prevents separate native playback.",
      );
  }
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
    animations: elements
      .filter((element) => element.hasAttribute("data-anim"))
      .map((element, documentIndex) => {
        const style = getComputedStyle(element);
        const [x, y] = style.transformOrigin.split(" ").map(parseFloat);
        const baseTransform = [
          style.transform,
          style.translate,
          style.rotate,
          style.scale,
        ].some((value) => value && value !== "none");
        return {
          id: sourceIds.get(element),
          attributes: Object.fromEntries(
            [...element.attributes]
              .filter((attribute) => attribute.name.startsWith("data-"))
              .map((attribute) => [attribute.name, attribute.value]),
          ),
          documentIndex,
          geometry: rect(element.getBoundingClientRect()),
          transformOrigin: { x, y },
          baseTransform,
          ...(element === root
            ? {
                unsupportedReason:
                  "The browser deck does not play animations attached to the slide root.",
              }
            : baseTransform
              ? {
                  unsupportedReason:
                    "The target has a CSS transform that cannot be mapped to a native animation pivot.",
                }
              : {}),
        };
      }),
    animationCount: elements.filter((element) =>
      element.hasAttribute("data-anim"),
    ).length,
  };
}
