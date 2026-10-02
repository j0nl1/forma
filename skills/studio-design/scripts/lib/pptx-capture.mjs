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
  const rect = (r, inset = 0) => ({
    x: r.x - origin.x + inset,
    y: r.y - origin.y + inset,
    w: r.width - inset * 2,
    h: r.height - inset * 2,
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
  const uniformScale = (style) => {
    const matrix = new DOMMatrixReadOnly(
      style.transform === "none" ? undefined : style.transform,
    );
    const scale =
      style.scale === "none" ? [1] : style.scale.split(/\s+/).map(Number);
    const rotation =
      style.rotate === "none" ? 0 : Number.parseFloat(style.rotate);
    if (
      !matrix.is2D ||
      Math.abs(matrix.b) > 1e-7 ||
      Math.abs(matrix.c) > 1e-7 ||
      matrix.a <= 0 ||
      Math.abs(matrix.a - matrix.d) > 1e-7 ||
      scale.length > 2 ||
      !scale.every((value) => Number.isFinite(value) && value > 0) ||
      Math.abs(scale[0] - (scale[1] ?? scale[0])) > 1e-7 ||
      rotation !== 0 ||
      style.translate.split(/\s+/).length > 2 ||
      style.perspective !== "none" ||
      (style.zoom && style.zoom !== "normal" && Number(style.zoom) !== 1)
    )
      return null;
    return matrix.a * scale[0];
  };
  const hasPseudo = (element) =>
    ["::before", "::after"].some((name) => {
      const style = getComputedStyle(element, name);
      return (
        !["none", "normal"].includes(style.content) && style.display !== "none"
      );
    });
  const foregroundInsideRoundedClip = (element, style, box, radii, scale) => {
    // Use the conservative central rectangle inside all four corner ellipses.
    // This permits inset cards without approximating native clipping of glyphs.
    const corners = radii.map((radius) => {
      const values = radius.split(/\s+/);
      return [box.width, box.height].map((length, axis) => {
        const value = values[axis] ?? values[0];
        return parseFloat(value) * (value.endsWith("%") ? length / 100 : scale);
      });
    });
    if (!corners.flat().every(Number.isFinite)) return false;
    const safe = {
      left:
        box.left +
        Math.max(
          corners[0][0],
          corners[3][0],
          parseFloat(style.borderLeftWidth) * scale,
        ),
      right:
        box.right -
        Math.max(
          corners[1][0],
          corners[2][0],
          parseFloat(style.borderRightWidth) * scale,
        ),
      top:
        box.top +
        Math.max(
          corners[0][1],
          corners[1][1],
          parseFloat(style.borderTopWidth) * scale,
        ),
      bottom:
        box.bottom -
        Math.max(
          corners[2][1],
          corners[3][1],
          parseFloat(style.borderBottomWidth) * scale,
        ),
    };
    const inside = (rect) =>
      rect.left >= safe.left &&
      rect.right <= safe.right &&
      rect.top >= safe.top &&
      rect.bottom <= safe.bottom;
    const inspect = (node) => {
      const computed = getComputedStyle(node);
      if (
        computed.display === "none" ||
        computed.visibility === "hidden" ||
        Number(computed.opacity) === 0
      )
        return true;
      if (node !== element) {
        if (
          node.shadowRoot ||
          (node.tagName === "LI" && computed.listStyleType !== "none") ||
          hasPseudo(node) ||
          computed.boxShadow !== "none" ||
          computed.textShadow !== "none" ||
          computed.filter !== "none" ||
          (parseFloat(computed.outlineWidth) > 0 &&
            computed.outlineStyle !== "none") ||
          parseFloat(computed.webkitTextStrokeWidth) > 0
        )
          return false;
        const fill = color(computed.backgroundColor);
        const painted =
          !fill ||
          fill.transparency < 100 ||
          computed.backgroundImage !== "none" ||
          ["Top", "Right", "Bottom", "Left"].some(
            (side) => parseFloat(computed[`border${side}Width`]) > 0,
          ) ||
          ["IMG", "SVG", "CANVAS", "VIDEO", "AUDIO", "IFRAME"].includes(
            node.tagName,
          );
        if (painted && !inside(node.getBoundingClientRect())) return false;
      }
      for (const child of node.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE && !inspect(child))
          return false;
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
          const range = document.createRange();
          range.selectNodeContents(child);
          if ([...range.getClientRects()].some((rect) => !inside(rect)))
            return false;
        }
      }
      return true;
    };
    return inspect(element);
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
  const text = (node, style, opacity, scale) => {
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
        fontSize: parseFloat(style.fontSize) * scale,
        bold: Number(style.fontWeight) >= 600 || style.fontWeight === "bold",
        italic: style.fontStyle === "italic",
        underline: style.textDecorationLine.includes("underline"),
        strike: style.textDecorationLine.includes("line-through"),
        charSpacing: (parseFloat(style.letterSpacing) || 0) * scale,
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
  const visit = (element, inheritedOpacity = 1, inheritedScale = 1) => {
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
    const pseudo = hasPseudo(element);
    const localScale = uniformScale(style),
      scale = inheritedScale * (localScale ?? 1);
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
      localScale === null ||
      style.filter !== "none" ||
      style.backdropFilter !== "none" ||
      style.clipPath !== "none" ||
      style.maskImage !== "none" ||
      style.mixBlendMode !== "normal" ||
      pseudo ||
      (clips &&
        hasRadius &&
        element.childNodes.length > 0 &&
        !foregroundInsideRoundedClip(element, style, box, radii, scale)) ||
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
    const fill = color(style.backgroundColor),
      stroke = color(style.borderTopColor);
    const borderWidth = parseFloat(style.borderTopWidth) * scale;
    const painted =
      !color(style.backgroundColor) ||
      style.backgroundImage !== "none" ||
      style.boxShadow !== "none" ||
      hasRadius ||
      new Set(borders).size > 1 ||
      (borderWidth && style.borderTopStyle !== "solid") ||
      (borderWidth && stroke?.transparency > 0 && stroke.transparency < 100);
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
        // CSS borders sit inside the border box; native strokes are centered.
        ...rect(box, stroke?.transparency === 0 ? borderWidth / 2 : 0),
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
          width: borderWidth,
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
      const fontSize = parseFloat(style.fontSize) * scale;
      objects.push({
        kind: "text",
        ...membership(element),
        text: ordered
          ? `${ordinal}.`
          : { disc: "•", circle: "◦", square: "▪" }[style.listStyleType],
        x: box.x - origin.x - fontSize * 1.2,
        y: box.y - origin.y,
        w: fontSize * 1.1,
        h: parseFloat(style.lineHeight) * scale || fontSize * 1.2,
        fontFace: style.fontFamily.split(",")[0].replace(/['"]/g, "").trim(),
        fontSize,
        color: color(style.color)?.color || "000000",
        transparency: (1 - opacity) * 100,
      });
    }
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text(child, style, opacity, scale);
      else if (child.nodeType === Node.ELEMENT_NODE)
        visit(child, opacity, scale);
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
