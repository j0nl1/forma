#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, main, readJson } from "../../../core/src/lib/files.mjs";
import {
  inspect,
  compile,
  preview,
  importSystem,
  wiring,
  discoverSystems,
  setPrimary,
} from "../../../design-systems/src/pipeline.mjs";
export * from "../../../design-systems/src/pipeline.mjs";
export async function run(argv = process.argv.slice(2)) {
  const { positional: p, flags } = args(argv, {
    "--primary": "boolean",
    "--update": "boolean",
    "--verbose": "boolean",
  });
  if (
    ![
      "check",
      "compile",
      "preview",
      "import",
      "discover",
      "wiring",
      "primary",
    ].includes(p[0]) ||
    p.length !== (["import", "primary"].includes(p[0]) ? 3 : 2)
  )
    throw new Error(
      "Usage: node design-system.mjs check <folder> [--verbose] | compile|preview <folder> | discover <designs-folder> | wiring <project> | primary <project> <slug> | import <system> <project> [--primary] [--update]",
    );
  if (
    Object.keys(flags).some((flag) =>
      flag === "verbose" ? p[0] !== "check" : p[0] !== "import",
    )
  )
    throw new Error(
      "--verbose applies to check; --primary and --update apply to import",
    );
  const root = path.resolve(p[1]);
  if (p[0] === "check") {
    const m = await inspect(root);
    console.log(
      JSON.stringify({
        ok: !m.issues.length,
        issues: m.issues,
        tokens: Object.keys(m.tokens).length,
        tokenDeclarations: m.tokenDetails.length,
        tokenKinds: m.tokenKinds,
        fonts: m.fonts,
        brandFonts: m.brandFonts,
        unclassified: m.unclassified,
        warnings: m.warnings,
        globalCssPaths: m.files,
        ...(flags.verbose ? { tokenDetails: m.tokenDetails } : {}),
        components: m.spec.components,
        cards: m.cards,
        startingPoints: m.spec.startingPoints,
        reactVersion: m.authoring?.version,
        runtimeDeclarations: m.authoring?.declarations,
        sourceNamespaces: m.authoring?.sourceNamespaces,
      }),
    );
    if (m.issues.length) process.exitCode = m.spec.css ? 1 : 2;
  } else if (p[0] === "primary")
    console.log(JSON.stringify(await setPrimary(root, p[2])));
  else
    console.log(
      JSON.stringify(
        await {
          compile,
          preview,
          import: importSystem,
          discover: discoverSystems,
          wiring,
        }[p[0]](root, p[2] && path.resolve(p[2]), flags),
      ),
    );
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(() => run());
