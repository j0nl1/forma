import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { distributionPaths } from "../../core/src/resources.mjs";
import {
  contained,
  safeFile,
  exists,
  readJson,
} from "../../core/src/lib/files.mjs";
import { record } from "../../core/src/project.mjs";

const identifier = (value) =>
  typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function relative(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.split("/").some((part) => !part || part === "." || part === "..") ||
    path.isAbsolute(value)
  )
    throw new Error("Catalog paths must be contained relative paths");
  return value;
}
async function data(root, filename) {
  const file = await safeFile(root, relative(filename));
  if ((await fs.stat(file)).size > 256 * 1024)
    throw new Error("Catalog metadata exceeds 256 KiB");
  return JSON.parse(await fs.readFile(file, "utf8"));
}
export async function catalogList(
  { target, kind, tag } = {},
  paths = distributionPaths(),
) {
  const index = await data(paths.catalog, "index.json");
  if (index.schemaVersion !== 1 || !Array.isArray(index.items))
    throw new Error("Unsupported catalog index");
  const seen = new Set();
  const items = [];
  for (const reference of index.items) {
    if (!identifier(reference.id) || seen.has(reference.id))
      throw new Error("Invalid or duplicate catalog ID");
    seen.add(reference.id);
    const item = await data(paths.catalog, reference.manifest);
    if (
      item.id !== reference.id ||
      item.schemaVersion !== 1 ||
      !["primitive", "component", "template", "preset"].includes(item.kind) ||
      typeof item.description !== "string" ||
      !Array.isArray(item.targets) ||
      !Array.isArray(item.tags) ||
      !Array.isArray(item.requirements) ||
      !Array.isArray(item.files) ||
      !item.parameters ||
      item.parameters.type !== "object" ||
      !item.parameters.properties ||
      typeof item.parameters.properties !== "object" ||
      Array.isArray(item.parameters.properties) ||
      !Array.isArray(item.dependencies) ||
      item.dependencies.some(
        (id) =>
          !identifier(id) ||
          !index.items.some((reference) => reference.id === id),
      )
    )
      throw new Error(`Invalid catalog item: ${reference.id}`);
    if (
      (!target || item.targets.includes(target)) &&
      (!kind || item.kind === kind) &&
      (!tag || item.tags.includes(tag))
    )
      items.push({
        id: item.id,
        kind: item.kind,
        description: item.description,
        targets: item.targets,
        tags: item.tags,
        requirements: item.requirements,
        ...(item.preview ? { preview: item.preview } : {}),
      });
  }
  return items;
}
export async function catalogShow(id, paths = distributionPaths()) {
  if (!identifier(id)) throw new Error("Invalid catalog ID");
  const index = await data(paths.catalog, "index.json");
  await catalogList({}, paths);
  const reference = index.items.find((item) => item.id === id);
  if (!reference) throw new Error(`Unknown catalog item: ${id}`);
  const item = await data(paths.catalog, reference.manifest);
  const names = new Set();
  for (const file of item.files) {
    relative(file.target);
    if (names.has(file.target) || file.target === ".forma-catalog.json")
      throw new Error("Duplicate or reserved catalog output");
    names.add(file.target);
    await safeFile(paths.root, relative(file.source));
  }
  if (!item.entry || !names.has(item.entry))
    throw new Error("Catalog entry is not in its file closure");
  const entry = item.files.find((file) => file.target === item.entry);
  const resourceDirectory = path.posix.dirname(reference.manifest);
  if (
    !entry.source.startsWith("catalog/" + resourceDirectory + "/") ||
    !item.files.some(
      (file) =>
        file.source === "catalog/" + reference.manifest &&
        file.target === "manifest.json",
    )
  )
    throw new Error("Catalog resources must own their entry and manifest");
  if (!item.preview || !names.has(item.preview))
    throw new Error("Catalog resource has no local preview");
  if (item.guide) {
    item.instructions = await fs.readFile(
      await safeFile(paths.skill, relative(item.guide)),
      "utf8",
    );
  }
  if (!item.instructions) {
    const readme = item.files.find((file) => file.target === "README.md");
    if (readme)
      item.instructions = await fs.readFile(
        await safeFile(paths.root, readme.source),
        "utf8",
      );
  }
  return item;
}
export async function catalogAdd(
  id,
  project,
  { dryRun = false } = {},
  paths = distributionPaths(),
) {
  const item = await catalogShow(id, paths);
  const root = await fs.realpath(path.resolve(project));
  const relativeDirectory = `assets/catalog/${id}`;
  const destination = path.join(root, relativeDirectory);
  const metadata = path.join(root, "design.json");
  if (await exists(metadata)) {
    const existing = await readJson(await safeFile(root, "design.json"));
    if (existing.schemaVersion !== 1 || !Array.isArray(existing.assets))
      throw new Error("Unsupported project metadata");
  }
  if (await exists(destination))
    throw new Error(`Catalog destination exists: ${relativeDirectory}`);
  const { resourceFiles } = await import("./resource-files.mjs");
  const files = (await resourceFiles(item, paths)).map((file) => ({
    ...file,
    sha256: digest(file.bytes),
  }));
  if (item.kind === "preset") {
    const seen = new Set();
    const copyGuide = async (name) => {
      if (seen.has(name)) return;
      seen.add(name);
      const source = await fs.readFile(
        await safeFile(paths.skill, relative(name)),
        "utf8",
      );
      const dependencies = [];
      const rewritten = source.replace(/\]\(([^)]+)\)/g, (match, href) => {
        const [link, ...fragment] = href.split("#");
        if (!link || /^(?:\w+:)/.test(link)) return match;
        const dependency = path.posix.normalize(
          path.posix.join(path.posix.dirname(name), link),
        );
        if (!dependency.startsWith("../") && dependency.endsWith(".md")) {
          dependencies.push(dependency);
          return match;
        }
        // Repository-only documentation and executable source are references,
        // not dependencies to execute or fetch while installing a preset.
        const repositoryPath = dependency.startsWith("packages/")
          ? dependency
          : path.posix.normalize(`skills/forma/${dependency}`);
        return `](https://github.com/j0nl1/forma/blob/main/${repositoryPath}${fragment.length ? "#" + fragment.join("#") : ""})`;
      });
      const bytes = Buffer.from(rewritten);
      files.push({ path: `guides/${name}`, bytes, sha256: digest(bytes) });
      for (const dependency of dependencies) await copyGuide(dependency);
    };
    if (!item.guide) throw new Error("Preset has no instructions");
    await copyGuide(item.guide);
  }
  const entry = item.entry ?? `guides/${item.guide}`;
  const report = {
    id,
    kind: item.kind,
    destination,
    entry: `${relativeDirectory}/${entry}`,
    requirements: item.requirements,
    files: files.map(({ path, sha256 }) => ({ path, sha256 })),
  };
  if (dryRun) return { ...report, dryRun: true };
  // Resolve each existing ancestor before creating the next directory.
  let parent = root;
  for (const name of ["assets", "catalog"]) {
    parent = path.join(parent, name);
    await fs.mkdir(parent).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    contained(root, await fs.realpath(parent));
  }
  const staged = path.join(parent, `.forma-catalog-${randomUUID()}`);
  await fs.mkdir(staged);
  let reserved = false;
  try {
    for (const file of files) {
      const target = path.join(staged, file.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.bytes, { flag: "wx" });
    }
    await fs.writeFile(
      path.join(staged, ".forma-catalog.json"),
      JSON.stringify({ schemaVersion: 1, ...report }, null, 2) + "\n",
      { flag: "wx" },
    );
    // Reserve atomically: even an empty existing directory must not be replaced.
    await fs.mkdir(destination);
    reserved = true;
    for (const name of await fs.readdir(staged))
      await fs.rename(path.join(staged, name), path.join(destination, name));
    await record(root, report.entry, {
      type: item.kind,
      source: `forma-catalog:${id}`,
    });
    return report;
  } catch (error) {
    if (reserved) await fs.rm(destination, { recursive: true, force: true });
    throw error;
  } finally {
    await fs.rm(staged, { recursive: true, force: true });
  }
}
