import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { safeFile } from "../../core/src/lib/files.mjs";

// Interpret source imports as data. Rebase only literal module and asset URLs;
// ordinary strings, authored content and executable source are never evaluated.
export async function resourceFiles(item, paths) {
  const sources = new Map(
    item.files.map((file) => [
      path.resolve(paths.root, file.source),
      file.target,
    ]),
  );
  const files = [];
  for (const file of item.files) {
    const filename = await safeFile(paths.root, file.source);
    let bytes = await fs.readFile(filename);
    if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(filename)) {
      const text = bytes.toString("utf8");
      const ast = ts.createSourceFile(
        filename,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      if (ast.parseDiagnostics.length)
        throw new Error(`Catalog source cannot be parsed: ${file.source}`);
      const edits = [];
      const literal = (node) => {
        if (
          !node ||
          !ts.isStringLiteralLike(node) ||
          !node.text.startsWith(".")
        )
          return;
        const target = sources.get(
          path.resolve(path.dirname(filename), node.text),
        );
        if (!target)
          throw new Error(
            `Catalog dependency is missing: ${file.source} -> ${node.text}`,
          );
        let specifier = path.posix.relative(
          path.posix.dirname(file.target),
          target,
        );
        if (!specifier.startsWith(".")) specifier = "./" + specifier;
        edits.push({
          start: node.getStart(ast),
          end: node.getEnd(),
          text: JSON.stringify(specifier),
        });
      };
      const visit = (node) => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
          literal(node.moduleSpecifier);
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword
        )
          literal(node.arguments[0]);
        if (
          ts.isNewExpression(node) &&
          node.expression.getText(ast) === "URL" &&
          node.arguments?.[1]?.getText(ast) === "import.meta.url"
        )
          literal(node.arguments[0]);
        ts.forEachChild(node, visit);
      };
      visit(ast);
      let rendered = text;
      for (const edit of edits.sort((a, b) => b.start - a.start))
        rendered =
          rendered.slice(0, edit.start) + edit.text + rendered.slice(edit.end);
      bytes = Buffer.from(rendered);
    }
    files.push({ path: file.target, bytes });
  }
  return files;
}
