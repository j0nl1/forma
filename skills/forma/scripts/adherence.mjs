#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { parse } from "parse5";
import { args, main, exists } from "./lib/files.mjs";
import { compiledSystem } from "./lib/system-manifest.mjs";
import { wiring } from "./lib/system-bindings.mjs";
import { inspectAdherenceUnit } from "./lib/adherence-source.mjs";
import { adherencePolicy } from "./lib/system-adherence.mjs";

async function systemsFor(root) {
  root = await fs.realpath(root);
  const folders = (await exists(path.join(root, "_ds_manifest.json")))
    ? [root]
    : (await wiring(root)).systems.map((system) =>
        path.join(root, "_ds", system.slug),
      );
  if (!folders.length)
    throw new Error("No compiled design systems are selected.");
  return Promise.all(
    folders.map(async (folder) => {
      const compiled = await compiledSystem(folder),
        m = compiled.manifest;
      const policy = m.adherence
        ? JSON.parse(compiled.files.get(m.adherence)?.toString() ?? "null")
        : adherencePolicy(
            {
              spec: m,
              tokens: m.tokens ?? {},
              tokenDetails: m.tokenDetails ?? [],
              fonts: m.fonts ?? [],
            },
            m.namespace,
          );
      if (
        policy?.schemaVersion !== 1 ||
        policy.slug !== m.slug ||
        policy.namespace !== m.namespace ||
        !Array.isArray(policy.components) ||
        !Array.isArray(policy.sourceDirectories) ||
        !Array.isArray(policy.publicEntries) ||
        !Array.isArray(policy.alwaysAllowedProps)
      )
        throw new Error("Invalid compiled adherence policy");
      for (const component of policy.components)
        if (
          typeof component.name !== "string" ||
          !Array.isArray(component.props) ||
          !Array.isArray(component.alternatives) ||
          !Array.isArray(component.signatures)
        )
          throw new Error("Invalid component adherence contract");
      return { ...compiled, policy };
    }),
  );
}
async function sourceFiles(input, systems) {
  const supported = (file) =>
    /\.(?:html?|jsx?|tsx?|[cm]js)$/.test(file) && !file.endsWith(".d.ts");
  const found = [];
  async function visit(file, explicit = false) {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink())
      throw new Error(`Adherence inputs must not be symlinks: ${file}`);
    if (stat.isDirectory()) {
      if (!explicit && systems.some((system) => system.root === file)) return;
      for (const item of (await fs.readdir(file)).sort())
        if (
          !["node_modules", ".git", "_ds"].includes(item) &&
          !item.startsWith("_ds_")
        )
          await visit(path.join(file, item));
    } else if (stat.isFile() && supported(file)) found.push(file);
    else if (explicit)
      throw new Error(
        "Adherence inputs must be JavaScript, TypeScript, JSX, TSX or HTML source.",
      );
  }
  await visit(path.resolve(input), true);
  if (!found.length)
    throw new Error("No supported authoring source files were found.");
  return found;
}
function sourceUnits(file, text) {
  if (!/\.html?$/.test(file)) return [{ file, original: file, text }];
  const parsed = parse(text, { sourceCodeLocationInfo: true }),
    classic = [],
    modules = [];
  function visit(node) {
    if (
      node.tagName === "script" &&
      !(node.attrs ?? []).some((attribute) => attribute.name === "src")
    ) {
      const type =
        (node.attrs ?? []).find((attribute) => attribute.name === "type")
          ?.value ?? "";
      if (
        [
          "",
          "text/javascript",
          "application/javascript",
          "text/babel",
          "text/jsx",
          "text/tsx",
          "module",
        ].includes(type)
      ) {
        const start = node.sourceCodeLocation.startTag.endOffset,
          end =
            node.sourceCodeLocation.endTag?.startOffset ??
            node.sourceCodeLocation.endOffset;
        (type === "module" ? modules : classic).push({ start, end });
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parsed);
  function padded(ranges) {
    let result = "",
      offset = 0;
    for (const range of ranges) {
      result += text.slice(offset, range.start).replace(/[^\r\n]/g, " ");
      result += text.slice(range.start, range.end);
      offset = range.end;
      if (offset < text.length) {
        result += ";";
        offset++;
      }
    }
    return result + text.slice(offset).replace(/[^\r\n]/g, " ");
  }
  return [
    ...(classic.length
      ? [{ file: file + ".classic.jsx", original: file, text: padded(classic) }]
      : []),
    ...modules.map((range, index) => ({
      file: file + `.module-${index}.jsx`,
      original: file,
      text: padded([range]),
    })),
  ];
}
export async function checkAdherence(root, input) {
  const systems = await systemsFor(root),
    files = await sourceFiles(input, systems),
    units = [];
  for (const file of files)
    units.push(...sourceUnits(file, await fs.readFile(file, "utf8")));
  const byName = new Map(units.map((unit) => [unit.file, unit]));
  const options = {
    noEmit: true,
    noLib: true,
    allowJs: true,
    typeRoots: [],
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.ESNext,
  };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (file, version) =>
    byName.has(file)
      ? ts.createSourceFile(
          file,
          byName.get(file).text + "\nexport {};",
          version,
          true,
        )
      : undefined;
  host.readFile = (file) => byName.get(file)?.text;
  host.fileExists = (file) => byName.has(file);
  host.resolveModuleNames = (names) => names.map(() => undefined);
  const program = ts.createProgram([...byName.keys()], options, host),
    checker = program.getTypeChecker(),
    diagnostics = [];
  for (const unit of units) {
    const source = program.getSourceFile(unit.file);
    const report = (node, diagnostic) => {
      const position = source.getLineAndCharacterOfPosition(
        typeof node === "number" ? node : node.getStart(source),
      );
      diagnostics.push({
        file: unit.original,
        line: position.line + 1,
        column: position.character + 1,
        ...diagnostic,
      });
    };
    for (const diagnostic of source.parseDiagnostics)
      report(diagnostic.start ?? 0, {
        severity: "error",
        rule: "syntax",
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
      });
    if (!source.parseDiagnostics.length)
      inspectAdherenceUnit(source, checker, systems, report);
  }
  diagnostics.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.column - b.column ||
      a.rule.localeCompare(b.rule),
  );
  const warnings = diagnostics.filter(
      (diagnostic) => diagnostic.severity === "warning",
    ).length,
    errors = diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    ).length,
    skipped = diagnostics.filter(
      (diagnostic) => diagnostic.severity === "skipped",
    ).length;
  return {
    ok: !errors && !warnings,
    advisory: true,
    systems: systems.map((system) => system.policy.slug),
    files,
    sourceUnits: units.length,
    warnings,
    errors,
    skipped,
    diagnostics,
    note: "Static adherence warnings do not prove visual fidelity. Dynamic values and spreads are reported as unchecked.",
  };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional, flags } = args(process.argv.slice(2), {
      "--strict": "boolean",
    });
    if (positional.length !== 2)
      throw new Error(
        "Usage: node adherence.mjs <compiled-system-or-bound-project> <source-file-or-folder> [--strict]",
      );
    const report = await checkAdherence(...positional);
    console.log(JSON.stringify(report, null, 2));
    if (report.errors) process.exitCode = 2;
    else if (flags.strict && report.warnings) process.exitCode = 1;
  });
