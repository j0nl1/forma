import { html } from "../../../core/src/lib/files.mjs";
import { decodePathData } from "./figma-geometry.mjs";
import {
  paintLayers,
  nodePaints,
  paintList,
  paintBlend,
} from "./figma-paints.mjs";
import { literalText } from "./figma-text-runs.mjs";
import { typography } from "./figma-text-style.mjs";
import { imagePaint } from "./figma-paint-images.mjs";
import { strokeAlignment } from "./figma-strokes.mjs";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
export const hasGlyphOutlines = (node) =>
  Array.isArray(node.derivedTextData?.glyphs) &&
  node.derivedTextData.glyphs.length > 0;

function glyphShapes(doc, node, warn) {
  const shapes = [];
  for (const glyph of node.derivedTextData.glyphs) {
    const bytes = doc.blobs?.[glyph?.commandsBlob]?.bytes;
    if (
      !bytes ||
      !(Array.isArray(bytes) || ArrayBuffer.isView(bytes)) ||
      !finite(glyph?.position?.x) ||
      !finite(glyph?.position?.y) ||
      !finite(glyph?.fontSize) ||
      glyph.fontSize <= 0 ||
      (glyph.rotation != null && !finite(glyph.rotation))
    ) {
      warn("unresolved or invalid glyph outline; visual review required");
      continue;
    }
    try {
      const d = decodePathData(bytes);
      if (!d) continue;
      const transform = `translate(${glyph.position.x} ${glyph.position.y}) scale(${glyph.fontSize} ${-glyph.fontSize})${glyph.rotation ? ` rotate(${(glyph.rotation * 180) / Math.PI})` : ""}`;
      shapes.push(
        `<path d="${html(d)}" transform="${html(transform)}" vector-effect="non-scaling-stroke"/>`,
      );
    } catch (error) {
      warn(`glyph outline: ${error.message}`);
    }
  }
  return shapes;
}

function glyphPaints(doc, paints, options) {
  const warn = (message) => options.warnings.push(`${options.id}: ${message}`);
  const visible = paintList(paints ?? [], warn, options.kind ?? "fill");
  const layers = [],
    defs = [];
  for (const [index, paint] of visible.entries()) {
    if (paint.type === "IMAGE") {
      const opacity = finite(paint.opacity)
        ? Math.max(0, Math.min(1, paint.opacity))
        : 1;
      const image = imagePaint(paint, {
        doc,
        w: options.w,
        h: options.h,
        opacity,
        warn,
      });
      if (paint.boundVariables && Object.keys(paint.boundVariables).length)
        warn("glyph image variable bindings need resolution and visual review");
      layers.push(
        image
          ? { image, blend: paintBlend(paint.blendMode, warn) }
          : { svg: "white", blend: "normal" },
      );
    } else {
      const resolved = paintLayers(doc, [paint], {
        ...options,
        id: `${options.id}-glyph-${index}`,
        vector: true,
      });
      layers.push(...resolved.layers);
      defs.push(resolved.defs);
    }
  }
  if (!visible.length && options.kind !== "stroke")
    layers.push({ svg: "black", blend: "normal" });
  return { layers, defs: defs.join("") };
}

export function nodeText(doc, node, paints, options) {
  const { id, w, h, color, warnings } = options;
  const warn = (message) => warnings.push(`${id}: ${message}`);
  const declarations = typography(node, warn);
  declarations.push("white-space:pre-wrap");
  if (!hasGlyphOutlines(node))
    return {
      declarations: [...declarations, `color:${paints.textColor}`],
      content: literalText(doc, node, options, warn),
      glyphs: false,
    };
  const shapes = glyphShapes(doc, node, warn);
  if (!shapes.length) {
    warn("saved glyph outlines unavailable; literal text fallback");
    const fallback = nodePaints(doc, node, { ...options, vector: false });
    return {
      declarations: [
        ...declarations,
        ...fallback.declarations,
        `color:${fallback.textColor}`,
      ],
      content: literalText(doc, node, options, warn),
      glyphs: false,
    };
  }
  const fills = glyphPaints(doc, node.fillPaints ?? [], {
    ...options,
    vector: true,
  });
  const strokes = glyphPaints(doc, node.strokePaints ?? [], {
    ...options,
    vector: true,
    kind: "stroke",
  });
  const key = `codex-figma-glyph-${id.replace(/[^\w-]/g, "-")}`;
  const width = Math.max(1, w),
    height = Math.max(1, h);
  const bounds = `x="${-width / 2}" y="${-height / 2}" width="${width * 2}" height="${height * 2}"`;
  const mask = (name, content) =>
    `<mask id="${key}-${name}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" ${bounds} style="mask-type:luminance">${content}</mask>`;
  const silhouettes = shapes.join("");
  const defs = [mask("fill", `<g fill="white">${silhouettes}</g>`)];
  const paint = (layers, name) =>
    layers
      .map((layer) =>
        layer.image
          ? `<foreignObject x="0" y="0" width="${width}" height="${height}" mask="url(#${key}-${name})" style="mix-blend-mode:${layer.blend}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;background-image:${html(layer.image)}"></div></foreignObject>`
          : `<rect ${bounds} fill="${html(layer.svg)}" mask="url(#${key}-${name})" style="mix-blend-mode:${layer.blend}"/>`,
      )
      .join("");
  let stroke = "";
  if (strokes.layers.length) {
    const weight =
      finite(node.strokeWeight) && node.strokeWeight > 0
        ? node.strokeWeight
        : 0;
    if (!weight) warn("glyph stroke weight missing or invalid; stroke omitted");
    else {
      const align = strokeAlignment(node, "OUTSIDE", warn);
      const outline = `<g fill="none" stroke="white" stroke-width="${weight * (align === "CENTER" ? 1 : 2)}">${silhouettes}</g>`;
      defs.push(
        mask(
          "stroke",
          align === "OUTSIDE"
            ? outline + `<g fill="black">${silhouettes}</g>`
            : align === "INSIDE"
              ? `<g mask="url(#${key}-fill)">${outline}</g>`
              : outline,
        ),
      );
      stroke = paint(strokes.layers, "stroke");
      if (node.dashPattern?.length)
        warn("glyph dash pattern needs saved dash semantics and visual review");
    }
  }
  let backdrop = "";
  const blurs = (Array.isArray(node.effects) ? node.effects : []).filter(
    (effect) =>
      effect?.visible !== false &&
      effect?.type === "BACKGROUND_BLUR" &&
      (!effect.blurType || effect.blurType === "NORMAL"),
  );
  if (blurs.length) {
    const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="white">${silhouettes}</g></svg>`;
    const uri = `data:image/svg+xml;base64,${Buffer.from(maskSvg).toString("base64")}`;
    const filter = blurs
      .map(
        (effect) =>
          `blur(${finite(effect.radius) ? Math.max(0, effect.radius) : 0}px)`,
      )
      .join(" ");
    declarations.push("backdrop-filter:none");
    backdrop = `<div aria-hidden="true" style="position:absolute;inset:0;backdrop-filter:${filter};mask-image:url('${uri}');-webkit-mask-image:url('${uri}');mask-size:100% 100%;-webkit-mask-size:100% 100%;mask-repeat:no-repeat"></div>`;
  }
  if (node.textDecoration && node.textDecoration !== "NONE")
    warn(
      "saved glyph text decoration needs resolved decoration geometry and visual review",
    );
  if (node.textData?.styleOverrideTable?.length)
    warn(
      "saved glyph character paint overrides need per-glyph style resolution and visual review",
    );
  const content = `${backdrop}<svg role="img" aria-label="${html(String(node.textData?.characters ?? node.characters ?? node.name ?? ""))}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="position:absolute;left:0;top:0;overflow:${node.textTruncation === "ENDING" && node.maxLines > 0 ? "hidden" : "visible"};isolation:isolate">${fills.defs}${strokes.defs}<defs>${defs.join("")}</defs>${paint(fills.layers, "fill")}${stroke}</svg><span style="position:absolute;inset:0;opacity:0;pointer-events:none" aria-hidden="true">${html(String(node.textData?.characters ?? node.characters ?? node.name ?? ""))}</span>`;
  return { declarations, content, glyphs: true };
}
