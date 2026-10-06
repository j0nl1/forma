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
} from "../packages/core/src/lib/files.mjs";
const source = fileURLToPath(new URL("../skills/forma", import.meta.url));
const digest = (data) => createHash("sha256").update(data).digest("hex");
const marker = ".forma-install.json";
export function installationDestination(
  { global, project, dest, harness } = {},
  { homeDir = os.homedir() } = {},
) {
  const roots = {
    shared: ".agents",
    codex: ".agents",
    claude: ".claude",
    gemini: ".gemini",
    opencode: global ? path.join(".config", "opencode") : ".opencode",
  };
  if ([global, project, dest].filter(Boolean).length !== 1)
    throw new Error("Choose exactly one of --global, --project or --dest");
  if (dest) {
    if (harness)
      throw new Error("Use --dest without --harness for a custom skill root");
    return path.resolve(dest);
  }
  const target = harness ?? "shared";
  if (!Object.hasOwn(roots, target))
    throw new Error(
      `Unknown harness: ${target}; choose shared, codex, claude, gemini or opencode, or use --dest`,
    );
  return path.resolve(
    global ? homeDir : project,
    roots[target],
    "skills",
    "forma",
  );
}
export async function install(
  destination,
  { update = false, dryRun = false } = {},
) {
  destination = path.resolve(destination);
  const checkout = fileURLToPath(new URL("..", import.meta.url));
  const files = (await walk(source)).map((file) => ({
    file,
    name: path.relative(source, file),
  }));
  for (const directory of ["packages", "catalog"])
    for (const file of await walk(path.join(checkout, directory)))
      files.push({ file, name: path.relative(checkout, file) });
  files.push({ file: path.join(checkout, "LICENSE"), name: "LICENSE" });
  const names = files.map(({ name }) => name);
  if (await exists(destination)) {
    if (!update)
      throw new Error(
        `Destination exists; use --update for a managed installation: ${destination}`,
      );
    if ((await fs.lstat(destination)).isSymbolicLink())
      throw new Error("Refusing to update a symlink installation");
    if (!(await exists(path.join(destination, marker))))
      throw new Error("Destination is not a managed Forma installation");
    const record = await readJson(path.join(destination, marker));
    if (record.package !== "forma" || record.schemaVersion !== 1)
      throw new Error("Destination is not a managed Forma installation");
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
  const staged = path.join(parent, `.forma-${randomUUID()}`),
    backup = staged + ".previous";
  const hashes = {};
  await fs.mkdir(staged);
  try {
    for (const { file, name: rel } of files) {
      const dest = path.join(staged, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      let bytes = await fs.readFile(file);
      if (file.startsWith(source + path.sep) && file.endsWith(".md")) {
        const text = bytes
          .toString("utf8")
          .replace(/\]\(([^)]+)\)/g, (match, link) => {
            if (/^(?:\w+:|#)/.test(link)) return match;
            const [relative, ...fragment] = link.split("#");
            const target = path.resolve(path.dirname(file), relative);
            const item = files.find((entry) => entry.file === target);
            if (!item) return match;
            const installedLink = path
              .relative(path.dirname(rel), item.name)
              .split(path.sep)
              .join("/");
            return `](${installedLink}${fragment.length ? "#" + fragment.join("#") : ""})`;
          });
        bytes = Buffer.from(text);
      }
      hashes[rel] = digest(bytes);
      await fs.writeFile(dest, bytes);
    }
    await writeJson(path.join(staged, marker), {
      schemaVersion: 1,
      package: "forma",
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
      "--harness": "value",
      "--update": "boolean",
      "--dry-run": "boolean",
    });
    if (p.length)
      throw new Error(
        "Usage: node tools/install.mjs --global | --project <folder> | --dest <skill-folder> [--harness shared|codex|claude|gemini|opencode] [--update] [--dry-run]",
      );
    const dest = installationDestination(flags);
    console.log(
      JSON.stringify(
        await install(dest, { update: flags.update, dryRun: flags["dry-run"] }),
        null,
        2,
      ),
    );
  });
