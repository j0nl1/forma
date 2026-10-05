import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const html = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const slug = (value) =>
  String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "design";
export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}
export async function exists(file) {
  try {
    await fs.lstat(file);
    return true;
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
}
export function contained(root, candidate) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
    throw new Error(`Path leaves allowed root: ${candidate}`);
  return candidate;
}
export async function safeFile(root, relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes("\0")
  )
    throw new Error(`Expected a relative path: ${relative}`);
  const base = await fs.realpath(root);
  const full = contained(base, path.resolve(base, relative));
  const real = await fs.realpath(full);
  contained(base, real);
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new Error(`Expected a file: ${relative}`);
  return real;
}
export async function walk(root) {
  const out = [];
  for (const item of await fs.readdir(root, { withFileTypes: true })) {
    if (item.name === "node_modules" || item.name === ".git") continue;
    const full = path.join(root, item.name);
    if (item.isSymbolicLink())
      throw new Error(`Symlinks are not supported: ${full}`);
    if (item.isDirectory()) out.push(...(await walk(full)));
    else if (item.isFile()) out.push(full);
  }
  return out.sort();
}
export async function write(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Write to a sibling temporary file so a failed write cannot truncate a result.
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, value);
    await fs.rename(tmp, file);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}
export const writeJson = (file, value) =>
  write(file, JSON.stringify(value, null, 2) + "\n");
export function args(argv, allowed = {}) {
  const positional = [],
    flags = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      positional.push(item);
      continue;
    }
    if (!(item in allowed)) throw new Error(`Unknown option: ${item}`);
    if (allowed[item] === "boolean") flags[item.slice(2)] = true;
    else {
      const next = argv[++i];
      if (next == null || next.startsWith("--"))
        throw new Error(`Missing value for ${item}`);
      flags[item.slice(2)] = next;
    }
  }
  return { positional, flags };
}
export function main(fn) {
  Promise.resolve()
    .then(fn)
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
export function localUrl(value) {
  const u = new URL(value);
  if (
    u.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
    u.username ||
    u.password
  )
    throw new Error("Expected a loopback HTTP URL.");
  return u.href;
}
