#!/usr/bin/env node
import { sharedRuntimePlugin } from "./lib/system-shared-runtime.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import { inlineHtml } from "./lib/inline.mjs";
import { readSystemSource } from "./lib/system-source.mjs";
import { systemReview } from "./lib/system-review.mjs";
import {
  buildReviewData,
  reviewRuntimeAssets,
  portableCardAssets,
} from "./lib/system-review-data.mjs";
import { cardScript } from "./lib/system-card-scripts.mjs";
import {
  authoringModel,
  authoringPlugin,
  reactRuntime,
  runtimeDeclaration,
} from "./lib/system-authoring.mjs";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  namespaceFor,
  compiledSystem,
  systemHash as hash,
} from "./lib/system-manifest.mjs";
import {
  importSystem,
  wiring,
  discoverSystems,
  setPrimary,
} from "./lib/system-bindings.mjs";
export {
  importSystem,
  wiring,
  discoverSystems,
  setPrimary,
} from "./lib/system-bindings.mjs";
import { args, main, slug, write, writeJson, safeFile } from "./lib/files.mjs";
const identifier = /^[A-Za-z_$][\w$]*$/;
export async function inspect(root) {
  root = await fs.realpath(root);
  const source = await readSystemSource(root);
  const { spec } = source;
  const issues = [...source.issues];
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
  for (const component of spec.components ?? [])
    try {
      await safeFile(root, component.sourcePath ?? spec.entry);
    } catch (error) {
      issues.push(error.message);
    }
  if (spec.entry)
    try {
      await safeFile(root, spec.entry);
    } catch (e) {
      issues.push(e.message);
    }
  for (const start of spec.startingPoints ?? [])
    try {
      await safeFile(root, start.path);
      if (start.previewPath) await safeFile(root, start.previewPath);
    } catch (e) {
      issues.push(e.message);
    }
  const result = {
    spec,
    tokens,
    files: [...files.keys()].map((f) => path.relative(root, f)),
    issues: [...new Set(issues)],
    cards: source.cards,
    declarations: source.declarations,
    sourceFiles: source.sourceFiles,
  };
  try {
    result.authoring = await authoringModel(root, result);
  } catch (error) {
    result.issues.push(error.message);
  }
  return result;
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
  const authoring = model.authoring;
  const namespace = await namespaceFor(root, spec.slug);
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
  if (spec.entry || spec.components.length || authoring.reactFiles.size) {
    const runtime = reactRuntime(authoring.version);
    const imports = spec.components
      .map(
        (component, index) =>
          `import{${component.export ?? component.name} as __component${index}}from ${JSON.stringify("./" + (component.sourcePath ?? spec.entry))};`,
      )
      .join("\n");
    const base = spec.entry
      ? `import*as Base from ${JSON.stringify("./" + spec.entry)};`
      : "const Base={};";
    const componentMap = spec.components
      .map(
        (component, index) =>
          `${JSON.stringify(component.name)}:__component${index}`,
      )
      .join(",");
    const result = await build({
      stdin: {
        contents: `${imports}import{React,ReactDOM,createRoot,hydrateRoot}from'codex-design:runtime';${base}const Components={...Base,${componentMap}};export{React,ReactDOM,createRoot,hydrateRoot,Components};`,
        resolveDir: root,
        loader: "jsx",
      },
      bundle: true,
      write: false,
      format: "iife",
      globalName: namespace,
      banner: { js: `/* @codex-ds namespace=${namespace} */` },
      footer: {
        js: `window.CodexDesignSystems ??= Object.create(null);window.CodexDesignSystems[${JSON.stringify(spec.slug)}]=${namespace};window.CodexDesignSystem=${namespace};`,
      },
      platform: "browser",
      jsx: "automatic",
      define:
        authoring.version === "18.3.1"
          ? { "process.env.NODE_ENV": JSON.stringify("production") }
          : {},
      nodePaths,
      plugins: [
        sharedRuntimePlugin(runtime),
        authoringPlugin(root, model, authoring),
        fence,
      ],
      logLevel: "silent",
      legalComments: "eof",
    });
    bundle = result.outputFiles[0].text;
  }
  const generated = new Map([
    ["_ds_tokens.css", css],
    ...(bundle ? [["_ds_bundle.js", bundle]] : []),
  ]);
  const transformScript = (code, type) =>
    cardScript(code, type, namespace, authoring.sourceNamespaces);
  const cardOptions = (file) => ({
    root,
    generated,
    transformScript,
    rewriteScriptSource: (src) => (runtimeDeclaration(src) ? null : undefined),
    ensureScript: authoring.reactFiles.has(file)
      ? {
          marker: `/* @codex-ds namespace=${namespace}`,
          code: bundle,
          prepend: true,
          after: `/* @codex-ds-card-runtime */\nwindow.React=window[${JSON.stringify(namespace)}].React;window.ReactDOM=window[${JSON.stringify(namespace)}].ReactDOM;`,
        }
      : undefined,
  });
  const seeds = [],
    cards = [],
    startingPoints = [],
    seedNames = new Set();
  for (const [index, card] of model.cards.entries()) {
    const name = "_ds_card_" + index + "_" + slug(card.name) + ".html";
    const content = await inlineHtml(
      await safeFile(root, card.path),
      cardOptions(card.path),
    );
    seeds.push({ name, content, sourcePath: card.path });
    cards.push({ ...card, sourcePath: card.path, path: name });
  }
  for (const seed of spec.startingPoints ?? []) {
    if (seed.kind === "component") {
      startingPoints.push({
        ...seed,
        sourcePath: seed.path,
        previewPath:
          cards.find((card) => card.sourcePath === seed.previewPath)?.path ??
          null,
      });
      continue;
    }
    const name =
      "_ds_seed_" +
      slug(seed.name ?? path.basename(seed.path, ".html")) +
      ".html";
    if (seedNames.has(name))
      throw new Error("Duplicate starting-point filename");
    seedNames.add(name);
    const content = await inlineHtml(
      await safeFile(root, seed.path),
      cardOptions(seed.path),
    );
    seeds.push({ name, content, sourcePath: seed.path });
    startingPoints.push({
      ...seed,
      sourcePath: seed.path,
      path: name,
      previewPath: name,
    });
  }
  const runtimeAssets = await reviewRuntimeAssets(
    root,
    model.sourceFiles,
    seeds.some((seed) => /\bfetch\s*\(/.test(seed.content)),
  );
  for (const seed of seeds)
    seed.content = portableCardAssets(
      seed.content,
      seed.sourcePath,
      runtimeAssets.assets,
    );
  const contracts =
    JSON.stringify(
      {
        schemaVersion: 1,
        declarations: model.declarations,
        components: spec.components.filter(
          (component) => component.contract || component.usage,
        ),
      },
      null,
      2,
    ) + "\n";
  const artifacts = {
    ...Object.fromEntries(seeds.map((s) => [s.name, hash(s.content)])),
    "_ds_tokens.css": hash(css),
    "_ds_contracts.json": hash(contracts),
    ...(bundle ? { "_ds_bundle.js": hash(bundle) } : {}),
  };
  const manifest = {
    schemaVersion: 1,
    name: spec.name,
    slug: spec.slug,
    namespace,
    sourceNamespaces: authoring.sourceNamespaces,
    reactVersion: bundle ? authoring.version : null,
    runtimeDeclarations: authoring.declarations,
    tokens,
    components: spec.components ?? [],
    examples: spec.examples ?? [],
    startingPoints,
    cards,
    contracts: "_ds_contracts.json",
    guidance: spec.guidance ?? "",
    css: "_ds_tokens.css",
    bundle: bundle ? "_ds_bundle.js" : null,
    artifacts,
  };
  const reviewFiles = new Map([
    ...generated,
    ...seeds.map((seed) => [seed.name, seed.content]),
  ]);
  const reviewData =
    JSON.stringify(
      await buildReviewData(root, manifest, reviewFiles, model.sourceFiles),
    ) + "\n";
  manifest.review = "_ds_review.json";
  artifacts[manifest.review] = hash(reviewData);
  for (const seed of seeds)
    await write(path.join(root, seed.name), seed.content);
  await write(path.join(root, "_ds_tokens.css"), css);
  await write(path.join(root, "_ds_contracts.json"), contracts);
  await write(path.join(root, manifest.review), reviewData);
  if (bundle) await write(path.join(root, "_ds_bundle.js"), bundle);
  else await fs.rm(path.join(root, "_ds_bundle.js"), { force: true });
  await writeJson(path.join(root, "_ds_manifest.json"), manifest);
  return manifest;
}
export async function preview(root) {
  const { manifest: m, files } = await compiledSystem(root);
  const data = m.review
    ? JSON.parse(files.get(m.review).toString())
    : await buildReviewData(root, m, files);
  const content = await systemReview(m, { files, data });
  await write(path.join(root, "preview.html"), content);
  return path.join(root, "preview.html");
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional: p, flags } = args(process.argv.slice(2), {
      "--primary": "boolean",
      "--update": "boolean",
    });
    if (
      ![
        "check",
        "compile",
        "preview",
        "import",
        "discover",
        "wiring",
        "primary",
      ].includes(p[0]) ||
      p.length !== (["import", "primary"].includes(p[0]) ? 3 : 2)
    )
      throw new Error(
        "Usage: node design-system.mjs check|compile|preview <folder> | discover <designs-folder> | wiring <project> | primary <project> <slug> | import <system> <project> [--primary] [--update]",
      );
    if (Object.keys(flags).length && p[0] !== "import")
      throw new Error("Import options apply only to import");
    const root = path.resolve(p[1]);
    if (p[0] === "check") {
      const m = await inspect(root);
      console.log(
        JSON.stringify({
          ok: !m.issues.length,
          issues: m.issues,
          tokens: Object.keys(m.tokens).length,
          components: m.spec.components,
          cards: m.cards,
          startingPoints: m.spec.startingPoints,
          reactVersion: m.authoring?.version,
          runtimeDeclarations: m.authoring?.declarations,
          sourceNamespaces: m.authoring?.sourceNamespaces,
        }),
      );
      if (m.issues.length) process.exitCode = 1;
    } else if (p[0] === "primary")
      console.log(JSON.stringify(await setPrimary(root, p[2])));
    else
      console.log(
        JSON.stringify(
          await {
            compile,
            preview,
            import: importSystem,
            discover: discoverSystems,
            wiring,
          }[p[0]](root, p[2] && path.resolve(p[2]), flags),
        ),
      );
  });
