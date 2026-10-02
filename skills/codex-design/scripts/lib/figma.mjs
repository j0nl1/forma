import fs from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { unzipSync } from "fflate";
import { Decompress } from "fzstd";
import { ByteBuffer, decodeBinarySchema } from "kiwi-schema";
import { html } from "./files.mjs";
import { nodeEffects } from "./figma-effects.mjs";
import { nodePaints, visiblePaints, paintList } from "./figma-paints.mjs";
import { boxStroke } from "./figma-strokes.mjs";
import { nodeGeometry } from "./figma-geometry.mjs";
import { renderMaskedChildren } from "./figma-masks.mjs";
import { hasGlyphOutlines, nodeText } from "./figma-text.mjs";
import { resolveInstance } from "./figma-instances.mjs";
const LIMIT = 128 * 1024 * 1024;
export const nodeId = (guid) =>
  guid ? `${guid.sessionID}:${guid.localID}` : null;
// Interpret the file's Kiwi schema as data; never compile it into JavaScript.
export function decodeMessage(schema, bytes) {
  const defs = new Map(schema.definitions.map((d) => [d.name, d]));
  const buffer = new ByteBuffer(bytes);
  let budget = 2000000;
  const primitives = {
    bool: () => !!buffer.readByte(),
    byte: () => buffer.readByte(),
    int: () => buffer.readVarInt(),
    uint: () => buffer.readVarUint(),
    float: () => buffer.readVarFloat(),
    string: () => buffer.readString(),
    int64: () => String(buffer.readVarInt64()),
    uint64: () => String(buffer.readVarUint64()),
  };
  function read(type, depth) {
    if (--budget < 0 || depth > 128)
      throw new Error("Figma decoding complexity limit exceeded");
    if (primitives[type]) return primitives[type]();
    const def = defs.get(type);
    if (!def) throw new Error(`Unknown Kiwi type: ${type}`);
    if (def.kind === "ENUM") {
      const value = buffer.readVarUint();
      return def.fields.find((f) => f.value === value)?.name ?? value;
    }
    const out = Object.create(null);
    function field(f) {
      let value;
      if (f.isArray) {
        const count = buffer.readVarUint();
        if (count > budget) throw new Error("Figma array limit exceeded");
        value = [];
        for (let i = 0; i < count; i++) value.push(read(f.type, depth + 1));
      } else value = read(f.type, depth + 1);
      if (!f.isDeprecated) out[f.name] = value;
    }
    if (def.kind === "STRUCT") {
      for (const f of def.fields) field(f);
    } else if (def.kind === "MESSAGE") {
      const byTag = new Map(def.fields.map((f) => [f.value, f]));
      while (true) {
        const tag = buffer.readVarUint();
        if (tag === 0) break;
        const f = byTag.get(tag);
        if (!f) throw new Error(`Unknown Kiwi field ${type}:${tag}`);
        field(f);
      }
    } else throw new Error(`Unsupported Kiwi definition: ${def.kind}`);
    return out;
  }
  return read("Message", 0);
}
function unpack(bytes) {
  if (
    bytes.length >= 4 &&
    Buffer.from(bytes.slice(0, 4)).toString("hex") === "28b52ffd"
  ) {
    const chunks = [];
    let total = 0;
    const decoder = new Decompress((chunk) => {
      total += chunk.length;
      if (total > LIMIT)
        throw new Error("Figma decompressed size limit exceeded");
      chunks.push(Buffer.from(chunk));
    });
    decoder.push(bytes, true);
    return Buffer.concat(chunks);
  }
  return inflateRawSync(bytes, { maxOutputLength: LIMIT });
}
export async function loadFig(file) {
  const stat = await fs.stat(file);
  if (stat.size > LIMIT) throw new Error("Figma file exceeds 128 MiB");
  let bytes = await fs.readFile(file);
  const images = {};
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let total = 0;
    const entries = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > LIMIT) throw new Error("Figma archive exceeds 128 MiB");
        return f.name === "canvas.fig" || f.name.startsWith("images/");
      },
    });
    if (!entries["canvas.fig"])
      throw new Error("Figma archive has no canvas.fig");
    bytes = Buffer.from(entries["canvas.fig"]);
    for (const [name, data] of Object.entries(entries))
      if (name.startsWith("images/")) images[name.slice(7)] = Buffer.from(data);
  }
  if (bytes.length < 20 || bytes.toString("utf8", 0, 8) !== "fig-kiwi")
    throw new Error("Expected a raw fig-kiwi or ZIP canvas.fig export");
  let offset = 12;
  const chunks = [];
  while (offset < bytes.length) {
    if (offset + 4 > bytes.length)
      throw new Error("Truncated Figma chunk header");
    const length = bytes.readUInt32LE(offset);
    offset += 4;
    if (length > bytes.length - offset)
      throw new Error("Truncated Figma chunk");
    chunks.push(bytes.subarray(offset, offset + length));
    offset += length;
  }
  if (chunks.length < 2)
    throw new Error("Figma schema and data chunks are required");
  const schema = decodeBinarySchema(unpack(chunks[0]));
  const message = decodeMessage(schema, unpack(chunks[1]));
  const nodes = new Map();
  for (const n of message.nodeChanges ?? []) {
    const id = nodeId(n.guid);
    if (id) {
      if (nodes.has(id)) nodes.set(id, { ...nodes.get(id), ...n });
      else nodes.set(id, { ...n });
    }
  }
  if (!nodes.has("0:0")) throw new Error("Figma document root 0:0 is missing");
  for (const n of nodes.values()) n.children = [];
  for (const n of nodes.values()) {
    const parent = nodes.get(nodeId(n.parentIndex?.guid));
    if (parent && n !== parent) parent.children.push(n);
  }
  for (const n of nodes.values())
    n.children.sort((a, b) =>
      String(a.parentIndex?.position ?? "").localeCompare(
        String(b.parentIndex?.position ?? ""),
        "en",
      ),
    );
  // Reject cycles even when disconnected from the document root.
  const visited = new Set(),
    active = new Set();
  function visit(n, depth = 0) {
    if (active.has(n)) throw new Error("Figma node cycle");
    if (depth > 128) throw new Error("Figma tree depth exceeded");
    if (visited.has(n)) return;
    active.add(n);
    for (const c of n.children) visit(c, depth + 1);
    active.delete(n);
    visited.add(n);
  }
  for (const n of nodes.values()) visit(n);
  return {
    version: bytes.readUInt32LE(8),
    root: nodes.get("0:0"),
    nodes,
    images,
    blobs: message.blobs ?? [],
  };
}
export function select(doc, spec) {
  if (doc.nodes.has(spec)) return doc.nodes.get(spec);
  const found = [...doc.nodes.values()].filter((n) => n.name === spec);
  if (found.length !== 1)
    throw new Error(
      found.length
        ? `Ambiguous node name; use an id: ${spec}`
        : `Node not found: ${spec}`,
    );
  return found[0];
}
export function outline(doc) {
  return [...doc.nodes.values()]
    .filter((n) => ["CANVAS", "FRAME", "SYMBOL", "INSTANCE"].includes(n.type))
    .map((n) => ({
      id: nodeId(n.guid),
      name: n.name ?? "",
      type: n.type,
      parent: nodeId(n.parentIndex?.guid),
      children: n.children.map((c) => nodeId(c.guid)),
    }));
}
const finite = (v, fallback = 0) =>
  Number.isFinite(Number(v)) ? Number(v) : fallback;
export function color(c, opacity = 1) {
  return `rgba(${["r", "g", "b"].map((k) => Math.round(Math.min(1, Math.max(0, finite(c?.[k]))) * 255)).join(",")},${Math.min(1, Math.max(0, finite(c?.a, 1) * opacity))})`;
}
export function renderNode(
  doc,
  node,
  {
    root = true,
    warnings = [],
    scope = "",
    componentGeometry = false,
    onNode,
    parent = null,
    parentKey = null,
  } = {},
) {
  if (
    componentGeometry &&
    node.type === "TEXT" &&
    node.derivedTextData?.glyphs?.length &&
    !/font ?awesome|material (icons|symbols)|icomoon|glyphicons?|ionicons/i.test(
      node.fontName?.family ?? "",
    )
  )
    node = {
      ...node,
      derivedTextData: { ...node.derivedTextData, glyphs: [] },
    };
  if (node.visible === false) return "";
  if (
    node.type === "INSTANCE" &&
    (componentGeometry || !node.children?.length)
  ) {
    const expanded = resolveInstance(doc, node, { warnings });
    if (expanded)
      return renderNode(doc, expanded, {
        root,
        warnings,
        scope,
        componentGeometry,
        onNode,
        parent,
        parentKey,
      });
  }
  if (node.instanceSymbol) scope += "instance-" + nodeId(node.guid) + "-";
  const id = nodeId(node.guid);
  const paintId = scope ? scope + id : id;
  onNode?.(node, { parent, parentKey, key: paintId });
  const css = [];
  const w = finite(node.size?.x, 320),
    h = finite(node.size?.y, 200);
  const t = node.transform;
  css.push(
    `position:${root ? "relative" : "absolute"}`,
    `width:${w}px`,
    `height:${h}px`,
    `box-sizing:border-box`,
  );
  if (t && !root) {
    css.push(`left:${finite(t.m02)}px`, `top:${finite(t.m12)}px`);
    if (
      t.m00 !== 1 ||
      t.m11 !== 1 ||
      finite(t.m01) !== 0 ||
      finite(t.m10) !== 0
    )
      css.push(
        `transform:matrix(${finite(t.m00, 1)},${finite(t.m10)},${finite(t.m01)},${finite(t.m11, 1)},0,0)`,
        `transform-origin:0 0`,
      );
  }
  if (node.opacity != null)
    css.push(`opacity:${Math.min(1, Math.max(0, finite(node.opacity, 1)))}`);
  if (node.cornerRadius)
    css.push(`border-radius:${finite(node.cornerRadius)}px`);
  if (node.type === "ELLIPSE") css.push("border-radius:50%");
  if (node.clipsContent) css.push("overflow:hidden");
  const vector =
    node.type !== "TEXT" &&
    (!!node.fillGeometry?.length ||
      !!node.strokeGeometry?.length ||
      [
        "VECTOR",
        "LINE",
        "STAR",
        "REGULAR_POLYGON",
        "BOOLEAN_OPERATION",
      ].includes(node.type));
  const glyphs = node.type === "TEXT" && hasGlyphOutlines(node);
  const paints = nodePaints(
    doc,
    glyphs ? { ...node, fillPaints: [], backgroundPaints: [] } : node,
    {
      id: paintId,
      w,
      h,
      color,
      vector: vector || glyphs,
      warnings,
    },
  );
  css.push(...paints.declarations);
  for (const key of ["derivedSymbolData", "symbolData"])
    if (
      node[key] &&
      (typeof node[key] !== "object" || Object.keys(node[key]).length)
    )
      warnings.push(`${id}: ${key} needs visual review`);
  const stroke = boxStroke(node, {
    id: paintId,
    color,
    vector: vector || glyphs,
    warnings,
  });
  css.push(...stroke.declarations);
  const effects = nodeEffects(node, {
    id: paintId,
    color,
    alpha: node.type === "TEXT" || vector,
    warnings,
    borderShadows: stroke.shadows,
  });
  css.push(...effects.declarations);
  let content = "";
  if (node.type === "TEXT") {
    const text = nodeText(doc, node, paints, {
      id: paintId,
      w,
      h,
      color,
      warnings,
    });
    css.push(...text.declarations);
    content = text.content;
  } else if (vector) {
    content = nodeGeometry(doc, node, paints, {
      id: paintId,
      w,
      h,
      color,
      vector,
      componentGeometry,
      warnings,
    });
  }
  if (node.stackMode && !componentGeometry) {
    warnings.push(`${id}: auto-layout rendered from saved geometry`);
  }
  content = effects.defs + content;
  content += renderMaskedChildren(doc, node, {
    warnings,
    scope,
    renderChild: (child) =>
      renderNode(doc, child, {
        root: false,
        warnings,
        scope,
        componentGeometry,
        onNode,
        parent: node,
        parentKey: paintId,
      }),
  });
  return `<div data-figma-id="${html(id)}"${componentGeometry ? ` data-figma-render-key="${html(paintId)}"` : ""} aria-label="${html(node.name)}" style="${html(css.join(";"))}">${content}</div>`;
}
export function renderDocument(doc, node) {
  const warnings = [];
  const content = renderNode(doc, node, { warnings });
  return {
    html: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(node.name ?? "Figma reference")}</title><style>body{margin:24px;background:#edf0f4;font-family:system-ui}*{box-sizing:border-box}</style>${content}</html>`,
    warnings: [...new Set(warnings)],
  };
}
export function extractedTokens(doc) {
  const tokens = {};
  let count = 0;
  for (const n of doc.nodes.values())
    for (const f of [
      ...visiblePaints(n),
      ...paintList(n.strokePaints ?? [], () => {}, "stroke"),
    ]) {
      const stops = f.stops ?? f.gradientStops;
      const colors =
        f.type === "SOLID"
          ? [f.color]
          : String(f.type).startsWith("GRADIENT_")
            ? (Array.isArray(stops) ? stops : []).map((s) => s?.color)
            : [];
      for (const c of colors) {
        if (!c || typeof c !== "object") continue;
        const value = color(c, finite(f.opacity, 1));
        if (!Object.values(tokens).includes(value))
          tokens[`--figma-color-${++count}`] = value;
      }
    }
  return tokens;
}
