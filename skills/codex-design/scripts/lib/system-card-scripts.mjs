import { transform } from "esbuild";
import ts from "typescript";
import { parse } from "parse5";

export function cardNeedsReact(content) {
  let found = false;
  const visit = (node) => {
    if (
      node.tagName === "script" &&
      node.attrs?.some(
        (attribute) =>
          attribute.name === "type" &&
          ["text/babel", "text/jsx", "text/tsx"].includes(attribute.value),
      )
    )
      found = true;
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(parse(content));
  return found;
}

// Parse declarations only. Authored scripts execute later in the browser.
export function scriptBindings(code) {
  const source = ts.createSourceFile(
    "card.js",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const names = new Map();
  const binding = (node, mutable, variable = false) => {
    if (ts.isIdentifier(node))
      names.set(node.text, { name: node.text, mutable, variable });
    else if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node))
      for (const element of node.elements)
        if (ts.isBindingElement(element))
          binding(element.name, mutable, variable);
  };
  const visit = (node, depth = 0) => {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      if (depth === 0 && node.name) binding(node.name, true);
      return;
    }
    if (ts.isFunctionLike(node)) return;
    if (ts.isVariableDeclarationList(node)) {
      const variable = !(node.flags & ts.NodeFlags.BlockScoped);
      if (depth === 0 || variable)
        for (const declaration of node.declarations)
          binding(
            declaration.name,
            !(node.flags & ts.NodeFlags.Const),
            variable,
          );
      return;
    }
    ts.forEachChild(node, (child) =>
      visit(child, depth + (ts.isBlock(node) ? 1 : 0)),
    );
  };
  visit(source);
  return [...names.values()];
}

export async function cardScript(code, type, namespace) {
  if (!["text/babel", "text/jsx", "text/tsx"].includes(type)) return code;
  const transformed = await transform(code, {
    loader: type === "text/tsx" ? "tsx" : "jsx",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    target: "es2022",
    legalComments: "inline",
  });
  const names = new Set(
    scriptBindings(transformed.code).map((item) => item.name),
  );
  const aliases = [
    !names.has("React")
      ? `var React=window[${JSON.stringify(namespace)}].React;`
      : "",
    !names.has("ReactDOM")
      ? `var ReactDOM={createRoot:window[${JSON.stringify(namespace)}].createRoot};`
      : "",
  ].join("\n");
  const parsed = ts.createSourceFile(
    "card.js",
    transformed.code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  if (
    parsed.statements.some(
      (node) =>
        ts.isImportDeclaration(node) ||
        ts.isExportDeclaration(node) ||
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ),
    )
  )
    throw new Error(
      "Bundle module imports in design-system cards before compilation.",
    );
  return aliases + "\n" + transformed.code;
}
