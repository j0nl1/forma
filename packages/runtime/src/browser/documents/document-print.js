import { printHygiene } from "./document-style.js";
export const webkitPrint = /apple/i.test(navigator.vendor || "");
const ids = {
  print: "codex-document-print",
  wrap: "codex-document-wrap",
  owns: "codex-document-owns-print",
  fixed: "codex-document-fixed-size",
  sizing: "codex-document-sizing",
};
function owned(id, tag) {
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement(tag);
    node.id = id;
    node.dataset.codexInjected = "";
    document.head.append(node);
  }
  return node;
}
function meta(key, name, content) {
  const authored = [...document.querySelectorAll(`meta[name="${name}"]`)].some(
    (node) => !node.hasAttribute("data-codex-injected"),
  );
  if (!content || authored) {
    document.getElementById(ids[key])?.remove();
    return;
  }
  const node = owned(ids[key], "meta");
  node.name = name;
  node.content = content;
}
export function syncHead() {
  const pages = [...document.querySelectorAll("doc-page")].filter(
    (page) => page.sheet && page.isConnected,
  );
  if (!pages.length) {
    for (const id of Object.values(ids)) document.getElementById(id)?.remove();
    return;
  }
  const fixed = pages.find((page) => page.printGeometry.fixed),
    owner = fixed || pages[0];
  const g = owner.printGeometry;
  const pinned =
    g.fixed || g.fit || owner.paginated || owner.printOverride?.paper;
  const size = pinned
    ? `size:${g.pageWidth} ${g.pageHeight};`
    : g.landscape
      ? "size:landscape;"
      : "";
  const margin =
    webkitPrint && !g.fixed && !g.fit && !owner.paginated
      ? `${g.margin} 0`
      : "0";
  const style = owned(ids.print, "style");
  const css = `@page{${size}margin:${margin}}${printHygiene}`;
  if (style.textContent !== css) style.textContent = css;
  // Last in the head gives the runtime's paper choice a deterministic cascade.
  if (document.head.lastElementChild !== style) document.head.append(style);
  const wrap = owned(ids.wrap, "style");
  const typography =
    ":where(doc-page h1,doc-page h2,doc-page h3,doc-page h4,doc-page h5,doc-page h6){text-wrap:balance}:where(doc-page p,doc-page li,doc-page blockquote,doc-page figcaption){text-wrap:pretty}";
  if (wrap.textContent !== typography) wrap.textContent = typography;
  meta("owns", "codex-owns-print", "true");
  meta(
    "fixed",
    "codex-fixed-size",
    fixed
      ? `${Math.round(fixed.printWidth)},${Math.round(fixed.printHeight)}`
      : null,
  );
  meta(
    "sizing",
    "codex-print-sizing",
    fixed ? "fixed" : g.landscape ? "default-landscape" : "default-portrait",
  );
}
