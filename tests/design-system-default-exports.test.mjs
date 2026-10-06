import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary } from "./helpers.mjs";
import {
  sourceAST,
  namedExports,
} from "../packages/design-systems/src/source/contracts.mjs";
import {
  inspect,
  compile,
  preview,
  importSystem,
} from "../packages/cli/src/commands/design-system.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";

test("named default components retain their real default import and local declaration identities", () => {
  const source = sourceAST(
    "Panel.jsx",
    "export default class Panel{};export {Panel as NamedPanel};",
  ).source;
  assert.deepEqual(namedExports(source), [
    { name: "Panel", export: "default", local: "Panel", kind: "component" },
    {
      name: "NamedPanel",
      export: "NamedPanel",
      local: "Panel",
      kind: "component",
    },
  ]);
  const functionSource = sourceAST(
    "Badge.jsx",
    "export default function Badge(){return null}",
  ).source;
  assert.deepEqual(namedExports(functionSource), [
    { name: "Badge", export: "default", local: "Badge", kind: "component" },
  ]);
  for (const text of [
    "export default class{}",
    "export default function(){return null}",
    "export default {label:'A data value'}",
    "export default function lowerHelper(){return null}",
  ])
    assert.deepEqual(namedExports(sourceAST("unknown.jsx", text).source), []);
});

test("discovered default classes and functions retain contracts, class state, public imports and portable output with the pinned React 18 pair", async (t) => {
  const directory = await temporary(t);
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const version of ["18.3.1"]) {
    const slug = version.startsWith("18") ? "classic" : "native",
      source = path.join(directory, slug),
      project = path.join(directory, slug + "-project");
    await fs.mkdir(source);
    await fs.writeFile(
      path.join(source, "system.json"),
      JSON.stringify({
        schemaVersion: 1,
        name: slug,
        slug,
        css: "styles.css",
        reactVersion: version,
        ...(slug === "classic"
          ? {
              components: [
                {
                  name: "Counter",
                  export: "default",
                  sourcePath: "Counter.jsx",
                  props: { label: "Counter" },
                },
              ],
            }
          : {}),
      }),
    );
    await fs.writeFile(
      path.join(source, "styles.css"),
      ":root{--accent:#315d9a;--gap:12px}button{background:var(--accent);color:white;padding:var(--gap)}",
    );
    await fs.writeFile(
      path.join(source, "Counter.jsx"),
      'import React from "react";if(typeof window==="undefined")throw new Error("Do not execute during analysis");export default class Counter extends React.Component{state={count:0};render(){return <button data-component="Counter" onClick={()=>this.setState(({count})=>({count:count+1}))}>{this.props.label||"Counter"} {this.state.count}</button>}}' +
        (slug === "classic" ? "export{Counter};" : ""),
    );
    await fs.writeFile(
      path.join(source, "Counter.d.ts"),
      'export interface CounterProps {/** @default "Counter" */label?:string}',
    );
    await fs.writeFile(
      path.join(source, "Badge.jsx"),
      'import React from "react";export default function Badge({label="Status"}){return <span data-component="Badge">{label}</span>}',
    );
    await fs.writeFile(
      path.join(source, "Badge.d.ts"),
      "export interface BadgeProps {label?:string}",
    );
    const before = await fs.readdir(source),
      model = await inspect(source);
    assert.deepEqual(model.issues, []);
    assert.deepEqual(await fs.readdir(source), before);
    assert.deepEqual(
      model.spec.components.map((c) => [
        c.name,
        c.export,
        c.contract.props.map((p) => p.name),
      ]),
      [
        ["Badge", "default", ["label"]],
        ["Counter", "default", ["label"]],
      ],
    );
    const manifest = await compile(source);
    assert.equal(manifest.reactVersion, version);
    await preview(source);
    await withPage(url + slug + "/preview.html", async (page) => {
      await page
        .getByRole("button", { name: "Counter 0", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Counter 1", exact: true })
        .waitFor();
      await page.getByText("Status", { exact: true }).waitFor();
    });
    await importSystem(source, project);
    await fs.writeFile(
      path.join(project, "main.js"),
      `import DS,{React,createRoot,Counter,Badge} from "./_ds/${slug}/_ds_entry.js";window.defaultIdentity=DS.Components.Counter===Counter&&DS.Components.Badge===Badge&&DS.React===React;createRoot(document.getElementById("root")).render(React.createElement(React.Fragment,null,React.createElement(Counter,{label:"Portable counter"}),React.createElement(Badge,{label:"Portable status"})));`,
    );
    await bundle(
      path.join(project, "main.js"),
      path.join(project, "bundle.js"),
    );
    const html =
      '<!doctype html><html lang="en"><title>Default component imports</title><link rel="stylesheet" href="_ds/' +
      slug +
      '/_ds_tokens.css"><div id="root"></div>';
    await fs.writeFile(
      path.join(project, "index.html"),
      html + '<script src="bundle.js"></script></html>',
    );
    await fs.writeFile(
      path.join(project, "module.html"),
      html + '<script type="module" src="main.js"></script></html>',
    );
    await fs.rm(source, { recursive: true });
    for (const file of ["index.html", "module.html"])
      await withPage(url + slug + "-project/" + file, async (page) => {
        await page
          .getByRole("button", { name: "Portable counter 0", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Portable counter 1", exact: true })
          .waitFor();
        assert.equal(await page.evaluate(() => window.defaultIdentity), true);
        await page.getByText("Portable status", { exact: true }).waitFor();
        assert.equal(
          await page
            .locator("button")
            .evaluate((n) => getComputedStyle(n).backgroundColor),
          "rgb(49, 93, 154)",
        );
        if (process.env.CODEX_CAPTURE_DEFAULTS && file === "module.html") {
          await fs.mkdir(process.env.CODEX_CAPTURE_DEFAULTS, {
            recursive: true,
          });
          await page.screenshot({
            path: path.join(
              process.env.CODEX_CAPTURE_DEFAULTS,
              slug + "-default-components.png",
            ),
          });
        }
      });
    const portable = path.join(directory, slug + "-portable.html");
    await exportArtifact("html", path.join(project, "index.html"), portable);
    await fs.rm(path.join(project, "_ds"), { recursive: true });
    await withPage(url + slug + "-portable.html", async (page) => {
      await page
        .getByRole("button", { name: "Portable counter 0", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Portable counter 1", exact: true })
        .waitFor();
      await page.getByText("Portable status", { exact: true }).waitFor();
    });
  }
});
