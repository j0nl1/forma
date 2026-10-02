import { blockedTextTags, leafTextTags, textKey } from "./text-editor-model.js";
const blocked = [...blockedTextTags, "text-editor"].join(",");
export function selectorFor(element) {
  const parts = [];
  for (
    let node = element;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const tag = node.localName;
    const peers = [...node.parentElement.children].filter(
      (peer) => peer.localName === tag,
    );
    parts.unshift(`${tag}:nth-of-type(${peers.indexOf(node) + 1})`);
  }
  return ["body", ...parts].join(">");
}
export function textAtGap(element, gap) {
  let current = 0;
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (current === gap) return node;
    } else current++;
  }
  return null;
}
export function setRun(element, gap, text) {
  const current = textAtGap(element, gap);
  if (current) {
    current.data = text;
    return current;
  }
  let index = 0,
    before = null;
  for (const child of element.childNodes)
    if (child.nodeType !== Node.TEXT_NODE) {
      if (index === gap) {
        before = child;
        break;
      }
      index++;
    }
  const node = document.createTextNode(text);
  element.insertBefore(node, before);
  return node;
}
export function sessionEntries() {
  const entries = [];
  for (const element of [
    document.body,
    ...document.body.querySelectorAll("*"),
  ]) {
    if (element.closest(blocked)) continue;
    let gap = 0,
      found = false;
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.data.trim()) {
          found = true;
          entries.push({
            selector: selectorFor(element),
            gap,
            key: textKey(selectorFor(element), gap),
            text: node.data,
            tag: element.localName,
          });
        }
      } else gap++;
    }
    if (
      !found &&
      !element.childNodes.length &&
      leafTextTags.has(element.localName)
    )
      entries.push({
        selector: selectorFor(element),
        gap: 0,
        key: textKey(selectorFor(element), 0),
        text: "",
        tag: element.localName,
      });
  }
  return entries;
}
export function resolveRun(entry) {
  let elements;
  try {
    elements = document.querySelectorAll(entry.selector);
  } catch {
    return null;
  }
  if (elements.length !== 1) return null;
  const element = elements[0];
  if (element.closest(blocked)) return null;
  const node = textAtGap(element, entry.gap);
  return { entry, element, node };
}
export function pointedText(event) {
  const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
  if (caret?.offsetNode?.nodeType === Node.TEXT_NODE) return caret.offsetNode;
  const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
  return range?.startContainer?.nodeType === Node.TEXT_NODE
    ? range.startContainer
    : null;
}
