import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  walk,
  readJson,
  exists,
} from "../skills/codex-design/scripts/lib/files.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const skill = path.join(root, "skills/codex-design");
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
const packagedReact18 = await readJson(
  path.join(skill, "runtimes/react18/package.json"),
);
const checkoutReact18 = await readJson(
  path.join(root, "runtimes/react18/package.json"),
);
if (JSON.stringify(packagedReact18) !== JSON.stringify(checkoutReact18))
  issues.push(
    "React 18 runtime packaging metadata differs from the checkout workspace",
  );
const types = await readJson(path.join(skill, "project-types.json"));
if (new Set(types.projectTypes.map((t) => t.id)).size !== 13)
  issues.push("Expected 13 unique project types");
for (const t of types.projectTypes)
  for (const relative of [t.reference, ...t.starters])
    if (!(await exists(path.join(skill, relative))))
      issues.push(`Missing routed resource: ${relative}`);
const body = await fs.readFile(path.join(skill, "SKILL.md"), "utf8");
if (!body.startsWith("---\nname: codex-design\ndescription:"))
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
