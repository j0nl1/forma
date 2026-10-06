#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, main, readJson } from "../../../core/src/lib/files.mjs";
import { record } from "../../../core/src/project.mjs";
export * from "../../../core/src/project.mjs";
export async function run(argv = process.argv.slice(2)) {
  const { positional: p, flags } = args(argv, {
    "--type": "value",
    "--source": "value",
  });
  if (p.length !== 3 || p[0] !== "record")
    throw new Error(
      "Usage: node project.mjs record <project> <relative-file> [--type <type>] [--source <url-or-description>]",
    );
  console.log(JSON.stringify(await record(path.resolve(p[1]), p[2], flags)));
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(() => run());
