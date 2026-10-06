import { html } from "../../../core/src/lib/files.mjs";
import { geometryPaths } from "./figma-geometry.mjs";

const identity = [1, 0, 0, 1, 0, 0];
const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const idOf = (node) =>
  `${node.guid?.sessionID ?? "unknown"}:${node.guid?.localID ?? "unknown"}`;
export const isMask = (node) => node.mask === true || node.isMask === true;
function product(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function matrix(node, warn) {
  const t = node.transform;
  if (!t) return identity;
  const values = [
    t.m00 ?? 1,
    t.m10 ?? 0,
    t.m01 ?? 0,
    t.m11 ?? 1,
    t.m02 ?? 0,
    t.m12 ?? 0,
  ];
  if (!values.every((value) => Number.isFinite(Number(value)))) {
    warn("mask transform contains non-finite coordinates; using identity");
    return identity;
  }
  return values.map(Number);
}
function transformed(shape, transform) {
  return shape.replace(
    /^<(path|rect|ellipse)\b/,
    `<$1 transform="matrix(${transform.join(" ")})"`,
  );
}
function shapes(doc, node, parent, warnings, depth = 0) {
  const warn = (message) => warnings.push(`${idOf(node)}: ${message}`);
  if (node.visible === false) return [];
  if (depth > 128) {
    warn("mask geometry nesting limit exceeded");
    return [];
  }
  const transform = product(parent, matrix(node, warn));
  if (node.type === "TEXT") {
    const glyphs = node.derivedTextData?.glyphs;
    if (!Array.isArray(glyphs) || !glyphs.length) {
      warn("text mask has no saved glyph geometry; visual review required");
      return [];
    }
    const output = [];
    for (const glyph of glyphs) {
      const values = [
        glyph.position?.x,
        glyph.position?.y,
        glyph.fontSize,
        glyph.rotation ?? 0,
      ];
      if (
        !values.every((value) => Number.isFinite(Number(value))) ||
        Number(glyph.fontSize) <= 0
      ) {
        warn("mask glyph has invalid saved geometry placement");
        continue;
      }
      const [x, y, size, angle] = values.map(Number);
      const c = Math.cos(angle),
        s = Math.sin(angle);
      const glyphMatrix = product(transform, [
        size * c,
        -size * s,
        -size * s,
        -size * c,
        x,
        y,
      ]);
      const paths = geometryPaths(
        doc,
        {
          fillGeometry: [
            {
              commandsBlob: glyph.commandsBlob,
              windingRule: glyph.windingRule,
            },
          ],
        },
        "fill",
        warn,
      );
      output.push(
        ...paths.map((path) =>
          transformed(path.replace(/fill-rule=/, "clip-rule="), glyphMatrix),
        ),
      );
    }
    return output;
  }
  const paths = geometryPaths(doc, node, "fill", warn);
  if (paths.length)
    return paths.map((path) =>
      transformed(path.replace(/fill-rule=/, "clip-rule="), transform),
    );
  const children = Array.isArray(node.children) ? node.children : [];
  if (children.length) {
    const contours = children.flatMap((child) =>
      shapes(doc, child, transform, warnings, depth + 1),
    );
    if (contours.length) return contours;
  }
  if (
    ["VECTOR", "LINE", "STAR", "REGULAR_POLYGON", "BOOLEAN_OPERATION"].includes(
      node.type,
    )
  ) {
    warn(
      "vector mask has no saved fill geometry; using source box contour fallback when size is positive",
    );
  }
  const w = finite(node.size?.x),
    h = finite(node.size?.y);
  if (w <= 0 || h <= 0) return [];
  if (node.type === "ELLIPSE")
    return [
      transformed(
        `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}"/>`,
        transform,
      ),
    ];
  const radius = Math.max(0, Math.min(finite(node.cornerRadius), w / 2, h / 2));
  return [
    transformed(`<rect width="${w}" height="${h}" rx="${radius}"/>`, transform),
  ];
}

// A visible mask starts a sibling run. Every mask ends that run, including hidden masks.
export function renderMaskedChildren(
  doc,
  parent,
  { warnings, renderChild, scope = "" },
) {
  const children = Array.isArray(parent.children) ? parent.children : [];
  const output = [];
  let index = 0;
  while (index < children.length) {
    const child = children[index++];
    if (!isMask(child) || child.visible === false) {
      output.push(renderChild(child));
      continue;
    }
    const content = [];
    while (index < children.length && !isMask(children[index]))
      content.push(renderChild(children[index++]));
    const mode = child.maskType ?? child.maskMode;
    if (mode != null && !["VECTOR", "OUTLINE"].includes(mode))
      warnings.push(
        `${idOf(child)}: ${mode} mask mode uses saved contour fallback; alpha/luminance compositing needs visual review`,
      );
    const geometry = shapes(doc, child, identity, warnings);
    if (!geometry.length) {
      warnings.push(
        `${idOf(child)}: mask has no usable geometry; rendering siblings unmasked`,
      );
      output.push(content.join(""));
      continue;
    }
    const key =
      "codex-figma-mask-" +
      `${scope}${idOf(parent)}-${idOf(child)}`.replace(/[^\w-]/g, "-");
    output.push(
      `<svg width="0" height="0" style="position:absolute;pointer-events:none" aria-hidden="true"><defs><clipPath id="${html(key)}" clipPathUnits="userSpaceOnUse">${geometry.join("")}</clipPath></defs></svg><div data-figma-mask-group="${html(idOf(child))}" style="position:absolute;inset:0;clip-path:url(#${html(key)})">${content.join("")}</div>`,
    );
  }
  return output.join("");
}
