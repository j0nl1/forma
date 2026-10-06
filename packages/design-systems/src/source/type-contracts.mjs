import path from "node:path";
import ts from "typescript";
import { description, docTag } from "./contracts.mjs";

function literalValues(type, checker, seen = new Set()) {
  if (!type || seen.has(type)) return null;
  seen.add(type);
  if (type.flags & ts.TypeFlags.TypeParameter)
    return literalValues(checker.getBaseConstraintOfType(type), checker, seen);
  const parts = type.isUnion() ? type.types : [type];
  const values = [];
  for (const part of parts) {
    if (part.flags & ts.TypeFlags.Undefined) continue;
    if (part.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral))
      values.push(part.value);
    else if (part.flags & ts.TypeFlags.BooleanLiteral)
      values.push(part.intrinsicName === "true");
    else if (part.flags & ts.TypeFlags.Null) values.push(null);
    else return null;
  }
  return values.length ? [...new Set(values)] : null;
}
function mappedReadonly(type, name, checker) {
  if (type.isIntersection()) {
    const decisions = type.types
      .filter((part) => checker.getPropertyOfType(part, name))
      .map((part) => mappedReadonly(part, name, checker));
    return decisions.includes(true)
      ? true
      : decisions.includes(false)
        ? false
        : undefined;
  }
  const token = type.declaration?.readonlyToken;
  return token ? token.kind !== ts.SyntaxKind.MinusToken : undefined;
}
function authoredOrder(node, checker, seen = new Set()) {
  if (!node || seen.has(node)) return [];
  seen.add(node);
  if (ts.isParenthesizedTypeNode(node))
    return authoredOrder(node.type, checker, seen);
  if (ts.isUnionTypeNode(node))
    return node.types.flatMap((child) =>
      authoredOrder(child, checker, new Set(seen)),
    );
  if (ts.isTypeReferenceNode(node)) {
    let symbol = checker.getSymbolAtLocation(node.typeName);
    if (symbol?.flags & ts.SymbolFlags.Alias)
      symbol = checker.getAliasedSymbol(symbol);
    const declaration = symbol?.declarations?.find(
      (node) =>
        ts.isTypeAliasDeclaration(node) || ts.isTypeParameterDeclaration(node),
    );
    if (declaration)
      return authoredOrder(
        declaration.type ?? declaration.constraint,
        checker,
        seen,
      );
  }
  return literalValues(checker.getTypeFromTypeNode(node), checker) ?? [];
}
export function typedContracts(checker, source, root, original, dependencies) {
  return (name) => {
    const module = checker.getSymbolAtLocation(source);
    const local = source.statements.find((node) => node.name?.text === name);
    let symbol =
      (module &&
        checker
          .getExportsOfModule(module)
          .find((item) => item.name === name)) ||
      (local?.name && checker.getSymbolAtLocation(local.name));
    if (!symbol) return null;
    if (symbol.flags & ts.SymbolFlags.Alias)
      symbol = checker.getAliasedSymbol(symbol);
    const node = symbol.declarations?.find(
      (node) =>
        ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node),
    );
    if (!node) return null;
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    function unresolvedBase(declaration, seen = new Set()) {
      if (seen.has(declaration)) return false;
      seen.add(declaration);
      for (const clause of declaration.heritageClauses ?? [])
        for (const base of clause.types) {
          const baseType = checker.getTypeAtLocation(base);
          if (baseType.flags & ts.TypeFlags.Any) return true;
          for (const parent of baseType.symbol?.declarations ?? [])
            if (
              ts.isInterfaceDeclaration(parent) &&
              unresolvedBase(parent, seen)
            )
              return true;
        }
      return false;
    }
    function describe(type) {
      const props = checker.getPropertiesOfType(type).map((property) => {
        const member = property.valueDeclaration ?? property.declarations?.[0];
        const propertyType = checker.getTypeOfSymbolAtLocation(property, node);
        const resolvedType = checker.typeToString(
          propertyType,
          node,
          ts.TypeFormatFlags.NoTruncation,
        );
        const record = {
          name: property.name,
          optional: !!(property.flags & ts.SymbolFlags.Optional),
          type:
            member &&
            (ts.isMethodSignature(member) || ts.isMethodDeclaration(member))
              ? member.getText()
              : (member?.type?.getText() ?? resolvedType),
          resolvedType,
          description: ts.displayPartsToString(
            property.getDocumentationComment(checker),
          ),
        };
        // Keep ordinary boolean controls distinct from authored literal variants.
        let values =
          member?.type?.kind === ts.SyntaxKind.BooleanKeyword
            ? null
            : literalValues(propertyType, checker);
        if (values) {
          const preferred = authoredOrder(member?.type, checker);
          values = [
            ...new Set([
              ...preferred.filter((value) => values.includes(value)),
              ...values,
            ]),
          ];
        }
        if (values) record.values = values;
        if (member) {
          const defaultValue = docTag(member, "default");
          if (defaultValue != null) {
            try {
              record.default = JSON.parse(defaultValue);
            } catch {
              record.default = defaultValue;
            }
          }
          const file = member.getSourceFile();
          record.definedIn = path.relative(root, file.fileName);
          record.line =
            file.getLineAndCharacterOfPosition(member.getStart()).line + 1;
        }
        const readonly =
          mappedReadonly(type, property.name, checker) ??
          member?.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
          );
        if (readonly) record.readonly = true;
        return record;
      });
      const signatures = [
        ...checker
          .getIndexInfosOfType(type)
          .map(
            (info) =>
              `[${info.declaration?.parameters[0]?.name.getText() ?? "key"}: ${checker.typeToString(info.keyType)}]: ${checker.typeToString(info.type, node, ts.TypeFormatFlags.NoTruncation)}`,
          ),
        ...[ts.SignatureKind.Call, ts.SignatureKind.Construct].flatMap((kind) =>
          checker
            .getSignaturesOfType(type, kind)
            .map((signature) =>
              checker.signatureToString(
                signature,
                node,
                ts.TypeFormatFlags.NoTruncation,
                kind,
              ),
            ),
        ),
      ];
      return { props, signatures };
    }
    return {
      name,
      description: description(node),
      ...describe(type),
      ...(type.isUnion()
        ? {
            alternatives: type.types.map((alternative) => ({
              type: checker.typeToString(
                alternative,
                node,
                ts.TypeFormatFlags.NoTruncation,
              ),
              ...describe(alternative),
            })),
          }
        : {}),
      declaration: original,
      dependencies,
      ...(symbol.declarations?.some(
        (declaration) =>
          ts.isInterfaceDeclaration(declaration) && unresolvedBase(declaration),
      )
        ? { openProps: true }
        : {}),
      ...(node.typeParameters?.length
        ? {
            typeParameters: node.typeParameters.map((parameter) => ({
              name: parameter.name.text,
              ...(parameter.constraint
                ? { constraint: parameter.constraint.getText() }
                : {}),
              ...(parameter.default
                ? { default: parameter.default.getText() }
                : {}),
            })),
          }
        : {}),
    };
  };
}
