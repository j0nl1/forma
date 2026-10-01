#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import postcss from "postcss";
import { inlineHtml } from "./lib/inline.mjs";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  args,
  main,
  html,
  slug,
  readJson,
  write,
  writeJson,
  exists,
  safeFile,
} from "./lib/files.mjs";
const hash = (text) => createHash("sha256").update(text).digest("hex");
const identifier = /^[A-Za-z_$][\w$]*$/;
export async function inspect(root) {
  root = await fs.realpath(root);
  const spec = await readJson(await safeFile(root, "system.json"));
  const issues = [];
  if (spec.schemaVersion !== 1) issues.push("schemaVersion must be 1");
  if (typeof spec.name !== "string" || !spec.name.trim())
    issues.push("name is required");
  if (typeof spec.slug !== "string" || slug(spec.slug) !== spec.slug)
    issues.push("slug must contain lowercase words separated by hyphens");
  if (!Array.isArray(spec.components ?? []))
    issues.push("components must be an array");
  if (!Array.isArray(spec.examples ?? []))
    issues.push("examples must be an array");
  const files = new Map(),
    tokens = {};
  async function cssFile(relative, stack = []) {
    const file = await safeFile(root, relative);
    if (stack.includes(file)) {
      issues.push(`CSS import cycle: ${relative}`);
      return;
    }
    if (files.has(file)) return;
    const text = await fs.readFile(file, "utf8");
    files.set(file, text);
    const parsed = postcss.parse(text);
    const imports = [];
    parsed.walkAtRules("import", (r) => imports.push(r));
    for (const rule of imports) {
      const match = rule.params.match(/^(?:url\(\s*)?["']?([^"'\s)]+)/);
      if (!match) {
        issues.push(`Invalid CSS import: ${rule.params}`);
        continue;
      }
      if (/^(?:https?:|\/\/)/i.test(match[1])) {
        issues.push(`Remote CSS import: ${match[1]}`);
        continue;
      }
      await cssFile(
        path.relative(root, path.resolve(path.dirname(file), match[1])),
        [...stack, file],
      );
    }
    parsed.walkDecls((d) => {
      if (d.prop.startsWith("--")) tokens[d.prop] = d.value;
    });
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (m[1].startsWith("data:") || m[1].startsWith("#")) continue;
      if (/^(?:https?:|\/\/)/i.test(m[1])) {
        issues.push(`Remote CSS asset: ${m[1]}`);
        continue;
      }
      const rel = path.relative(
        root,
        path.resolve(path.dirname(file), m[1].split(/[?#]/)[0]),
      );
      await safeFile(root, rel);
    }
  }
  try {
    await cssFile(spec.css);
  } catch (e) {
    issues.push(e.message);
  }
  for (const [name, value] of Object.entries(tokens))
    for (const m of value.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
      if (!(m[1] in tokens) && m[2] !== ",")
        issues.push(`${name} references missing token ${m[1]}`);
    }
  const visiting = new Set(),
    visited = new Set();
  function checkAlias(name) {
    if (visiting.has(name)) {
      issues.push(`Token alias cycle: ${name}`);
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    for (const m of (tokens[name] ?? "").matchAll(/var\(\s*(--[\w-]+)/g))
      if (m[1] in tokens) checkAlias(m[1]);
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of Object.keys(tokens)) checkAlias(name);
  const names = new Set();
  for (const c of Array.isArray(spec.components) ? spec.components : []) {
    if (
      !identifier.test(c.name ?? "") ||
      !identifier.test(c.export ?? c.name ?? "")
    )
      issues.push(`Invalid component identifier: ${c.name}`);
    if (names.has(c.name)) issues.push(`Duplicate component: ${c.name}`);
    names.add(c.name);
    if (
      c.props != null &&
      (typeof c.props !== "object" || Array.isArray(c.props))
    )
      issues.push(`Component props must be an object: ${c.name}`);
  }
  if ((spec.components ?? []).length && !spec.entry)
    issues.push("React components require an entry");
  if (spec.entry)
    try {
      await safeFile(root, spec.entry);
    } catch (e) {
      issues.push(e.message);
    }
  for (const start of spec.startingPoints ?? [])
    try {
      await safeFile(root, start.path);
    } catch (e) {
      issues.push(e.message);
    }
  return {
    spec,
    tokens,
    files: [...files.keys()].map((f) => path.relative(root, f)),
    issues: [...new Set(issues)],
  };
}
const nodePaths = [
  fileURLToPath(new URL("../node_modules", import.meta.url)),
  fileURLToPath(new URL("../../../node_modules", import.meta.url)),
];
export async function compile(root) {
  root = await fs.realpath(root);
  const model = await inspect(root);
  if (model.issues.length) throw new Error(model.issues.join("\n"));
  const { spec, tokens } = model;
  // Resolution checks happen without evaluating imported component source.
  const fence = {
    name: "contained-source",
    setup(builder) {
      builder.onLoad({ filter: /.*/ }, async ({ path: file }) => {
        if (file.includes(`${path.sep}node_modules${path.sep}`)) return;
        await safeFile(root, path.relative(root, file));
      });
    },
  };
  const cssResult = await build({
    entryPoints: [path.join(root, spec.css)],
    bundle: true,
    write: false,
    outfile: "tokens.css",
    loader: {
      ".woff2": "dataurl",
      ".woff": "dataurl",
      ".ttf": "dataurl",
      ".png": "dataurl",
      ".jpg": "dataurl",
      ".svg": "dataurl",
      ".webp": "dataurl",
    },
    plugins: [fence],
    metafile: true,
    logLevel: "silent",
  });
  const css = cssResult.outputFiles[0].text;
  let bundle = null;
  if (spec.entry) {
    const validateImports = (spec.components ?? []).map(
      (c, i) => `${c.export ?? c.name} as __checked${i}`,
    );
    const validation = validateImports.length
      ? `import{${validateImports.join(",")}}from ${JSON.stringify("./" + spec.entry)};export const checked=[${validateImports.map((_, i) => "__checked" + i).join(",")}];`
      : "";
    const result = await build({
      stdin: {
        contents: `${validation}import React from 'react';import{createRoot}from'react-dom/client';import*as Components from ${JSON.stringify("./" + spec.entry)};export{React,createRoot,Components};`,
        resolveDir: root,
        loader: "jsx",
      },
      bundle: true,
      write: false,
      format: "iife",
      globalName: "CodexDesignSystem",
      platform: "browser",
      jsx: "automatic",
      nodePaths,
      plugins: [fence],
      logLevel: "silent",
      legalComments: "eof",
    });
    bundle = result.outputFiles[0].text;
  }
  const seeds = [];
  const seedNames = new Set();
  for (const seed of spec.startingPoints ?? []) {
    const name =
      "_ds_seed_" +
      slug(seed.name ?? path.basename(seed.path, ".html")) +
      ".html";
    if (seedNames.has(name))
      throw new Error("Duplicate starting-point filename");
    seedNames.add(name);
    const content = await inlineHtml(await safeFile(root, seed.path), { root });
    seeds.push({ name, title: seed.name ?? name, content });
  }
  const artifacts = {
    ...Object.fromEntries(seeds.map((s) => [s.name, hash(s.content)])),
    "_ds_tokens.css": hash(css),
    ...(bundle ? { "_ds_bundle.js": hash(bundle) } : {}),
  };
  const manifest = {
    schemaVersion: 1,
    name: spec.name,
    slug: spec.slug,
    tokens,
    components: spec.components ?? [],
    examples: spec.examples ?? [],
    startingPoints: seeds.map((s) => ({ name: s.title, path: s.name })),
    guidance: spec.guidance ?? "",
    css: "_ds_tokens.css",
    bundle: bundle ? "_ds_bundle.js" : null,
    artifacts,
  };
  for (const seed of seeds)
    await write(path.join(root, seed.name), seed.content);
  await write(path.join(root, "_ds_tokens.css"), css);
  if (bundle) await write(path.join(root, "_ds_bundle.js"), bundle);
  else await fs.rm(path.join(root, "_ds_bundle.js"), { force: true });
  await writeJson(path.join(root, "_ds_manifest.json"), manifest);
  return manifest;
}
export async function preview(root) {
  const m = await readJson(await safeFile(root, "_ds_manifest.json"));
  const json = JSON.stringify(m.components).replace(/</g, "\\u003c");
  const tokens = Object.entries(m.tokens)
    .map(
      ([name, value]) =>
        `<tr><th>${html(name)}</th><td>${html(value)}</td><td><span style="display:inline-block;width:3rem;height:1rem;background:var(${html(name)})"></span></td></tr>`,
    )
    .join("");
  const examples = (m.examples ?? [])
    .map((e) => `<article><h2>${html(e.name)}</h2>${e.html ?? ""}</article>`)
    .join("");
  const content = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(m.name)}</title><link rel="stylesheet" href="./_ds_tokens.css"><style>body{margin:0;padding:clamp(20px,4vw,64px);font:16px/1.5 system-ui;color:#18202c;background:#f7f8fa}main{max-width:1100px;margin:auto}article{padding:24px;margin:16px 0;background:white;border:1px solid #d9dfe8;border-radius:12px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}h1{font-size:clamp(32px,5vw,56px)}button:focus-visible,a:focus-visible{outline:3px solid #4169e1}</style><main><h1>${html(m.name)}</h1><p>${html(m.guidance)}</p><h2>Tokens</h2><table><thead><tr><th>Name</th><th>Value</th><th>Preview</th></tr></thead><tbody>${tokens}</tbody></table><h2>Components</h2>${examples}<div id="components"></div><h2>Starting points</h2>${m.startingPoints.map((s) => `<p><a href="${html(s.path)}">${html(s.name ?? s.path)}</a></p>`).join("")}</main>${m.bundle ? `<script src="./_ds_bundle.js"></script><script>const ds=window.CodexDesignSystem;for(const c of ${json}){const card=document.createElement('article');const heading=document.createElement('h3');heading.textContent=c.name;card.append(heading);const mount=document.createElement('div');card.append(mount);document.getElementById('components').append(card);const Component=ds.Components[c.export||c.name];if(!Component)throw new Error('Missing component export: '+c.name);ds.createRoot(mount).render(ds.React.createElement(Component,c.props||{}));}</script>` : ""}</html>`;
  await write(path.join(root, "preview.html"), content);
  return path.join(root, "preview.html");
}
export async function importSystem(source, project) {
  const m = await readJson(await safeFile(source, "_ds_manifest.json"));
  if (m.schemaVersion !== 1 || slug(m.slug) !== m.slug)
    throw new Error("Invalid design-system manifest");
  if (
    !m.artifacts ||
    !(m.css in m.artifacts) ||
    (m.bundle && !(m.bundle in m.artifacts))
  )
    throw new Error("Incomplete artifact manifest");
  const dest = path.resolve(project, "_ds", m.slug);
  if (await exists(dest))
    throw new Error(`Design-system binding already exists: ${dest}`);
  const copies = [];
  for (const [name, expected] of Object.entries(m.artifacts)) {
    const file = await safeFile(source, name);
    const bytes = await fs.readFile(file);
    if (hash(bytes) !== expected)
      throw new Error(`Stale compiled artifact: ${name}`);
    copies.push([name, bytes]);
  }
  const metadata = path.join(project, "design.json");
  const meta = (await exists(metadata))
    ? await readJson(metadata)
    : { schemaVersion: 1, designSystems: [], assets: [] };
  if (meta.schemaVersion !== 1 || !Array.isArray(meta.designSystems))
    throw new Error("Unsupported project metadata");
  // Validate every destination before writing; never follow an existing parent symlink.
  await fs.mkdir(project, { recursive: true });
  if (
    (await exists(path.join(project, "_ds"))) &&
    (await fs.lstat(path.join(project, "_ds"))).isSymbolicLink()
  )
    throw new Error("Design-system destination is a symlink");
  try {
    await fs.mkdir(dest, { recursive: true });
    for (const [name, bytes] of copies) {
      if (path.basename(name) !== name)
        throw new Error("Artifact names must be basenames");
      await write(path.join(dest, name), bytes);
    }
    const imported = { ...m };
    await writeJson(path.join(dest, "_ds_manifest.json"), imported);
    meta.designSystems.push({
      slug: m.slug,
      path: `_ds/${m.slug}/_ds_manifest.json`,
    });
    await writeJson(metadata, meta);
  } catch (e) {
    await fs.rm(dest, { recursive: true, force: true });
    throw e;
  }
  return { destination: dest, binding: meta.designSystems.at(-1) };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional: p } = args(process.argv.slice(2));
    if (
      !["check", "compile", "preview", "import"].includes(p[0]) ||
      p.length !== (p[0] === "import" ? 3 : 2)
    )
      throw new Error(
        "Usage: node design-system.mjs check|compile|preview <folder> | import <system> <project>",
      );
    const root = path.resolve(p[1]);
    if (p[0] === "check") {
      const m = await inspect(root);
      console.log(
        JSON.stringify({
          ok: !m.issues.length,
          issues: m.issues,
          tokens: Object.keys(m.tokens).length,
        }),
      );
      if (m.issues.length) process.exitCode = 1;
    } else
      console.log(
        JSON.stringify(
          await { compile, preview, import: importSystem }[p[0]](
            root,
            p[2] && path.resolve(p[2]),
          ),
        ),
      );
  });
