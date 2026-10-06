import { html } from "../../../core/src/lib/files.mjs";
import { typography } from "./figma-text-style.mjs";
import { nodePaints } from "./figma-paints.mjs";

export function literalText(doc, node, options, warn) {
  const characters = String(
    node.textData?.characters ?? node.characters ?? node.name ?? "",
  );
  let ids = node.textData?.characterStyleIDs,
    table = node.textData?.styleOverrideTable;
  const metadata = node.textData?.lines;
  if (ids != null && (!Array.isArray(ids) || ids.length !== characters.length))
    warn(
      "text character style mapping incomplete; missing entries use the base style",
    );
  if (table != null && !Array.isArray(table))
    warn("text style override table must be an array");
  if (metadata != null && !Array.isArray(metadata))
    warn("text line metadata must be an array");
  ids = Array.isArray(ids) ? ids : [];
  table = Array.isArray(table) ? table : [];
  const lines = Array.isArray(metadata) ? metadata : [];
  if (!ids.length && !table.length && !lines.length) return html(characters);
  const byId = new Map();
  for (const style of table) {
    if (!style || !Number.isInteger(style.styleID)) {
      warn("invalid text style override");
      continue;
    }
    byId.set(style.styleID, style);
  }
  const styles = new Map();
  function run(text, styleId) {
    const style = byId.get(styleId);
    if (!style) {
      if (styleId !== 0) warn(`unresolved character style ${String(styleId)}`);
      return html(text);
    }
    if (!styles.has(styleId)) {
      const declarations = typography(style, warn, false);
      if (style.fillPaints != null) {
        const paint = nodePaints(
          doc,
          { ...style, type: "TEXT" },
          { ...options, vector: false },
        );
        declarations.push(...paint.declarations, `color:${paint.textColor}`);
      }
      styles.set(styleId, declarations.join(";"));
    }
    return `<span style="${html(styles.get(styleId))}">${html(text)}</span>`;
  }
  let offset = 0,
    ordered = 0;
  return characters
    .split("\n")
    .map((text, index) => {
      const line = lines[index];
      const list =
        line?.lineType === "ORDERED_LIST" ||
        line?.lineType === "UNORDERED_LIST";
      ordered = line?.lineType === "ORDERED_LIST" ? ordered + 1 : 0;
      let prefix = "";
      if (list) {
        const level = line.indentationLevel ?? 1;
        const valid = Number.isInteger(level) && level >= 0 && level <= 256;
        if (!valid)
          warn("invalid list indentation level; base indentation retained");
        const padding = "\u00a0\u00a0".repeat(
          Math.max(0, (valid ? level : 1) - 1),
        );
        prefix = `${padding}${line.lineType === "ORDERED_LIST" ? ordered + "." : "\u2022"}\u00a0`;
      }
      let result = html(prefix);
      for (let start = 0; start < text.length;) {
        const style = ids[offset + start] ?? 0;
        let end = start + 1;
        while (end < text.length && (ids[offset + end] ?? 0) === style) end++;
        result += run(text.slice(start, end), style);
        start = end;
      }
      offset += text.length + 1;
      return result;
    })
    .join("\n");
}
