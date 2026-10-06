import fs from "node:fs/promises";
import path from "node:path";
import { parseFragment } from "parse5";
import {
  exists,
  readJson,
  safeFile,
  slug,
} from "../../../core/src/lib/files.mjs";
import { namedExports, docTag } from "./system-contracts.mjs";
import { typeGraph } from "./system-type-graph.mjs";
import { exportGraph } from "./system-export-graph.mjs";

async function sourceFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (
        ["node_modules", ".git", "_ds"].includes(entry.name) ||
        entry.name.startsWith(".import-") ||
        entry.name.startsWith(".previous-")
      )
        continue;
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(
          `Design-system source must not contain symlinks: ${path.relative(root, full)}`,
        );
      if (entry.isDirectory()) await visit(full);
      else if (
        entry.isFile() &&
        !entry.name.startsWith("_ds_") &&
        entry.name !== "preview.html"
      )
        files.push(path.relative(root, full));
    }
  }
  await visit(root);
  return files.sort();
}
function attributes(text) {
  const node = parseFragment(`<meta ${text}>`).childNodes.find(
    (node) => node.tagName === "meta",
  );
  return Object.fromEntries(
    (node?.attrs ?? []).map((attribute) => [attribute.name, attribute.value]),
  );
}
function tag(text, name, lines) {
  const prefix = text.split(/\r?\n/).slice(0, lines).join("\n");
  const match = prefix.match(
    new RegExp("<!--\\s*@" + name + "\\b([\\s\\S]*?)-->"),
  );
  return match ? attributes(match[1]) : null;
}
function viewport(value, file, issues) {
  if (value && !/^[1-9]\d*x[1-9]\d*$/.test(value))
    issues.push(`Invalid viewport in ${file}: ${value}`);
  return value || "700x150";
}
export async function readSystemSource(root) {
  const files = await sourceFiles(root),
    issues = [],
    discovered = [],
    cards = [],
    starts = [];
  const types = await typeGraph(root, files);
  issues.push(...types.issues);
  const exportsGraph = exportGraph(root, types.parsed);
  issues.push(...exportsGraph.issues);
  let spec;
  if (await exists(path.join(root, "system.json")))
    spec = await readJson(await safeFile(root, "system.json"));
  else {
    let css;
    for (const name of [
      "styles.css",
      "index.css",
      "globals.css",
      "global.css",
      "main.css",
      "theme.css",
      "app.css",
      "tokens.css",
    ]) {
      css = files
        .filter((file) => path.basename(file) === name)
        .sort(
          (a, b) =>
            a.split(path.sep).length - b.split(path.sep).length ||
            a.localeCompare(b),
        )[0];
      if (css) break;
    }
    if (!css && (await exists(path.join(root, "_ds_manifest.json")))) {
      const previous = await readJson(
        await safeFile(root, "_ds_manifest.json"),
      );
      const hint = Array.isArray(previous.globalCssPaths)
        ? previous.globalCssPaths.at(-1)
        : null;
      if (typeof hint === "string" && files.includes(hint)) css = hint;
    }
    const readme = files.find((file) => /^(?:readme)\.md$/i.test(file));
    const guidance = readme
      ? await fs.readFile(path.join(root, readme), "utf8")
      : "";
    spec = {
      schemaVersion: 1,
      name: guidance.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(root),
      slug: slug(path.basename(root)),
      css,
      components: [],
      startingPoints: [],
      guidance,
    };
  }
  if (!Array.isArray(spec.components ?? []))
    issues.push("components must be an array");
  if (!Array.isArray(spec.startingPoints ?? []))
    issues.push("startingPoints must be an array");
  const typedSources = new Set();
  for (const file of files.filter(
    (file) => /\.(?:jsx|tsx|js|ts)$/.test(file) && !file.endsWith(".d.ts"),
  )) {
    const source = types.parsed.get(file);
    const dtsPath = file.replace(/\.(?:jsx|tsx|js|ts)$/, ".d.ts");
    let getContract = () => null,
      startTag = null;
    if (files.includes(dtsPath)) {
      typedSources.add(dtsPath);
      const declaration = types.parsed.get(dtsPath);
      getContract = types.contracts(dtsPath);
      for (const node of declaration.statements) {
        const value = docTag(node, "startingPoint");
        if (value != null) {
          startTag = attributes(value);
          break;
        }
      }
    }
    const exports = namedExports(source);
    const usagePath = file.replace(/\.(?:jsx|tsx|js|ts)$/, ".prompt.md");
    const usage = files.includes(usagePath)
      ? await fs.readFile(path.join(root, usagePath), "utf8")
      : "";
    for (const exported of exports) {
      if (
        exportsGraph.forwarded.get(file)?.has(exported.name) ||
        exportsGraph.suppressed.get(file)?.has(exported.name)
      )
        continue;
      const contract =
        getContract(exported.name + "Props") ?? getContract(exported.name);
      discovered.push({
        ...exported,
        sourcePath: file,
        ...(contract ? { contract: { ...contract, path: dtsPath } } : {}),
        ...(usage ? { usage, usagePath } : {}),
      });
    }
    if (startTag) {
      const stem = path.basename(file).replace(/\.(?:jsx|tsx|js|ts)$/, ""),
        eligible = [
          ...exports.filter(
            (item) => !exportsGraph.suppressed.get(file)?.has(item.name),
          ),
          ...exportsGraph.aliases.filter((alias) => alias.via === file),
        ].filter((item) => item.kind !== "constant");
      const primary =
        eligible.find((item) => item.name === stem) ?? eligible[0];
      if (!primary)
        issues.push(
          `A component starting point has no named component export: ${file}`,
        );
      else
        starts.push({
          name: primary.name,
          component: primary.name,
          path: file,
          kind: "component",
          section: startTag.section ?? "",
          subtitle: startTag.subtitle ?? "",
          viewport: viewport(startTag.viewport, file, issues),
        });
    }
  }
  for (const declaration of files.filter((file) => file.endsWith(".d.ts")))
    if (!typedSources.has(declaration) && !types.reached.has(declaration))
      issues.push(
        `Orphan declaration without a sibling source: ${declaration}`,
      );
  for (const file of files.filter((file) => file.endsWith(".html"))) {
    const text = await fs.readFile(path.join(root, file), "utf8"),
      card = tag(text, "dsCard", 4),
      start = tag(text, "startingPoint", 6);
    if (card)
      cards.push({
        path: file,
        group: card.group || "Other",
        name: card.name || path.basename(file),
        subtitle: card.subtitle ?? "",
        viewport: viewport(card.viewport, file, issues),
      });
    if (start)
      starts.push({
        path: file,
        sourcePath: file,
        kind: "screen",
        name:
          start.name ||
          (path.dirname(file) === "."
            ? path.basename(file, ".html")
            : path.basename(path.dirname(file))),
        section: start.section ?? "",
        subtitle: start.subtitle ?? "",
        viewport: viewport(start.viewport, file, issues),
      });
  }
  cards.sort(
    (a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path),
  );
  for (const start of starts.filter((start) => start.kind === "component"))
    start.previewPath =
      cards.find((card) => path.dirname(card.path) === path.dirname(start.path))
        ?.path ?? null;
  const components = new Map();
  for (const item of discovered) {
    if (components.has(item.name))
      issues.push(
        `Duplicate component export ${item.name}: ${components.get(item.name).sourcePath}, ${item.sourcePath}`,
      );
    else components.set(item.name, item);
  }
  for (const alias of exportsGraph.aliases) {
    const owner = discovered.find(
      (component) =>
        !alias.moduleNamespace &&
        component.sourcePath === alias.sourcePath &&
        component.export === alias.export,
    );
    const { via, ...api } = alias;
    const existing = components.get(alias.name);
    if (
      existing &&
      (existing.sourcePath !== alias.sourcePath ||
        existing.export !== alias.export ||
        !!existing.moduleNamespace !== !!alias.moduleNamespace)
    ) {
      issues.push(
        `Duplicate component export ${alias.name}: ${existing.sourcePath}, ${alias.sourcePath}`,
      );
      continue;
    }
    const declarationPath = via.replace(/\.(?:jsx|tsx|js|ts)$/, ".d.ts");
    const contract = files.includes(declarationPath)
      ? (types.contracts(declarationPath)(alias.name + "Props") ??
        types.contracts(declarationPath)(alias.name))
      : null;
    const usagePath = via.replace(/\.(?:jsx|tsx|js|ts)$/, ".prompt.md");
    const usage = files.includes(usagePath)
      ? await fs.readFile(path.join(root, usagePath), "utf8")
      : null;
    components.set(alias.name, {
      ...owner,
      ...existing,
      kind:
        existing?.kind ??
        owner?.kind ??
        (/^[A-Z_\d]+$/.test(alias.name) ? "constant" : "component"),
      ...api,
      ...(contract ? { contract: { ...contract, path: declarationPath } } : {}),
      ...(usage != null ? { usage, usagePath } : {}),
      reexports: [
        ...(existing?.reexports ?? []),
        { path: via, export: alias.name },
      ],
    });
  }
  const explicitNames = new Set();
  for (const explicit of Array.isArray(spec.components)
    ? spec.components
    : []) {
    if (!explicit || typeof explicit !== "object") {
      issues.push("Component entries must be objects");
      continue;
    }
    if (explicitNames.has(explicit.name))
      issues.push(`Duplicate component: ${explicit.name}`);
    explicitNames.add(explicit.name);
    const existing =
      components.get(explicit.export ?? explicit.name) ??
      (explicit.export === "default"
        ? [...components.values()].find(
            (component) =>
              (component.export === "default" ||
                component.name === explicit.name) &&
              component.sourcePath === (explicit.sourcePath ?? spec.entry),
          )
        : undefined);
    components.set(explicit.name, {
      ...existing,
      ...explicit,
      ...(!explicit.sourcePath && !existing && spec.entry
        ? { sourcePath: spec.entry }
        : {}),
    });
  }
  const explicitStarts = Array.isArray(spec.startingPoints)
    ? spec.startingPoints
    : [];
  const paths = new Set(explicitStarts.map((start) => start.path));
  const startingPoints = [
    ...explicitStarts.map((start) => ({
      ...start,
      kind: start.kind ?? "screen",
    })),
    ...starts.filter((start) => !paths.has(start.path)),
  ];
  return {
    spec: { ...spec, components: [...components.values()], startingPoints },
    cards,
    issues,
    sourceFiles: files,
    declarations: types.declarations,
    warnings: [...types.warnings, ...exportsGraph.warnings],
  };
}
