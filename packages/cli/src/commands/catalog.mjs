#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { args, main } from "../../../core/src/lib/files.mjs";
import {
  catalogList,
  catalogShow,
  catalogAdd,
} from "../../../catalog/src/index.mjs";

export async function run(argv = process.argv.slice(2)) {
  const { positional: p, flags } = args(argv, {
    "--target": "value",
    "--kind": "value",
    "--tag": "value",
    "--dry-run": "boolean",
  });
  const [command, id, project] = p;
  if (
    !["list", "show", "add"].includes(command) ||
    p.length !== { list: 1, show: 2, add: 3 }[command] ||
    Object.keys(flags).some((key) =>
      command === "list"
        ? key === "dry-run"
        : command === "add"
          ? key !== "dry-run"
          : true,
    )
  )
    throw new Error(
      "Usage: forma catalog list [--target <medium>] [--kind component|template|preset] [--tag <tag>] | show <id> | add <id> <project> [--dry-run]",
    );
  const result =
    command === "list"
      ? await catalogList(flags)
      : command === "show"
        ? await catalogShow(id)
        : await catalogAdd(id, project, { dryRun: flags["dry-run"] });
  console.log(JSON.stringify(result, null, 2));
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(() => run());
