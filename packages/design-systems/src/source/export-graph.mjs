import path from "node:path";
import ts from "typescript";
import { namedExports } from "./contracts.mjs";

export function exportGraph(root, parsed) {
  const sources = new Map(
    [...parsed]
      .filter(([file]) => /\.(?:jsx|tsx|js|ts)$/.test(file))
      .map(([file, source]) => [path.join(root, file), source]),
  );
  const issues = new Set(),
    warnings = new Set();
  function dependency(name, file) {
    if (!name.startsWith(".") && !path.isAbsolute(name)) return null;
    const base = path.resolve(path.dirname(file), name);
    if (!base.startsWith(root + path.sep)) {
      issues.add(
        `Escaping source dependency: ${name} (in ${path.relative(root, file)})`,
      );
      return null;
    }
    const stem = base.replace(/\.(?:jsx|tsx|js|ts)$/, "");
    const candidates = [
      base,
      ...[".tsx", ".ts", ".jsx", ".js", ".d.ts"].map((ext) => stem + ext),
      ...["index.tsx", "index.ts", "index.jsx", "index.js", "index.d.ts"].map(
        (name) => path.join(base, name),
      ),
    ];
    const found = candidates.find((file) => sources.has(file));
    if (!found && (!path.extname(name) || /\.(?:jsx|tsx|js|ts)$/.test(name)))
      issues.add(
        `Missing local source dependency: ${name} (in ${path.relative(root, file)})`,
      );
    return found ?? null;
  }
  const options = {
    noEmit: true,
    noLib: true,
    allowJs: true,
    checkJs: true,
    typeRoots: [],
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.Preserve,
  };
  const host = ts.createCompilerHost(options);
  host.getCurrentDirectory = () => root;
  host.fileExists = (file) => sources.has(file);
  host.readFile = (file) => sources.get(file)?.text;
  host.getSourceFile = (file, version) =>
    sources.has(file)
      ? ts.createSourceFile(file, sources.get(file).text, version, true)
      : undefined;
  host.resolveModuleNames = (names, file) =>
    names.map((name) => {
      const target = dependency(name, file);
      if (!target) return undefined;
      return {
        resolvedFileName: target,
        extension: target.endsWith(".d.ts")
          ? ts.Extension.Dts
          : target.endsWith(".tsx")
            ? ts.Extension.Tsx
            : target.endsWith(".jsx")
              ? ts.Extension.Jsx
              : target.endsWith(".js")
                ? ts.Extension.Js
                : ts.Extension.Ts,
      };
    });
  const program = ts.createProgram([...sources.keys()], options, host),
    checker = program.getTypeChecker();
  const moduleExports = (file) => {
    const source = program.getSourceFile(file),
      symbol = source && checker.getSymbolAtLocation(source);
    return symbol ? checker.getExportsOfModule(symbol) : [];
  };
  const resolved = (symbol) =>
    symbol?.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const typeOnly = (node) => {
    for (; node && !ts.isSourceFile(node); node = node.parent)
      if (node.isTypeOnly) return true;
    return false;
  };
  function typeOnlySymbol(symbol) {
    return (
      symbol?.declarations?.some((declaration) => {
        if (typeOnly(declaration)) return true;
        if (
          ts.isExportSpecifier(declaration) &&
          !declaration.parent.parent.moduleSpecifier
        )
          return checker
            .getExportSpecifierLocalTargetSymbol(declaration)
            ?.declarations?.some(typeOnly);
        return false;
      }) ?? false
    );
  }
  function valueExport(file, name, seen = new Set()) {
    const key = file + ":" + name;
    if (seen.has(key)) return false;
    seen.add(key);
    const source = program.getSourceFile(file);
    if (!source || file.endsWith(".d.ts")) return false;
    const symbol = moduleExports(file).find((symbol) => symbol.name === name),
      target = resolved(symbol);
    if (!target || !(target.flags & ts.SymbolFlags.Value)) return false;
    for (const node of source.statements) {
      if (
        ts.isExportAssignment(node) &&
        !node.isExportEquals &&
        name === "default"
      )
        return true;
      if (ts.isExportDeclaration(node)) {
        if (node.isTypeOnly) continue;
        const clause = node.exportClause;
        if (clause && ts.isNamedExports(clause)) {
          const entry = clause.elements.find(
            (entry) => entry.name.text === name,
          );
          if (!entry || entry.isTypeOnly) continue;
          if (!node.moduleSpecifier) {
            if (typeOnlySymbol(symbol)) return false;
            const local = checker.getExportSpecifierLocalTargetSymbol(entry);
            const binding = local?.declarations?.find(
              (node) =>
                ts.isImportSpecifier(node) ||
                ts.isImportClause(node) ||
                ts.isNamespaceImport(node),
            );
            if (!binding) return true;
            if (typeOnly(binding)) return false;
            let imported = binding.parent;
            while (imported && !ts.isImportDeclaration(imported))
              imported = imported.parent;
            const next =
              imported && dependency(imported.moduleSpecifier.text, file);
            if (!next) return false;
            return (
              ts.isNamespaceImport(binding) ||
              valueExport(
                next,
                ts.isImportSpecifier(binding)
                  ? (binding.propertyName ?? binding.name).text
                  : "default",
                new Set(seen),
              )
            );
          }
          const next = dependency(node.moduleSpecifier.text, file);
          if (
            next &&
            valueExport(
              next,
              (entry.propertyName ?? entry.name).text,
              new Set(seen),
            )
          )
            return true;
        } else if (
          clause &&
          ts.isNamespaceExport(clause) &&
          clause.name.text === name
        )
          return true;
        else if (!clause && name !== "default") {
          const next = dependency(node.moduleSpecifier.text, file);
          if (next && valueExport(next, name, new Set(seen))) return true;
        }
      } else if (
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ) &&
        !ts.isInterfaceDeclaration(node) &&
        !ts.isTypeAliasDeclaration(node)
      ) {
        const isDefault = node.modifiers.some(
          (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
        );
        if (isDefault && name === "default") return true;
        if (
          !isDefault &&
          target.declarations?.some(
            (declaration) =>
              declaration.getSourceFile() === source &&
              declaration.pos >= node.pos &&
              declaration.end <= node.end,
          )
        )
          return true;
      }
    }
    return false;
  }
  const aliases = [],
    forwarded = new Map(),
    suppressed = new Map();
  for (const [file] of sources) {
    if (file.endsWith(".d.ts")) continue;
    const source = program.getSourceFile(file),
      relative = path.relative(root, file);
    for (const diagnostic of program.getSemanticDiagnostics(source))
      if ([2308, 2305, 2459, 2460].includes(diagnostic.code)) {
        if (typeOnly(ts.getTokenAtPosition(source, diagnostic.start ?? 0)))
          continue;
        const position = source.getLineAndCharacterOfPosition(
          diagnostic.start ?? 0,
        );
        issues.add(
          `${relative}:${position.line + 1}:${position.character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
        );
      }
    for (const node of source.statements) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        !node.isTypeOnly &&
        !node.importClause?.isTypeOnly &&
        node.moduleSpecifier
      ) {
        const bindings = node.exportClause ?? node.importClause?.namedBindings;
        const onlyTypes =
          !node.importClause?.name &&
          bindings?.elements?.length &&
          bindings.elements.every((entry) => {
            const symbol = resolved(checker.getSymbolAtLocation(entry.name));
            return (
              entry.isTypeOnly ||
              (symbol &&
                symbol.name !== "unknown" &&
                !(symbol.flags & ts.SymbolFlags.Value))
            );
          });
        const target =
          !onlyTypes && dependency(node.moduleSpecifier.text, file);
        if (target && target.endsWith(".d.ts"))
          issues.add(
            `Runtime module has declarations but no implementation: ${node.moduleSpecifier.text} (in ${relative})`,
          );
      }
      if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.moduleSpecifier &&
        !node.moduleSpecifier.text.startsWith(".") &&
        !path.isAbsolute(node.moduleSpecifier.text)
      )
        warnings.add(
          `External runtime export inventory is unavailable: ${node.moduleSpecifier.text} (in ${relative}). Localize the source to discover its public values.`,
        );
      if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      )
        for (const element of node.exportClause.elements) {
          if (element.isTypeOnly) continue;
          const symbol = checker.getSymbolAtLocation(element.name),
            target = resolved(symbol);
          if (!target || target.name === "unknown") {
            const message = `Unresolved runtime re-export ${element.name.text} in ${relative}`;
            if (node.moduleSpecifier?.text.startsWith(".")) issues.add(message);
            else warnings.add(message);
          }
        }
    }
    for (const symbol of moduleExports(file)) {
      const target = resolved(symbol);
      if (
        typeOnlySymbol(symbol) ||
        (target?.name !== "unknown" &&
          target?.flags & ts.SymbolFlags.Value &&
          !valueExport(file, symbol.name))
      ) {
        if (!suppressed.has(relative)) suppressed.set(relative, new Set());
        suppressed.get(relative).add(symbol.name);
        continue;
      }
      if (!/^[A-Z][\w$]*$/.test(symbol.name) || !valueExport(file, symbol.name))
        continue;
      const declaration = target.valueDeclaration ?? target.declarations?.[0];
      if (!declaration) continue;
      const ownerFile = declaration.getSourceFile().fileName;
      const namespace = ts.isSourceFile(declaration);
      if (namespace) {
        aliases.push({
          name: symbol.name,
          sourcePath: path.relative(root, ownerFile),
          export: symbol.name,
          local: null,
          kind: "constant",
          moduleNamespace: true,
          via: relative,
        });
        if (!forwarded.has(relative)) forwarded.set(relative, new Set());
        forwarded.get(relative).add(symbol.name);
        continue;
      }
      const ownerSource = program.getSourceFile(ownerFile);
      if (!ownerSource || !sources.has(ownerFile)) continue;
      const owners = moduleExports(ownerFile).filter(
        (owner) =>
          resolved(owner) === target && valueExport(ownerFile, owner.name),
      );
      const authored = namedExports(ownerSource).find((item) =>
        owners.some((owner) => owner.name === item.export),
      );
      const exported = authored?.export ?? owners[0]?.name;
      if (!exported) continue;
      if (ownerFile === file && authored?.name === symbol.name) continue;
      const alias = {
        name: symbol.name,
        sourcePath: path.relative(root, ownerFile),
        export: exported,
        local: authored?.local ?? declaration.name?.text ?? null,
        ...(authored ? { kind: authored.kind } : {}),
        via: relative,
      };
      aliases.push(alias);
      if (!forwarded.has(relative)) forwarded.set(relative, new Set());
      forwarded.get(relative).add(symbol.name);
    }
  }
  return {
    aliases,
    forwarded,
    suppressed,
    issues: [...issues],
    warnings: [...warnings],
  };
}
