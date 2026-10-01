#!/usr/bin/env node
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { args, main, exists } from "./lib/files.mjs";
export async function bundle(
  entry,
  out,
  { globalName, overwrite = false } = {},
) {
  if (!overwrite && (await exists(out)))
    throw new Error(`Output exists: ${out}`);
  await build({
    entryPoints: [path.resolve(entry)],
    outfile: path.resolve(out),
    bundle: true,
    format: "iife",
    globalName,
    platform: "browser",
    jsx: "automatic",
    target: ["es2022"],
    nodePaths: [
      fileURLToPath(new URL("../node_modules", import.meta.url)),
      fileURLToPath(new URL("../../../node_modules", import.meta.url)),
    ],
    logLevel: "silent",
    legalComments: "eof",
  });
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional: p, flags } = args(process.argv.slice(2), {
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
  });
