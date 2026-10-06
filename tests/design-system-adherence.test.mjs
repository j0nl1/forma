import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { temporary, root } from "./helpers.mjs";
import {
  compile,
  importSystem,
  wiring,
} from "../packages/cli/src/commands/design-system.mjs";
import { checkAdherence } from "../packages/cli/src/commands/adherence.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";

async function system(t, slug = "harbor", variants = '"soft"|"solid"') {
  const directory = await temporary(t),
    source = path.join(directory, slug);
  await fs.mkdir(path.join(source, "components"), { recursive: true });
  await fs.writeFile(
    path.join(source, "styles.css"),
    ":root{--accent:#315d9a;--gap:12px}button{padding:var(--gap);background:var(--accent);color:white}",
  );
  await fs.writeFile(
    path.join(source, "components/Button.jsx"),
    `import React from "react";if(typeof window==="undefined")throw new Error("Never execute source during inventory");export const ICONS=["start","finish"];export function Button({label="Continue",variant="soft"}){const [count,setCount]=React.useState(0);return <button data-system="${slug}" data-variant={variant} onClick={()=>setCount(count+1)}>{label} {count}</button>}`,
  );
  await fs.writeFile(
    path.join(source, "components/Button.d.ts"),
    `export interface ButtonProps{label?:string;variant?:${variants};disabled?:boolean}`,
  );
  const manifest = await compile(source);
  return { directory, source, manifest };
}
const rules = (report) =>
  report.diagnostics
    .filter((diagnostic) => diagnostic.severity === "warning")
    .map((diagnostic) => diagnostic.rule);

test("native adherence policy preserves the inspected advisory rules and checks direct JSX with exact source locations", async (t) => {
  const { directory, source, manifest } = await system(t);
  const policy = JSON.parse(
    await fs.readFile(path.join(source, manifest.adherence), "utf8"),
  );
  assert.equal(policy.schemaVersion, 1);
  assert.deepEqual(policy.tokens, ["--accent", "--gap"]);
  assert.deepEqual(policy.sourceDirectories, ["components"]);
  assert.deepEqual(
    policy.components.map((component) => component.name),
    ["Button"],
  );
  assert.ok(policy.alwaysAllowedProps.includes("className"));
  assert.ok(manifest.artifacts[manifest.adherence]);
  assert.ok(manifest.artifacts[manifest.moduleEntry]);
  const file = path.join(directory, "consumer.jsx"),
    text = `const Button=window[${JSON.stringify(manifest.namespace)}].Components.Button;\nconst view=<Button unknown="value" variant="ghost" style={{color:"#ff0033",padding:"16px"}}/>;\nglobalThis.mustNotExecute=true;throw new Error("Read source without execution");`;
  await fs.writeFile(file, text);
  const before = await fs.readFile(file, "utf8"),
    report = await checkAdherence(source, file);
  assert.deepEqual(rules(report).sort(), [
    "invalid-variant",
    "raw-color",
    "raw-length",
    "unknown-prop",
  ]);
  assert.equal(report.errors, 0);
  assert.equal(report.advisory, true);
  assert.equal(
    report.diagnostics.find((d) => d.rule === "unknown-prop").line,
    2,
  );
  assert.equal(
    report.diagnostics.find((d) => d.rule === "unknown-prop").column,
    20,
  );
  assert.equal(globalThis.mustNotExecute, undefined);
  assert.equal(await fs.readFile(file, "utf8"), before);
});

test("several systems, aliases, namespace imports and shadowed local components retain independent contracts", async (t) => {
  const harbor = await system(t),
    trail = await system(t, "trail", '"quiet"|"loud"'),
    project = path.join(harbor.directory, "consumer");
  await importSystem(harbor.source, project);
  await importSystem(trail.source, project);
  const file = path.join(project, "views.jsx");
  await fs.writeFile(
    file,
    `import {Button as HarborButton} from "./_ds/harbor/_ds_entry.js";import*as Trail from "./_ds/trail/_ds_entry.js";const {Button:Quiet}=window.CodexDesignSystems.trail.Components;const Native=window[${JSON.stringify(harbor.manifest.namespace)}].Components.Button;const valid=<><HarborButton variant="solid"/><Trail.Button variant="loud"/><Quiet variant="quiet"/><Native variant="soft"/></>;const bad=<><HarborButton variant="loud"/><Trail.Button variant="solid"/><Button variant="soft"/></>;function unrelated(HarborButton,window){const Native=window.Components.Button;return <><HarborButton variant="anything" unknown/><Native variant="anything" unknown/></>}`,
  );
  const report = await checkAdherence(project, file);
  assert.deepEqual(rules(report).sort(), [
    "ambiguous-component",
    "invalid-variant",
    "invalid-variant",
  ]);
  assert.deepEqual(
    report.diagnostics
      .filter((d) => d.rule === "invalid-variant")
      .map((d) => d.system),
    ["harbor", "trail"],
  );
  const pages = path.join(project, "pages");
  await fs.mkdir(pages);
  for (const [slug, variant] of [
    ["harbor", "soft"],
    ["trail", "quiet"],
  ])
    await fs.writeFile(
      path.join(pages, slug + ".html"),
      `<!doctype html><html lang="en"><title>${slug}</title><script>const Button=window.CodexDesignSystems.${slug}.Components.Button;</script><script type="text/babel">const view=<Button variant="${variant}"/>;</script></html>`,
    );
  assert.equal((await checkAdherence(project, pages)).warnings, 0);
});

test("HTML script scopes, createElement props, literal spreads and dynamic coverage are read-only and correctly located", async (t) => {
  const { directory, source, manifest } = await system(t),
    file = path.join(directory, "index.html");
  await fs.writeFile(
    file,
    `<!doctype html><html lang="en"><title>Adherence inspection</title>\n<script type="application/json">{"color":"#ff0033","padding":"16px"}</script>\n<script>const {Button:Action}=window[${JSON.stringify(manifest.namespace)}].Components;const properties={variant:"ghost",label:"Continue"};</script>\n<script type="text/babel">const element=<Action {...properties} className="okay" extra/>;</script>\n<script>React.createElement(Action,{variant:"solid",unsupported:1});React.createElement(Action,{variant:readUserChoice()});</script></html>`,
  );
  const report = await checkAdherence(source, file);
  assert.deepEqual(rules(report).sort(), [
    "invalid-variant",
    "unknown-prop",
    "unknown-prop",
  ]);
  assert.equal(report.skipped, 1);
  assert.equal(
    report.diagnostics.find((d) => d.rule === "invalid-variant").line,
    3,
  );
  assert.equal(report.diagnostics.find((d) => d.property === "extra").line, 4);
  assert.equal(
    report.diagnostics.find((d) => d.property === "unsupported").line,
    5,
  );
  assert.equal(report.errors, 0);
});

test("CLI advisory/strict exits, internal import guidance and genuine syntax failures preserve inputs", async (t) => {
  const { directory, source } = await system(t),
    file = path.join(directory, "view.jsx");
  await fs.writeFile(
    file,
    `import {Button} from "./harbor/components/Button.jsx";const view=<Button variant="ghost"/>;`,
  );
  const run = (flags) =>
    spawnSync(
      process.execPath,
      [
        path.join(root, "packages/cli/src/commands/adherence.mjs"),
        source,
        file,
        ...flags,
      ],
      { encoding: "utf8" },
    );
  assert.equal(run([]).status, 0);
  assert.equal(run(["--strict"]).status, 1);
  assert.ok(rules(JSON.parse(run([]).stdout)).includes("internal-import"));
  await fs.rename(file, path.join(directory, "index.js"));
  assert.ok(
    !rules(
      await checkAdherence(source, path.join(directory, "index.js")),
    ).includes("internal-import"),
  );
  await fs.writeFile(file, "const broken=<Button ");
  const failed = run([]);
  assert.equal(failed.status, 2);
  assert.equal(JSON.parse(failed.stdout).errors > 0, true);
  assert.equal(await fs.readFile(file, "utf8"), "const broken=<Button ");
});

test("mutated constants, mutable variables and computed spreads remain explicitly unchecked instead of receiving a clean variant verdict", async (t) => {
  const { directory, source, manifest } = await system(t),
    file = path.join(directory, "dynamic.jsx");
  await fs.writeFile(
    file,
    `const Button=window[${JSON.stringify(manifest.namespace)}].Components.Button;let value="soft";value=readUserInput();const props={variant:"soft"};const alias=props;alias.variant="ghost";const first=<Button variant={value}/>;const second=<Button {...props}/>;const third=<Button {...{[readKey()]:true}} variant="solid"/>;`,
  );
  const report = await checkAdherence(source, file);
  assert.equal(report.errors, 0);
  assert.equal(report.warnings, 0);
  assert.equal(report.skipped, 3);
  await fs.writeFile(
    file,
    `import {createElement as h} from "react";const Button=window[${JSON.stringify(manifest.namespace)}].Components.Button;const props={variant:"soft"};unknownObject.createElement(props);h(Button,{variant:"ghost"});const view=<Button {...props}/>;`,
  );
  const escaped = await checkAdherence(source, file);
  assert.deepEqual(rules(escaped), ["invalid-variant"]);
  assert.equal(escaped.skipped, 1);
});

test("conditional contracts, independent HTML scopes and untampered policy hashes preserve precise advisory coverage", async (t) => {
  const { directory, source } = await system(t);
  await fs.writeFile(
    path.join(source, "components/Button.d.ts"),
    'export type ButtonProps = {kind:"link";href:string;tone?:"soft"}|{kind:"action";onClick?:()=>void;tone?:"solid"};',
  );
  const manifest = await compile(source),
    inputs = path.join(directory, "pages");
  await fs.mkdir(inputs);
  for (const [name, kind, extra] of [
    ["first", "link", 'href="/home"'],
    ["second", "action", "onClick={()=>{}}"],
  ])
    await fs.writeFile(
      path.join(inputs, name + ".html"),
      `<!doctype html><html lang="en"><title>${name}</title><script>const Button=window[${JSON.stringify(manifest.namespace)}].Components.Button;</script><script type="text/babel">const view=<Button kind="${kind}" ${extra}/>;</script></html>`,
    );
  assert.equal((await checkAdherence(source, inputs)).warnings, 0);
  const bad = path.join(inputs, "mismatch.jsx");
  await fs.writeFile(
    bad,
    `const Button=window[${JSON.stringify(manifest.namespace)}].Components.Button;const view=<Button kind="link" onClick={()=>{}} tone="solid"/>;`,
  );
  const report = await checkAdherence(source, bad);
  assert.deepEqual(rules(report), ["unknown-prop", "invalid-variant"]);
  assert.deepEqual(
    report.diagnostics.find(
      (diagnostic) => diagnostic.rule === "invalid-variant",
    ).expected,
    ["soft"],
  );
  await fs.appendFile(path.join(source, manifest.adherence), "\n ");
  await assert.rejects(checkAdherence(source, bad), /Stale compiled artifact/);
});

test("unresolved inherited contracts do not reject unknown inherited props while retaining known variant warnings", async (t) => {
  const { directory, source } = await system(t);
  await fs.writeFile(
    path.join(source, "components/Button.d.ts"),
    'export interface ButtonProps extends ExternalControls.ButtonAttributes {variant?:"soft"|"solid"}',
  );
  const manifest = await compile(source),
    file = path.join(directory, "partial.jsx");
  assert.equal(
    manifest.components.find((component) => component.name === "Button")
      .contract.openProps,
    true,
  );
  await fs.writeFile(
    file,
    `const Button=window[${JSON.stringify(manifest.namespace)}].Components.Button;const view=<Button role="button" aria-label="Continue" variant="ghost"/>;`,
  );
  const report = await checkAdherence(source, file);
  assert.deepEqual(rules(report), ["invalid-variant"]);
  assert.equal(report.skipped, 1);
});

test("public ES module entries render real shared-runtime components and preserve portable output after deleting sources", async (t) => {
  const { directory, source, manifest } = await system(t),
    project = path.join(directory, "consumer");
  await importSystem(source, project);
  const wired = await wiring(project);
  assert.equal(wired.systems[0].moduleEntry, "_ds_entry.js");
  assert.equal(wired.systems[0].adherence, "_ds_adherence.json");
  const guide = await fs.readFile(
    path.join(project, "_ds/harbor/_ds_guide.md"),
    "utf8",
  );
  assert.match(guide, /\.\/\_ds\/harbor\/\_ds_entry\.js/);
  assert.match(guide, /adherence\.mjs/);
  await fs.writeFile(
    path.join(project, "main.jsx"),
    `import {React,createRoot,Button} from "./_ds/harbor/_ds_entry.js";import DS from "./_ds/harbor/_ds_entry.js";window.entrySystemMatches=DS===window.CodexDesignSystems.harbor && DS===window[${JSON.stringify(manifest.namespace)}];createRoot(document.getElementById("root")).render(React.createElement(Button,{label:"Public entry",variant:"solid"}));`,
  );
  await bundle(path.join(project, "main.jsx"), path.join(project, "bundle.js"));
  await fs.writeFile(
    path.join(project, "index.html"),
    '<!doctype html><html lang="en"><title>Public entry</title><link rel="stylesheet" href="_ds/harbor/_ds_tokens.css"><div id="root"></div><script src="bundle.js"></script></html>',
  );
  await fs.writeFile(
    path.join(project, "module.html"),
    '<!doctype html><html lang="en"><title>Browser module entry</title><link rel="stylesheet" href="_ds/harbor/_ds_tokens.css"><div id="root"></div><script type="module" src="main.js"></script></html>',
  );
  await fs.copyFile(
    path.join(project, "main.jsx"),
    path.join(project, "main.js"),
  );
  // The source uses createElement and is valid native browser JavaScript as well as build input.
  await fs.rm(source, { recursive: true });
  assert.equal(
    (await checkAdherence(project, path.join(project, "main.jsx"))).warnings,
    0,
  );
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const name of ["index.html", "module.html"])
    await withPage(url + "consumer/" + name, async (page) => {
      await page.getByRole("button", { name: "Public entry 0" }).click();
      await page.getByRole("button", { name: "Public entry 1" }).waitFor();
      assert.equal(await page.evaluate(() => window.entrySystemMatches), true);
      assert.equal(
        await page
          .locator("button")
          .evaluate((node) => getComputedStyle(node).backgroundColor),
        "rgb(49, 93, 154)",
      );
      if (process.env.CODEX_CAPTURE_ADHERENCE && name === "module.html") {
        await fs.mkdir(process.env.CODEX_CAPTURE_ADHERENCE, {
          recursive: true,
        });
        await page.screenshot({
          path: path.join(
            process.env.CODEX_CAPTURE_ADHERENCE,
            "public-module-entry.png",
          ),
        });
        await page.setViewportSize({ width: 390, height: 720 });
        await page.screenshot({
          path: path.join(
            process.env.CODEX_CAPTURE_ADHERENCE,
            "public-module-entry-narrow.png",
          ),
        });
      }
    });
  const portable = path.join(directory, "portable.html");
  await exportArtifact("html", path.join(project, "index.html"), portable);
  await fs.rm(path.join(project, "_ds"), { recursive: true });
  await withPage(url + "portable.html", async (page) => {
    await page.getByRole("button", { name: "Public entry 0" }).click();
    await page.getByRole("button", { name: "Public entry 1" }).waitFor();
  });
});
