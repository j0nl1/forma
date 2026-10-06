import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { sourceAST } from "./contracts.mjs";
import { typedContracts } from "./type-contracts.mjs";

export async function typeGraph(root, files) {
  const originals = new Map(),
    parsed = new Map(),
    issues = new Set(),
    warnings = new Set();
  for (const file of files.filter((file) =>
    /\.(?:[cm]?tsx?|jsx?)$/.test(file),
  )) {
    const text = await fs.promises.readFile(path.join(root, file), "utf8");
    originals.set(path.join(root, file), text);
    const result = sourceAST(file, text);
    parsed.set(file, result.source);
    result.issues.forEach((issue) => issues.add(issue));
  }
  const roots = files.filter(
    (file) =>
      file.endsWith(".d.ts") &&
      files.some(
        (source) =>
          /\.(?:jsx|tsx|js|ts)$/.test(source) &&
          !source.endsWith(".d.ts") &&
          source.replace(/\.(?:jsx|tsx|js|ts)$/, ".d.ts") === file,
      ),
  );
  const reached = new Set(),
    edges = new Map();
  function dependency(specifier, containingFile) {
    if (path.isAbsolute(specifier) || /^[a-z]:[\\/]/i.test(specifier)) {
      issues.add(
        `Escaping type dependency: ${specifier} (in ${path.relative(root, containingFile)})`,
      );
      return undefined;
    }
    if (!specifier.startsWith(".")) {
      warnings.add(
        `External type dependency is unavailable: ${specifier} (in ${path.relative(root, containingFile)}). Localize its declarations to resolve the full contract.`,
      );
      return undefined;
    }
    const base = path.resolve(path.dirname(containingFile), specifier);
    if (!base.startsWith(root + path.sep)) {
      issues.add(
        `Escaping type dependency: ${specifier} (in ${path.relative(root, containingFile)})`,
      );
      return undefined;
    }
    const stem = base.replace(/\.(?:[cm]?js|jsx|[cm]?tsx?)$/, "");
    const candidates = base.endsWith(".d.ts")
      ? [base]
      : [
          ...[".ts", ".tsx", ".d.ts", ".mts", ".cts", ".js", ".jsx"].map(
            (ext) => stem + ext,
          ),
          ...["index.ts", "index.tsx", "index.d.ts"].map((file) =>
            path.join(base, file),
          ),
        ];
    const found = candidates.find((file) => originals.has(file));
    if (!found)
      issues.add(
        `Missing local type dependency: ${specifier} (in ${path.relative(root, containingFile)})`,
      );
    return found;
  }
  function visit(file) {
    if (reached.has(file)) return;
    reached.add(file);
    const source = parsed.get(file),
      next = new Set();
    const info = ts.preProcessFile(source.text, true, true);
    for (const imported of info.importedFiles) {
      const resolved = dependency(imported.fileName, path.join(root, file));
      if (resolved) next.add(path.relative(root, resolved));
    }
    for (const reference of info.referencedFiles) {
      const specifier = reference.fileName.startsWith(".")
        ? reference.fileName
        : "./" + reference.fileName;
      const resolved = dependency(specifier, path.join(root, file));
      if (resolved) next.add(path.relative(root, resolved));
    }
    edges.set(file, next);
    for (const file of next) visit(file);
  }
  roots.forEach(visit);
  const declarations = Object.fromEntries(
    [...reached]
      .filter((file) => file.endsWith(".d.ts"))
      .sort()
      .map((file) => [file, originals.get(path.join(root, file))]),
  );
  if (!roots.length)
    return {
      parsed,
      declarations,
      reached,
      issues: [...issues],
      warnings: [...warnings],
      contracts: () => () => null,
    };
  const options = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    strictNullChecks: true,
    allowJs: true,
    typeRoots: [],
    lib: ["lib.es5.d.ts"],
  };
  const library = path.dirname(
    fileURLToPath(import.meta.resolve("typescript")),
  );
  const isLibrary = (file) =>
    path.dirname(file) === library &&
    /^lib\.[\w.]+\.d\.ts$/.test(path.basename(file));
  const host = ts.createCompilerHost(options);
  host.getCurrentDirectory = () => root;
  host.fileExists = (file) =>
    originals.has(file) || (isLibrary(file) && fs.existsSync(file));
  host.readFile = (file) =>
    originals.get(file) ??
    (isLibrary(file) ? fs.readFileSync(file, "utf8") : undefined);
  host.getSourceFile = (file, languageVersion) => {
    let text = host.readFile(file);
    if (text === undefined) return undefined;
    // Declaration siblings without exports must not merge private names across components.
    if (
      originals.has(file) &&
      file.endsWith(".d.ts") &&
      !ts.isExternalModule(parsed.get(path.relative(root, file)))
    )
      text += "\nexport {};";
    return ts.createSourceFile(file, text, languageVersion, true);
  };
  host.resolveModuleNames = (names, file) =>
    names.map((name) => {
      const resolved = dependency(name, file);
      if (!resolved) return undefined;
      const extension = resolved.endsWith(".d.ts")
        ? ts.Extension.Dts
        : resolved.endsWith(".tsx")
          ? ts.Extension.Tsx
          : resolved.endsWith(".jsx")
            ? ts.Extension.Jsx
            : resolved.endsWith(".js")
              ? ts.Extension.Js
              : ts.Extension.Ts;
      return { resolvedFileName: resolved, extension };
    });
  const program = ts.createProgram(
      roots.map((file) => path.join(root, file)),
      options,
      host,
    ),
    checker = program.getTypeChecker();
  for (const file of reached) {
    const source = program.getSourceFile(path.join(root, file));
    if (!source || !file.endsWith(".d.ts")) continue;
    for (const diagnostic of program.getSemanticDiagnostics(source)) {
      const position = source.getLineAndCharacterOfPosition(
        diagnostic.start ?? 0,
      );
      const message = `${file}:${position.line + 1}:${position.character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
      // Unlocalized namespaces/packages retain authored types with explicit advisories.
      if ([2304, 2307, 2503, 2688, 2792].includes(diagnostic.code))
        warnings.add(message);
      else issues.add(message);
    }
  }
  function dependencies(file) {
    const found = new Set([file]);
    function visit(file) {
      for (const next of edges.get(file) ?? [])
        if (!found.has(next)) {
          found.add(next);
          visit(next);
        }
    }
    visit(file);
    return [...found].filter((entry) => entry !== file).sort();
  }
  return {
    parsed,
    declarations,
    reached,
    issues: [...issues],
    warnings: [...warnings],
    contracts: (file) =>
      typedContracts(
        checker,
        program.getSourceFile(path.join(root, file)),
        root,
        originals.get(path.join(root, file)),
        dependencies(file),
      ),
  };
}
