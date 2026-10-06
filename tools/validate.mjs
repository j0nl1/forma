import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { walk, readJson, exists } from "../packages/core/src/lib/files.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const skill = path.join(root, "skills/forma");
const files = await walk(root);
const issues = [];
for (const file of files) {
  if (/\.(mjs|js)$/.test(file))
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    } catch (e) {
      issues.push(e.stderr.toString());
    }
  if (file.endsWith(".md")) {
    const content = await fs.readFile(file, "utf8");
    for (const m of content.matchAll(/\]\(([^)]+)\)/g)) {
      const link = m[1];
      if (/^(?:https?:|#|app:)/.test(link) || link.includes("<")) continue;
      if (!(await exists(path.resolve(path.dirname(file), link.split("#")[0]))))
        issues.push(`Broken link in ${path.relative(root, file)}: ${link}`);
    }
    if (/\bTODO\b|\[TODO/.test(content))
      issues.push(`Unfinished placeholder: ${file}`);
  }
}
const checkoutPackage = await readJson(path.join(root, "package.json"));
const skillPackage = await readJson(path.join(skill, "package.json"));
for (const manifest of [checkoutPackage, skillPackage])
  if (
    manifest.dependencies.react !== "18.3.1" ||
    manifest.dependencies["react-dom"] !== "18.3.1"
  )
    issues.push("React and ReactDOM must use the single pinned 18.3.1 pair");
const types = await readJson(path.join(skill, "project-types.json"));
if (new Set(types.projectTypes.map((t) => t.id)).size !== 13)
  issues.push("Expected 13 unique project types");
for (const t of types.projectTypes)
  for (const relative of [t.reference, ...t.starters])
    if (
      !(await exists(
        path.join(relative.startsWith("packages/") ? root : skill, relative),
      ))
    )
      issues.push(`Missing routed resource: ${relative}`);
const body = await fs.readFile(path.join(skill, "SKILL.md"), "utf8");
if (!body.startsWith("---\nname: forma\ndescription:"))
  issues.push("Invalid skill frontmatter");
try {
  const description = JSON.parse(body.match(/^description: (.+)$/m)?.[1] ?? "");
  if (typeof description !== "string" || !description.trim())
    issues.push("Missing skill description");
} catch {
  issues.push("Skill description must be a valid quoted YAML string");
}
if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Validated ${files.length} files, 13 project types, script syntax, and Markdown links.`,
  );
