import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { parse } from "parse5";
import { sourceAST } from "./system-contracts.mjs";
import { safeFile } from "../../../core/src/lib/files.mjs";
import { usesBrowserReact } from "./system-browser-globals.mjs";
export {
  usesBrowserReact,
  rewriteCardGlobals,
} from "./system-browser-globals.mjs";
export { authoringPlugin } from "./system-authoring-source.mjs";

export const sourceNamespace = (name) =>
  typeof name === "string" &&
  /^[A-Za-z_$][\w$]*$/.test(name) &&
  ![
    "React",
    "ReactDOM",
    "window",
    "self",
    "globalThis",
    "__proto__",
    "prototype",
    "constructor",
  ].includes(name);
const attribute = (node, name) =>
  node.attrs?.find((item) => item.name === name)?.value;
const jsxTypes = ["text/babel", "text/jsx", "text/tsx"];
// Recognize package declarations, never fetch or evaluate their remote code.
export function runtimeDeclaration(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !["unpkg.com", "cdn.jsdelivr.net"].includes(url.hostname)
  )
    return null;
  const prefix = url.hostname === "cdn.jsdelivr.net" ? "/npm/" : "/";
  if (!url.pathname.startsWith(prefix)) return null;
  const resource = url.pathname.slice(prefix.length);
  const react = resource.match(
    /^(react|react-dom)(?:@([^/]+))?\/umd\/\1\.(?:production\.min|development)\.js$/,
  );
  if (react) {
    const requestedVersion = react[2] ?? "18";
    if (!/^18(?:\.\d+(?:\.\d+)?)?$/.test(requestedVersion))
      throw new Error(
        `Unsupported React CDN version: ${requestedVersion}. The supported local React version is 18.3.1.`,
      );
    return {
      package: react[1],
      requestedVersion,
      runtimeVersion: "18.3.1",
      url: value,
    };
  }
  const babel = resource.match(
    /^@babel\/standalone(?:@([^/]+))?\/babel(?:\.min)?\.js$/,
  );
  if (babel)
    return {
      package: "@babel/standalone",
      requestedVersion: babel[1] ?? "7",
      replacement: "build-time JSX/TSX",
      url: value,
    };
  return null;
}
export function cardRuntime(content) {
  const declarations = [];
  let react = false;
  function visit(node) {
    if (node.tagName === "script") {
      if (
        ![
          undefined,
          "",
          "text/javascript",
          "application/javascript",
          "module",
          ...jsxTypes,
        ].includes(attribute(node, "type"))
      )
        return;
      const src = attribute(node, "src"),
        declaration = src ? runtimeDeclaration(src) : null;
      if (declaration) declarations.push(declaration);
      if (
        declaration?.package.startsWith("react") ||
        jsxTypes.includes(attribute(node, "type"))
      )
        react = true;
      const code =
        node.childNodes?.map((child) => child.value ?? "").join("") ?? "";
      // Includes classic cards using the already-loaded global React/DOM API.
      if (/\bReact(?:DOM)?\b/.test(code)) react = true;
    }
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parse(content));
  return { react, declarations };
}
export function reactRuntime(version = "18.3.1") {
  if (version !== "18.3.1")
    throw new Error(`Unsupported local React runtime: ${version}`);
  try {
    const require = createRequire(
      new URL("../../package.json", import.meta.url),
    );
    if (
      require("react/package.json").version !== version ||
      require("react-dom/package.json").version !== version
    )
      throw new Error(
        "Installed React pair does not match the requested version",
      );
    return {
      version,
      alias: {
        react: path.dirname(require.resolve("react/package.json")),
        "react-dom": path.dirname(require.resolve("react-dom/package.json")),
      },
    };
  } catch {
    // Report the required setup without exposing filesystem resolution details.
  }
  throw new Error(
    `React ${version} is not installed. Run npm ci --ignore-scripts from the repository or installed skill root.`,
  );
}
export async function authoringModel(root, model) {
  const sourceNamespaces = model.spec.sourceNamespaces ?? [];
  if (
    !Array.isArray(sourceNamespaces) ||
    sourceNamespaces.some((name) => !sourceNamespace(name))
  )
    throw new Error(
      "sourceNamespaces must be an array of safe browser namespace identifiers",
    );
  const namespaces = new Set(sourceNamespaces);
  let previous;
  try {
    previous = JSON.parse(
      await fs.readFile(await safeFile(root, "_ds_manifest.json"), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (previous) {
    if (previous.schemaVersion === 1) {
      if (!Array.isArray(previous.sourceNamespaces ?? []))
        throw new Error("Invalid persisted source namespaces");
      for (const name of previous.sourceNamespaces ?? []) {
        if (!sourceNamespace(name))
          throw new Error("Invalid persisted source namespace");
        namespaces.add(name);
      }
      if (sourceNamespace(previous.namespace))
        namespaces.add(previous.namespace);
    } else if (sourceNamespace(previous.namespace))
      namespaces.add(previous.namespace);
    else if (previous.namespace != null)
      throw new Error("Invalid legacy design-system namespace");
  }
  let globals = false;
  for (const relative of model.sourceFiles.filter(
    (file) => /\.(?:jsx|tsx|js|ts)$/.test(file) && !file.endsWith(".d.ts"),
  )) {
    const text = await fs.readFile(await safeFile(root, relative), "utf8");
    const source = sourceAST(relative, text).source;
    if (usesBrowserReact(source)) globals = true;
  }
  const declarations = [],
    reactFiles = new Set();
  for (const card of [
    ...model.cards,
    ...(model.spec.startingPoints ?? []).filter(
      (start) => start.kind !== "component",
    ),
  ]) {
    const result = cardRuntime(
      await fs.readFile(await safeFile(root, card.path), "utf8"),
    );
    if (result.react) reactFiles.add(card.path);
    for (const declaration of result.declarations)
      if (!declarations.some((item) => item.url === declaration.url))
        declarations.push(declaration);
  }
  const version = model.spec.reactVersion ?? "18.3.1";
  if (version !== "18.3.1")
    throw new Error(
      `Unsupported local React runtime: ${version}; Forma uses React 18.3.1`,
    );
  return {
    sourceNamespaces: [...namespaces],
    reactFiles,
    declarations,
    version,
    globals,
  };
}
