#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, main, readJson } from "../../../core/src/lib/files.mjs";
import {
  initConfig,
  checkConfig,
  resolveConfig,
} from "../../../core/src/config.mjs";
export * from "../../../core/src/config.mjs";
export async function runConfigCli(argv) {
  const { positional: p, flags } = args(argv, {
    "--request": "value",
    "--capabilities": "value",
    "--needs": "value",
  });
  const [command, root] = p;
  if (
    p.length !== 2 ||
    !["init", "check", "resolve"].includes(command) ||
    (command !== "resolve" && Object.keys(flags).length)
  )
    throw new Error(
      "Usage: config.mjs init|check|resolve <project-folder> [--request <relative.json>] [--capabilities <relative.json>] [--needs speech,image,video,transcription,ocr]",
    );
  if (command === "init") return initConfig(root);
  if (command === "check") return checkConfig(root);
  return resolveConfig(root, {
    request: flags.request,
    capabilities: flags.capabilities,
    needs: flags.needs === undefined ? [] : flags.needs.split(","),
  });
}
export async function run(argv = process.argv.slice(2)) {
  console.log(JSON.stringify(await runConfigCli(argv), null, 2));
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(() => run());
