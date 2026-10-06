import { transform } from "esbuild";
import ts from "typescript";
import { parse } from "parse5";
import { rewriteCardGlobals } from "./authoring.mjs";

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

export async function cardScript(code, type, namespace, sourceNamespaces = []) {
  if (
    code.startsWith("/* @codex-ds namespace=") ||
    ![
      "",
      "text/javascript",
      "application/javascript",
      "text/babel",
      "text/jsx",
      "text/tsx",
    ].includes(type)
  )
    return code;
  code = rewriteCardGlobals(
    code,
    type === "text/tsx" ? "card.tsx" : "card.jsx",
    namespace,
    sourceNamespaces,
  );
  if (!["text/babel", "text/jsx", "text/tsx"].includes(type)) return code;
  const transformed = await transform(code, {
    loader: type === "text/tsx" ? "tsx" : "jsx",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    target: "es2022",
    legalComments: "inline",
  });
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
  return transformed.code;
}
