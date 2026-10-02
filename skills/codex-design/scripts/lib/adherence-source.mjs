import ts from "typescript";
import path from "node:path";
import { bindings } from "./adherence-bindings.mjs";
import { literal, objectProperties, unknown } from "./adherence-values.mjs";

export function inspectAdherenceUnit(source, checker, systems, report) {
  const { resolve, publicModule } = bindings(checker, systems, source.fileName);
  const warn = (node, rule, message, extra = {}) =>
    report(node, { severity: "warning", rule, message, ...extra });
  const skip = (node, message) =>
    report(node, { severity: "skipped", rule: "dynamic-input", message });
  function checkUse(tag, attributes, dynamic, node) {
    const binding = resolve(tag);
    if (binding?.kind === "ambiguous") {
      warn(
        node,
        "ambiguous-component",
        `Qualify ${binding.name} with its system namespace or public entry import.`,
      );
      return;
    }
    if (binding?.kind !== "component") return;
    const { system, name } = binding,
      contract = system.policy.components.find(
        (component) => component.name === name,
      );
    const props = new Map(
      attributes.map((attribute) => [attribute.name, attribute]),
    );
    const alternatives = contract.alternatives.filter((alternative) =>
      alternative.props.every(
        (property) =>
          !property.values ||
          property.optional ||
          !props.get(property.name)?.value.known ||
          property.values.includes(props.get(property.name).value.value),
      ),
    );
    const declared = alternatives.length
      ? alternatives.flatMap((alternative) => alternative.props)
      : contract.props;
    const allowed = new Set([
      ...system.policy.alwaysAllowedProps,
      ...declared.map((property) => property.name),
    ]);
    const open =
      contract.openProps ||
      contract.signatures.some((signature) =>
        /^\[.*:\s*string\]/.test(signature),
      );
    if (contract.openProps)
      skip(
        node,
        `${name} has unresolved inherited properties; its complete prop allowlist was not validated.`,
      );
    if (dynamic)
      skip(
        node,
        `Some ${name} spread properties are dynamic; only known properties are checked.`,
      );
    for (const attribute of attributes) {
      const choices = declared.filter(
        (property) => property.name === attribute.name,
      );
      const property = choices.length
        ? {
            ...choices[0],
            optional: choices.some((choice) => choice.optional),
            resolvedType: choices
              .map((choice) => choice.resolvedType ?? choice.type)
              .join(" | "),
            values: choices.every((choice) => choice.values?.length)
              ? [...new Set(choices.flatMap((choice) => choice.values))]
              : undefined,
          }
        : null;
      const extra = {
        system: system.policy.slug,
        component: name,
        property: attribute.name,
      };
      if (!open && !allowed.has(attribute.name))
        warn(
          attribute.node,
          "unknown-prop",
          `${name} does not accept ${attribute.name} in this contract.`,
          extra,
        );
      else if (property?.values?.length) {
        if (!attribute.value.known)
          skip(
            attribute.node,
            `${name}.${attribute.name} has a dynamic value; its variants were not validated.`,
          );
        else if (
          !(
            attribute.value.value === undefined &&
            (property.optional ||
              /\bundefined\b/.test(property.resolvedType ?? property.type))
          ) &&
          !property.values.includes(attribute.value.value)
        )
          warn(
            attribute.node,
            "invalid-variant",
            `${name}.${attribute.name} must be one of ${property.values.map((value) => JSON.stringify(value)).join(", ")}.`,
            {
              ...extra,
              value: attribute.value.value,
              expected: property.values,
            },
          );
      }
    }
  }
  function restrictedImport(node, specifier) {
    if (
      path.basename(source.fileName) === "index.js" ||
      publicModule(specifier)
    )
      return;
    const normalized = specifier
      .replace(/\\/g, "/")
      .replace(/^(?:\.\.\/|\.\/)+/, "");
    const bare = !specifier.startsWith(".") && !path.isAbsolute(specifier);
    for (const system of systems) {
      const absolute = path.resolve(path.dirname(source.fileName), specifier);
      if (
        system.policy.sourceDirectories.some(
          (directory) =>
            (bare &&
              normalized.startsWith(directory.replace(/\\/g, "/") + "/")) ||
            absolute.startsWith(path.join(system.root, directory) + path.sep),
        )
      ) {
        warn(
          node,
          "internal-import",
          `Use ${system.policy.slug}'s public entry instead of component internals.`,
          { system: system.policy.slug },
        );
        break;
      }
    }
  }
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (/#[0-9a-f]{3,8}\b/i.test(node.text))
        warn(
          node,
          "raw-color",
          "Use a declared design-system color token instead of a raw hex color.",
        );
      if (/\b\d+px\b/.test(node.text))
        warn(
          node,
          "raw-length",
          "Use a declared design-system spacing token instead of a raw pixel length.",
        );
    }
    if (
      ts.isImportDeclaration(node) ||
      (ts.isExportDeclaration(node) && node.moduleSpecifier)
    )
      restrictedImport(node.moduleSpecifier, node.moduleSpecifier.text);
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const props = new Map();
      let dynamic = false;
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) {
          const result = objectProperties(attribute.expression, checker);
          dynamic ||= result.dynamic;
          if (result.dynamic)
            for (const [name, property] of props)
              props.set(name, { ...property, value: unknown });
          for (const property of result.properties)
            props.set(property.name, property);
        } else {
          const value = !attribute.initializer
            ? { known: true, value: true }
            : ts.isJsxExpression(attribute.initializer)
              ? literal(attribute.initializer.expression, checker)
              : literal(attribute.initializer, checker);
          props.set(attribute.name.getText(source), {
            name: attribute.name.getText(source),
            node: attribute,
            value,
          });
        }
      }
      checkUse(node.tagName, [...props.values()], dynamic, node);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        resolve(callee)?.kind === "create-element" &&
        node.arguments.length >= 2
      ) {
        const props = objectProperties(node.arguments[1], checker);
        checkUse(node.arguments[0], props.properties, props.dynamic, node);
      }
      if (
        (callee.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(callee) &&
            callee.text === "require" &&
            !checker.getSymbolAtLocation(callee))) &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        restrictedImport(node.arguments[0], node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
