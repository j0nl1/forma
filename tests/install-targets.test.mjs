import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary, root } from "./helpers.mjs";
import { installationDestination } from "../tools/install.mjs";

test("installation selects shared and native roots without a harness process", async (t) => {
  const dir = await temporary(t);
  const homeDir = path.join(dir, "home");
  const project = path.join(dir, "project");
  const expected = {
    shared: [".agents", ".agents"],
    codex: [".agents", ".agents"],
    claude: [".claude", ".claude"],
    gemini: [".gemini", ".gemini"],
    opencode: [path.join(".config", "opencode"), ".opencode"],
  };
  for (const [harness, [userRoot, projectRoot]] of Object.entries(expected)) {
    assert.equal(
      installationDestination({ global: true, harness }, { homeDir }),
      path.join(homeDir, userRoot, "skills/studio-design"),
    );
    assert.equal(
      installationDestination({ project, harness }, { homeDir }),
      path.join(project, projectRoot, "skills/studio-design"),
    );
  }
  assert.equal(
    installationDestination({ global: true }, { homeDir }),
    path.join(homeDir, ".agents/skills/studio-design"),
  );
  assert.equal(
    installationDestination({ project }, { homeDir }),
    path.join(project, ".agents/skills/studio-design"),
  );
  await assert.rejects(fs.stat(homeDir));
  await assert.rejects(fs.stat(project));
});

test("ambiguous and unsupported installer targets fail before writing", () => {
  for (const flags of [
    {},
    { global: true, project: "/project" },
    { global: true, dest: "/custom" },
    { project: "/project", dest: "/custom" },
  ])
    assert.throws(() => installationDestination(flags), /exactly one/);
  for (const harness of ["unknown", "toString", "__proto__"])
    assert.throws(
      () => installationDestination({ global: true, harness }),
      /Unknown harness/,
    );
  assert.throws(
    () => installationDestination({ dest: "/custom", harness: "codex" }),
    /without --harness/,
  );
  assert.equal(
    installationDestination({ dest: "custom/studio-design" }),
    path.resolve("custom/studio-design"),
  );
});

test("CLI installs identical portable files in each project root and preserves local edits", async (t) => {
  const dir = await temporary(t);
  const installer = path.join(root, "tools/install.mjs");
  const source = path.join(root, "skills/studio-design");
  for (const harness of ["shared", "codex", "claude", "gemini", "opencode"]) {
    const project = path.join(dir, harness);
    const options = [installer, "--project", project, "--harness", harness];
    const run = (extra = []) =>
      JSON.parse(
        execFileSync(process.execPath, [...options, ...extra], {
          stdio: "pipe",
        }),
      );
    const dryRun = run(["--dry-run"]);
    await assert.rejects(fs.stat(project));
    const installed = run();
    assert.equal(installed.destination, dryRun.destination);
    assert.equal(installed.dependenciesInstalled, false);
    for (const file of [
      "SKILL.md",
      "references/harness.md",
      "references/codex.md",
      "agents/openai.yaml",
      "scripts/preview.mjs",
      "scripts/export.mjs",
      "package-lock.json",
    ])
      assert.deepEqual(
        await fs.readFile(path.join(installed.destination, file)),
        await fs.readFile(path.join(source, file)),
      );
    assert.deepEqual(await fs.readdir(project), [
      path.basename(path.dirname(path.dirname(installed.destination))),
    ]);
    run(["--update"]);
    const entry = path.join(installed.destination, "SKILL.md");
    await fs.appendFile(entry, "\nLocal customization\n");
    assert.throws(() => run(["--update"]), /Local changes would be lost/);
    assert.match(await fs.readFile(entry, "utf8"), /Local customization/);
  }
});
