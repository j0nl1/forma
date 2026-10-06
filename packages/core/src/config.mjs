import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { exists, safeFile } from "./lib/files.mjs";
import {
  validatePreferences,
  resolvePreferences,
} from "./lib/config-model.mjs";

const filename = "forma.toml";
const maxBytes = 64 * 1024;
async function readBounded(root, relative) {
  const file = await safeFile(root, relative);
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes)
      throw new Error("Configuration input exceeds 64 KiB or is not a file");
    const buffer = Buffer.alloc(maxBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const read = await handle.read(buffer, size, buffer.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > maxBytes) throw new Error("Configuration input exceeds 64 KiB");
    return new TextDecoder("utf-8", { fatal: true }).decode(
      buffer.subarray(0, size),
    );
  } finally {
    await handle.close();
  }
}
export async function checkConfig(projectRoot) {
  const root = await fs.realpath(path.resolve(projectRoot));
  const file = path.join(root, filename);
  if (!(await exists(file)))
    return { configured: false, file, preferences: { schema_version: 1 } };
  const source = await readBounded(root, filename);
  let preferences;
  try {
    preferences = parse(source, { maxDepth: 16, unsafeKeyBehaviour: "throw" });
  } catch {
    throw new Error("Invalid forma.toml syntax or unsafe table key");
  }
  validatePreferences(preferences);
  return { configured: true, file, preferences };
}
export async function initConfig(projectRoot) {
  const root = await fs.realpath(path.resolve(projectRoot));
  const target = path.join(root, filename);
  const temp = path.join(root, `.forma-config-${randomUUID()}.tmp`);
  const template = fileURLToPath(
    new URL("../templates/forma.toml", import.meta.url),
  );
  try {
    await fs.writeFile(temp, await fs.readFile(template), {
      flag: "wx",
      mode: 0o600,
    });
    await fs.link(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
  return { file: target, created: true };
}
export async function resolveConfig(
  projectRoot,
  { request, capabilities, needs = [] } = {},
) {
  const checked = await checkConfig(projectRoot);
  const root = path.dirname(checked.file);
  const read = async (relative) => {
    const source = await readBounded(root, relative);
    try {
      return JSON.parse(source);
    } catch {
      throw new Error("Invalid configuration companion JSON");
    }
  };
  const explicit = request ? await read(request) : {};
  const snapshot = capabilities ? await read(capabilities) : undefined;
  return {
    configured: checked.configured,
    file: checked.file,
    ...resolvePreferences(root, checked.preferences, explicit, snapshot, needs),
  };
}
