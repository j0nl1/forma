import { parse } from "parse5";
import { createHash } from "node:crypto";
import {
  blockedTextTags,
  leafTextTags,
  textKey,
  escapedText,
  validateTextEdits,
} from "../../assets/starters/text-editor-model.js";
export const textVersion = (source) =>
  createHash("sha256").update(source).digest("hex");
export function inspectText(source) {
  const document = parse(source, { sourceCodeLocationInfo: true }),
    entries = [];
  function visit(parent, selector) {
    if (parent.tagName && blockedTextTags.has(parent.tagName)) return;
    const children = parent.childNodes || [],
      location = parent.sourceCodeLocation;
    const leaf = leafTextTags.has(parent.tagName),
      actualText = children.some(
        (node) => node.nodeName === "#text" && node.value.trim(),
      );
    const canInsert =
      location?.startTag &&
      (leaf || actualText || !children.some((node) => node.tagName));
    let gap = 0,
      offset = location?.startTag?.endOffset,
      hadText = false;
    const push = (text, start, end) => {
      if (!selector || !Number.isInteger(start) || !Number.isInteger(end))
        return;
      entries.push({
        key: textKey(selector, gap),
        marker: createHash("sha256")
          .update(selector)
          .digest("hex")
          .slice(0, 24),
        elementEnd: location?.startTag?.endOffset,
        selector,
        gap,
        text,
        tag: parent.tagName,
        start,
        end,
      });
    };
    for (const node of children) {
      if (node.nodeName === "#text") {
        hadText = true;
        if (selector && (node.value.trim() || leaf || actualText))
          push(
            node.value,
            node.sourceCodeLocation?.startOffset,
            node.sourceCodeLocation?.endOffset,
          );
      } else {
        if (canInsert && !hadText && leaf) push("", offset, offset);
        gap++;
        hadText = false;
        offset = node.sourceCodeLocation?.endOffset;
      }
    }
    if (canInsert && !hadText && (leaf || actualText || !children.length))
      push("", offset, offset);
    const counters = new Map();
    for (const child of children) {
      if (!child.tagName) continue;
      const count = (counters.get(child.tagName) || 0) + 1;
      counters.set(child.tagName, count);
      const next =
        child.tagName === "body"
          ? "body"
          : selector
            ? `${selector}>${child.tagName}:nth-of-type(${count})`
            : null;
      visit(child, next);
    }
  }
  visit(document, null);
  return { version: textVersion(source), entries };
}
export function applyTextEdits(source, input) {
  const edits = validateTextEdits(input),
    bindings = inspectText(source),
    index = new Map(bindings.entries.map((entry) => [entry.key, entry]));
  const changes = edits
    .map((edit) => {
      const target = index.get(edit.key);
      if (!target)
        throw new Error("This text run is not present in the literal source.");
      return { ...target, value: escapedText(edit.text) };
    })
    .sort((a, b) => b.start - a.start);
  for (let i = 1; i < changes.length; i++)
    if (
      changes[i].end > changes[i - 1].start ||
      changes[i].start === changes[i - 1].start
    )
      throw new Error("Text source ranges overlap.");
  for (const change of changes)
    source =
      source.slice(0, change.start) + change.value + source.slice(change.end);
  return source;
}
