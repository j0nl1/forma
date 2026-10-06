import path from "node:path";
import ts from "typescript";
import { unwrap, literal, initializer } from "./values.mjs";

const runtimeNames = new Set([
  "React",
  "ReactDOM",
  "createRoot",
  "hydrateRoot",
  "Components",
  "default",
]);
export function bindings(checker, systems, filename) {
  const publicModule = (specifier) =>
    systems.find((system) =>
      system.policy.publicEntries.some(
        (entry) =>
          path.resolve(path.dirname(filename), specifier) ===
          path.join(system.root, entry),
      ),
    );
  const component = (system, name) =>
    system.policy.components.find((component) => component.name === name)
      ? { kind: "component", system, name }
      : null;
  const internalModule = (specifier) =>
    systems.find((system) =>
      system.policy.components.some(
        (component) =>
          component.sourcePath &&
          path.resolve(path.dirname(filename), specifier) ===
            path.join(system.root, component.sourcePath),
      ),
    );
  function member(base, name) {
    if (!base) return null;
    if (base.kind === "ambiguous")
      return { ...base, name: base.name + "." + name };
    if (base.kind === "global") {
      if (name === "React") return { kind: "react" };
      if (name === "CodexDesignSystems") return { kind: "registry" };
      if (name === "CodexDesignSystem" && systems.length === 1)
        return { kind: "system", system: systems[0] };
      const system = systems.find((system) => system.policy.namespace === name);
      if (system) return { kind: "system", system };
      const legacy = systems.filter((system) =>
        system.policy.sourceNamespaces?.includes(name),
      );
      if (legacy.length === 1) return { kind: "components", system: legacy[0] };
      if (legacy.length > 1) return { kind: "ambiguous", name };
    }
    if (base.kind === "registry") {
      const system = systems.find((system) => system.policy.slug === name);
      if (system) return { kind: "system", system };
    }
    if (base.kind === "system" && name === "Components")
      return { kind: "components", system: base.system };
    if (base.kind === "system" && name === "React") return { kind: "react" };
    if (base.kind === "react" && name === "createElement")
      return { kind: "create-element" };
    if (base.kind === "exports") {
      if (name === "default") return { kind: "system", system: base.system };
      if (name === "Components")
        return { kind: "components", system: base.system };
      if (name === "React") return { kind: "react" };
      if (runtimeNames.has(name)) return null;
    }
    if (["components", "exports"].includes(base.kind))
      return component(base.system, name);
    if (base.kind === "source-exports") {
      const exported = base.system.policy.components.find(
        (component) => component.sourceExport === name,
      );
      return exported ? component(base.system, exported.name) : null;
    }
    return null;
  }
  function resolve(node, seen = new Set()) {
    node = unwrap(node);
    if (!node || seen.has(node)) return null;
    seen.add(node);
    if (ts.isPropertyAccessExpression(node))
      return member(resolve(node.expression, seen), node.name.text);
    if (ts.isElementAccessExpression(node)) {
      const key = literal(node.argumentExpression, checker);
      return key.known
        ? member(resolve(node.expression, seen), String(key.value))
        : null;
    }
    if (!ts.isIdentifier(node)) return null;
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol) {
      if (["window", "self", "globalThis"].includes(node.text))
        return { kind: "global" };
      if (node.text === "React") return { kind: "react" };
      const matches = systems.filter((system) =>
        system.manifest.components.some(
          (component) =>
            component.kind !== "constant" && component.name === node.text,
        ),
      );
      if (matches.length === 1) return component(matches[0], node.text);
      if (matches.length > 1) return { kind: "ambiguous", name: node.text };
      return null;
    }
    for (const declaration of symbol.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration))
        return resolve(initializer(node, checker, true), seen);
      if (ts.isBindingElement(declaration)) {
        let pattern = declaration.parent;
        if (!ts.isObjectBindingPattern(pattern)) return null;
        const key = declaration.propertyName?.text ?? declaration.name.text;
        let base;
        if (ts.isVariableDeclaration(pattern.parent))
          base = resolve(pattern.parent.initializer, seen);
        else if (ts.isBindingElement(pattern.parent)) {
          // Nested object bindings are resolved through the owning declaration.
          const outer = pattern.parent,
            outerPattern = outer.parent;
          if (
            ts.isObjectBindingPattern(outerPattern) &&
            ts.isVariableDeclaration(outerPattern.parent)
          )
            base = member(
              resolve(outerPattern.parent.initializer, seen),
              outer.propertyName?.text ?? "Components",
            );
        }
        return member(base, key);
      }
      if (ts.isImportSpecifier(declaration)) {
        const specifier = declaration.parent.parent.parent.moduleSpecifier.text;
        if (
          specifier === "react" &&
          (declaration.propertyName?.text ?? declaration.name.text) ===
            "createElement"
        )
          return { kind: "create-element" };
        const system = publicModule(specifier),
          internal = internalModule(specifier);
        if (system) {
          const name = declaration.propertyName?.text ?? declaration.name.text;
          if (name === "Components") return { kind: "components", system };
          if (name === "React") return { kind: "react" };
          return runtimeNames.has(name) ? null : component(system, name);
        }
        if (internal)
          return member(
            { kind: "source-exports", system: internal },
            declaration.propertyName?.text ?? declaration.name.text,
          );
      }
      if (ts.isNamespaceImport(declaration) || ts.isImportClause(declaration)) {
        const imported = ts.isNamespaceImport(declaration)
          ? declaration.parent.parent
          : declaration.parent;
        if (imported.moduleSpecifier.text === "react") return { kind: "react" };
        const system = publicModule(imported.moduleSpecifier.text);
        if (system)
          return {
            kind: ts.isNamespaceImport(declaration) ? "exports" : "system",
            system,
          };
      }
    }
    return null;
  }
  return { resolve, publicModule };
}
