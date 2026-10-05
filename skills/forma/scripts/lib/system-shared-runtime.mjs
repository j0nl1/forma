import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

// Read the pinned packages' export assignments without executing their code.
async function exportedNames(directory, stem, legacy) {
  const file = path.join(
    directory,
    "cjs",
    `${stem}.${legacy ? "production.min" : "development"}.js`,
  );
  const source = ts.createSourceFile(
    file,
    await fs.readFile(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const names = new Set();
  function visit(node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      ts.isIdentifier(node.left.expression) &&
      node.left.expression.text === "exports"
    )
      names.add(node.left.name.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...names].sort();
}

export function sharedRuntimePlugin(runtime) {
  const modules = {
    react: ["React", "react", "index.js", "react"],
    "react-dom": ["DOM", "react-dom", "index.js", "react-dom"],
    "react-dom/client": [
      "Client",
      "react-dom",
      "client.js",
      "react-dom-client",
    ],
    "react/jsx-runtime": [
      "JSX",
      "react",
      "jsx-runtime.js",
      "react-jsx-runtime",
    ],
    "react/jsx-dev-runtime": [
      "JSXDev",
      "react",
      "jsx-dev-runtime.js",
      "react-jsx-dev-runtime",
    ],
  };
  return {
    name: "shared-design-system-runtime",
    setup(builder) {
      builder.onResolve({ filter: /^studio-design:runtime$/ }, () => ({
        path: "pair",
        namespace: "codex-shared-runtime",
      }));
      builder.onResolve(
        { filter: /^(?:react|react-dom)(?:\/.*)?$/ },
        ({ path: name, importer }) => {
          if (
            Object.values(runtime.alias).some((directory) =>
              importer.startsWith(directory + path.sep),
            )
          )
            return;
          if (!modules[name])
            throw new Error(`Unsupported browser React entry: ${name}`);
          return { path: name, namespace: "codex-react-facade" };
        },
      );
      builder.onLoad(
        { filter: /.*/, namespace: "codex-shared-runtime" },
        () => {
          const imports = Object.values(modules)
            .map(
              ([local, pkg, file]) =>
                `import*as raw${local} from ${JSON.stringify(path.join(runtime.alias[pkg], file))};`,
            )
            .join("\n");
          return {
            contents: `${imports}
const registry=window.CodexDesignRuntimes??=Object.create(null);
const pair=registry[${JSON.stringify(runtime.version)}]??=(()=>{const React=rawReact.default;const DOM=rawDOM,Client=rawClient,JSX=rawJSX,JSXDev=rawJSXDev;const ReactDOM={...DOM,...Client};return{React,DOM,Client,JSX,JSXDev,ReactDOM};})();
const {React,DOM,Client,JSX,JSXDev,ReactDOM}=pair;const {createRoot,hydrateRoot}=Client;
export{React,DOM,Client,JSX,JSXDev,ReactDOM,createRoot,hydrateRoot};`,
            loader: "js",
            resolveDir: runtime.alias.react,
          };
        },
      );
      builder.onLoad(
        { filter: /.*/, namespace: "codex-react-facade" },
        async ({ path: name }) => {
          const [local, pkg, , stem] = modules[name];
          const names =
            name === "react-dom/client" && runtime.version === "18.3.1"
              ? ["createRoot", "hydrateRoot"]
              : await exportedNames(
                  runtime.alias[pkg],
                  stem,
                  runtime.version === "18.3.1",
                );
          return {
            contents: `import{${local} as selected}from'studio-design:runtime';export default selected.default??selected;${names.map((name) => `export const ${name}=selected.${name};`).join("\n")}`,
            loader: "js",
            resolveDir: runtime.alias.react,
          };
        },
      );
    },
  };
}
