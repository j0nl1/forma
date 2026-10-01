import path from "node:path";
import fs from "node:fs/promises";
import { parse, serialize } from "parse5";
import postcss from "postcss";
import { safeFile } from "./files.mjs";
const MIME = {
  ".json": "application/json",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ico": "image/x-icon",
};
const remote = (value) => /^(?:https?:|\/\/)/i.test(value);
const embedded = (value) => /^(?:data:|blob:|#)/i.test(value);
function localReference(root, base, value) {
  if (remote(value))
    throw new Error(
      `Remote dependency must be downloaded or removed: ${value}`,
    );
  if (/^[a-z][\w+.-]*:/i.test(value))
    throw new Error(`Unsupported dependency scheme: ${value}`);
  const [name] = value.split(/[?#]/);
  if (name.startsWith("/"))
    throw new Error(`Use a relative dependency path: ${value}`);
  return path.relative(root, path.resolve(base, decodeURIComponent(name)));
}
export async function inlineHtml(input, { root: scope } = {}) {
  const pageBase = path.dirname(path.resolve(input));
  const root = scope ? path.resolve(scope) : pageBase;
  const local = (base, value) =>
    safeFile(root, localReference(root, base, value));
  async function data(base, value) {
    if (!value || embedded(value)) return value;
    const file = await local(base, value);
    const suffix = value.includes("#")
      ? "#" + value.split("#").slice(1).join("#")
      : "";
    return `data:${MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream"};base64,${(await fs.readFile(file)).toString("base64")}${suffix}`;
  }
  async function css(text, base, ancestry = []) {
    const tree = postcss.parse(text);
    const imports = [];
    tree.walkAtRules("import", (r) => imports.push(r));
    for (const rule of imports) {
      const match = rule.params.match(
        /^(?:url\(\s*)?["']?([^"'\s)]+)["']?\s*\)?\s*(.*)$/,
      );
      if (!match) throw new Error(`Cannot parse CSS import: ${rule.params}`);
      const file = await local(base, match[1]);
      if (ancestry.includes(file)) throw new Error("CSS import cycle");
      const child = postcss.parse(
        await css(await fs.readFile(file, "utf8"), path.dirname(file), [
          ...ancestry,
          file,
        ]),
      );
      if (match[2]) {
        const media = postcss.atRule({ name: "media", params: match[2] });
        media.append(child.nodes);
        rule.replaceWith(media);
      } else rule.replaceWith(...child.nodes);
    }
    const declarations = [];
    tree.walkDecls((r) => declarations.push(r));
    for (const decl of declarations) {
      const matches = [
        ...decl.value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g),
      ];
      for (const m of matches) {
        const value = (m[1] ?? m[2] ?? m[3]).trim();
        decl.value = decl.value.replace(
          m[0],
          `url("${await data(base, value)}")`,
        );
      }
    }
    return tree.toString();
  }
  const doc = parse(await fs.readFile(input, "utf8"));
  const attr = (n, key) => n.attrs?.find((a) => a.name === key);
  const remove = (n, key) => {
    n.attrs = n.attrs.filter((a) => a.name !== key);
  };
  const text = (n, value) => {
    n.childNodes = [{ nodeName: "#text", value, parentNode: n }];
  };
  async function visit(n) {
    if (n.tagName === "script") {
      if (attr(n, "type")?.value === "module")
        throw new Error("Bundle ES module scripts before standalone export.");
      const src = attr(n, "src");
      if (src) {
        const f = await local(pageBase, src.value);
        text(
          n,
          (await fs.readFile(f, "utf8")).replace(/<\/script/gi, "<\\/script"),
        );
        remove(n, "src");
        remove(n, "integrity");
        remove(n, "crossorigin");
      }
    }
    if (n.tagName === "link" && attr(n, "rel")?.value === "stylesheet") {
      const f = await local(pageBase, attr(n, "href")?.value ?? "");
      n.tagName = "style";
      n.nodeName = "style";
      n.attrs = n.attrs.filter((a) => a.name === "media");
      text(
        n,
        (await css(await fs.readFile(f, "utf8"), path.dirname(f), [f])).replace(
          /<\/style/gi,
          "<\\/style",
        ),
      );
    } else if (n.tagName === "style") {
      text(
        n,
        (
          await css(
            n.childNodes?.map((c) => c.value ?? "").join("") ?? "",
            pageBase,
          )
        ).replace(/<\/style/gi, "<\\/style"),
      );
    }
    const style = attr(n, "style");
    if (style) {
      const wrapped = await css(`x{${style.value}}`, pageBase);
      style.value = wrapped.slice(
        wrapped.indexOf("{") + 1,
        wrapped.lastIndexOf("}"),
      );
    }
    for (const key of ["src", "poster", "xlink:href"]) {
      const a = attr(n, key);
      if (a && n.tagName !== "script") a.value = await data(pageBase, a.value);
    }
    if (["image", "use", "link"].includes(n.tagName)) {
      const a = attr(n, "href");
      if (a) a.value = await data(pageBase, a.value);
    }
    const srcset = attr(n, "srcset");
    if (srcset) {
      if (srcset.value.includes("data:"))
        throw new Error(
          "Embedded data URLs in srcset are unsupported; use src.",
        );
      const candidates = [];
      for (const item of srcset.value.split(",")) {
        const [url, ...descriptor] = item.trim().split(/\s+/);
        candidates.push([await data(pageBase, url), ...descriptor].join(" "));
      }
      srcset.value = candidates.join(", ");
    }
    for (const child of [...(n.childNodes ?? [])]) await visit(child);
    if (n.content) await visit(n.content);
  }
  await visit(doc);
  return serialize(doc);
}
