#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import {
  args,
  main,
  exists,
  walk,
  readJson,
  writeJson,
} from "../skills/studio-design/scripts/lib/files.mjs";
const source = fileURLToPath(
  new URL("../skills/studio-design", import.meta.url),
);
const digest = (data) => createHash("sha256").update(data).digest("hex");
const marker = ".studio-design-install.json";
export async function install(
  destination,
  { update = false, dryRun = false } = {},
) {
  destination = path.resolve(destination);
  const files = await walk(source);
  const names = files.map((f) => path.relative(source, f));
  if (await exists(destination)) {
    if (!update)
      throw new Error(
        `Destination exists; use --update for a managed installation: ${destination}`,
      );
    if ((await fs.lstat(destination)).isSymbolicLink())
      throw new Error("Refusing to update a symlink installation");
    const record = await readJson(path.join(destination, marker));
    if (record.package !== "studio-design" || record.schemaVersion !== 1)
      throw new Error(
        "Destination is not a managed Studio Design installation",
      );
    const present = await walk(destination);
    for (const file of present) {
      const name = path.relative(destination, file);
      if (name === marker) continue;
      if (
        !(name in record.files) ||
        digest(await fs.readFile(file)) !== record.files[name]
      )
        throw new Error(`Local changes would be lost: ${name}`);
    }
    for (const name of Object.keys(record.files))
      if (!(await exists(path.join(destination, name))))
        throw new Error(`Installed file removed locally: ${name}`);
  }
  if (dryRun) return { destination, files: names, update };
  await fs.mkdir(path.dirname(destination), { recursive: true });
  // Resolve ancestors once; a symlink at the destination itself is rejected above.
  const parent = await fs.realpath(path.dirname(destination));
  destination = path.join(parent, path.basename(destination));
  const staged = path.join(parent, `.studio-design-${randomUUID()}`),
    backup = staged + ".previous";
  const hashes = {};
  await fs.mkdir(staged);
  try {
    for (const file of files) {
      const rel = path.relative(source, file);
      const dest = path.join(staged, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      const bytes = await fs.readFile(file);
      hashes[rel] = digest(bytes);
      await fs.writeFile(dest, bytes);
    }
    await writeJson(path.join(staged, marker), {
      schemaVersion: 1,
      package: "studio-design",
      version: "1.0.0",
      files: hashes,
    });
    if (await exists(destination)) await fs.rename(destination, backup);
    try {
      await fs.rename(staged, destination);
    } catch (e) {
      if (await exists(backup)) await fs.rename(backup, destination);
      throw e;
    }
    await fs.rm(backup, { recursive: true, force: true });
  } finally {
    await fs.rm(staged, { recursive: true, force: true });
  }
  return { destination, files: names.length, dependenciesInstalled: false };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional: p, flags } = args(process.argv.slice(2), {
      "--global": "boolean",
      "--project": "value",
      "--dest": "value",
      "--update": "boolean",
      "--dry-run": "boolean",
    });
    if (
      p.length ||
      [flags.global, flags.project, flags.dest].filter(Boolean).length !== 1
    )
      throw new Error(
        "Usage: node tools/install.mjs --global | --project <folder> | --dest <skill-folder> [--update] [--dry-run]",
      );
    const dest =
      flags.dest ||
      path.join(
        flags.global ? os.homedir() : path.resolve(flags.project),
        ".agents",
        "skills",
        "studio-design",
      );
    console.log(
      JSON.stringify(
        await install(dest, { update: flags.update, dryRun: flags["dry-run"] }),
        null,
        2,
      ),
    );
  });
