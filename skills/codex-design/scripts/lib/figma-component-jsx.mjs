import { parseFragment } from "parse5";
import postcss from "postcss";
import { renderNode, nodeId } from "./figma.mjs";
import { applyNodeLayout, layoutChildrenStretched } from "./figma-layout.mjs";
import { instanceJsx } from "./figma-component-instances.mjs";

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
export function componentBody(doc, root, model, warnings, context = {}) {
  const clones = new Map(),
    parents = new Map(),
    stretches = new Map(),
    rendered = new Map();
  function clone(node, parent = null, parentStretched = false) {
    const stretched = layoutChildrenStretched(node, parent, {
      isRoot: parent === null,
      parentStretched,
    });
    const copy = {
      ...node,
      children: node.children.map((child) => clone(child, node, stretched)),
    };
    parents.set(nodeId(node.guid), parent);
    stretches.set(nodeId(node.guid), parentStretched);
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
  const markup = renderNode(doc, clone(root), {
    warnings,
    componentGeometry: true,
    onNode: (node, { parent, parentKey, key }) => {
      const parentStretched = stretches.get(parentKey) ?? false;
      rendered.set(key, { node, parent, parentStretched });
      stretches.set(
        key,
        layoutChildrenStretched(node, parent, {
          isRoot: parent === null,
          parentStretched,
        }),
      );
    },
  });
  const fragment = parseFragment(markup),
    ids = [];
  const visit = (node) => {
    for (const attr of node.attrs ?? [])
      if (attr.name === "id") ids.push(attr.value);
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(fragment);
  function emit(element, isRoot = false, disabled = false) {
    if (element.nodeName === "#text") return `{${quote(element.value)}}`;
    if (!element.tagName) return "";
    const id = element.attrs.find(
      (attr) => attr.name === "data-figma-id",
    )?.value;
    const renderKey = element.attrs.find(
      (attr) => attr.name === "data-figma-render-key",
    )?.value;
    const snapshot = rendered.get(renderKey);
    const source = clones.get(id) ?? snapshot?.node ?? doc.nodes.get(id),
      refs = (source?.componentPropRefs ?? []).filter((ref) => !ref.isDeleted);
    const binding = (field) =>
      refs
        .filter((ref) => ref.componentPropNodeField === field)
        .map((ref) => model.byId.get(nodeId(ref.defID)))
        .find(Boolean);
    const visible = disabled ? null : binding("VISIBLE"),
      text = disabled ? null : binding("TEXT_DATA"),
      slot =
        source?.type === "INSTANCE" ? binding("OVERRIDDEN_SYMBOL_ID") : null;
    const attrs = [];
    let style = {};
    for (const attr of element.attrs) {
      if (attr.name === "data-figma-render-key") continue;
      if (attr.name === "style") {
        const declarations = postcss
          .parse(`a{${attr.value}}`)
          .first.nodes.filter((node) => node.type === "decl");
        style = Object.fromEntries(
          declarations.map((decl) => [camel(decl.prop), decl.value]),
        );
        if (source)
          applyNodeLayout(style, snapshot?.node ?? source, {
            parent: snapshot?.parent ?? parents.get(id),
            isRoot,
            warnings,
            parentStretched: snapshot?.parentStretched ?? stretches.get(id),
          });
        const entries = Object.entries(style).map(
          ([key, value]) => `${quote(key)}:${scoped(value, ids)}`,
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
    if (source?.type === "INSTANCE" && context.registry && !disabled) {
      const instance = instanceJsx(
        doc,
        source,
        style,
        context.registry,
        context.deps,
        warnings,
        { slot, isRoot, current: context.entry },
      );
      if (instance)
        return visible?.kind === "BOOL"
          ? `{props.${visible.key} && (${instance})}`
          : instance;
      disabled = true;
    }
    if (isRoot) attrs.push("className={props.className}");
    let content = (element.childNodes ?? [])
      .map((child) => emit(child, false, disabled))
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
