import path from "node:path";
import { exists, safeFile, readJson, writeJson } from "./lib/files.mjs";
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
