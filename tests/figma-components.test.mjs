import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { compileSchema, parseSchema, encodeBinarySchema } from "kiwi-schema";
import { zipSync } from "fflate";
import { temporary } from "./helpers.mjs";
import { importFig } from "../packages/cli/src/commands/figma.mjs";
import { loadFig } from "../packages/exports/src/lib/figma.mjs";
import {
  componentModel,
  componentEntries,
} from "../packages/exports/src/lib/figma-component-model.mjs";
import { sourceAST } from "../packages/exports/src/lib/system-contracts.mjs";
import {
  compile,
  preview,
  inspect,
} from "../packages/cli/src/commands/design-system.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";
const guid = (localID) => ({ sessionID: 1, localID });
const transform = (x = 0, y = 0) => ({
  m00: 1,
  m01: 0,
  m02: x,
  m10: 0,
  m11: 1,
  m12: y,
});
const color = (r, g, b) => ({ r, g, b, a: 1 });
const paint = (c) => ({ type: "SOLID", color: c });
function bytes() {
  // Only this owned constant fixture schema is compiled, never imported design schemas.
  const schema = parseSchema(`
    enum NodeType{DOCUMENT=0;FRAME=1;SYMBOL=2;TEXT=3;INSTANCE=4;ELLIPSE=5;}
    struct Guid{uint sessionID;uint localID;}struct Vec{float x;float y;}struct Parent{Guid guid;string position;}
    struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;}struct Color{float r;float g;float b;float a;}
    message Paint{string type=1;Color color=2;}message Text{string characters=1;}message Initial{bool boolValue=1;Text textValue=2;float floatValue=3;}
    message Def{Guid id=1;string name=2;string type=3;string sortPosition=4;Initial initialValue=5;bool isDeleted=6;Guid parentPropDefId=7;}
    message Ref{Guid defID=1;string componentPropNodeField=2;bool isDeleted=3;}message Order{string property=1;string[] values=2;}
    message Font{string family=1;string style=2;}
    message Node{Guid guid=1;Parent parentIndex=2;NodeType type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;bool isStateGroup=8;Def[] componentPropDefs=9;Ref[] componentPropRefs=10;Order[] stateGroupPropertyValueOrders=11;Text textData=12;Font fontName=13;float fontSize=14;bool visible=15;bool mask=16;}
    message Message{Node[] nodeChanges=1;}
  `);
  const nodes = [
    { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Document" },
    {
      guid: guid(1),
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "a" },
      type: "FRAME",
      name: "Stateful label",
      isStateGroup: true,
      size: { x: 600, y: 100 },
      componentPropDefs: [
        { id: guid(91), name: "Size", type: "VARIANT", sortPosition: "a" },
        { id: guid(92), name: "Active", type: "VARIANT", sortPosition: "b" },
        {
          id: guid(93),
          name: "Label",
          type: "TEXT",
          sortPosition: "c",
          initialValue: { textValue: { characters: "Default <&>" } },
        },
        {
          id: guid(94),
          name: "Show indicator",
          type: "BOOL",
          sortPosition: "d",
          initialValue: { boolValue: true },
        },
        {
          id: guid(95),
          name: "Slot",
          type: "INSTANCE_SWAP",
          sortPosition: "e",
        },
        { id: guid(96), name: "Ignored", type: "TEXT", isDeleted: true },
      ],
      stateGroupPropertyValueOrders: [
        { property: "Size", values: ["Small", "Large"] },
        { property: "Active", values: ["True", "False"] },
      ],
    },
    {
      guid: guid(50),
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "b" },
      type: "SYMBOL",
      name: "Stateful label",
      size: { x: 40, y: 40 },
      fillPaints: [paint(color(1, 1, 0))],
    },
    {
      guid: guid(51),
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "c" },
      type: "SYMBOL",
      name: "../../<script>danger</script>",
      size: { x: 20, y: 20 },
      fillPaints: [paint(color(0, 1, 0))],
    },
  ];
  nodes.push({
    guid: guid(52),
    parentIndex: { guid: guid(50), position: "a" },
    type: "ELLIPSE",
    name: "Mask circle",
    size: { x: 20, y: 20 },
    mask: true,
  });
  nodes.push({
    guid: guid(53),
    parentIndex: { guid: guid(50), position: "b" },
    type: "FRAME",
    name: "Masked ink",
    size: { x: 40, y: 40 },
    fillPaints: [paint(color(0, 0, 1))],
  });
  for (const [id, name, w, h, c] of [
    [2, "Size=Small, Active=True", 120, 48, color(0, 0, 1)],
    [3, "Size=Large, Active=False", 200, 64, color(1, 0, 0)],
    [4, "Size=Small, Active=False", 120, 48, color(0, 0.5, 0)],
  ]) {
    nodes.push({
      guid: guid(id),
      parentIndex: { guid: guid(1), position: String(id) },
      type: "SYMBOL",
      name,
      size: { x: w, y: h },
      fillPaints: [paint(c)],
      componentPropDefs: [
        {
          id: guid(id + 100),
          name: "Inherited label",
          type: "TEXT",
          parentPropDefId: guid(93),
        },
      ],
    });
    nodes.push({
      guid: guid(id + 10),
      parentIndex: { guid: guid(id), position: "a" },
      type: "TEXT",
      name: "Bound label",
      size: { x: 100, y: 25 },
      transform: transform(10, 8),
      fontName: { family: "Arial", style: "Regular" },
      fontSize: 16,
      fillPaints: [paint(color(1, 1, 1))],
      textData: { characters: "Raw " + id },
      componentPropRefs: [
        { defID: guid(id + 100), componentPropNodeField: "TEXT_DATA" },
      ],
    });
    nodes.push({
      guid: guid(id + 20),
      parentIndex: { guid: guid(id), position: "b" },
      type: "FRAME",
      name: "Indicator",
      size: { x: 20, y: 20 },
      transform: transform(90, 24),
      visible: false,
      fillPaints: [paint(color(0, 1, 0))],
      componentPropRefs: [
        { defID: guid(94), componentPropNodeField: "VISIBLE" },
      ],
    });
    nodes.push({
      guid: guid(id + 30),
      parentIndex: { guid: guid(id), position: "c" },
      type: "INSTANCE",
      name: "Content slot",
      size: { x: 20, y: 20 },
      transform: transform(10, 28),
      componentPropRefs: [
        { defID: guid(95), componentPropNodeField: "OVERRIDDEN_SYMBOL_ID" },
      ],
    });
  }
  const header = Buffer.alloc(12);
  header.write("fig-kiwi");
  header.writeUInt32LE(1, 8);
  const chunks = [
    Buffer.from(encodeBinarySchema(schema)),
    Buffer.from(compileSchema(schema).encodeMessage({ nodeChanges: nodes })),
  ].map(deflateRawSync);
  return Buffer.concat([
    header,
    ...chunks.flatMap((chunk) => {
      const size = Buffer.alloc(4);
      size.writeUInt32LE(chunk.length);
      return [size, chunk];
    }),
  ]);
}
async function fixture(t) {
  const dir = await temporary(t, "figma-components-");
  const raw = path.join(dir, "components.fig"),
    zip = path.join(dir, "zip.fig");
  await fs.writeFile(raw, bytes());
  await fs.writeFile(zip, zipSync({ "canvas.fig": bytes() }));
  return { dir, raw, zip };
}
const style =
  "*{box-sizing:border-box}body{margin:24px;background:white;font-family:Arial}";
function reference(w, h, c, label, indicator) {
  return `<div style="position:relative;width:${w}px;height:${h}px;background:${c}"><div style="position:absolute;left:10px;top:8px;width:100px;height:25px;color:white;font:16px Arial;white-space:pre-wrap">${label}</div>${indicator ? '<div style="position:absolute;left:90px;top:24px;width:20px;height:20px;background:#00ff00"></div>' : ""}</div>`;
}
async function consumer(dir, output, name = "consumer") {
  await fs.writeFile(
    path.join(dir, name + ".jsx"),
    `import React from 'react';import {createRoot} from 'react-dom/client';import {StatefulLabel} from './${output}/components/StatefulLabel.jsx';import {StatefulLabel2} from './${output}/components/StatefulLabel2.jsx';` +
      `
  const props={};window.update=(patch)=>{Object.assign(props,patch);render()};
  const root=createRoot(document.getElementById('root'));
  function render(){root.render(<StatefulLabel {...props}/>)}render();
  createRoot(document.getElementById('duplicates')).render(<><StatefulLabel2/><StatefulLabel2/></>);`,
  );
  await bundle(path.join(dir, name + ".jsx"), path.join(dir, name + ".js"));
  await fs.writeFile(
    path.join(dir, name + ".html"),
    `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="codex-fixed-sheet" content="off"><style>${style}</style><div id="root"></div><div id="duplicates"></div><p><button onclick="window.update({size:'sm',active:true,label:'Small variant',showIndicator:true})">Small variant</button> <button onclick="window.update({size:'lg',active:false,label:'Large variant',showIndicator:false})">Large variant</button></p><script src="${name}.js"></script></html>`,
  );
}
test("Figma components retain declared axes, defaults, inherited refs, safe names and collisions without changing input", async (t) => {
  const { dir, raw } = await fixture(t),
    original = await fs.readFile(raw),
    doc = await loadFig(raw);
  assert.deepEqual(
    componentEntries(doc).map((entry) => entry.name),
    ["StatefulLabel", "StatefulLabel2", "ScriptDangerScript"],
  );
  const model = componentModel(doc.nodes.get("1:1"));
  assert.deepEqual(
    model.axes.map((axis) => [axis.key, axis.value, axis.type]),
    [
      ["size", "sm", '"sm" | "lg"'],
      ["active", true, "boolean"],
    ],
  );
  assert.equal(model.byId.get("1:102").key, "label");
  const reservedModel = componentModel({
    ...doc.nodes.get("1:1"),
    componentPropDefs: [
      { id: guid(70), name: "style", type: "TEXT" },
      { id: guid(71), name: "className", type: "TEXT" },
    ],
  });
  assert.deepEqual(
    reservedModel.props.map((prop) => prop.key),
    ["style2", "className2"],
  );
  const caseDoc = { ...doc, nodes: new Map(doc.nodes) };
  caseDoc.nodes.set("1:50", {
    ...doc.nodes.get("1:50"),
    name: "STATEFUL LABEL",
  });
  assert.equal(
    componentEntries(caseDoc).find((entry) => entry.node.guid.localID === 50)
      .name,
    "STATEFULLABEL2",
  );
  const reservedDoc = { ...doc, nodes: new Map(doc.nodes) };
  reservedDoc.nodes.set("1:51", { ...doc.nodes.get("1:51"), name: "React" });
  assert.equal(
    componentEntries(reservedDoc).find(
      (entry) => entry.node.guid.localID === 51,
    ).name,
    "React2",
  );
  assert.deepEqual(
    model.cases.map((item) => item.values),
    [
      ["sm", true],
      ["lg", false],
      ["sm", false],
    ],
  );
  const aliases = componentModel({
    ...doc.nodes.get("1:1"),
    stateGroupPropertyValueOrders: [
      { property: "Size", values: ["Small (10)", "Large"] },
      { property: "Active", values: ["Yes", "No"] },
    ],
  });
  assert.equal(aliases.props.find((prop) => prop.key === "size").value, "sm");
  assert.equal(aliases.props.find((prop) => prop.key === "active").value, true);
  const result = await importFig(
    "components",
    raw,
    path.join(dir, "selected"),
    "1:1",
  );
  assert.equal(result.components, 1);
  const code = await fs.readFile(
    path.join(dir, "selected/components/StatefulLabel.jsx"),
    "utf8",
  );
  assert.deepEqual(sourceAST("StatefulLabel.jsx", code).issues, []);
  assert.doesNotMatch(code, /dangerouslySetInnerHTML/);
  assert.match(code, /props.label/);
  assert.match(code, /props.showIndicator/);
  assert.match(code, /props.slot/);
  await assert.rejects(
    importFig("components", raw, path.join(dir, "ambiguous"), "Stateful label"),
    /Ambiguous/,
  );
  await assert.rejects(
    importFig("components", raw, path.join(dir, "missing"), "absent"),
    /No matching/,
  );
  assert.deepEqual(await fs.readFile(raw), original);
  const warnings = [],
    node = doc.nodes.get("1:1");
  node.children.push({ ...node.children[0], guid: guid(80) });
  componentModel(node, warnings);
  assert.match(warnings.join("\n"), /collision/);
});
test("raw and ZIP generated React variants preserve exact owned CSS pixels and live text, visibility, slots and style props", async (t) => {
  const { dir, raw, zip } = await fixture(t);
  for (const [name, file] of [
    ["raw", raw],
    ["zip", zip],
  ]) {
    await importFig("components", file, path.join(dir, name));
    await consumer(dir, name, name + "-consumer");
  }
  const refs = [
    [120, 48, "blue", "Default &lt;&amp;&gt;", true],
    [200, 64, "red", "Updated &lt;script&gt;", false],
    [120, 48, "rgb(0,128,0)", "Default &lt;&amp;&gt;", true],
  ];
  await fs.writeFile(
    path.join(dir, "reference.html"),
    `<!doctype html><meta name="codex-fixed-sheet" content="off"><style>${style}</style>${refs.map((args, i) => `<section id="reference-${i}">${reference(...args)}</section>`).join("")}<div id="reference-badge" style="position:relative;width:40px;height:40px;background:yellow"><svg width="0" height="0" style="position:absolute"><defs><clipPath id="reference-circle" clipPathUnits="userSpaceOnUse"><circle cx="10" cy="10" r="10"/></clipPath></defs></svg><div style="position:absolute;inset:0;background:blue;clip-path:url(#reference-circle)"></div></div>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const expected = [];
  let badge;
  await withPage(url + "reference.html", async (page) => {
    badge = await page.locator("#reference-badge").screenshot();
    for (let i = 0; i < refs.length; i++)
      expected.push(await page.locator(`#reference-${i} > div`).screenshot());
  });
  for (const name of ["raw", "zip"])
    await withPage(url + name + "-consumer.html", async (page, errors) => {
      const root = page.locator("#root > div");
      await root.waitFor();
      await page.locator("#duplicates > div").first().waitFor();
      for (const duplicate of await page.locator("#duplicates > div").all())
        assert.deepEqual(await duplicate.screenshot(), badge);
      const ids = await page
        .locator("#duplicates [id]")
        .evaluateAll((nodes) => nodes.map((node) => node.id));
      assert.equal(ids.length, 2);
      assert.equal(new Set(ids).size, 2);
      assert.deepEqual(await root.screenshot(), expected[0]);
      await page.evaluate(() =>
        window.update({
          size: "lg",
          active: false,
          label: "Updated <script>",
          showIndicator: false,
        }),
      );
      await page.waitForFunction(
        () =>
          document.querySelector("#root > div").getBoundingClientRect()
            .width === 200,
      );
      assert.deepEqual(await root.screenshot(), expected[1]);
      assert.equal(await page.locator("#root script").count(), 0);
      await page.evaluate(() =>
        window.update({
          size: "sm",
          active: false,
          label: null,
          showIndicator: true,
        }),
      );
      await page.waitForFunction(
        () =>
          document.querySelector("#root > div").getBoundingClientRect()
            .width === 120,
      );
      assert.deepEqual(await root.screenshot(), expected[2]);
      await page.evaluate(() =>
        window.update({
          size: "unsupported",
          active: true,
          slot: "Slot text",
          className: "custom",
          style: { borderRadius: 8 },
        }),
      );
      await page.waitForFunction(
        () => document.querySelector("#root > div").className === "custom",
      );
      assert.equal(
        await root.evaluate((el) => getComputedStyle(el).borderRadius),
        "8px",
      );
      assert.match(await root.textContent(), /Slot text/);
      assert.deepEqual(errors, []);
      if (process.env.CODEX_CAPTURE_FIGMA_COMPONENTS) {
        await exportArtifact(
          "html",
          path.join(dir, name + "-consumer.html"),
          path.join(process.env.CODEX_CAPTURE_FIGMA_COMPONENTS, name + ".html"),
        );
        await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_COMPONENTS, {
          recursive: true,
        });
        await page.screenshot({
          path: path.join(
            process.env.CODEX_CAPTURE_FIGMA_COMPONENTS,
            name + ".png",
          ),
        });
      }
    });
});
test("generated Figma component contracts, compiled samples and portable React output remain usable after deleting the Figma and system sources", async (t) => {
  const { dir, raw, zip } = await fixture(t),
    system = path.join(dir, "system");
  await importFig("design-system", zip, system);
  const inventory = await inspect(system);
  assert.equal(inventory.spec.components.length, 3);
  const manifest = await compile(system);
  assert.equal(manifest.components.length, 3);
  assert.deepEqual(
    manifest.components
      .find((c) => c.name === "StatefulLabel")
      .contract.props.find((p) => p.name === "size").values,
    ["sm", "lg"],
  );
  assert.equal(
    manifest.components
      .find((c) => c.name === "StatefulLabel")
      .contract.props.find((p) => p.name === "size").default,
    "sm",
  );
  await preview(system);
  await fs.copyFile(
    path.join(system, "preview.html"),
    path.join(dir, "review.html"),
  );
  await consumer(dir, "system", "portable-consumer");
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await exportArtifact(
    "html",
    path.join(dir, "portable-consumer.html"),
    path.join(dir, "portable.html"),
  );
  await fs.rm(system, { recursive: true, force: true });
  await fs.rm(raw);
  await fs.rm(zip);
  await fs.rm(path.join(dir, "portable-consumer.js"));
  await withPage(url + "review.html", async (page, errors) => {
    assert.ok((await page.content()).includes("StatefulLabel"));
    assert.deepEqual(errors, []);
    const roots = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .filter((el) => el.shadowRoot)
        .flatMap((el) => [
          ...el.shadowRoot.querySelectorAll('[data-figma-id="1:2"]'),
        ])
        .map((el) => ({
          text: el.textContent,
          width: el.getBoundingClientRect().width,
        })),
    );
    assert.ok(
      roots.some((item) => item.text.includes("Default <&>") && item.width > 0),
    );
  });
  await withPage(url + "portable.html", async (page, errors) => {
    await page.locator("#root > div").waitFor();
    assert.match(await page.locator("#root").textContent(), /Default <&>/);
    await page.evaluate(() =>
      window.update({ size: "lg", active: false, label: "Portable value" }),
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#root > div").getBoundingClientRect().width ===
        200,
    );
    assert.match(await page.locator("#root").textContent(), /Portable value/);
    assert.deepEqual(errors, []);
  });
  await exportArtifact(
    "png",
    url + "portable.html",
    path.join(dir, "portable.png"),
  );
  assert.ok((await fs.stat(path.join(dir, "portable.png"))).size > 500);
});
