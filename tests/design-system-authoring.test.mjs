import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { temporary } from "./helpers.mjs";
import {
  inspect,
  compile,
  preview,
  importSystem,
  wiring,
} from "../skills/forma/scripts/design-system.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";
import { inlineHtml } from "../skills/forma/scripts/lib/inline.mjs";
import {
  sourceAST,
  declarationContracts,
} from "../skills/forma/scripts/lib/system-contracts.mjs";

const declaration = `type Variant = 'soft' | 'solid';
type Alias = Variant;
interface Base { /** An accessible action label. */ label: string; }
/** An action that follows the selected emphasis.
 * @startingPoint section="Actions" subtitle="A reusable call to action" viewport="700x200"
 */
export interface ButtonProps extends Base {
  /** Visual emphasis.
   * @default "soft"
   */
  variant?: Alias;
  /** @default false */ disabled?: boolean;
  readonly level?: 1 | 2;
  onComplete?(value: {code: string; count: number}): void;
  config?: {foreground: string; spacing: number};
}
export interface ButtonProps { title?: string; }`;
async function fixture(t) {
  const directory = await temporary(t),
    source = path.join(directory, "aurora");
  await fs.mkdir(path.join(source, "components", "actions"), {
    recursive: true,
  });
  await fs.mkdir(path.join(source, "tokens"));
  await fs.mkdir(path.join(source, "ui"));
  await fs.mkdir(path.join(source, "assets"));
  await fs.writeFile(
    path.join(source, "README.md"),
    "# Aurora System\n\nUse clear labels and soft surfaces.",
  );
  await fs.writeFile(
    path.join(source, "styles.css"),
    '@import "tokens/colors.css";',
  );
  await fs.writeFile(
    path.join(source, "tokens/colors.css"),
    ":root{--accent:#255d9b;--soft:#e2eefc}body{font:18px system-ui}button{padding:12px 18px;border:0;border-radius:8px;margin:8px}",
  );
  await fs.writeFile(
    path.join(source, "components/actions/Button.tsx"),
    `import React from 'react';if(typeof window==='undefined')throw new Error('Component source must not execute during inspection'); export const PALETTE={accent:'blue'};export function Button({variant='soft',disabled=false,label='Continue'}){const [count,setCount]=React.useState(0);return <button data-variant={variant} disabled={disabled} style={{background:variant==='solid'?'var(--accent)':'var(--soft)',color:variant==='solid'?'white':'black'}} onClick={()=>setCount(count+1)}>{label} {count}</button>};export function helper(){return 'lowercase helper'}`,
  );
  await fs.writeFile(
    path.join(source, "components/actions/Button.d.ts"),
    declaration,
  );
  await fs.writeFile(
    path.join(source, "components/actions/Button.prompt.md"),
    "Use Button for one deliberate action.\n\nChoose `solid` for the primary action and `soft` for supporting actions.",
  );
  await fs.writeFile(
    path.join(source, "assets/logo.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="20"><rect width="60" height="20" fill="#255d9b"/></svg>',
  );
  const script = `<script>const ds=window.CodexDesignSystems.aurora;ds.createRoot(document.getElementById('root')).render(ds.React.createElement(ds.Components.Button,{variant:'solid',label:'Start'}));</script>`;
  await fs.writeFile(
    path.join(source, "components/actions/buttons.html"),
    `<!-- @dsCard group="Components" name="Action variants" viewport="700x200" subtitle="A solid action with independent state" -->\n<!doctype html><html lang="en"><title>Action variants</title><link rel="stylesheet" href="../../styles.css"><script src="../../_ds_bundle.js"></script><div id="root"></div>${script}</html>`,
  );
  await fs.writeFile(
    path.join(source, "ui/welcome.html"),
    `<!-- @startingPoint section="Screens" name="Welcome" viewport="700x300" subtitle="Begin with a working action" -->\n<!doctype html><html lang="en"><title>Welcome</title><link rel="stylesheet" href="../_ds_tokens.css"><script src="../_ds_bundle.js"></script><img src="../assets/logo.svg" alt="Aurora mark"><div id="root"></div>${script}</html>`,
  );
  return { directory, source };
}
async function fingerprint(directory) {
  const result = {};
  async function walk(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(file);
      else
        result[path.relative(directory, file)] = createHash("sha256")
          .update(await fs.readFile(file))
          .digest("hex");
    }
  }
  await walk(directory);
  return result;
}

test("declaration AST preserves inherited and merged properties, nested types, aliases, defaults and methods", () => {
  const parsed = sourceAST("Button.d.ts", declaration);
  assert.deepEqual(parsed.issues, []);
  const contract = declarationContracts(parsed.source)("ButtonProps");
  assert.deepEqual(
    contract.props.map((property) => property.name),
    ["label", "variant", "disabled", "level", "onComplete", "config", "title"],
  );
  const property = (name) =>
    contract.props.find((property) => property.name === name);
  assert.equal(property("label").optional, false);
  assert.match(property("label").description, /accessible/);
  assert.deepEqual(property("variant").values, ["soft", "solid"]);
  assert.equal(property("variant").default, "soft");
  assert.equal(property("variant").optional, true);
  assert.equal(property("disabled").default, false);
  assert.deepEqual(property("level").values, [1, 2]);
  assert.equal(property("level").readonly, true);
  assert.match(
    property("onComplete").type,
    /value: \{code: string; count: number\}/,
  );
  assert.match(property("config").type, /foreground: string; spacing: number/);
  assert.equal(contract.declaration, declaration);
});

test("automatic authoring discovery is read-only and retains components, constants, usage, cards and both starting-point kinds", async (t) => {
  const { source } = await fixture(t),
    before = await fingerprint(source),
    model = await inspect(source);
  assert.deepEqual(model.issues, []);
  assert.deepEqual(await fingerprint(source), before);
  assert.equal(model.spec.name, "Aurora System");
  assert.equal(model.spec.css, "styles.css");
  assert.equal(model.spec.entry, undefined);
  assert.deepEqual(
    model.spec.components.map((component) => component.name),
    ["PALETTE", "Button"],
  );
  assert.equal(model.spec.components[0].kind, "constant");
  assert.equal(
    model.spec.components[1].contract.path,
    "components/actions/Button.d.ts",
  );
  assert.match(model.spec.components[1].usage, /supporting actions/);
  assert.deepEqual(
    model.cards.map((card) => [card.group, card.name, card.viewport]),
    [["Components", "Action variants", "700x200"]],
  );
  assert.equal(model.spec.startingPoints[0].kind, "component");
  assert.equal(model.spec.startingPoints[0].component, "Button");
  assert.equal(
    model.spec.startingPoints[0].previewPath,
    "components/actions/buttons.html",
  );
  assert.equal(model.spec.startingPoints[1].kind, "screen");
  assert.equal(model.spec.startingPoints[1].name, "Welcome");
});

test("first compilation creates working portable cards and screen seeds; imported contracts and usage survive source deletion", async (t) => {
  const { directory, source } = await fixture(t),
    manifest = await compile(source);
  assert.equal(manifest.cards.length, 1);
  assert.equal(manifest.startingPoints.length, 2);
  assert.equal(manifest.startingPoints[0].previewPath, manifest.cards[0].path);
  assert.equal(
    manifest.startingPoints[1].previewPath,
    manifest.startingPoints[1].path,
  );
  assert.ok(manifest.artifacts[manifest.contracts]);
  await preview(source);
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url + "aurora/preview.html", async (page) => {
    await page.getByRole("button", { name: "Continue 0" }).waitFor();
    await page.getByText("Properties · 7").click();
    assert.ok(
      await page.getByText('"soft" | "solid"', { exact: true }).isVisible(),
    );
    assert.equal(
      await page.getByText('"accent": "blue"', { exact: false }).count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("link", { name: "Welcome", exact: true })
        .getAttribute("href"),
      "#review-card-1",
    );
    assert.equal(await page.locator("iframe").count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "Start 0" }).count(),
      2,
    );
  });
  const project = path.join(directory, "project");
  await importSystem(source, project);
  const binding = await wiring(project);
  assert.equal(binding.systems[0].startingPoints[0].component, "Button");
  const copied = path.join(project, "_ds/aurora");
  assert.match(
    await fs.readFile(path.join(copied, "_ds_guide.md"), "utf8"),
    /supporting actions/,
  );
  assert.match(
    await fs.readFile(path.join(copied, "_ds_guide.md"), "utf8"),
    /variant\?/,
  );
  const contracts = JSON.parse(
    await fs.readFile(path.join(copied, manifest.contracts), "utf8"),
  );
  assert.equal(
    contracts.declarations["components/actions/Button.d.ts"],
    declaration,
  );
  await fs.rm(source, { recursive: true });
  for (const file of [manifest.cards[0].path, manifest.startingPoints[1].path])
    await withPage(url + "project/_ds/aurora/" + file, async (page) => {
      await page.getByRole("button", { name: "Start 0" }).click();
      await page.getByRole("button", { name: "Start 1" }).waitFor();
      assert.equal(
        await page
          .locator("button")
          .evaluate((node) => getComputedStyle(node).backgroundColor),
        "rgb(37, 93, 155)",
      );
      if (file === manifest.startingPoints[1].path)
        assert.ok(
          (await page.locator("img").getAttribute("src")).startsWith(
            "data:image/svg+xml;base64,",
          ),
        );
    });
});

test("recompilation uses current generated CSS and components instead of an earlier disk bundle", async (t) => {
  const { directory, source } = await fixture(t);
  const first = await compile(source);
  await fs.appendFile(
    path.join(source, "tokens/colors.css"),
    ":root{--accent:#286c42}",
  );
  const component = path.join(source, "components/actions/Button.tsx");
  await fs.writeFile(
    component,
    (await fs.readFile(component, "utf8")).replace(
      "{label} {count}",
      "{label} updated {count}",
    ),
  );
  const second = await compile(source);
  assert.equal(second.namespace, first.namespace);
  assert.notEqual(
    second.artifacts[second.cards[0].path],
    first.artifacts[first.cards[0].path],
  );
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url + "aurora/" + second.cards[0].path, async (page) => {
    await page.getByRole("button", { name: "Start updated 0" }).click();
    await page.getByRole("button", { name: "Start updated 1" }).waitFor();
    assert.equal(
      await page
        .locator("button")
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      "rgb(40, 108, 66)",
    );
  });
});

test("discovery reports orphan declarations, duplicate exports, malformed syntax and invalid card geometry without writes", async (t) => {
  const { source } = await fixture(t);
  await fs.writeFile(
    path.join(source, "Unused.d.ts"),
    "export interface UnusedProps { label:string }",
  );
  await fs.writeFile(
    path.join(source, "Duplicate.jsx"),
    "export function Button(){return null}",
  );
  await fs.writeFile(
    path.join(source, "Broken.tsx"),
    "export function Broken( {",
  );
  const card = path.join(source, "components/actions/buttons.html");
  await fs.writeFile(
    card,
    (await fs.readFile(card, "utf8")).replace("700x200", "0x200"),
  );
  const before = await fingerprint(source),
    model = await inspect(source);
  assert.ok(model.issues.some((issue) => issue.includes("Orphan")));
  assert.ok(
    model.issues.some((issue) =>
      issue.includes("Duplicate component export Button"),
    ),
  );
  assert.ok(model.issues.some((issue) => issue.includes("Broken.tsx:")));
  assert.ok(model.issues.some((issue) => issue.includes("Invalid viewport")));
  await assert.rejects(compile(source), /Orphan|Duplicate/);
  assert.deepEqual(await fingerprint(source), before);
});

test("inline generation overrides remain inside their declared root and do not write virtual dependencies to disk", async (t) => {
  const directory = await temporary(t),
    input = path.join(directory, "index.html");
  await fs.writeFile(
    input,
    '<!doctype html><html lang="en"><title>Virtual output</title><link rel="stylesheet" href="generated.css"><script src="generated.js"></script></html>',
  );
  const generated = new Map([
    ["generated.css", "body{color:#112233}"],
    ["generated.js", 'window.virtualSource="Current";'],
  ]);
  const output = await inlineHtml(input, { root: directory, generated });
  assert.match(output, /color:#112233/);
  assert.match(output, /virtualSource="Current"/);
  assert.deepEqual(await fs.readdir(directory), ["index.html"]);
  await assert.rejects(
    inlineHtml(input, {
      root: directory,
      generated: new Map([["../escape.js", "outside"]]),
    }),
    /leaves allowed root/,
  );
});
