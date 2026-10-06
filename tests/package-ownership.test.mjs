import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { walk } from "../packages/core/src/lib/files.mjs";
import { root } from "./helpers.mjs";

test("package dependencies follow the acyclic ownership graph and keep browser source independent", async () => {
  const allowed = {
    core: [],
    runtime: ["core"],
    media: ["core", "runtime"],
    exports: ["core", "runtime", "media"],
    "design-systems": ["core", "runtime", "exports"],
    figma: ["core", "runtime"],
    catalog: ["core", "runtime"],
    cli: [
      "core",
      "runtime",
      "media",
      "exports",
      "design-systems",
      "figma",
      "catalog",
    ],
  };
  for (const [owner, dependencies] of Object.entries(allowed)) {
    const directory = path.join(root, "packages", owner);
    const manifest = JSON.parse(
      await fs.readFile(path.join(directory, "package.json"), "utf8"),
    );
    assert.equal(manifest.name, "@forma/" + owner);
    for (const dependency of Object.keys(manifest.dependencies).filter((name) =>
      name.startsWith("@forma/"),
    ))
      assert.ok(dependencies.includes(dependency.slice("@forma/".length)));
    for (const file of await walk(path.join(directory, "src"))) {
      if (!/\.(mjs|js|jsx)$/.test(file)) continue;
      const source = await fs.readFile(file, "utf8");
      for (const match of source.matchAll(
        /(?:from\s*|import\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g,
      )) {
        const target = path.resolve(path.dirname(file), match[1]);
        const relative = path
          .relative(path.join(root, "packages"), target)
          .split(path.sep);
        const other = relative[0];
        assert.ok(
          other in allowed,
          `${file} imports outside the package distribution: ${match[1]}`,
        );
        if (other !== owner)
          assert.ok(
            dependencies.includes(other),
            `${owner} must not depend on ${other}`,
          );
      }
      if (file.includes(`${path.sep}browser${path.sep}`))
        assert.doesNotMatch(
          source,
          /from\s*["']node:/,
          "browser source must remain portable",
        );
    }
  }
});
