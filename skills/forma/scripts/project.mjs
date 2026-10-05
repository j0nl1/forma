#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  args,
  exists,
  safeFile,
  readJson,
  writeJson,
  main,
} from "./lib/files.mjs";
export async function record(
  root,
  file,
  { type = "ui-mockups", source = null } = {},
) {
  await safeFile(root, file);
  const dest = path.join(root, "design.json");
  const meta = (await exists(dest))
    ? await readJson(dest)
    : { schemaVersion: 1, designSystems: [], assets: [] };
  if (meta.schemaVersion !== 1 || !Array.isArray(meta.assets))
    throw new Error("Unsupported project metadata");
  const entry = { path: file, type, ...(source ? { source } : {}) };
  const i = meta.assets.findIndex((a) => a.path === file);
  if (i < 0) meta.assets.push(entry);
  else meta.assets[i] = { ...meta.assets[i], ...entry };
  await writeJson(dest, meta);
  return meta;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional: p, flags } = args(process.argv.slice(2), {
      "--type": "value",
      "--source": "value",
    });
    if (p.length !== 3 || p[0] !== "record")
      throw new Error(
        "Usage: node project.mjs record <project> <relative-file> [--type <type>] [--source <url-or-description>]",
      );
    console.log(JSON.stringify(await record(path.resolve(p[1]), p[2], flags)));
  });
