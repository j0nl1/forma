import { parse } from "parse5";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { injectHead } from "./inject-head.mjs";
let runtime;
export function hasPlainCanvas(html) {
  let enabled = false,
    installed = false;
  const visit = (node) => {
    const attrs = Object.fromEntries(
      (node.attrs ?? []).map(({ name, value }) => [name, value]),
    );
    if (
      node.tagName === "meta" &&
      attrs.name === "design_doc_mode" &&
      attrs.content === "canvas"
    )
      enabled = true;
    if (
      node.tagName === "script" &&
      Object.hasOwn(attrs, "data-codex-plain-canvas-runtime")
    )
      installed = true;
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(parse(html));
  return enabled && !installed;
}
export async function injectPlainCanvas(html) {
  if (!hasPlainCanvas(html)) return html;
  runtime ??= build({
    entryPoints: [
      fileURLToPath(
        new URL("../../assets/starters/plain-canvas.js", import.meta.url),
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
  const script = (await runtime).replace(/<\/script/gi, "<\\/script");
  return injectHead(
    html,
    `<script data-codex-plain-canvas-runtime>${script}</script>`,
  );
}
