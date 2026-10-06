import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  catalogList,
  catalogShow,
  catalogAdd,
} from "../packages/catalog/src/index.mjs";
import { buildCatalogSite } from "../packages/catalog/src/site.mjs";
import { bundle } from "../packages/runtime/src/node/build.mjs";
import { install } from "../tools/install.mjs";
import { root, temporary } from "./helpers.mjs";

test("catalog filters return concise metadata and selected presets retain the canonical guide", async () => {
  const items = await catalogList({ target: "audio", kind: "preset" });
  assert.equal(items.length, 5);
  assert.ok(
    items.every((item) => !("files" in item) && !("instructions" in item)),
  );
  const selected = await catalogShow("audio-podcast");
  assert.equal(
    selected.instructions,
    await fs.readFile(
      path.join(root, "skills/forma/generations/audio/podcast.md"),
      "utf8",
    ),
  );
  await assert.rejects(() => catalogShow("../outside"));
});

test("catalog add copies complete module closures that bundle without the repository", async (t) => {
  const project = await temporary(t);
  await fs.writeFile(
    path.join(project, "design.json"),
    JSON.stringify({
      schemaVersion: 1,
      assets: [],
      designSystems: [],
      custom: "keep",
    }),
  );
  for (const item of await catalogList({ kind: "component" })) {
    const result = await catalogAdd(item.id, project);
    await bundle(
      path.join(project, result.entry),
      path.join(project, item.id + ".bundle.js"),
    );
    assert.ok(
      (await fs.stat(path.join(project, item.id + ".bundle.js"))).size > 100,
    );
    await assert.rejects(() => catalogAdd(item.id, project), /exists/);
    const provenance = JSON.parse(
      await fs.readFile(
        path.join(result.destination, ".forma-catalog.json"),
        "utf8",
      ),
    );
    assert.ok(
      provenance.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)),
    );
  }
  const metadata = JSON.parse(
    await fs.readFile(path.join(project, "design.json"), "utf8"),
  );
  assert.equal(metadata.custom, "keep");
  assert.equal(metadata.assets.length, 5);
});

test("catalog dry runs and invalid metadata do not write project files", async (t) => {
  const project = await temporary(t);
  const result = await catalogAdd("audio-summary", project, { dryRun: true });
  assert.equal(result.dryRun, true);
  assert.deepEqual(await fs.readdir(project), []);
  await fs.writeFile(
    path.join(project, "design.json"),
    JSON.stringify({ schemaVersion: 99, assets: [] }),
  );
  await assert.rejects(
    () => catalogAdd("audio-summary", project),
    /Unsupported/,
  );
  assert.deepEqual(await fs.readdir(project), ["design.json"]);
});

test("catalog rejects escaping destination ancestors and source symlinks", async (t) => {
  const project = await temporary(t),
    outside = await temporary(t);
  await fs.symlink(outside, path.join(project, "assets"));
  await assert.rejects(
    () => catalogAdd("audio-summary", project),
    /allowed root/,
  );
  assert.deepEqual(await fs.readdir(outside), []);
});

test("installed skill CLI and web catalog share the portable index", async (t) => {
  const directory = await temporary(t);
  const destination = path.join(directory, "skill");
  await install(destination);
  const items = JSON.parse(
    execFileSync(
      process.execPath,
      [
        path.join(destination, "scripts/forma.mjs"),
        "catalog",
        "list",
        "--target",
        "audio",
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(items.length, 5);
  const executable = path.join(directory, "forma");
  await fs.symlink(
    path.join(destination, "packages/cli/src/index.mjs"),
    executable,
  );
  assert.match(
    execFileSync(process.execPath, [executable, "--help"], {
      encoding: "utf8",
    }),
    /Usage: forma <command>/,
  );
  const result = await buildCatalogSite(path.join(directory, "site"));
  const document = await fs.readFile(result.output, "utf8");
  assert.equal(result.items, (await catalogList()).length);
  for (const item of await catalogList()) assert.ok(document.includes(item.id));
});

test("catalog source inventory rejects symlinks before copying or evaluating source", async (t) => {
  const directory = await temporary(t),
    outside = await temporary(t),
    project = await temporary(t);
  await fs.mkdir(path.join(directory, "catalog"));
  await fs.writeFile(
    path.join(outside, "source.js"),
    'throw new Error("This source must not execute during inventory");',
  );
  await fs.symlink(
    path.join(outside, "source.js"),
    path.join(directory, "source.js"),
  );
  await fs.writeFile(
    path.join(directory, "catalog/index.json"),
    JSON.stringify({
      schemaVersion: 1,
      items: [{ id: "test-source", manifest: "item.json" }],
    }),
  );
  await fs.writeFile(
    path.join(directory, "catalog/item.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "test-source",
      kind: "component",
      description: "Fixture",
      targets: ["video"],
      tags: [],
      requirements: [],
      entry: "source.js",
      files: [{ source: "source.js", target: "source.js" }],
    }),
  );
  await assert.rejects(
    () =>
      catalogAdd(
        "test-source",
        project,
        {},
        {
          root: directory,
          catalog: path.join(directory, "catalog"),
          skill: directory,
        },
      ),
    /allowed root/,
  );
  assert.deepEqual(await fs.readdir(project), []);
});
