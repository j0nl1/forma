import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { zipSync } from "fflate";
import { temporary, root, figFixture } from "./helpers.mjs";
import { install, installationDestination } from "../tools/install.mjs";
import {
  inspect,
  compile,
  preview,
  importSystem,
} from "../packages/cli/src/commands/design-system.mjs";
import {
  loadFig,
  outline,
  select,
  renderDocument,
} from "../packages/figma/src/decode/document.mjs";
import { importFig } from "../packages/cli/src/commands/figma.mjs";
import { inlineHtml } from "../packages/exports/src/lib/inline.mjs";
import { record } from "../packages/cli/src/commands/project.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";

test("installation stages a standalone skill and refuses destructive updates", async (t) => {
  const dir = await temporary(t),
    dest = path.join(dir, "skill");
  assert.equal((await install(dest, { dryRun: true })).destination, dest);
  await assert.rejects(fs.stat(dest));
  await install(dest);
  assert.match(
    await fs.readFile(path.join(dest, "SKILL.md"), "utf8"),
    /name: forma/,
  );
  assert.ok(await fs.stat(path.join(dest, "package-lock.json")));
  await assert.rejects(install(dest), /Destination exists/);
  await install(dest, { update: true });
  await fs.appendFile(path.join(dest, "SKILL.md"), "\nLocal customization\n");
  await assert.rejects(install(dest, { update: true }), /Local changes/);
  assert.match(
    await fs.readFile(path.join(dest, "SKILL.md"), "utf8"),
    /Local customization/,
  );
});

test("system inspection is read-only; compile, preview and import preserve bindings", async (t) => {
  const dir = await temporary(t),
    system = path.join(dir, "system"),
    project = path.join(dir, "project");
  await fs.cp(path.join(root, "examples/design-system"), system, {
    recursive: true,
  });
  const before = await fs.readdir(system);
  const model = await inspect(system);
  assert.deepEqual(model.issues, []);
  assert.deepEqual(await fs.readdir(system), before);
  const manifest = await compile(system);
  assert.equal(manifest.components.length, 2);
  assert.equal(manifest.tokens["--color-accent"], "#275dad");
  await preview(system);
  await fs.mkdir(project);
  await fs.writeFile(
    path.join(project, "design.json"),
    JSON.stringify({
      schemaVersion: 1,
      assets: [],
      designSystems: [],
      custom: "keep",
    }),
  );
  await importSystem(system, project);
  const meta = JSON.parse(await fs.readFile(path.join(project, "design.json")));
  assert.equal(meta.custom, "keep");
  assert.equal(meta.designSystems[0].slug, "harbor");
  await assert.rejects(importSystem(system, project), /already exists/);
  await fs.appendFile(path.join(system, "_ds_tokens.css"), "/* altered */");
  await assert.rejects(
    importSystem(system, path.join(dir, "another-project")),
    /Stale/,
  );
});

test("systems reject escapes, alias cycles and missing named exports", async (t) => {
  const dir = await temporary(t);
  await fs.cp(path.join(root, "examples/design-system"), dir, {
    recursive: true,
  });
  await fs.appendFile(
    path.join(dir, "tokens.css"),
    "\n:root{--a:var(--b);--b:var(--a);--missing:var(--unknown);}",
  );
  const model = await inspect(dir);
  assert.ok(model.issues.some((x) => x.includes("cycle")));
  assert.ok(model.issues.some((x) => x.includes("missing token")));
  await fs.writeFile(path.join(dir, "tokens.css"), ":root{--color:red;}");
  const spec = JSON.parse(await fs.readFile(path.join(dir, "system.json")));
  spec.components = [{ name: "Missing", export: "Missing" }];
  await fs.writeFile(path.join(dir, "system.json"), JSON.stringify(spec));
  await assert.rejects(compile(dir), /No matching export|Missing/);
  spec.css = "../outside.css";
  await fs.writeFile(path.join(dir, "system.json"), JSON.stringify(spec));
  assert.ok((await inspect(dir)).issues.length);
});

test("offline Figma decoder reconstructs raw and ZIP input without executing schema", async (t) => {
  const dir = await temporary(t),
    raw = path.join(dir, "sample.fig"),
    zip = path.join(dir, "zip.fig");
  const bytes = figFixture();
  await fs.writeFile(raw, bytes);
  await fs.writeFile(
    zip,
    zipSync({
      "canvas.fig": bytes,
      "images/example": new Uint8Array([1, 2, 3]),
    }),
  );
  for (const file of [raw, zip]) {
    const doc = await loadFig(file);
    assert.equal(doc.nodes.size, 5);
    assert.equal(outline(doc).length, 3);
    assert.equal(select(doc, "Reading room").type, "FRAME");
    const rendered = renderDocument(doc, select(doc, "1:1"));
    assert.match(rendered.html, /Safe &lt;title&gt; &amp; useful content/);
  }
  const mount = path.join(dir, "mount");
  await importFig("mount", raw, mount);
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(mount, "nodes/1:1.json"))).children,
    ["1:2"],
  );
  const system = path.join(dir, "fig-system");
  await importFig("design-system", raw, system);
  assert.deepEqual((await inspect(system)).issues, []);
  assert.equal((await compile(system)).examples.length, 1);
});

test("Figma import rejects malformed chunks, ambiguous names, cycles and overwrites", async (t) => {
  const dir = await temporary(t),
    file = path.join(dir, "file.fig");
  await fs.writeFile(file, figFixture({ duplicateName: true }));
  await assert.rejects(
    importFig("render", file, path.join(dir, "out.html"), "Reading room"),
    /Ambiguous/,
  );
  await fs.writeFile(file, figFixture({ cycle: true }));
  await assert.rejects(loadFig(file), /cycle/);
  await fs.writeFile(file, figFixture().subarray(0, 24));
  await assert.rejects(loadFig(file), /Truncated/);
  await fs.writeFile(file, figFixture());
  const output = path.join(dir, "out.html");
  await importFig("render", file, output, "1:1");
  await assert.rejects(importFig("render", file, output, "1:1"), /overwrite/);
});

test("standalone export parses nested CSS, embeds images and preserves safe markup", async (t) => {
  const dir = await temporary(t);
  await fs.mkdir(path.join(dir, "css"));
  await fs.writeFile(
    path.join(dir, "pixel.png"),
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA/QAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  await fs.writeFile(path.join(dir, "css/colors.css"), ":root{--accent:#123}");
  await fs.writeFile(
    path.join(dir, "css/main.css"),
    '@import "colors.css";body{background:url("../pixel.png")}',
  );
  await fs.writeFile(path.join(dir, "app.js"), 'window.example="</script>";');
  const input = path.join(dir, "index.html");
  await fs.writeFile(
    input,
    '<!doctype html><html><link rel="stylesheet" href="css/main.css"><img src="pixel.png" srcset="pixel.png 1x, pixel.png 2x"><script src="app.js"></script><a href="https://example.com">Source</a></html>',
  );
  const output = await inlineHtml(input);
  assert.match(output, /data:image\/png;base64/);
  assert.match(output, /--accent:#123/);
  assert.match(output, /<\\\/script>/);
  assert.ok(!output.includes('src="app.js"'));
  assert.match(output, /href="https:\/\/example.com"/);
  await fs.writeFile(input, '<script src="https://example.com/a.js"></script>');
  await assert.rejects(inlineHtml(input), /Remote/);
  await fs.writeFile(input, '<script type="module" src="app.js"></script>');
  await assert.rejects(inlineHtml(input), /Bundle/);
  await fs.writeFile(input, '<img src="../escape.png">');
  await assert.rejects(inlineHtml(input), /leaves allowed root/);
});

test("preview rejects traversal, escaped symlinks, foreign hosts and non-GET methods", async (t) => {
  const dir = await temporary(t),
    rootDir = path.join(dir, "served");
  await fs.mkdir(rootDir);
  await fs.writeFile(path.join(rootDir, "index.html"), "Local");
  await fs.writeFile(path.join(dir, "secret.txt"), "Secret");
  await fs.symlink(
    path.join(dir, "secret.txt"),
    path.join(rootDir, "escaped.txt"),
  );
  const { server, url } = await serve(rootDir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  assert.equal(await (await fetch(url)).text(), "Local");
  const range = await fetch(url, { headers: { Range: "bytes=1-3" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("Content-Range"), "bytes 1-3/5");
  assert.equal(await range.text(), "oca");
  assert.equal(
    await (await fetch(url, { headers: { Range: "bytes=-2" } })).text(),
    "al",
  );
  assert.equal(
    await (await fetch(url, { headers: { Range: "bytes=2-" } })).text(),
    "cal",
  );
  for (const value of [
    "bytes=8-",
    "bytes=3-1",
    "bytes=-0",
    "bytes=0-1,3-4",
    "invalid",
  ]) {
    const response = await fetch(url, { headers: { Range: value } });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("Content-Range"), "bytes */5");
  }
  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.headers.get("Content-Length"), "5");
  assert.equal(await head.text(), "");
  assert.equal((await fetch(url + "escaped.txt")).status, 403);
  assert.equal((await fetch(url + "%2e%2e%2fsecret.txt")).status, 403);
  assert.equal((await fetch(url, { method: "POST" })).status, 405);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = http.get(
      url,
      { headers: { host: "attacker.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
  });
  assert.equal(hostStatus, 403);
});

test("asset registration preserves metadata and upserts without duplicates", async (t) => {
  const dir = await temporary(t);
  await fs.writeFile(path.join(dir, "index.html"), "Example");
  await fs.writeFile(
    path.join(dir, "design.json"),
    JSON.stringify({
      schemaVersion: 1,
      assets: [],
      designSystems: [],
      custom: 42,
    }),
  );
  await record(dir, "index.html");
  const meta = await record(dir, "index.html", {
    type: "wireframe",
    source: "Local source",
  });
  assert.equal(meta.custom, 42);
  assert.equal(meta.assets.length, 1);
  assert.equal(meta.assets[0].type, "wireframe");
  await assert.rejects(record(dir, "../missing.html"));
});

test("compiled starting points remain self-contained after system import", async (t) => {
  const dir = await temporary(t),
    source = path.join(dir, "system");
  await fs.cp(path.join(root, "examples/design-system"), source, {
    recursive: true,
  });
  const manifest = await compile(source);
  assert.equal(manifest.startingPoints.length, 2);
  assert.ok(
    manifest.startingPoints.some(
      (start) => start.kind === "component" && start.component === "Button",
    ),
  );
  const project = path.join(dir, "project");
  await importSystem(source, project);
  const seed = path.join(
    project,
    "_ds/harbor",
    manifest.startingPoints[0].path,
  );
  assert.match(await fs.readFile(seed, "utf8"), /--color-paper/);
  await fs.rm(source, { recursive: true });
  assert.ok(await fs.stat(seed));
});

test("installed skill lockfile and helpers work in a non-Codex root independently of the checkout", async (t) => {
  const dir = await temporary(t),
    dest = installationDestination({ project: dir, harness: "claude" });
  await install(dest);
  const { execFileSync } = await import("node:child_process");
  execFileSync("npm", ["ci", "--ignore-scripts", "--offline"], {
    cwd: dest,
    stdio: "pipe",
  });
  const source = path.join(dir, "system");
  await fs.cp(path.join(root, "examples/design-system"), source, {
    recursive: true,
  });
  const output = execFileSync(
    process.execPath,
    [
      path.join(dest, "packages/cli/src/commands/design-system.mjs"),
      "compile",
      source,
    ],
    { encoding: "utf8" },
  );
  assert.equal(JSON.parse(output).slug, "harbor");
  const configured = execFileSync(
    process.execPath,
    [path.join(dest, "packages/cli/src/commands/config.mjs"), "init", dir],
    { encoding: "utf8" },
  );
  assert.equal(JSON.parse(configured).created, true);
  const checked = execFileSync(
    process.execPath,
    [path.join(dest, "packages/cli/src/commands/config.mjs"), "check", dir],
    { encoding: "utf8" },
  );
  assert.equal(JSON.parse(checked).preferences.output.directory, "designs");
});

test("offline Figma decoder supports independently generated Zstandard chunks", async () => {
  const doc = await loadFig(path.join(root, "tests/fixtures/zstd.fig"));
  assert.equal(doc.nodes.size, 5);
  assert.equal(select(doc, "Reading room").type, "FRAME");
});
