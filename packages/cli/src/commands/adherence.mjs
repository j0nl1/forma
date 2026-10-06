#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, main, readJson } from "../../../core/src/lib/files.mjs";
import { checkAdherence } from "../../../exports/src/adherence.mjs";
export * from "../../../exports/src/adherence.mjs";
export async function run(argv = process.argv.slice(2)) {
  const { positional, flags } = args(argv, {
    "--strict": "boolean",
  });
  if (positional.length !== 2)
    throw new Error(
      "Usage: node adherence.mjs <compiled-system-or-bound-project> <source-file-or-folder> [--strict]",
    );
  const report = await checkAdherence(...positional);
  console.log(JSON.stringify(report, null, 2));
  if (report.errors) process.exitCode = 2;
  else if (flags.strict && report.warnings) process.exitCode = 1;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(() => run());
