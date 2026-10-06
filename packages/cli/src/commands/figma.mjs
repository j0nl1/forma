#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, main, readJson } from "../../../core/src/lib/files.mjs";
import { importFig } from "../../../figma/src/import.mjs";
export * from "../../../figma/src/import.mjs";
export async function run(argv = process.argv.slice(2)) {
  const { positional: p, flags } = args(argv, {
    "--node": "value",
  });
  if (
    ![
      "outline",
      "mount",
      "render",
      "materialize",
      "design-system",
      "components",
    ].includes(p[0]) ||
    p.length !== (p[0] === "outline" ? 2 : 3)
  )
    throw new Error(
      "Usage: node figma.mjs outline <file.fig> | mount|design-system|components <file.fig> <folder> | render|materialize <file.fig> <destination> --node <id-or-name>",
    );
  console.log(JSON.stringify(await importFig(...p, flags.node), null, 2));
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(() => run());
