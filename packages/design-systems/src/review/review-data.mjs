import fs from "node:fs/promises";
import path from "node:path";
import { parse, parseFragment, serialize } from "parse5";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import { marked } from "marked";
import { safeFile } from "../../../core/src/lib/files.mjs";
import { scriptBindings } from "../compiler/card-scripts.mjs";

const mime = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".txt": "text/plain",
  ".csv": "text/csv",
};
const attr = (node, name) =>
  node.attrs?.find((item) => item.name === name)?.value;
const attributes = (node) =>
  Object.fromEntries(
    (node?.attrs ?? []).map((item) => [item.name, item.value]),
  );

export function shadowCss(css) {
  const tree = postcss.parse(css),
    fonts = [];
  tree.walkAtRules("font-face", (rule) => {
    let node = rule.clone(),
      parent = rule.parent;
    while (parent?.type === "atrule") {
      const wrapper = parent.clone({ nodes: [] });
      wrapper.append(node);
      node = wrapper;
      parent = parent.parent;
    }
    fonts.push(node.toString());
    rule.remove();
  });
  tree.walkRules((rule) => {
    for (let parent = rule.parent; parent; parent = parent.parent)
      if (parent.type === "atrule" && /keyframes$/i.test(parent.name)) return;
    rule.selector = selectorParser((selectors) => {
      selectors.walk((node) => {
        if (!(
          (node.type === "tag" && node.value.toLowerCase() === "html") ||
          (node.type === "pseudo" && node.value === ":root")
        ))
          return;
        const host = selectorParser.pseudo({ value: ":host" });
        node.replaceWith(host);
        const compound = [];
        let next = host.next();
        while (next && next.type !== "combinator") {
          const following = next.next();
          if (!(
            next.type === "pseudo" && [":root", ":host"].includes(next.value)
          ))
            compound.push(next.clone());
          next.remove();
          next = following;
        }
        let previous = host.prev();
        while (previous && previous.type !== "combinator") {
          const preceding = previous.prev();
          compound.unshift(previous.clone());
          previous.remove();
          previous = preceding;
        }
        if (compound.length) {
          const selector = selectorParser.selector();
          for (const item of compound) selector.append(item);
          host.append(selector);
        }
      });
    }).processSync(rule.selector);
  });
  return { css: tree.toString(), fonts };
}

export function reviewCard(content, metadata, styles, fonts) {
  const doc = parse(content),
    html = doc.childNodes.find((node) => node.tagName === "html"),
    head = html.childNodes.find((node) => node.tagName === "head"),
    body = html.childNodes.find((node) => node.tagName === "body");
  const scripts = [],
    handlers = [],
    sheetIds = [];
  function visit(node) {
    for (const attribute of [...(node.attrs ?? [])]) {
      if (!/^on[a-z]/.test(attribute.name)) continue;
      const key = String(handlers.length);
      handlers.push({
        key,
        event: attribute.name.slice(2),
        code: attribute.value,
      });
      node.attrs.splice(node.attrs.indexOf(attribute), 1);
      node.attrs.push({ name: "data-review-event-" + key, value: "" });
    }

    for (const child of [...(node.childNodes ?? [])]) {
      if (
        child.tagName === "script" &&
        [undefined, "", "text/javascript", "application/javascript"].includes(
          attr(child, "type"),
        )
      ) {
        const code = child.childNodes.map((item) => item.value ?? "").join("");
        if (!/^\/\* @codex-ds(?: namespace=|-runtime-assets)/.test(code))
          scripts.push({ code, bindings: scriptBindings(code) });
        node.childNodes.splice(node.childNodes.indexOf(child), 1);
        continue;
      }
      if (child.tagName === "style") {
        const source = child.childNodes
          .map((item) => item.value ?? "")
          .join("");
        const media = attr(child, "media"),
          scoped = shadowCss(media ? `@media ${media}{${source}}` : source);
        let index = styles.indexOf(scoped.css);
        if (index < 0) {
          index = styles.length;
          styles.push(scoped.css);
        }
        sheetIds.push(index);
        for (const font of scoped.fonts) fonts.add(font);
        node.childNodes.splice(node.childNodes.indexOf(child), 1);
        continue;
      }
      visit(child);
      if (child.content) visit(child.content);
    }
  }
  visit(html);
  const [width, height] = (metadata.viewport ?? "700x150")
    .split("x")
    .map(Number);
  if (!(width > 0 && height > 0))
    throw new Error(`Invalid review viewport: ${metadata.name}`);
  return {
    ...metadata,
    width,
    height,
    htmlAttributes: attributes(html),
    bodyAttributes: attributes(body),
    head: serialize(head),
    body: serialize(body),
    scripts,
    handlers,
    sheetIds,
  };
}

export async function reviewRuntimeAssets(root, files, needed) {
  const assets = {},
    warnings = [];
  if (!needed) return { assets, warnings };
  let size = 0;
  for (const relative of files) {
    const parts = relative.split(path.sep),
      name = parts.at(-1),
      ext = path.extname(name).toLowerCase();
    if (
      !mime[ext] ||
      parts.some(
        (part) =>
          part.startsWith(".") ||
          [
            "node_modules",
            "_import",
            "_ds",
            "_sources",
            "dist",
            "build",
          ].includes(part),
      ) ||
      name.startsWith("_") ||
      /^(?:package(?:-lock)?|tsconfig|system)\.json$/.test(name)
    )
      continue;
    const file = await safeFile(root, relative),
      stat = await fs.stat(file);
    if ((stat.size * 4) / 3 > 3 * 1024 * 1024 - size) {
      warnings.push(`Runtime asset exceeds the 3 MiB budget: ${relative}`);
      continue;
    }
    const value = `data:${mime[ext]};base64,${(await fs.readFile(file)).toString("base64")}`;
    if (size + value.length > 3 * 1024 * 1024) {
      warnings.push(`Runtime asset exceeds the 3 MiB budget: ${relative}`);
      continue;
    }
    assets[relative.split(path.sep).join("/")] = value;
    size += value.length;
  }
  return { assets, warnings };
}
async function readmeHtml(root, markdown) {
  const tree = parseFragment(marked.parse(markdown ?? ""));
  async function visit(node) {
    for (const child of [...(node.childNodes ?? [])]) {
      if (
        [
          "script",
          "style",
          "iframe",
          "object",
          "embed",
          "link",
          "meta",
          "base",
        ].includes(child.tagName)
      ) {
        node.childNodes.splice(node.childNodes.indexOf(child), 1);
        continue;
      }
      child.attrs = (child.attrs ?? []).filter(
        (attribute) =>
          !/^on/.test(attribute.name) &&
          attribute.name !== "srcdoc" &&
          !(
            ["href", "src", "xlink:href"].includes(attribute.name) &&
            /^\s*(?:javascript|vbscript):/i.test(attribute.value)
          ),
      );
      if (child.tagName === "img") {
        const src = child.attrs.find((item) => item.name === "src");
        if (src && !/^(?:https?:|data:|\/\/)/i.test(src.value)) {
          const file = await safeFile(
            root,
            decodeURIComponent(src.value.split(/[?#]/)[0]),
          );
          src.value = `data:${mime[path.extname(file)] ?? "application/octet-stream"};base64,${(await fs.readFile(file)).toString("base64")}`;
        } else if (src && !src.value.startsWith("data:")) {
          // The review is offline; keep a readable reference rather than a remote request.
          const label = attr(child, "alt") ?? "Remote image";
          child.tagName = child.nodeName = "span";
          child.attrs = [];
          child.childNodes = [
            {
              nodeName: "#text",
              value: label,
              parentNode: child,
            },
          ];
        }
      }
      await visit(child);
    }
  }
  await visit(tree);
  return serialize(tree);
}

export async function buildReviewData(root, manifest, files, sourceFiles = []) {
  const styles = [],
    fonts = new Set(),
    cards = [],
    consumed = new Set();
  for (const font of shadowCss(files.get(manifest.css).toString()).fonts)
    fonts.add(font);
  const add = (meta, content) =>
    cards.push(
      reviewCard(
        content,
        { ...meta, id: "review-card-" + cards.length },
        styles,
        fonts,
      ),
    );
  const componentHtml = (component) => {
    const json = JSON.stringify(component).replace(/</g, "\\u003c");
    return `<html><head><style>${files.get(manifest.css).toString()}</style></head><body><div id="sample"></div><script>const ds=window[${JSON.stringify(manifest.namespace ?? "CodexDesignSystem")}],c=${json},value=ds.Components[c.name];if(c.kind==='constant'){const pre=document.createElement('pre');pre.textContent=JSON.stringify(value,null,2);document.getElementById('sample').append(pre);}else ds.createRoot(document.getElementById('sample')).render(ds.React.createElement(value,c.props||{}));</script></body></html>`;
  };
  for (const start of manifest.startingPoints ?? []) {
    const file =
      start.previewPath ?? (start.kind !== "component" ? start.path : null);
    if (!file && start.kind === "component") {
      const component = manifest.components.find(
        (component) =>
          component.name === start.component ||
          component.export === start.component,
      );
      if (!component)
        throw new Error(`Missing starting-point component: ${start.component}`);
      add(
        { ...start, group: start.section || "Starting points", component },
        componentHtml(component),
      );
      continue;
    }
    if (!file || consumed.has(file)) continue;
    consumed.add(file);
    add(
      {
        ...start,
        path: file,
        sourcePath:
          manifest.cards?.find((card) => card.path === file)?.sourcePath ??
          start.sourcePath,
        group: start.section || "Starting points",
      },
      files.get(file).toString(),
    );
  }
  for (const card of manifest.cards ?? []) {
    if (consumed.has(card.path)) continue;
    consumed.add(card.path);
    add(card, files.get(card.path).toString());
  }
  for (const component of manifest.components ?? []) {
    add(
      {
        name: component.name,
        group: "Components",
        component,
        viewport: "700x150",
        sourcePath: component.sourcePath,
      },
      componentHtml(component),
    );
  }

  for (const example of manifest.examples ?? [])
    add(
      { name: example.name, group: "Examples", viewport: "700x150" },
      `<html><head><style>${files.get(manifest.css).toString()}</style></head><body>${example.html ?? ""}</body></html>`,
    );
  const { assets, warnings } = await reviewRuntimeAssets(
    root,
    sourceFiles,
    cards.some((card) =>
      card.scripts.some((script) => /\bfetch\s*\(/.test(script.code)),
    ),
  );
  const readme = sourceFiles.find((file) => /^readme\.md$/i.test(file));
  const notes = readme
    ? await fs.readFile(await safeFile(root, readme), "utf8")
    : manifest.guidance;
  return {
    schemaVersion: 1,
    cards,
    styles,
    fonts: [...fonts],
    assets,
    warnings,
    readme: await readmeHtml(root, notes),
  };
}

export function portableCardAssets(content, sourcePath, assets) {
  if (!/\bfetch\s*\(/.test(content)) return content;
  const doc = parse(content),
    html = doc.childNodes.find((node) => node.tagName === "html"),
    head = html.childNodes.find((node) => node.tagName === "head");
  const code = `/* @codex-ds-runtime-assets */\n(()=>{const assets=${JSON.stringify(assets).replace(/</g, "\\u003c")},original=window.fetch.bind(window),source=new URL(${JSON.stringify("./" + sourcePath)},'https://review.invalid/');window.fetch=function(input,options){if(typeof input==='string'||input instanceof URL){const resolved=new URL(String(input),source);if(resolved.origin===source.origin){const key=decodeURIComponent(resolved.pathname.slice(1));if(Object.hasOwn(assets,key))return original(assets[key],options);return original(new URL(String(input),new URL(${JSON.stringify("./" + sourcePath)},location.href)),options)}}return original(input,options)}})();`;
  const script = {
    nodeName: "script",
    tagName: "script",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    attrs: [],
    parentNode: head,
    childNodes: [],
  };
  script.childNodes.push({
    nodeName: "#text",
    value: code,
    parentNode: script,
  });
  head.childNodes.unshift(script);
  return serialize(doc);
}
