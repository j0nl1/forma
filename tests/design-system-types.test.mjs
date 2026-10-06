import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { temporary } from "./helpers.mjs";
import {
  inspect,
  compile,
  preview,
  importSystem,
} from "../packages/cli/src/commands/design-system.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";

async function fixture(t) {
  const directory = await temporary(t),
    source = path.join(directory, "typed");
  await fs.mkdir(path.join(source, "types"), { recursive: true });
  await fs.mkdir(path.join(source, "components"));
  await fs.writeFile(
    path.join(source, "styles.css"),
    ":root{--accent:#315d9a}button{padding:12px;background:var(--accent);color:white}",
  );
  await fs.writeFile(
    path.join(source, "types/shared.d.ts"),
    `
export type Tone = "soft" | "solid";
export type Size = -1 | 0 | 2;
export interface Common<T extends Tone = "soft"> {
  /** Choose the visual emphasis. @default "soft" */
  tone?: T;
  /** A stable authored identity. */
  readonly id: string;
  ignored: number;
}
export interface Generic<T extends Tone = "soft"> { value: T; onChoose?(value: T): void }
`,
  );
  await fs.writeFile(
    path.join(source, "types/index.d.ts"),
    `export type {Common as Base, Tone, Size, Generic} from "./shared.js";`,
  );
  await fs.writeFile(
    path.join(source, "components/Button.d.ts"),
    `
import type {Base, Tone, Size} from "../types/index.js";
/** A configurable action. @startingPoint section="Actions" viewport="480x120" */
export type ButtonProps = Readonly<Partial<Pick<Base<Tone>, "tone" | "id">>> & {
  label: string;
  size?: Size;
  onChange?: (tone: Tone) => void;
};
`,
  );
  await fs.writeFile(
    path.join(source, "components/Button.jsx"),
    `import React from "react";if(typeof window==="undefined")throw new Error("Never execute source during type checks");export function Button({label="Continue",tone="soft"}){const [count,setCount]=React.useState(0);return <button data-tone={tone} onClick={()=>setCount(count+1)}>{label} {count}</button>}`,
  );
  await fs.writeFile(
    path.join(source, "components/Choice.d.ts"),
    `import type {Generic, Tone} from "../types/index.js";export interface ChoiceProps<T extends Tone = "soft"> extends Generic<T> { label?: string }`,
  );
  await fs.writeFile(
    path.join(source, "components/Choice.jsx"),
    `import React from "react";export function Choice({label="Choice",value="soft"}){return <span>{label}: {value}</span>}`,
  );
  return { directory, source };
}

test("contained type imports and generic utilities preserve resolved properties, variants, docs and defaults without execution", async (t) => {
  const { source } = await fixture(t),
    model = await inspect(source);
  assert.deepEqual(model.issues, []);
  const contract = model.spec.components.find(
    (c) => c.name === "Button",
  ).contract;
  const prop = (name) => contract.props.find((p) => p.name === name);
  assert.deepEqual(contract.props.map((p) => p.name).sort(), [
    "id",
    "label",
    "onChange",
    "size",
    "tone",
  ]);
  assert.deepEqual(prop("tone").values, ["soft", "solid"]);
  assert.equal(prop("tone").default, "soft");
  assert.match(prop("tone").description, /visual emphasis/);
  assert.equal(prop("tone").optional, true);
  assert.equal(prop("id").optional, true);
  assert.equal(prop("id").readonly, true);
  assert.equal(prop("label").optional, false);
  assert.equal(prop("label").readonly, undefined);
  assert.deepEqual(prop("size").values, [-1, 0, 2]);
  assert.equal(prop("size").type, "Size");
  assert.match(prop("onChange").resolvedType, /Tone/);
  assert.equal(prop("tone").definedIn, "types/shared.d.ts");
  assert.deepEqual(contract.dependencies, [
    "types/index.d.ts",
    "types/shared.d.ts",
  ]);
  const generic = model.spec.components.find(
    (c) => c.name === "Choice",
  ).contract;
  assert.deepEqual(generic.typeParameters, [
    { name: "T", constraint: "Tone", default: '"soft"' },
  ]);
  assert.deepEqual(generic.props.find((p) => p.name === "value").values, [
    "soft",
    "solid",
  ]);
  assert.match(
    generic.props.find((p) => p.name === "onChoose").type,
    /onChoose\?\(value: T\)/,
  );
  assert.deepEqual(Object.keys(model.declarations).sort(), [
    "components/Button.d.ts",
    "components/Choice.d.ts",
    "types/index.d.ts",
    "types/shared.d.ts",
  ]);
  assert.equal(
    await fs.stat(path.join(source, "_ds_manifest.json")).catch(() => null),
    null,
  );
});

test("type re-exports, cyclic module graphs and mapped modifiers retain complete contracts and advisory gaps", async (t) => {
  const { source } = await fixture(t);
  await fs.appendFile(
    path.join(source, "types/shared.d.ts"),
    `
import type {Base} from "./index.js";
type Mutable<T> = {-readonly [K in keyof T]: T[K]};
export type ButtonContract = Mutable<Required<Omit<Base<"solid">, "ignored">>> & {extra?: ExternalVisual.Node};
`,
  );
  await fs.writeFile(
    path.join(source, "components/Button.d.ts"),
    'export type {ButtonContract as ButtonProps} from "../types/shared.js";',
  );
  const model = await inspect(source);
  assert.deepEqual(model.issues, []);
  assert.ok(
    model.warnings.some((warning) => warning.includes("ExternalVisual")),
  );
  const contract = model.spec.components.find(
    (component) => component.name === "Button",
  ).contract;
  assert.deepEqual(contract.dependencies, [
    "types/index.d.ts",
    "types/shared.d.ts",
  ]);
  assert.deepEqual(contract.props.map((property) => property.name).sort(), [
    "extra",
    "id",
    "tone",
  ]);
  const tone = contract.props.find((property) => property.name === "tone");
  assert.equal(tone.optional, false);
  assert.deepEqual(tone.values, ["solid"]);
  assert.equal(
    contract.props.find((property) => property.name === "id").readonly,
    undefined,
  );
  assert.equal(
    contract.props.find((property) => property.name === "extra").type,
    "ExternalVisual.Node",
  );
});

test("conditional union contracts retain every alternative's properties in manifests, reviews and portable guides", async (t) => {
  const { source, directory } = await fixture(t);
  await fs.appendFile(
    path.join(source, "types/shared.d.ts"),
    'export type Form<T extends Tone> = T extends "soft" ? {kind:T; radius:2} : {kind:T; contrast:true};',
  );
  await fs.writeFile(
    path.join(source, "components/Choice.d.ts"),
    'import type {Form,Tone} from "../types/shared.js";export type ChoiceProps = Form<Tone> & {label:string};',
  );
  const manifest = await compile(source),
    contract = manifest.components.find(
      (component) => component.name === "Choice",
    ).contract;
  assert.deepEqual(contract.props.map((property) => property.name).sort(), [
    "kind",
    "label",
  ]);
  assert.deepEqual(
    contract.alternatives.map((alternative) =>
      alternative.props.map((property) => property.name).sort(),
    ),
    [
      ["kind", "label", "radius"],
      ["contrast", "kind", "label"],
    ],
  );
  assert.deepEqual(
    contract.alternatives[0].props.find(
      (property) => property.name === "radius",
    ).values,
    [2],
  );
  assert.deepEqual(
    contract.alternatives[1].props.find(
      (property) => property.name === "contrast",
    ).values,
    [true],
  );
  const review = await preview(source);
  await importSystem(source, path.join(directory, "consumer"));
  const guide = await fs.readFile(
    path.join(directory, "consumer/_ds/typed/_ds_guide.md"),
    "utf8",
  );
  assert.match(guide, /### Alternative 1/);
  assert.match(guide, /`radius`/);
  assert.match(guide, /`contrast`/);
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(pathToFileURL(review).href);
  await page.evaluate(() => window.CodexSystemReviewReady);
  const article = page.locator('[data-card-name="Choice"]').first();
  await article.getByText("Properties · 2", { exact: true }).click();
  await article
    .getByText("Alternative 1 · 3 properties", { exact: true })
    .click();
  await article
    .getByRole("rowheader", { name: "radius", exact: true })
    .waitFor();
  await article
    .getByText("Alternative 2 · 3 properties", { exact: true })
    .click();
  await article
    .getByRole("rowheader", { name: "contrast", exact: true })
    .waitFor();
});

test("resolved contracts remain usable in imported guides and interactive reviews after source deletion", async (t) => {
  const { directory, source } = await fixture(t),
    manifest = await compile(source);
  const project = path.join(directory, "consumer");
  await importSystem(source, project);
  const copy = path.join(project, "_ds/typed");
  const review = await preview(copy),
    portable = path.join(directory, "typed-review.html");
  await fs.copyFile(review, portable);
  const contracts = JSON.parse(
    await fs.readFile(path.join(copy, "_ds_contracts.json"), "utf8"),
  );
  assert.match(contracts.declarations["types/shared.d.ts"], /visual emphasis/);
  assert.deepEqual(
    contracts.components.find((c) => c.name === "Button").contract,
    manifest.components.find((c) => c.name === "Button").contract,
  );
  const guide = await fs.readFile(path.join(copy, "_ds_guide.md"), "utf8");
  assert.match(guide, /"soft".*"solid"/);
  assert.match(guide, /Choose the visual emphasis/);
  await fs.rm(source, { recursive: true });
  await fs.rm(copy, { recursive: true });
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const address of [
    url + "typed-review.html",
    pathToFileURL(portable).href,
  ]) {
    const page = await browser.newPage({
        viewport: { width: 1000, height: 800 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(address);
    await page.evaluate(() => window.CodexSystemReviewReady);
    const button = page.getByRole("button", { name: "Continue 0" }).first();
    await button.click();
    await page.getByRole("button", { name: "Continue 1" }).first().waitFor();
    const article = page.locator('[data-card-name="Button"]').first();
    await article.getByText("Properties · 5", { exact: true }).click();
    const tone = article.locator("tr").filter({
      has: page.getByRole("rowheader", { name: "tone?", exact: true }),
    });
    await tone.getByText('"soft" | "solid"', { exact: true }).waitFor();
    assert.match(await tone.innerText(), /Choose the visual emphasis/);
    const size = article.locator("tr").filter({
      has: page.getByRole("rowheader", { name: "size?", exact: true }),
    });
    assert.match(await size.innerText(), /-1 \| 0 \| 2/);
    if (process.env.CODEX_CAPTURE_TYPES && address.startsWith("http")) {
      await fs.mkdir(process.env.CODEX_CAPTURE_TYPES, { recursive: true });
      await article.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(
          process.env.CODEX_CAPTURE_TYPES,
          "typed-contract-review.png",
        ),
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await article.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(
          process.env.CODEX_CAPTURE_TYPES,
          "typed-contract-review-narrow.png",
        ),
      });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test("missing and escaping local type dependencies fail before replacing generated artifacts", async (t) => {
  const { directory, source } = await fixture(t);
  await compile(source);
  const before = await fs.readFile(
    path.join(source, "_ds_manifest.json"),
    "utf8",
  );
  await fs.writeFile(
    path.join(directory, "Outside.d.ts"),
    'export interface Outside {secret:"External type must stay outside"}',
  );
  for (const specifier of [
    "../types/absent.js",
    "../../Outside.js",
    path.join(directory, "Outside.d.ts"),
  ]) {
    await fs.writeFile(
      path.join(source, "components/Button.d.ts"),
      `import type {Outside} from ${JSON.stringify(specifier)};export interface ButtonProps extends Outside {label:string}`,
    );
    const model = await inspect(source);
    assert.ok(
      model.issues.some((issue) => issue.includes(specifier)),
      JSON.stringify(model.issues),
    );
    await assert.rejects(compile(source), /type dependency/i);
    assert.equal(
      await fs.readFile(path.join(source, "_ds_manifest.json"), "utf8"),
      before,
    );
    assert.ok(!Object.hasOwn(model.declarations, "../Outside.d.ts"));
  }
});
