import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { sourceAST } from "./system-contracts.mjs";
import { safeFile } from "../../../core/src/lib/files.mjs";
import { browserProperty } from "./system-browser-globals.mjs";
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
export function authoringPlugin(root, model, authoring) {
  return {
    name: "design-system-authoring",
    setup(builder) {
      builder.onLoad(
        { filter: /\.(?:jsx|tsx|js|ts)$/ },
        async ({ path: file }) => {
          if (file.includes(`${path.sep}node_modules${path.sep}`)) return;
          const relative = path.relative(root, file);
          const safe = await safeFile(root, relative),
            raw = await fs.readFile(safe, "utf8"),
            source = sourceAST(relative, raw).source;
          const identifiers = new Set();
          const collect = (node) => {
            if (ts.isIdentifier(node)) identifiers.add(node.text);
            ts.forEachChild(node, collect);
          };
          collect(source);
          const imports = [],
            bindings = new Map();
          const unique = (stem) => {
            let name = stem;
            for (let index = 1; identifiers.has(name); index++)
              name = stem + index;
            identifiers.add(name);
            return name;
          };
          const runtime = (name) => {
            if (!bindings.has(name)) {
              const local = unique("__codex" + name);
              bindings.set(name, local);
              imports.push(
                ts.factory.createImportDeclaration(
                  undefined,
                  ts.factory.createImportClause(
                    false,
                    undefined,
                    ts.factory.createNamedImports([
                      ts.factory.createImportSpecifier(
                        false,
                        ts.factory.createIdentifier(name),
                        ts.factory.createIdentifier(local),
                      ),
                    ]),
                  ),
                  ts.factory.createStringLiteral("forma:runtime"),
                ),
              );
            }
            return ts.factory.createIdentifier(bindings.get(name));
          };
          const component = (name) => {
            const item = model.spec.components.find(
              (item) => item.name === name || item.export === name,
            );
            if (!item)
              throw new Error(
                `Unknown browser system export ${name} in ${relative}`,
              );
            if (
              (item.sourcePath ?? model.spec.entry) === relative &&
              item.local !== null
            )
              return ts.factory.createIdentifier(
                item.local ?? item.export ?? item.name,
              );
            const key = "component:" + name;
            if (!bindings.has(key)) {
              const local = unique("__codexSystem" + name),
                target = path
                  .relative(
                    path.dirname(file),
                    path.join(root, item.sourcePath ?? model.spec.entry),
                  )
                  .split(path.sep)
                  .join("/");
              bindings.set(key, local);
              imports.push(
                ts.factory.createImportDeclaration(
                  undefined,
                  ts.factory.createImportClause(
                    false,
                    undefined,
                    item.moduleNamespace
                      ? ts.factory.createNamespaceImport(
                          ts.factory.createIdentifier(local),
                        )
                      : ts.factory.createNamedImports([
                          ts.factory.createImportSpecifier(
                            false,
                            ts.factory.createIdentifier(
                              item.export ?? item.name,
                            ),
                            ts.factory.createIdentifier(local),
                          ),
                        ]),
                  ),
                  ts.factory.createStringLiteral(
                    target.startsWith(".") ? target : "./" + target,
                  ),
                ),
              );
            }
            return ts.factory.createIdentifier(bindings.get(key));
          };
          const namespaceObject = (names) =>
            ts.factory.createObjectLiteralExpression(
              names.map((name) =>
                ts.factory.createGetAccessorDeclaration(
                  undefined,
                  ts.factory.createStringLiteral(name),
                  [],
                  undefined,
                  ts.factory.createBlock(
                    [ts.factory.createReturnStatement(component(name))],
                    true,
                  ),
                ),
              ),
              true,
            );
          const result = ts.transform(source, [
            (context) => (node) =>
              ts.visitNode(node, function visit(node) {
                const key = browserProperty(node);
                if (key === "React" || key === "ReactDOM") return runtime(key);
                if (authoring.sourceNamespaces.includes(key)) {
                  const parent = node.parent;
                  if (
                    ts.isPropertyAccessExpression(parent) &&
                    parent.expression === node
                  )
                    return namespaceObject([parent.name.text]);
                  if (
                    ts.isElementAccessExpression(parent) &&
                    parent.expression === node &&
                    ts.isStringLiteralLike(parent.argumentExpression)
                  )
                    return namespaceObject([parent.argumentExpression.text]);
                  if (
                    ts.isVariableDeclaration(parent) &&
                    ts.isObjectBindingPattern(parent.name)
                  ) {
                    const names = parent.name.elements.map((element) =>
                      element.dotDotDotToken
                        ? null
                        : (element.propertyName ?? element.name).text,
                    );
                    if (names.every(Boolean)) return namespaceObject(names);
                  }
                  return namespaceObject(
                    model.spec.components.map((item) => item.name),
                  );
                }
                return ts.visitEachChild(node, visit, context);
              }),
          ]);
          try {
            const transformed = result.transformed[0];
            const output = ts.factory.updateSourceFile(transformed, [
              ...imports,
              ...transformed.statements,
            ]);
            return {
              contents: printer.printFile(output),
              loader: path.extname(file).slice(1),
              resolveDir: path.dirname(file),
            };
          } finally {
            result.dispose();
          }
        },
      );
    },
  };
}
