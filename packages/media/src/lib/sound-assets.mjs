import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  slug,
  exists,
  readJson,
  writeJson,
} from "../../../core/src/lib/files.mjs";
import { sourceTransaction } from "../../../core/src/lib/source-transaction.mjs";

async function projectMetadata(project) {
  const file = path.join(project, "design.json");
  if (!(await exists(file)))
    return { schemaVersion: 1, designSystems: [], assets: [] };
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(
      "Project metadata must be a regular local design.json file.",
    );
  const meta = await readJson(file);
  if (meta.schemaVersion !== 1 || !Array.isArray(meta.assets))
    throw new Error("Unsupported project metadata.");
  return meta;
}
export async function soundDestination(root, prompt, name) {
  const project = await fs.realpath(root);
  if (!(await fs.stat(project)).isDirectory())
    throw new Error("Expected a project directory.");
  if (
    name != null &&
    (typeof name !== "string" || !/^[a-z0-9][a-z0-9_-]*(?:\.mp3)?$/.test(name))
  )
    throw new Error(
      "Sound name must be a lowercase filename slug, optionally ending in .mp3.",
    );
  const base =
    name?.replace(/\.mp3$/, "") ??
    `${slug(prompt).slice(0, 64)}-${randomUUID().slice(0, 8)}`;
  const folder = path.join(project, "scraps");
  if (await exists(folder)) {
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error(
        "The project scraps path must be a regular local directory.",
      );
  }
  const relativePath = `scraps/${base}.mp3`;
  const file = path.join(project, relativePath);
  if (await exists(file))
    throw new Error("Sound output already exists; choose a different name.");
  await projectMetadata(project);
  return { project, relativePath, file, folder };
}
export async function reserveSound(destination) {
  const { project, folder, file } = destination;
  await fs.mkdir(folder, { recursive: true });
  if (
    (await fs.realpath(folder)) !== folder ||
    (await fs.realpath(project)) !== project
  )
    throw new Error("Sound destination changed before generation.");
  const lock = path.join(folder, `.${path.basename(file)}.pending`);
  let handle;
  try {
    handle = await fs.open(lock, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "This sound filename is reserved by another request. Check that request before trying again.",
      );
    throw error;
  }
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
    );
    await handle.close();
    if (await exists(file))
      throw new Error("Sound output already exists; choose a different name.");
    await projectMetadata(project);
    return async () => fs.rm(lock, { force: true });
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.rm(lock, { force: true });
    throw error;
  }
}
export async function saveSound(destination, bytes, request) {
  const { folder, file, project, relativePath } = destination;
  if ((await fs.realpath(folder)) !== folder)
    throw new Error(
      "Sound destination changed during generation; no audio was written.",
    );
  const temporary = path.join(folder, `.${randomUUID()}.sound`);
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    // A hard link publishes a complete file without replacing an existing result.
    await fs.link(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const provider =
    new URL(request.endpoint).hostname === "api.elevenlabs.io"
      ? "elevenlabs"
      : "configured-sound-provider";
  let registration;
  try {
    await sourceTransaction(path.join(project, "design.json"), async () => {
      const lock = path.join(project, ".codex-sound-registration.pending");
      const handle = await fs.open(lock, "wx", 0o600);
      try {
        const meta = await projectMetadata(project);
        const entry = {
          path: relativePath,
          type: "audio",
          source: provider,
          generation: {
            provider,
            endpoint: request.endpoint,
            prompt: request.body.text,
            promptInfluence: request.body.prompt_influence,
            ...(request.body.duration_seconds == null
              ? {}
              : { requestedDurationSeconds: request.body.duration_seconds }),
            createdAt: new Date().toISOString(),
            bytes: bytes.length,
            sha256,
          },
        };
        const existing = meta.assets.findIndex(
          (asset) => asset.path === relativePath,
        );
        if (existing < 0) meta.assets.push(entry);
        else meta.assets[existing] = { ...meta.assets[existing], ...entry };
        await writeJson(path.join(project, "design.json"), meta);
      } finally {
        await handle.close();
        await fs.rm(lock, { force: true });
      }
    });
    registration = { registered: true };
  } catch (error) {
    registration = {
      registered: false,
      error:
        error.code === "EEXIST"
          ? "The MP3 was saved, but another sound writer holds the project registration reservation. Keep the audio and register it after that writer finishes."
          : "The MP3 was saved, but project metadata could not be updated. Keep the audio and register it manually after resolving design.json.",
    };
  }
  return { file, bytes: bytes.length, sha256, registration };
}
