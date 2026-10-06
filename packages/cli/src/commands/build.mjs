#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, main, readJson } from "../../../core/src/lib/files.mjs";
import { bundle } from "../../../runtime/src/node/build.mjs";
export * from "../../../runtime/src/node/build.mjs";
export async function run(argv = process.argv.slice(2)) {
  const { positional: p, flags } = args(argv, {
    "--global": "value",
    "--overwrite": "boolean",
  });
  if (p.length !== 2)
    throw new Error(
      "Usage: node build.mjs <entry.js|jsx|tsx> <output.js> [--global <name>] [--overwrite]",
    );
  await bundle(p[0], p[1], {
    globalName: flags.global,
    overwrite: flags.overwrite,
  });
  console.log(JSON.stringify({ output: path.resolve(p[1]) }));
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(() => run());
