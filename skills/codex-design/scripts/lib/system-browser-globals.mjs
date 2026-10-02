import ts from "typescript";
import { sourceAST } from "./system-contracts.mjs";
const scopeBindings = new WeakMap();
function boundBrowserName(node, name) {
  const binding = (node, names) => {
    if (ts.isIdentifier(node)) names.add(node.text);
    else if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node))
      for (const item of node.elements)
        if (ts.isBindingElement(item)) binding(item.name, names);
  };
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (
      !ts.isSourceFile(scope) &&
      !ts.isBlock(scope) &&
      !ts.isFunctionLike(scope) &&
      !ts.isCatchClause(scope) &&
      !ts.isForStatement(scope) &&
      !ts.isForOfStatement(scope) &&
      !ts.isForInStatement(scope)
    )
      continue;
    if (!scopeBindings.has(scope)) {
      const names = new Set();
      if (ts.isFunctionLike(scope)) {
        for (const item of scope.parameters) binding(item.name, names);
        if (scope.name && ts.isIdentifier(scope.name))
          binding(scope.name, names);
      }
      if (ts.isCatchClause(scope) && scope.variableDeclaration)
        binding(scope.variableDeclaration.name, names);
      const statements =
        scope.statements ??
        (ts.isBlock(scope.body) ? scope.body.statements : []);
      for (const statement of statements) {
        if (ts.isVariableStatement(statement))
          for (const item of statement.declarationList.declarations)
            binding(item.name, names);
        if (
          (ts.isFunctionDeclaration(statement) ||
            ts.isClassDeclaration(statement)) &&
          statement.name
        )
          binding(statement.name, names);
        if (ts.isImportDeclaration(statement) && statement.importClause) {
          if (statement.importClause.name)
            binding(statement.importClause.name, names);
          const imports = statement.importClause.namedBindings;
          if (imports && ts.isNamespaceImport(imports))
            binding(imports.name, names);
          if (imports && ts.isNamedImports(imports))
            for (const item of imports.elements) binding(item.name, names);
        }
      }
      if (scope.initializer && ts.isVariableDeclarationList(scope.initializer))
        for (const item of scope.initializer.declarations)
          binding(item.name, names);
      if (ts.isFunctionLike(scope) || ts.isSourceFile(scope)) {
        const visit = (node) => {
          if (
            node !== scope &&
            (ts.isFunctionLike(node) || ts.isClassDeclaration(node))
          )
            return;
          if (
            ts.isVariableDeclarationList(node) &&
            !(node.flags & ts.NodeFlags.BlockScoped)
          )
            for (const item of node.declarations) binding(item.name, names);
          ts.forEachChild(node, visit);
        };
        visit(scope);
      }
      scopeBindings.set(scope, names);
    }
    if (scopeBindings.get(scope).has(name)) return true;
  }
  return false;
}
export function browserProperty(node) {
  if (
    (ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) &&
    ts.isIdentifier(node.expression) &&
    ["window", "self", "globalThis"].includes(node.expression.text)
  ) {
    if (boundBrowserName(node, node.expression.text)) return null;
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    if (ts.isStringLiteralLike(node.argumentExpression))
      return node.argumentExpression.text;
  }
  return null;
}
export function usesBrowserReact(source) {
  let found = false;
  function visit(node) {
    if (["React", "ReactDOM"].includes(browserProperty(node))) found = true;
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
export function rewriteCardGlobals(
  code,
  filename,
  namespace,
  sourceNamespaces,
) {
  const source = sourceAST(filename, code).source;
  const replacement = ts.factory.createElementAccessExpression(
    ts.factory.createIdentifier("window"),
    ts.factory.createStringLiteral(namespace),
  );
  const result = ts.transform(source, [
    (context) => (node) =>
      ts.visitNode(node, function visit(node) {
        const key = browserProperty(node);
        if (key === "React" || key === "ReactDOM")
          return ts.factory.createPropertyAccessExpression(replacement, key);
        if (sourceNamespaces.includes(key) && key !== namespace)
          return ts.factory.createPropertyAccessExpression(
            replacement,
            "Components",
          );
        return ts.visitEachChild(node, visit, context);
      }),
  ]);
  try {
    return printer.printFile(result.transformed[0]);
  } finally {
    result.dispose();
  }
}
