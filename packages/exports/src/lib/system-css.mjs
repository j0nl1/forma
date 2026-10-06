import fs from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import { safeFile } from "../../../core/src/lib/files.mjs";
import {
  cssImport,
  cssURLs,
  cssUnescape,
} from "../../../runtime/src/browser/font-css.js";
import { tokenMetadata } from "./system-token-metadata.mjs";
import { fontMetadata, fontFamilies } from "./system-font-metadata.mjs";

function context(node) {
  const selectors = [],
    conditions = [];
  for (
    let parent = node.parent;
    parent && parent.type !== "root";
    parent = parent.parent
  ) {
    if (parent.type === "rule") selectors.unshift(parent.selector);
    if (parent.type === "atrule")
      conditions.unshift(`@${parent.name} ${parent.params}`.trim());
  }
  return { selector: selectors.join(" "), conditions };
}
export async function inspectSystemCSS(root, entry) {
  const files = new Set(),
    declarations = [],
    faces = [],
    issues = [],
    warnings = [];
  async function asset(file, url, label) {
    if (url.startsWith("data:") || url.startsWith("#")) return;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url))
      throw new Error(`Remote CSS ${label}: ${url}`);
    const pathname = decodeURIComponent(url.split(/[?#]/)[0]);
    const relative = path.relative(
      root,
      path.resolve(path.dirname(file), pathname),
    );
    try {
      await safeFile(root, relative);
    } catch (error) {
      throw new Error(
        `CSS ${label} not found: ${url} (in ${path.relative(root, file)}): ${error.message}`,
      );
    }
  }
  async function visit(relative, chain = [], inherited = []) {
    const file = await safeFile(root, relative);
    if (chain.includes(file)) {
      issues.push(
        `CSS import cycle: ${[...chain, file].map((file) => path.relative(root, file)).join(" → ")}`,
      );
      return;
    }
    const tree = postcss.parse(await fs.readFile(file, "utf8"), { from: file });
    for (const node of tree.nodes) {
      if (node.type !== "atrule" || node.name.toLowerCase() !== "import")
        continue;
      try {
        const imported = cssImport(node.params);
        if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(imported.value))
          throw new Error(`Remote CSS import: ${imported.value}`);
        await visit(
          path.relative(
            root,
            path.resolve(
              path.dirname(file),
              decodeURIComponent(imported.value.split(/[?#]/)[0]),
            ),
          ),
          [...chain, file],
          [...inherited, ...imported.wrappers],
        );
      } catch (error) {
        issues.push(error.message);
      }
    }
    files.add(relative);
    tree.walkDecls((node) => {
      if (!node.prop.startsWith("--")) return;
      const next = node.next(),
        annotation =
          next?.type === "comment" &&
          next.source?.start.line === node.source.end.line
            ? next.text.match(/^\s*@kind\s+([a-z]+)\s*$/i)?.[1].toLowerCase()
            : null;
      const scope = context(node);
      declarations.push({
        name: cssUnescape(node.prop),
        ...(cssUnescape(node.prop) !== node.prop
          ? { authoredName: node.prop }
          : {}),
        value: node.value,
        definedIn: relative,
        line: node.source.start.line,
        column: node.source.start.column,
        selector: scope.selector,
        conditions: [...inherited, ...scope.conditions],
        ...(annotation ? { annotation } : {}),
      });
    });
    tree.walkAtRules((rule) => {
      if (rule.name.toLowerCase() !== "font-face") return;
      const properties = Object.fromEntries(
        (rule.nodes ?? [])
          .filter((node) => node.type === "decl")
          .map((node) => [node.prop.toLowerCase(), node.value]),
      );
      const family = fontFamilies(properties["font-family"] ?? "")[0];
      if (!family) {
        issues.push(
          `@font-face missing font-family in ${relative}:${rule.source.start.line}`,
        );
        return;
      }
      const scope = context(rule);
      faces.push({
        family,
        definedIn: relative,
        line: rule.source.start.line,
        conditions: [...inherited, ...scope.conditions],
        src: properties.src ?? null,
        weight: properties["font-weight"] ?? "normal",
        style: properties["font-style"] ?? "normal",
        display: properties["font-display"] ?? null,
        unicodeRange: properties["unicode-range"] ?? null,
      });
    });
    const assets = [];
    tree.walkDecls((node) => {
      for (const url of cssURLs(node.value))
        assets.push(
          asset(
            file,
            url.value,
            node.parent.type === "atrule" &&
              node.parent.name.toLowerCase() === "font-face"
              ? "font src"
              : "asset",
          ),
        );
    });
    for (const result of await Promise.allSettled(assets))
      if (result.status === "rejected") issues.push(result.reason.message);
  }
  try {
    if (typeof entry !== "string" || !entry.trim())
      throw new Error(
        "No global CSS entry found. Create styles.css or index.css, or set system.json.css.",
      );
    await visit(entry);
  } catch (error) {
    issues.push(error.message);
  }
  const metadata = tokenMetadata(declarations),
    fontInfo = fontMetadata(faces, metadata.tokenDetails);
  if (metadata.unclassified.length)
    warnings.push(
      `Unclassified tokens: ${metadata.unclassified.join(", ")}. Add a trailing /* @kind color|spacing|radius|shadow|font|other */ annotation.`,
    );
  for (const item of fontInfo.brandFonts)
    warnings.push(
      `Brand font has no @font-face: ${item.family} [${item.tokens.join(", ")}]. Rendering may use an installed font or fallback.`,
    );
  return {
    ...metadata,
    ...fontInfo,
    files: [...files],
    issues: [...new Set([...issues, ...metadata.issues])],
    warnings,
  };
}
