import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Repository and installed distributions share the same package layout.
export function distributionPaths() {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const repositorySkill = path.join(root, "skills/forma");
  return {
    root,
    packages: path.join(root, "packages"),
    catalog: path.join(root, "catalog"),
    skill: existsSync(path.join(repositorySkill, "SKILL.md"))
      ? repositorySkill
      : root,
  };
}
