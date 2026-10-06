#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { args, main } from "../../../core/src/lib/files.mjs";
import {
  readCompositionSource,
  saveCompositionSource,
} from "../../../runtime/src/node/composition-source.mjs";

export async function compositionCommand(argv) {
  const { positional, flags } = args(argv, {
    "--clip": "value",
    "--start": "value",
    "--base-version": "value",
    "--operation-id": "value",
  });
  const [command, file] = positional;
  if (
    positional.length !== 2 ||
    !["inspect", "move", "undo", "redo"].includes(command)
  )
    throw new Error(
      "Usage: node composition.mjs inspect <HTML> | move <HTML> --clip <id> --start <JSON seconds or reference> --base-version <SHA-256> --operation-id <id> | undo|redo <HTML> --base-version <SHA-256> --operation-id <id>",
    );
  if (command === "inspect") {
    if (Object.keys(flags).length)
      throw new Error("inspect does not accept write options");
    return { diagnostics: [], ...(await readCompositionSource(file)) };
  }
  if (
    command !== "move" &&
    (flags.clip !== undefined || flags.start !== undefined)
  )
    throw new Error("undo/redo do not accept clip fields");
  let start;
  if (command === "move") {
    if (flags.start === undefined) throw new Error("move requires --start");
    try {
      start = JSON.parse(flags.start);
    } catch {
      throw new Error(
        "--start must be a JSON number or {after,offset} reference",
      );
    }
  }
  return saveCompositionSource(file, {
    baseVersion: flags["base-version"],
    operationId: flags["operation-id"],
    action: command,
    ...(command === "move" ? { clipId: flags.clip, start } : {}),
  });
}
export async function run(argv = process.argv.slice(2)) {
  return compositionCommand(argv)
    .then((value) => console.log(JSON.stringify(value)))
    .catch((error) => {
      process.stderr.write(
        JSON.stringify({
          diagnostics: [
            {
              code: error.code ?? "COMPOSITION_COMMAND",
              message: error.message,
            },
          ],
        }) + "\n",
      );
      process.exitCode = 1;
    });
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(() => run());
