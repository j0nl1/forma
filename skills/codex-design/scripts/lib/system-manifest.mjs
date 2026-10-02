import fs from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { exists, safeFile, slug } from "./files.mjs";
import path from "node:path";
import { sourceNamespace } from "./system-authoring.mjs";

export const systemHash = (value) =>
  createHash("sha256").update(value).digest("hex");
export const systemNamespace = (value) =>
  typeof value === "string" &&
  /^CodexDS_[A-Za-z0-9_]+_[a-f0-9]{12}$/.test(value);
const newNamespace = (name) =>
  "CodexDS_" + name.replace(/-/g, "_") + "_" + randomBytes(6).toString("hex");
export async function namespaceFor(root, name) {
  const file = path.join(root, "_ds_manifest.json");
  if (await exists(file)) {
    const previous = JSON.parse(
      await fs.readFile(await safeFile(root, "_ds_manifest.json"), "utf8"),
    );
    if (previous.namespace != null) {
      if (previous.schemaVersion !== 1 && sourceNamespace(previous.namespace))
        return newNamespace(name);
      if (!systemNamespace(previous.namespace))
        throw new Error("Invalid persisted design-system namespace");
      return previous.namespace;
    }
  }
  if (await exists(path.join(root, "_ds_bundle.js"))) {
    const bundle = await fs.readFile(
      await safeFile(root, "_ds_bundle.js"),
      "utf8",
    );
    const header = bundle.match(/^\/\* @codex-ds namespace=(\S+) \*\//)?.[1];
    if (header != null) {
      if (!systemNamespace(header))
        throw new Error("Invalid persisted design-system bundle namespace");
      return header;
    }
  }
  return newNamespace(name);
}
export async function compiledSystem(root) {
  root = await fs.realpath(root);
  const bytes = await fs.readFile(await safeFile(root, "_ds_manifest.json"));
  const manifest = JSON.parse(bytes);
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.slug !== "string" ||
    slug(manifest.slug) !== manifest.slug
  )
    throw new Error("Invalid design-system manifest");
  if (manifest.namespace != null && !systemNamespace(manifest.namespace))
    throw new Error("Invalid design-system namespace");
  if (
    !manifest.artifacts ||
    typeof manifest.artifacts !== "object" ||
    Array.isArray(manifest.artifacts) ||
    !Object.hasOwn(manifest.artifacts, manifest.css) ||
    (manifest.bundle && !Object.hasOwn(manifest.artifacts, manifest.bundle))
  )
    throw new Error("Incomplete artifact manifest");
  const files = new Map();
  for (const [name, expected] of Object.entries(manifest.artifacts)) {
    if (
      path.basename(name) !== name ||
      [".", "..", "_ds_manifest.json"].includes(name) ||
      !/^[a-f0-9]{64}$/.test(expected)
    )
      throw new Error("Artifact names must be basenames with SHA-256 hashes");
    const file = await safeFile(root, name);
    if ((await fs.lstat(path.join(root, name))).isSymbolicLink())
      throw new Error("Design-system artifacts must not be symlinks");
    const content = await fs.readFile(file);
    if (systemHash(content) !== expected)
      throw new Error(`Stale compiled artifact: ${name}`);
    files.set(name, content);
  }
  return { root, manifest, bytes, files };
}
