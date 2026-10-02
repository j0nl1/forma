import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary } from "./helpers.mjs";
import {
  inspect,
  compile,
  preview,
  importSystem,
} from "../skills/codex-design/scripts/design-system.mjs";
import { checkAdherence } from "../skills/codex-design/scripts/adherence.mjs";
import { bundle } from "../skills/codex-design/scripts/build.mjs";
import { exportArtifact } from "../skills/codex-design/scripts/export.mjs";
import { serve } from "../skills/codex-design/scripts/preview.mjs";
import { withPage } from "../skills/codex-design/scripts/lib/browser.mjs";
async function fixture(t) {
  const dir = await temporary(t),
    source = path.join(dir, "harbor");
  await fs.mkdir(source);
  await fs.writeFile(
    path.join(source, "styles.css"),
    ":root{--accent:#315d9a}button{background:var(--accent);color:white;padding:12px}",
  );
  await fs.writeFile(
    path.join(source, "Button.jsx"),
    'import React from "react";if(typeof window==="undefined")throw new Error("Never evaluate source during inventory");export const ICONS=["start","finish"];export function Button({label="Continue",variant="soft"}){const[count,setCount]=React.useState(0);return <button data-variant={variant} onClick={()=>setCount(count+1)}>{label} {count}</button>}',
  );
  await fs.writeFile(
    path.join(source, "Button.d.ts"),
    'export interface ButtonProps{/** Accessible text. */label?:string;/** @default "soft" */variant?:"soft"|"solid"}',
  );
  await fs.writeFile(
    path.join(source, "Button.prompt.md"),
    "Use one clear action label and the declared emphasis variants.",
  );
  await fs.writeFile(
    path.join(source, "Counter.jsx"),
    'import React from "react";export default class Counter extends React.Component{state={count:0};render(){return <button onClick={()=>this.setState(({count})=>({count:count+1}))}>{this.props.label||"Count"} {this.state.count}</button>}}',
  );
  await fs.writeFile(
    path.join(source, "Counter.d.ts"),
    "export interface CounterProps{label?:string}",
  );
  await fs.writeFile(
    path.join(source, "actions.ts"),
    'import{Button as Imported}from"./Button.jsx";import type{Button as TypeButton}from"./Button.jsx";export{Imported as LocalAction};export{TypeButton as HiddenComponent};export{Button as Action,ICONS as Choices}from"./Button.jsx";export{default as CountAction}from"./Counter.jsx";export type{ButtonProps as HiddenProps}from"./Button.jsx";',
  );
  await fs.writeFile(
    path.join(source, "actions.d.ts"),
    '/** @startingPoint section="Aliases" viewport="520x160" */\nexport interface LocalActionProps{\n/** Barrel-specific accessible text. */\nlabel?:string;\n/** @default "soft" */\nvariant?:"soft"|"solid"\n}',
  );
  await fs.writeFile(
    path.join(source, "actions.prompt.md"),
    "Use one clear action label; this barrel-specific guidance also applies to its aliases.",
  );
  await fs.writeFile(
    path.join(source, "first.js"),
    'export*from"./actions.js";export*from"./second.js";',
  );
  await fs.writeFile(
    path.join(source, "second.js"),
    'export*from"./first.js";export*from"./Button.jsx";',
  );
  await fs.writeFile(
    path.join(source, "index.js"),
    'export*from"./first.js";export*as Widgets from"./Button.jsx";import*as ImportedWidgets from"./Button.jsx";export{ImportedWidgets as LocalWidgets};',
  );
  await fs.writeFile(
    path.join(source, "public.js"),
    'export*from"./index.js";',
  );
  return { dir, source };
}
test("re-export aliases, local imported aliases, cyclic star barrels and namespace values preserve owning contracts without duplicate components", async (t) => {
  const { source } = await fixture(t),
    before = await fs.readdir(source),
    model = await inspect(source);
  assert.deepEqual(model.issues, []);
  assert.deepEqual(await fs.readdir(source), before);
  const byName = new Map(model.spec.components.map((c) => [c.name, c]));
  assert.deepEqual([...byName.keys()].sort(), [
    "Action",
    "Button",
    "Choices",
    "CountAction",
    "Counter",
    "ICONS",
    "LocalAction",
    "LocalWidgets",
    "Widgets",
  ]);
  for (const name of ["Action", "LocalAction"]) {
    const c = byName.get(name);
    assert.equal(c.sourcePath, "Button.jsx");
    assert.equal(c.export, "Button");
    assert.deepEqual(
      c.contract.props.find((p) => p.name === "variant").values,
      ["soft", "solid"],
    );
    assert.match(c.usage, /clear action/);
    assert.ok(c.reexports.some((r) => r.path === "index.js"));
  }
  assert.equal(byName.get("CountAction").export, "default");
  assert.equal(byName.get("CountAction").sourcePath, "Counter.jsx");
  assert.equal(byName.get("Choices").kind, "constant");
  assert.equal(byName.get("Widgets").kind, "constant");
  assert.equal(byName.get("Widgets").moduleNamespace, true);
  assert.equal(byName.get("Widgets").sourcePath, "Button.jsx");
  assert.ok(
    byName.get("Widgets").reexports.some((r) => r.path === "public.js"),
  );
  assert.equal(byName.get("LocalAction").contract.path, "actions.d.ts");
  assert.match(
    byName.get("LocalAction").contract.props.find((p) => p.name === "label")
      .description,
    /Barrel-specific/,
  );
  assert.match(byName.get("LocalAction").usage, /barrel-specific/);
  assert.deepEqual(
    model.spec.startingPoints.map(({ component, section, viewport }) => ({
      component,
      section,
      viewport,
    })),
    [{ component: "LocalAction", section: "Aliases", viewport: "520x160" }],
  );
});
test("aliased source functions remain the actual portable components and retain variant checks after deleting source and copied libraries", async (t) => {
  const { dir, source } = await fixture(t),
    project = path.join(dir, "project");
  await fs.writeFile(
    path.join(source, "system.json"),
    JSON.stringify({
      schemaVersion: 1,
      name: "Harbor",
      slug: "harbor",
      css: "styles.css",
      sourceNamespaces: ["HarborSystem"],
      components: [],
    }),
  );
  await fs.writeFile(
    path.join(source, "Consumer.jsx"),
    'import React from"react";const{Widgets}=window.HarborSystem;export function Consumer(){return <Widgets.Button label="Namespace consumer"/>}',
  );
  const m = await compile(source);
  await preview(source);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  await withPage(url + "harbor/preview.html", async (page) => {
    await page
      .getByRole("button", { name: "Continue 0", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Continue 1", exact: true })
      .waitFor();
  });
  await importSystem(source, project);
  await fs.writeFile(
    path.join(project, "main.js"),
    'import{React,createRoot,Button,Action,LocalAction,CountAction,Counter,Choices,ICONS,Widgets,LocalWidgets,Consumer}from"./_ds/harbor/_ds_entry.js";window.aliasIdentity=Action===Button&&LocalAction===Button&&CountAction===Counter&&Choices===ICONS&&Widgets.Button===Button&&LocalWidgets===Widgets;createRoot(document.getElementById("root")).render(React.createElement(React.Fragment,null,React.createElement(Action,{label:"Action",variant:"solid"}),React.createElement(LocalAction,{label:"Local action",variant:"soft"}),React.createElement(CountAction,{label:"Counter alias"}),React.createElement(Consumer)));',
  );
  await fs.writeFile(
    path.join(project, "invalid.jsx"),
    'import{Action,LocalAction}from"./_ds/harbor/_ds_entry.js";const view=<><Action variant="ghost"/><LocalAction unknown/></>;',
  );
  const report = await checkAdherence(
    project,
    path.join(project, "invalid.jsx"),
  );
  assert.deepEqual(
    report.diagnostics
      .filter((d) => d.severity === "warning")
      .map((d) => [d.component, d.rule]),
    [
      ["Action", "invalid-variant"],
      ["LocalAction", "unknown-prop"],
    ],
  );
  const guide = await fs.readFile(
    path.join(project, "_ds/harbor/_ds_guide.md"),
    "utf8",
  );
  assert.match(guide, /## Action/);
  assert.match(guide, /soft/);
  assert.match(guide, /barrel-specific/);
  assert.match(guide, /Public re-exports:.*`public.js`/);
  await bundle(path.join(project, "main.js"), path.join(project, "bundle.js"));
  const body =
    '<!doctype html><html lang="en"><title>Portable aliases</title><link rel="stylesheet" href="_ds/harbor/_ds_tokens.css"><div id="root"></div>';
  await fs.writeFile(
    path.join(project, "module.html"),
    body + '<script type="module" src="main.js"></script></html>',
  );
  await fs.writeFile(
    path.join(project, "index.html"),
    body + '<script src="bundle.js"></script></html>',
  );
  await fs.rm(source, { recursive: true });
  for (const file of ["module.html", "index.html"])
    await withPage(url + "project/" + file, async (page) => {
      for (const label of [
        "Action",
        "Local action",
        "Counter alias",
        "Namespace consumer",
      ]) {
        await page
          .getByRole("button", { name: label + " 0", exact: true })
          .click();
        await page
          .getByRole("button", { name: label + " 1", exact: true })
          .waitFor();
      }
      assert.equal(await page.evaluate(() => window.aliasIdentity), true);
      assert.equal(
        await page
          .getByRole("button", { name: "Action 1", exact: true })
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        "rgb(49, 93, 154)",
      );
      if (process.env.CODEX_CAPTURE_REEXPORTS && file === "module.html") {
        await fs.mkdir(process.env.CODEX_CAPTURE_REEXPORTS, {
          recursive: true,
        });
        await page.screenshot({
          path: path.join(
            process.env.CODEX_CAPTURE_REEXPORTS,
            "portable-aliases.png",
          ),
        });
      }
    });
  const portable = path.join(dir, "portable.html");
  await exportArtifact("html", path.join(project, "index.html"), portable);
  await fs.rm(path.join(project, "_ds"), { recursive: true });
  await withPage(url + "portable.html", async (page) => {
    await page
      .getByRole("button", { name: "Counter alias 0", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Counter alias 1", exact: true })
      .waitFor();
    assert.equal(await page.evaluate(() => window.aliasIdentity), true);
    await page.setViewportSize({ width: 375, height: 640 });
    if (process.env.CODEX_CAPTURE_REEXPORTS)
      await page.screenshot({
        path: path.join(
          process.env.CODEX_CAPTURE_REEXPORTS,
          "portable-aliases-narrow.png",
        ),
      });
  });
  assert.ok(m.artifacts[m.moduleEntry]);
});
test("missing, escaping and ambiguous local re-exports fail read-only inspection before replacing compiled artifacts", async (t) => {
  const { source } = await fixture(t);
  await compile(source);
  const before = await fs.readFile(
    path.join(source, "_ds_manifest.json"),
    "utf8",
  );
  for (const text of [
    'export{Missing}from"./Button.jsx";',
    'export{Button as Lost}from"../outside.jsx";',
    'export{Lost}from"./missing.jsx";',
    'export*as Button from"./Button.jsx";',
  ]) {
    await fs.writeFile(path.join(source, "bad.js"), text);
    assert.equal((await inspect(source)).issues.length > 0, true);
    await assert.rejects(compile(source));
    assert.equal(
      await fs.readFile(path.join(source, "_ds_manifest.json"), "utf8"),
      before,
    );
  }
  await fs.rm(path.join(source, "bad.js"));
  await fs.writeFile(path.join(source, "a.js"), "export const shared=1;");
  await fs.writeFile(path.join(source, "b.js"), "export const shared=2;");
  await fs.writeFile(
    path.join(source, "bad.js"),
    'export*from"./a.js";export*from"./b.js";',
  );
  assert.ok(
    (await inspect(source)).issues.some((i) =>
      /ambiguous|already exported/i.test(i),
    ),
  );
});
test("type-only declaration paths and forwarding chains stay out of the runtime catalog while unavailable external exports remain visible advisories", async (t) => {
  const { source } = await fixture(t);
  await fs.writeFile(
    path.join(source, "shared-types.d.ts"),
    "export interface Settings{label:string}\nexport declare function Ghost():unknown;",
  );
  await fs.writeFile(
    path.join(source, "types.d.ts"),
    'export{Settings}from"./shared-types.js";',
  );
  await fs.writeFile(
    path.join(source, "types.ts"),
    'import{Settings}from"./shared-types.js";export type{Settings};export type{Button as HiddenButton}from"./Button.jsx";',
  );
  await fs.writeFile(
    path.join(source, "type-consumer.ts"),
    'import{HiddenButton}from"./types.js";export{HiddenButton as HiddenAlias};export type*from"./Button.jsx";',
  );
  await fs.writeFile(
    path.join(source, "external.js"),
    'export*from"unavailable-library";export*as External from"unavailable-namespace";',
  );
  const model = await inspect(source);
  assert.deepEqual(model.issues, []);
  assert.equal(
    model.spec.components.some((c) => /Hidden|External|Settings/.test(c.name)),
    false,
  );
  for (const name of ["unavailable-library", "unavailable-namespace"])
    assert.ok(model.warnings.some((w) => w.includes(name)));
  await fs.writeFile(
    path.join(source, "bad-runtime.js"),
    'export{Ghost}from"./shared-types.js";',
  );
  assert.ok(
    (await inspect(source)).issues.some((issue) =>
      /declarations but no implementation/.test(issue),
    ),
  );
});
