import { frameSelector } from "./social-model.js";
export function descendants(root) {
  const nodes = [],
    visited = new Set();
  const visit = (node) => {
    if (!node || visited.has(node)) return;
    visited.add(node);
    if (node instanceof Element) nodes.push(node);
    if (node instanceof HTMLSlotElement) {
      const assigned = node.assignedNodes({ flatten: true });
      if (assigned.length) {
        for (const child of assigned) visit(child);
        return;
      }
    }
    if (node.shadowRoot) visit(node.shadowRoot);
    for (const child of node.childNodes) visit(child);
  };
  if (root.shadowRoot) visit(root.shadowRoot);
  for (const child of root.childNodes) visit(child);
  return nodes;
}
export function parentOf(node) {
  return node.parentElement || node.getRootNode()?.host || null;
}
export function belongsTo(node, board) {
  for (let parent = parentOf(node); parent; parent = parentOf(parent)) {
    if (parent === board) return true;
    if (parent.localName === "social-frames") return false;
  }
  return false;
}
export function visibleFrame(node) {
  const style = getComputedStyle(node),
    box = node.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.position !== "fixed" &&
    box.width >= 2 &&
    box.height >= 2
  );
}
export function frameList(board) {
  return descendants(board).filter((node) => {
    if (
      !node.matches(frameSelector) ||
      !belongsTo(node, board) ||
      !visibleFrame(node)
    )
      return false;
    for (
      let parent = parentOf(node);
      parent && parent !== board;
      parent = parentOf(parent)
    )
      if (parent.matches(frameSelector)) return false;
    return true;
  });
}
export function cssImage(node, source) {
  node.style.backgroundImage = source ? `url(${JSON.stringify(source)})` : "";
}
