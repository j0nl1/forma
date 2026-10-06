#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { existsSync, realpathSync } from "node:fs";
import { main } from "../../core/src/lib/files.mjs";

const commands = new Set([
  "adherence",
  "build",
  "catalog",
  "composition",
  "config",
  "design-system",
  "export",
  "figma",
  "preview",
  "project",
  "sound-effects",
  "source-to-audio",
  "verify",
]);
export async function run(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command === "--help" || command === "help") {
    console.log(
      `Usage: forma <command> [arguments]\nCommands: ${[...commands].join(", ")}`,
    );
    return;
  }
  if (!commands.has(command))
    throw new Error("Unknown command; use forma --help");
  const module = await import(`./commands/${command}.mjs`);
  return module.run(rest);
}
if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
)
  main(() => run());
