import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { watch, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary, root } from "./helpers.mjs";
import {
  compile,
  inspect,
  preview,
  importSystem,
  wiring,
  discoverSystems,
  setPrimary,
} from "../packages/cli/src/commands/design-system.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";

async function system(directory, name, color) {
  await fs.mkdir(directory, { recursive: true });
  const spec = {
    schemaVersion: 1,
    name,
    slug: name.toLowerCase(),
    css: "tokens.css",
    entry: "Button.jsx",
    components: [{ name: "Button", props: { children: name } }],
    startingPoints: [{ name: `${name} landing`, path: "landing.html" }],
    guidance: `Use ${name} components and the declared accent.`,
  };
  await fs.writeFile(path.join(directory, "system.json"), JSON.stringify(spec));
  await fs.writeFile(
    path.join(directory, "tokens.css"),
    `:root{--shared-accent:${color};--system-name:"${name}"}`,
  );
  await fs.writeFile(
    path.join(directory, "landing.html"),
    `<!doctype html><html lang="en"><title>${name} landing</title><link rel="stylesheet" href="tokens.css"><h1>${name} landing</h1></html>`,
  );
  await fs.writeFile(
    path.join(directory, "Button.jsx"),
    `import React from 'react'; if(typeof window==='undefined') throw new Error('Component source was evaluated outside a browser'); window.designSystemExecutions=(window.designSystemExecutions||0)+1;export function Button({children}){const [count,setCount]=React.useState(0);return <button data-system="${name}" style={{background:'var(--shared-accent)',color:'white'}} onClick={()=>setCount(count+1)}>{children||'${name}'} {count}</button>}`,
  );
  return spec;
}
const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
async function metadata(project) {
  return json(path.join(project, "design.json"));
}

test("system namespaces persist across edits and moves without executing component source during inspection or compilation", async (t) => {
  const directory = await temporary(t),
    source = path.join(directory, "source");
  await system(source, "Alpha", "#cc2244");
  const before = await fs.readdir(source);
  assert.deepEqual((await inspect(source)).issues, []);
  assert.deepEqual(await fs.readdir(source), before);
  const first = await compile(source);
  assert.match(first.namespace, /^CodexDS_alpha_[a-f0-9]{12}$/);
  await fs.appendFile(
    path.join(source, "tokens.css"),
    "\n:root{--spacing:12px}",
  );
  const second = await compile(source);
  assert.equal(second.namespace, first.namespace);
  assert.notEqual(
    second.artifacts["_ds_tokens.css"],
    first.artifacts["_ds_tokens.css"],
  );
  const moved = path.join(directory, "moved");
  await fs.rename(source, moved);
  assert.equal((await compile(moved)).namespace, first.namespace);
  await fs.rm(path.join(moved, "_ds_manifest.json"));
  assert.equal(
    (await compile(moved)).namespace,
    first.namespace,
    "The surviving bundle header preserves identity when rebuilding a removed manifest",
  );
  assert.equal((await inspect(moved)).spec.name, "Alpha");
  await preview(moved);
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url + "moved/preview.html", async (page) => {
    await page.getByRole("button", { name: "Alpha 0" }).click();
    await page.getByRole("button", { name: "Alpha 1" }).waitFor();
    assert.equal(await page.evaluate(() => window.designSystemExecutions), 1);
    assert.equal(
      await page.evaluate(
        (namespace) =>
          window.CodexDesignSystems.alpha === window[namespace] &&
          window.CodexDesignSystem === window[namespace],
        first.namespace,
      ),
      true,
    );
  });
});

test("two imported systems retain distinct interactive components, primary CSS order and offline output after source deletion", async (t) => {
  const directory = await temporary(t),
    project = path.join(directory, "project"),
    sources = path.join(directory, "sources");
  const alpha = path.join(sources, "alpha"),
    beta = path.join(sources, "beta");
  await system(alpha, "Alpha", "#cc2244");
  await system(beta, "Beta", "#2244cc");
  const a = await compile(alpha),
    b = await compile(beta);
  assert.notEqual(a.namespace, b.namespace);
  await fs.mkdir(project);
  await fs.writeFile(
    path.join(project, "design.json"),
    JSON.stringify({
      schemaVersion: 1,
      designSystems: [],
      assets: [{ path: "old.html", type: "mockup" }],
      custom: { owner: "Keep me" },
    }),
  );
  await Promise.all([
    importSystem(alpha, project, { primary: true }),
    importSystem(beta, project),
  ]);
  let meta = await metadata(project);
  assert.equal(meta.primaryDesignSystem, "alpha");
  assert.equal(meta.designSystems.length, 2);
  const available = await discoverSystems(sources);
  assert.deepEqual(
    available.map((s) => s.slug),
    ["alpha", "beta"],
  );
  assert.ok(
    available.every(
      (s) =>
        s.startingPoints.length === 1 &&
        s.components.length === 1 &&
        s.issues.length === 0,
    ),
  );
  assert.deepEqual(
    await discoverSystems(directory),
    [],
    "Consumed copies nested under project/_ds are not authored systems",
  );
  const head = await wiring(project);
  assert.deepEqual(
    head.systems.map((s) => s.slug),
    ["beta", "alpha"],
  );
  const content = `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><title>Two systems</title>${head.html}<style>body{margin:30px;font:18px system-ui}button{padding:14px;margin:8px}</style><h1>Independent design systems</h1><div id="alpha"></div><div id="beta"></div><script>for(const [key,namespace] of ${JSON.stringify(
    [
      ["alpha", a.namespace],
      ["beta", b.namespace],
    ],
  )}){const ds=window[namespace];ds.createRoot(document.getElementById(key)).render(ds.React.createElement(ds.Components.Button));}</script></html>`;
  await fs.writeFile(path.join(project, "index.html"), content);
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url + "project/index.html", async (page) => {
    await page.getByRole("button", { name: "Alpha 0" }).click();
    await page.getByRole("button", { name: "Alpha 1" }).waitFor();
    await page.getByRole("button", { name: "Beta 0" }).waitFor();
    assert.equal(
      await page
        .locator('[data-system="Beta"]')
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      "rgb(204, 34, 68)",
    );
    assert.equal(
      await page.evaluate(() =>
        Object.keys(window.CodexDesignSystems).sort().join(","),
      ),
      "alpha,beta",
    );
  });
  await importSystem(beta, project, { update: true, primary: true });
  meta = await metadata(project);
  assert.equal(meta.primaryDesignSystem, "beta");
  assert.deepEqual(meta.custom, { owner: "Keep me" });
  assert.equal(meta.assets[0].path, "old.html");
  const primary = await wiring(project);
  assert.deepEqual(
    primary.systems.map((s) => s.slug),
    ["alpha", "beta"],
  );
  await fs.writeFile(
    path.join(project, "index.html"),
    content.replace(head.html, primary.html),
  );
  await exportArtifact(
    "html",
    path.join(project, "index.html"),
    path.join(directory, "portable.html"),
  );
  await fs.rm(sources, { recursive: true });
  await setPrimary(project, "alpha");
  assert.equal(
    (await wiring(project)).primaryDesignSystem,
    "alpha",
    "Primary selection works without the original source",
  );
  await assert.rejects(setPrimary(project, "missing"), /bound system/);
  await fs.rm(project, { recursive: true });
  await withPage(url + "portable.html", async (page) => {
    assert.equal(
      await page
        .locator('[data-system="Alpha"]')
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      "rgb(34, 68, 204)",
    );
    await page.getByRole("button", { name: "Beta 0" }).click();
    await page.getByRole("button", { name: "Beta 1" }).waitFor();
    await page.getByRole("button", { name: "Alpha 0" }).waitFor();
  });
});

test("managed updates replace the pinned copy, remove stale seeds and preserve binding and project metadata", async (t) => {
  const directory = await temporary(t),
    source = path.join(directory, "source"),
    project = path.join(directory, "project");
  const spec = await system(source, "Alpha", "#cc2244");
  const first = await compile(source);
  await importSystem(source, project);
  const meta = await metadata(project);
  meta.designSystems[0].note = "Keep the note";
  meta.title = "Custom project";
  await fs.writeFile(path.join(project, "design.json"), JSON.stringify(meta));
  spec.startingPoints = [{ name: "New landing", path: "landing.html" }];
  await fs.writeFile(path.join(source, "system.json"), JSON.stringify(spec));
  await fs.appendFile(
    path.join(source, "tokens.css"),
    ":root{--shared-accent:#228844}",
  );
  const second = await compile(source);
  const result = await importSystem(source, project, { update: true });
  assert.equal(result.binding.namespace, first.namespace);
  assert.equal(result.binding.note, "Keep the note");
  const destination = result.destination;
  assert.deepEqual(
    (await json(path.join(destination, "_ds_manifest.json"))).startingPoints,
    second.startingPoints,
  );
  await assert.rejects(
    fs.stat(path.join(destination, first.startingPoints[0].path)),
    { code: "ENOENT" },
  );
  assert.match(
    await fs.readFile(path.join(destination, "_ds_guide.md"), "utf8"),
    new RegExp(first.namespace),
  );
  assert.equal((await metadata(project)).title, "Custom project");
  assert.equal((await metadata(project)).designSystems.length, 1);
  assert.ok(
    !(await fs.readdir(path.join(project, "_ds"))).some((name) =>
      name.startsWith("."),
    ),
  );
  await fs.rm(source, { recursive: true });
  assert.equal(
    (await wiring(project)).systems[0].startingPoints[0].name,
    "New landing",
  );
});

test("updates and wiring reject changed copies, identities and unsafe metadata without losing existing state", async (t) => {
  const directory = await temporary(t),
    source = path.join(directory, "source"),
    project = path.join(directory, "project");
  await system(source, "Alpha", "#cc2244");
  await compile(source);
  const imported = await importSystem(source, project);
  const metaBefore = await fs.readFile(
    path.join(project, "design.json"),
    "utf8",
  );
  const css = path.join(imported.destination, "_ds_tokens.css"),
    original = await fs.readFile(css);
  await fs.appendFile(css, "/* local customization */");
  await assert.rejects(
    importSystem(source, project, { update: true }),
    /Stale compiled artifact/,
  );
  await assert.rejects(wiring(project), /Stale compiled artifact/);
  assert.equal(
    await fs.readFile(path.join(project, "design.json"), "utf8"),
    metaBefore,
  );
  await fs.writeFile(css, original);
  const extra = path.join(imported.destination, "custom.txt");
  await fs.writeFile(extra, "Custom content");
  await assert.rejects(
    importSystem(source, project, { update: true }),
    /untracked file/,
  );
  await fs.rm(extra);
  const manifestFile = path.join(imported.destination, "_ds_manifest.json"),
    manifestBytes = await fs.readFile(manifestFile);
  const manifest = JSON.parse(manifestBytes);
  manifest.guidance = "Changed guidance";
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(wiring(project), /manifest changed/);
  await fs.writeFile(manifestFile, manifestBytes);
  const replacement = path.join(directory, "replacement");
  await system(replacement, "Alpha", "#228844");
  await compile(replacement);
  await assert.rejects(
    importSystem(replacement, project, { update: true }),
    /cannot replace.*namespace/,
  );
  await assert.rejects(
    importSystem(source, path.join(directory, "new"), { update: true }),
    /existing managed/,
  );
  const current = path.join(project, "design.json");
  await fs.rename(current, path.join(project, "real.json"));
  await fs.symlink("real.json", current);
  await assert.rejects(
    importSystem(source, project, { update: true }),
    /regular file/,
  );
  assert.equal(
    await fs.readFile(path.join(project, "real.json"), "utf8"),
    metaBefore,
  );
});

test("a metadata edit during staging rolls an update back while preserving the author's new metadata", async (t) => {
  const directory = await temporary(t),
    source = path.join(directory, "source"),
    project = path.join(directory, "project");
  await system(source, "Alpha", "#cc2244");
  await compile(source);
  const imported = await importSystem(source, project);
  const beforeManifest = await fs.readFile(
    path.join(imported.destination, "_ds_manifest.json"),
  );
  const beforeCSS = await fs.readFile(
    path.join(imported.destination, "_ds_tokens.css"),
  );
  await fs.appendFile(
    path.join(source, "tokens.css"),
    ":root{--shared-accent:#228844}",
  );
  await compile(source);
  const edited = await metadata(project);
  edited.title = "An intervening author edit";
  let observed = false;
  const watcher = watch(path.join(project, "_ds"), (_event, name) => {
    if (observed || !name?.toString().startsWith(".import-")) return;
    observed = true;
    writeFileSync(path.join(project, "design.json"), JSON.stringify(edited));
  });
  t.after(() => watcher.close());
  await assert.rejects(
    importSystem(source, project, { update: true }),
    /Source changed/,
  );
  assert.equal(observed, true);
  assert.deepEqual(
    await fs.readFile(path.join(imported.destination, "_ds_manifest.json")),
    beforeManifest,
  );
  assert.deepEqual(
    await fs.readFile(path.join(imported.destination, "_ds_tokens.css")),
    beforeCSS,
  );
  assert.equal((await metadata(project)).title, edited.title);
  assert.ok(
    !(await fs.readdir(path.join(project, "_ds"))).some((name) =>
      name.startsWith("."),
    ),
  );
  assert.equal((await wiring(project)).systems[0].slug, "alpha");
});

test("CLI discovery, update, primary selection and wiring work from a compiled system while damaged discovery is read-only", async (t) => {
  const directory = await temporary(t),
    source = path.join(directory, "alpha"),
    project = path.join(directory, "project");
  await system(source, "Alpha", "#cc2244");
  await compile(source);
  const cli = (...args) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          path.join(root, "packages/cli/src/commands/design-system.mjs"),
          ...args,
        ],
        { encoding: "utf8" },
      ),
    );
  assert.equal(cli("discover", directory)[0].slug, "alpha");
  cli("import", source, project);
  assert.equal(
    cli("import", source, project, "--update", "--primary").primaryDesignSystem,
    "alpha",
  );
  assert.match(cli("wiring", project).html, /_ds\/alpha\/_ds_bundle.js/);
  assert.equal(cli("primary", project, "alpha").primaryDesignSystem, "alpha");
  await fs.appendFile(path.join(source, "_ds_tokens.css"), "/* changed */");
  const before = await fs.readFile(path.join(source, "_ds_tokens.css"), "utf8");
  assert.match((await discoverSystems(directory))[0].issues[0], /Stale/);
  assert.equal(
    await fs.readFile(path.join(source, "_ds_tokens.css"), "utf8"),
    before,
  );
});
