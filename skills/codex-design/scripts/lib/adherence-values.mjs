import ts from "typescript";

export const unknown = Object.freeze({ known: false });
const mutations = new WeakMap();
function mutationFacts(source, checker) {
  if (mutations.has(source)) return mutations.get(source);
  const written = new Set(),
    escaped = new Set(),
    aliases = new Map();
  function base(node) {
    node = unwrap(node);
    while (
      node &&
      (ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node))
    )
      node = unwrap(node.expression);
    return node && ts.isIdentifier(node)
      ? checker.getSymbolAtLocation(node)
      : null;
  }
  function mark(node, destination = written) {
    const symbol = base(node);
    if (symbol) destination.add(symbol);
  }
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isIdentifier(unwrap(node.initializer))
    ) {
      const left = base(node.name),
        right = base(node.initializer);
      if (left && right) {
        for (const [a, b] of [
          [left, right],
          [right, left],
        ]) {
          if (!aliases.has(a)) aliases.set(a, new Set());
          aliases.get(a).add(b);
        }
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    )
      mark(node.left);
    if (ts.isDeleteExpression(node)) mark(node.expression);
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
        node.operator,
      )
    )
      mark(node.operand);
    if (ts.isCallExpression(node)) {
      for (const argument of node.arguments)
        if (ts.isIdentifier(unwrap(argument))) mark(argument, escaped);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const destination of [written, escaped]) {
    const queue = [...destination];
    for (const symbol of queue)
      for (const alias of aliases.get(symbol) ?? [])
        if (!destination.has(alias)) {
          destination.add(alias);
          queue.push(alias);
        }
  }
  const facts = { written, escaped };
  mutations.set(source, facts);
  return facts;
}
export function unwrap(node) {
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node))
  )
    node = node.expression;
  return node;
}
export function initializer(node, checker, origin = false) {
  const symbol = checker.getSymbolAtLocation(node);
  const declaration = symbol?.valueDeclaration;
  const facts = mutationFacts(node.getSourceFile(), checker);
  return declaration &&
    ts.isVariableDeclaration(declaration) &&
    declaration.parent.flags & ts.NodeFlags.Const &&
    !facts.written.has(symbol) &&
    (origin || !facts.escaped.has(symbol))
    ? declaration.initializer
    : null;
}
export function literal(node, checker, seen = new Set()) {
  node = unwrap(node);
  if (!node || seen.has(node)) return unknown;
  seen.add(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return { known: true, value: node.text };
  if (ts.isNumericLiteral(node))
    return { known: true, value: Number(node.text) };
  if (node.kind === ts.SyntaxKind.TrueKeyword)
    return { known: true, value: true };
  if (node.kind === ts.SyntaxKind.FalseKeyword)
    return { known: true, value: false };
  if (node.kind === ts.SyntaxKind.NullKeyword)
    return { known: true, value: null };
  if (ts.isIdentifier(node)) {
    if (node.text === "undefined" && !checker.getSymbolAtLocation(node))
      return { known: true, value: undefined };
    return literal(initializer(node, checker), checker, seen);
  }
  if (
    ts.isPrefixUnaryExpression(node) &&
    [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(node.operator)
  ) {
    const result = literal(node.operand, checker, seen);
    if (result.known && typeof result.value === "number")
      return {
        known: true,
        value:
          node.operator === ts.SyntaxKind.MinusToken
            ? -result.value
            : result.value,
      };
  }
  return unknown;
}
export function objectProperties(node, checker, seen = new Set()) {
  node = unwrap(node);
  if (!node || seen.has(node)) return { properties: [], dynamic: true };
  seen.add(node);
  if (ts.isIdentifier(node))
    return objectProperties(initializer(node, checker), checker, seen);
  if (!ts.isObjectLiteralExpression(node))
    return { properties: [], dynamic: true };
  const properties = new Map();
  let dynamic = false;
  for (const item of node.properties) {
    if (ts.isSpreadAssignment(item)) {
      const result = objectProperties(item.expression, checker, new Set(seen));
      dynamic ||= result.dynamic;
      if (result.dynamic)
        for (const [name, property] of properties)
          properties.set(name, { ...property, value: unknown });
      for (const property of result.properties)
        properties.set(property.name, property);
    } else {
      const key = ts.isComputedPropertyName(item.name)
        ? literal(item.name.expression, checker)
        : { known: true, value: item.name.text };
      if (!key.known) {
        dynamic = true;
        for (const [name, property] of properties)
          properties.set(name, { ...property, value: unknown });
        continue;
      }
      properties.set(String(key.value), {
        name: String(key.value),
        node: item,
        value: ts.isPropertyAssignment(item)
          ? literal(item.initializer, checker)
          : ts.isShorthandPropertyAssignment(item)
            ? literal(item.name, checker)
            : unknown,
      });
    }
  }
  return { properties: [...properties.values()], dynamic };
}
