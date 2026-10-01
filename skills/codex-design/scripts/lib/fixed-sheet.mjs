import { parse } from "parse5";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { injectHead } from "./inject-head.mjs";
let runtime;
export function needsFixedSheet(html) {
  let installed = false,
    candidate = false;
  const visit = (node) => {
    const attrs = Object.fromEntries(
      (node.attrs ?? []).map(({ name, value }) => [name, value]),
    );
    if (
      node.tagName === "script" &&
      Object.hasOwn(attrs, "data-codex-fixed-sheet-runtime")
    )
      installed = true;
    if (
      (["svg", "canvas", "img", "table"].includes(node.tagName) &&
        attrs.width) ||
      (node.tagName === "script" &&
        !["application/json", "application/ld+json"].includes(attrs.type)) ||
      (node.tagName === "link" && attrs.rel === "stylesheet") ||
      /\bwidth\s*:/.test(attrs.style || "") ||
      (node.tagName === "style" &&
        /\bwidth\s*:/.test(
          node.childNodes?.map((child) => child.value || "").join(""),
        ))
    )
      candidate = true;
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(parse(html));
  return candidate && !installed;
}
export async function injectFixedSheet(html) {
  if (!needsFixedSheet(html)) return html;
  runtime ??= build({
    entryPoints: [
      fileURLToPath(
        new URL("../../assets/starters/fixed-sheet.js", import.meta.url),
      ),
    ],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
  })
    .then((result) => result.outputFiles[0].text)
    .catch((error) => {
      runtime = undefined;
      throw error;
    });
  return injectHead(
    html,
    `<script data-codex-fixed-sheet-runtime>${(await runtime).replace(/<\/script/gi, "<\\/script")}</script>`,
  );
}
