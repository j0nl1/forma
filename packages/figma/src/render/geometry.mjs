import { html } from "../../../core/src/lib/files.mjs";
import { paintLayers } from "./paints.mjs";
import { strokeAlignment } from "./strokes.mjs";
import { vectorNetworkPaths } from "./vector-network.mjs";
export function decodePathData(bytes) {
  const view = new DataView(Uint8Array.from(bytes).buffer);
  let offset = 0;
  const out = [],
    counts = [0, 2, 2, 4, 6];
  while (offset < view.byteLength) {
    const code = view.getUint8(offset++);
    if (code > 4) throw new Error("Unsupported vector command");
    const count = counts[code];
    if (offset + count * 4 > view.byteLength)
      throw new Error("Truncated vector path");
    const values = [];
    for (let i = 0; i < count; i++) {
      const value = view.getFloat32(offset, true);
      if (!Number.isFinite(value))
        throw new Error("Non-finite vector coordinate");
      values.push(value);
      offset += 4;
    }
    out.push(["Z", "M", "L", "Q", "C"][code] + " " + values.join(" "));
  }
  return out.join(" ");
}
export function geometryPaths(doc, node, kind, warn) {
  const geometry = node[`${kind}Geometry`] ?? [];
  if (!Array.isArray(geometry)) {
    warn(`${kind} geometry must be an array`);
    return [];
  }
  const paths = [];
  for (const item of geometry) {
    const bytes = doc.blobs[item?.commandsBlob]?.bytes;
    if (!bytes || !(Array.isArray(bytes) || ArrayBuffer.isView(bytes))) {
      warn(`${kind} geometry missing command blob`);
      continue;
    }
    try {
      const d = decodePathData(bytes);
      if (d)
        paths.push(
          `<path d="${html(d)}" fill-rule="${["ODD", "EVENODD"].includes(item.windingRule) ? "evenodd" : "nonzero"}"/>`,
        );
    } catch (error) {
      warn(`${kind} geometry: ${error.message}`);
    }
  }
  return paths;
}
const paintedPaths = (paths, layers, extra = "") =>
  paths
    .map((path) =>
      layers
        .map(
          (layer) =>
            `<g fill="${html(layer.svg)}" style="mix-blend-mode:${layer.blend}"${extra}>${path}</g>`,
        )
        .join(""),
    )
    .join("");
export function nodeGeometry(doc, node, fills, options) {
  const { id, w, h, warnings } = options;
  const warn = (message) => warnings.push(`${id}: ${message}`);
  const fillPaths = geometryPaths(doc, node, "fill", warn),
    strokePaths = geometryPaths(doc, node, "stroke", warn);
  const strokes = paintLayers(doc, node.strokePaints ?? [], {
    ...options,
    vector: true,
    kind: "stroke",
  });
  if (options.componentGeometry && !fillPaths.length && !strokePaths.length)
    fillPaths.push(
      ...vectorNetworkPaths(doc, node, warn).map(
        ({ d, rule }) => `<path d="${html(d)}" fill-rule="${html(rule)}"/>`,
      ),
    );
  if (strokes.layers.length && !strokePaths.length)
    warn("vector stroke geometry missing; visual review required");
  if (fills.layers.length && !fillPaths.length)
    warn("vector fill geometry missing; visual review required");
  const width = Math.max(1, w),
    height = Math.max(1, h);
  let mask = "",
    strokeAttrs = "";
  const align = strokeAlignment(node, "CENTER", warn);
  if (strokePaths.length && fillPaths.length && align !== "CENTER") {
    const key = "codex-figma-stroke-" + id.replace(/[^\w-]/g, "-");
    // Saved stroke blobs are filled outlines. Keep their coordinates and mask against the fill.
    const shape = `<g fill="${align === "INSIDE" ? "white" : "black"}">${fillPaths.join("")}</g>`;
    const bounds = `x="${-width / 2}" y="${-height / 2}" width="${width * 2}" height="${height * 2}"`;
    mask = `<defs><mask id="${key}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" ${bounds} style="mask-type:luminance">${align === "OUTSIDE" ? `<rect ${bounds} fill="white"/>` : ""}${shape}</mask></defs>`;
    strokeAttrs = ` mask="url(#${key})"`;
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="position:absolute;left:0;top:0;overflow:visible;isolation:isolate">${fills.defs}${strokes.defs}${mask}${paintedPaths(fillPaths, fills.layers)}${paintedPaths(strokePaths, strokes.layers, strokeAttrs)}</svg>`;
}
