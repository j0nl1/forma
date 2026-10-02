import { parseFragment } from "parse5";
import postcss from "postcss";
import { renderNode, nodeId } from "./figma.mjs";

const camel = (value) =>
  value.startsWith("--")
    ? value
    : value
        .replace(/^-ms-/, "ms-")
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const quote = (value) => JSON.stringify(value);
function scoped(value, ids) {
  const pieces = [];
  let remaining = String(value);
  const pattern = new RegExp(
    ids.length
      ? ids
          .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .sort((a, b) => b.length - a.length)
          .join("|")
      : "(?!)",
    "g",
  );
  let start = 0;
  for (const match of remaining.matchAll(pattern)) {
    pieces.push(
      quote(remaining.slice(start, match.index)),
      "scope",
      quote(match[0]),
    );
    start = match.index + match[0].length;
  }
  pieces.push(quote(remaining.slice(start)));
  return pieces.filter((piece) => piece !== '""').join(" + ") || '""';
}
export function componentBody(doc, root, model, warnings) {
  const clones = new Map();
  function clone(node) {
    const copy = { ...node, children: node.children.map(clone) };
    clones.set(nodeId(copy.guid), copy);
    const refs = (node.componentPropRefs ?? []).filter((ref) => !ref.isDeleted);
    if (
      refs.some(
        (ref) =>
          ref.componentPropNodeField === "VISIBLE" &&
          model.byId.get(nodeId(ref.defID))?.kind === "BOOL",
      )
    )
      copy.visible = true;
    if (
      refs.some(
        (ref) =>
          ref.componentPropNodeField === "TEXT_DATA" &&
          model.byId.get(nodeId(ref.defID))?.kind === "TEXT",
      ) &&
      copy.derivedTextData
    )
      copy.derivedTextData = { ...copy.derivedTextData, glyphs: [] };
    return copy;
  }
  const markup = renderNode(doc, clone(root), { warnings });
  const fragment = parseFragment(markup),
    ids = [];
  const visit = (node) => {
    for (const attr of node.attrs ?? [])
      if (attr.name === "id") ids.push(attr.value);
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(fragment);
  function emit(element, isRoot = false) {
    if (element.nodeName === "#text") return `{${quote(element.value)}}`;
    if (!element.tagName) return "";
    const id = element.attrs.find(
      (attr) => attr.name === "data-figma-id",
    )?.value;
    const source = clones.get(id),
      refs = (source?.componentPropRefs ?? []).filter((ref) => !ref.isDeleted);
    const binding = (field) =>
      refs
        .filter((ref) => ref.componentPropNodeField === field)
        .map((ref) => model.byId.get(nodeId(ref.defID)))
        .find(Boolean);
    const visible = binding("VISIBLE"),
      text = binding("TEXT_DATA"),
      slot =
        source?.type === "INSTANCE" ? binding("OVERRIDDEN_SYMBOL_ID") : null;
    const attrs = [];
    for (const attr of element.attrs) {
      if (attr.name === "style") {
        const declarations = postcss
          .parse(`a{${attr.value}}`)
          .first.nodes.filter((node) => node.type === "decl");
        const entries = declarations.map(
          (decl) => `${quote(camel(decl.prop))}:${scoped(decl.value, ids)}`,
        );
        if (isRoot) entries.push("...props.style");
        attrs.push(`style={{${entries.join(",")}}}`);
      } else {
        const name =
          attr.name === "class"
            ? "className"
            : attr.name.startsWith("data-") || attr.name.startsWith("aria-")
              ? attr.name
              : attr.prefix === "xlink"
                ? "xlinkHref"
                : camel(attr.name);
        attrs.push(`${name}={${scoped(attr.value, ids)}}`);
      }
    }
    if (isRoot) attrs.push("className={props.className}");
    let content = (element.childNodes ?? [])
      .map((child) => emit(child))
      .join("");
    if (text?.kind === "TEXT") content = `{props.${text.key}}`;
    if (slot?.kind === "INSTANCE_SWAP")
      content = `{props.${slot.key} ?? <>${content}</>}`;
    const tag = `<${element.tagName} ${attrs.join(" ")}>${content}</${element.tagName}>`;
    return visible?.kind === "BOOL"
      ? `{props.${visible.key} && (${tag})}`
      : tag;
  }
  const element = fragment.childNodes.find((node) => node.tagName);
  if (!element) return "null";
  const body = emit(element, true);
  return body.startsWith("{") ? `<>${body}</>` : body;
}
