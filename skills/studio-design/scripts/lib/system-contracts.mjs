import ts from "typescript";

export function sourceAST(filename, text) {
  const source = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const issues = source.parseDiagnostics.map((diagnostic) => {
    const position = source.getLineAndCharacterOfPosition(
      diagnostic.start ?? 0,
    );
    return `${filename}:${position.line + 1}:${position.character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
  });
  return { source, issues };
}
const comment = (value) =>
  typeof value === "string"
    ? value
    : (value ?? []).map((part) => part.text ?? "").join("");
function leadingDoc(node) {
  const source = node.getSourceFile();
  return [
    ...source.text
      .slice(node.getFullStart(), node.getStart(source))
      .matchAll(/\/\*\*([\s\S]*?)\*\//g),
  ]
    .map((match) =>
      match[1]
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*\*?\s?/, ""))
        .join("\n")
        .trim(),
    )
    .join("\n");
}
export function docTag(node, name) {
  const tag = ts.getJSDocTags(node).find((tag) => tag.tagName.text === name);
  if (tag) return comment(tag.comment).trim();
  return (
    leadingDoc(node)
      .match(new RegExp("(?:^|\\n|\\s)@" + name + "\\s+([^\\n]+)"))?.[1]
      ?.trim() ?? null
  );
}
export function description(node) {
  const value = (node.jsDoc ?? [])
    .map((doc) => comment(doc.comment))
    .filter(Boolean)
    .join("\n");
  return (
    value ||
    leadingDoc(node)
      .split(/(?:^|\n|\s)@[A-Za-z]/)[0]
      .trim()
  );
}
export function namedExports(source) {
  const result = [];
  const add = (name, local = name, exported = name) => {
    if (/^[A-Z][\w$]*$/.test(name))
      result.push({
        name,
        export: exported,
        local,
        kind: /[a-z]/.test(name) ? "component" : "constant",
      });
  };
  for (const node of source.statements) {
    if (
      ts.isExportDeclaration(node) &&
      !node.moduleSpecifier &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const element of node.exportClause.elements)
        if (!element.isTypeOnly)
          add(
            element.name.text,
            element.propertyName?.text ?? element.name.text,
          );
    } else if (
      node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    ) {
      const isDefault = node.modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      );
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isEnumDeclaration(node)
      ) {
        if (node.name)
          add(
            node.name.text,
            node.name.text,
            isDefault ? "default" : node.name.text,
          );
      }
      if (!isDefault && ts.isVariableStatement(node))
        for (const declaration of node.declarationList.declarations)
          if (ts.isIdentifier(declaration.name)) add(declaration.name.text);
    }
  }
  return [...new Map(result.map((item) => [item.name, item])).values()];
}
export function declarationContracts(source) {
  const declarations = new Map();
  for (const node of source.statements)
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      const list = declarations.get(node.name.text) ?? [];
      list.push(node);
      declarations.set(node.name.text, list);
    }
  function literals(type, seen = new Set()) {
    if (!type) return null;
    if (ts.isParenthesizedTypeNode(type)) return literals(type.type, seen);
    if (ts.isUnionTypeNode(type)) {
      const sets = type.types.map((child) => literals(child, new Set(seen)));
      return sets.every(Boolean) ? [...new Set(sets.flat())] : null;
    }
    if (ts.isLiteralTypeNode(type)) {
      const value = type.literal;
      if (ts.isStringLiteral(value)) return [value.text];
      if (ts.isNumericLiteral(value)) return [Number(value.text)];
      if (
        value.kind === ts.SyntaxKind.TrueKeyword ||
        value.kind === ts.SyntaxKind.FalseKeyword
      )
        return [value.kind === ts.SyntaxKind.TrueKeyword];
      if (
        ts.isPrefixUnaryExpression(value) &&
        ts.isNumericLiteral(value.operand)
      )
        return [Number(value.getText(source))];
    }
    if (
      ts.isTypeReferenceNode(type) &&
      ts.isIdentifier(type.typeName) &&
      !seen.has(type.typeName.text)
    ) {
      seen.add(type.typeName.text);
      const declaration = declarations
        .get(type.typeName.text)
        ?.find(ts.isTypeAliasDeclaration);
      if (declaration) return literals(declaration.type, seen);
    }
    return null;
  }
  function members(name, seen = new Set()) {
    if (seen.has(name)) return [];
    seen.add(name);
    const result = [];
    for (const node of declarations.get(name) ?? []) {
      if (ts.isInterfaceDeclaration(node)) {
        for (const clause of node.heritageClauses ?? [])
          for (const type of clause.types)
            if (ts.isIdentifier(type.expression))
              result.push(...members(type.expression.text, new Set(seen)));
        result.push(...node.members);
      } else if (ts.isTypeLiteralNode(node.type))
        result.push(...node.type.members);
      else if (
        ts.isTypeReferenceNode(node.type) &&
        ts.isIdentifier(node.type.typeName)
      )
        result.push(...members(node.type.typeName.text, new Set(seen)));
      else if (ts.isIntersectionTypeNode(node.type))
        for (const type of node.type.types) {
          if (ts.isTypeLiteralNode(type)) result.push(...type.members);
          else if (
            ts.isTypeReferenceNode(type) &&
            ts.isIdentifier(type.typeName)
          )
            result.push(...members(type.typeName.text, new Set(seen)));
        }
    }
    return result;
  }
  return (name) => {
    const node = declarations.get(name)?.[0];
    if (!node) return null;
    const props = new Map(),
      signatures = [];
    for (const member of members(name)) {
      if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) {
        signatures.push(member.getText(source));
        continue;
      }
      const name =
        ts.isIdentifier(member.name) ||
        ts.isStringLiteral(member.name) ||
        ts.isNumericLiteral(member.name)
          ? member.name.text
          : member.name.getText(source);
      const property = {
        name,
        optional: !!member.questionToken,
        type: ts.isMethodSignature(member)
          ? member.getText(source)
          : (member.type?.getText(source) ?? member.getText(source)),
        description: description(member),
      };
      const values = literals(member.type);
      if (values) property.values = values;
      const defaultValue = docTag(member, "default");
      if (defaultValue != null) {
        try {
          property.default = JSON.parse(defaultValue);
        } catch {
          property.default = defaultValue;
        }
      }
      if (
        member.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
        )
      )
        property.readonly = true;
      props.set(name, property);
    }
    return {
      name,
      description: description(node),
      props: [...props.values()],
      signatures,
      declaration: source.text,
    };
  };
}
