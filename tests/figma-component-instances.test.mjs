import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { compileSchema, parseSchema, encodeBinarySchema } from "kiwi-schema";
import { zipSync } from "fflate";
import { temporary } from "./helpers.mjs";
import { importFig } from "../skills/forma/scripts/figma.mjs";
import {
  compile,
  preview,
  inspect,
} from "../skills/forma/scripts/design-system.mjs";
import { bundle } from "../skills/forma/scripts/build.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/forma/scripts/export.mjs";
const guid = (localID) => ({ sessionID: 1, localID });
const matrix = (x = 0, y = 0) => ({
  m00: 1,
  m01: 0,
  m02: x,
  m10: 0,
  m11: 1,
  m12: y,
});
const color = (r, g, b) => ({ type: "SOLID", color: { r, g, b, a: 1 } });
const ref = (id, field) => ({ defID: guid(id), componentPropNodeField: field });
const assignment = (id, value) => ({ defID: guid(id), value });
const override = (ids, fields) => ({
  guidPath: { guids: ids.map(guid) },
  ...fields,
});
function bytes() {
  // Compile this independently owned constant fixture schema only; imported schemas remain data.
  const schema = parseSchema(`
    enum Type{DOCUMENT=0;FRAME=1;SYMBOL=2;INSTANCE=3;TEXT=4;ELLIPSE=5;}
    struct Guid{uint sessionID;uint localID;}struct Vec{float x;float y;}struct Parent{Guid guid;string position;}
    struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;}struct Color{float r;float g;float b;float a;}
    message Paint{string type=1;Color color=2;}message Text{string characters=1;}message Value{bool boolValue=1;Text textValue=2;Guid guidValue=3;float floatValue=4;}
    message Def{Guid id=1;string name=2;string type=3;string sortPosition=4;Value initialValue=5;}message Ref{Guid defID=1;string componentPropNodeField=2;bool isDeleted=3;}
    message Order{string property=1;string[] values=2;}message Assignment{Guid defID=1;Value value=2;}
    message GuidPath{Guid[] guids=1;}message Override{GuidPath guidPath=1;Text textData=2;bool visible=3;Guid overriddenSymbolID=4;Paint[] fillPaints=5;}
    message SymbolData{Guid symbolID=1;Override[] symbolOverrides=2;}message Font{string family=1;string style=2;}
    message Node{Guid guid=1;Parent parentIndex=2;Type type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;bool isStateGroup=8;Def[] componentPropDefs=9;Ref[] componentPropRefs=10;Order[] stateGroupPropertyValueOrders=11;Text textData=12;Font fontName=13;float fontSize=14;bool visible=15;SymbolData symbolData=16;Assignment[] componentPropAssignments=17;Override[] derivedSymbolData=18;Guid overriddenSymbolID=19;}
    message Blob{byte[] bytes=1;}message Message{Node[] nodeChanges=1;Blob[] blobs=2;}
  `);
  const rootGuid = { sessionID: 0, localID: 0 };
  const node = (id, parent, type, w, h, x = 0, y = 0, extra = {}) => ({
    guid: guid(id),
    parentIndex: {
      guid: parent === 0 ? rootGuid : guid(parent),
      position: String(id),
    },
    type,
    name: "Fixture node " + id,
    size: { x: w, y: h },
    transform: matrix(x, y),
    ...extra,
  });
  const instance = (id, parent, target, w, h, x = 0, y = 0, extra = {}) =>
    node(id, parent, "INSTANCE", w, h, x, y, {
      symbolData: { symbolID: guid(target) },
      ...extra,
    });
  const text = (id, parent, x, y, characters, defs = []) =>
    node(id, parent, "TEXT", 120, 20, x, y, {
      textData: { characters },
      fontName: { family: "Arial", style: "Regular" },
      fontSize: 14,
      fillPaints: [color(0, 0, 0)],
      componentPropRefs: defs,
    });
  const def = (id, name, type, value, order) => ({
    id: guid(id),
    name,
    type,
    initialValue: value,
    sortPosition: order,
  });
  const nodes = [
    { guid: rootGuid, type: "DOCUMENT", name: "Document" },
    node(1, 0, "SYMBOL", 560, 240, 0, 0, {
      name: "Card",
      fillPaints: [color(1, 1, 1)],
      componentPropDefs: [
        def(
          1001,
          "Label",
          "TEXT",
          { textValue: { characters: "Parent label" } },
          "a",
        ),
        def(1002, "Show flag", "BOOL", { boolValue: true }, "b"),
        def(1003, "Slot", "INSTANCE_SWAP", {}, "c"),
      ],
    }),
    node(100, 0, "FRAME", 100, 60, 0, 0, {
      name: "Badge",
      isStateGroup: true,
      componentPropDefs: [
        def(1100, "Size", "VARIANT", {}, "a"),
        def(1101, "Active", "VARIANT", {}, "b"),
        def(
          1102,
          "Label",
          "TEXT",
          { textValue: { characters: "Default" } },
          "c",
        ),
        def(1103, "Show mark", "BOOL", { boolValue: true }, "d"),
        def(1104, "Icon", "INSTANCE_SWAP", {}, "e"),
      ],
      stateGroupPropertyValueOrders: [
        { property: "Size", values: ["Small (64)", "Large (80)"] },
        { property: "Active", values: ["True", "False"] },
      ],
    }),
    node(200, 0, "SYMBOL", 16, 16, 0, 0, {
      name: "Default icon",
      fillPaints: [color(0.5, 0, 0.5)],
    }),
    node(2001, 200, "ELLIPSE", 12, 12, 2, 2, { fillPaints: [color(0, 0, 1)] }),
    node(201, 0, "SYMBOL", 16, 16, 0, 0, {
      name: "Swap icon",
      fillPaints: [color(1, 1, 0)],
    }),
    node(300, 0, "SYMBOL", 80, 48, 0, 0, { name: "Nested container" }),
    instance(301, 300, 101, 80, 48),
    node(400, 0, "SYMBOL", 20, 20, 0, 0, {
      name: "Cycle",
      fillPaints: [color(1, 0, 0)],
    }),
    instance(401, 400, 400, 20, 20),
    node(500, 0, "SYMBOL", 20, 20, 0, 0, {
      name: "Unrelated",
      fillPaints: [color(1, 0, 1)],
    }),
  ];
  for (const [id, name, w, h, paint] of [
    [101, "Size=Small (64), Active=True", 80, 48, color(0, 0, 1)],
    [102, "Size=Large (80), Active=False", 100, 60, color(1, 0, 0)],
    [103, "Size=Small (64), Active=False", 80, 48, color(0, 0.5, 0)],
  ]) {
    nodes.push(
      node(id, 100, "SYMBOL", w, h, 0, 0, { name, fillPaints: [paint] }),
      text(id * 10 + 1, id, 8, 6, "Default", [ref(1102, "TEXT_DATA")]),
      node(id * 10 + 2, id, "FRAME", 12, 12, 8, h - 18, {
        name: "Mark",
        fillPaints: [color(0, 1, 0)],
        componentPropRefs: [ref(1103, "VISIBLE")],
      }),
      instance(id * 10 + 3, id, 200, 16, 16, w - 24, h - 24, {
        componentPropRefs: [ref(1104, "OVERRIDDEN_SYMBOL_ID")],
      }),
    );
  }
  nodes.push(
    instance(11, 1, 102, 200, 120, 20, 20, {
      symbolData: {
        symbolID: guid(102),
        symbolOverrides: [
          override([1021], { textData: { characters: "Override loses" } }),
        ],
      },
      componentPropAssignments: [
        assignment(1100, { textValue: { characters: "Large (80)" } }),
        assignment(1101, { boolValue: false }),
        assignment(1102, { textValue: { characters: "Assigned" } }),
        assignment(1103, { boolValue: false }),
        assignment(1104, { guidValue: guid(201) }),
      ],
    }),
    node(119, 11, "FRAME", 200, 120, 0, 0, {
      name: "Stale cache",
      fillPaints: [color(1, 0, 1)],
    }),
    instance(12, 1, 101, 80, 48, 260, 20, {
      symbolData: {
        symbolID: guid(101),
        symbolOverrides: [
          override([1011], { textData: { characters: "Direct" } }),
          override([1012], { visible: false }),
          override([1013], { overriddenSymbolID: guid(201) }),
        ],
      },
    }),
    instance(13, 1, 300, 80, 48, 260, 100, {
      derivedSymbolData: [
        override([301, 1011], { textData: { characters: "Deep <&>" } }),
      ],
    }),
    instance(14, 1, 999, 80, 48, 380, 20, {
      componentPropRefs: [ref(1003, "OVERRIDDEN_SYMBOL_ID")],
    }),
    text(15, 1, 380, 100, "Parent label", [ref(1001, "TEXT_DATA")]),
    node(16, 1, "FRAME", 16, 16, 530, 100, {
      name: "Flag",
      fillPaints: [color(0, 1, 0)],
      componentPropRefs: [ref(1002, "VISIBLE")],
    }),
  );
  const head = Buffer.alloc(12);
  head.write("fig-kiwi");
  head.writeUInt32LE(15, 8);
  const chunks = [
    deflateRawSync(encodeBinarySchema(schema)),
    deflateRawSync(
      compileSchema(schema).encodeMessage({ nodeChanges: nodes, blobs: [] }),
    ),
  ];
  return Buffer.concat([
    head,
    ...chunks.flatMap((chunk) => {
      const size = Buffer.alloc(4);
      size.writeUInt32LE(chunk.length);
      return [size, chunk];
    }),
  ]);
}
async function fixture(t) {
  const dir = await temporary(t),
    raw = path.join(dir, "raw.fig"),
    zip = path.join(dir, "zip.fig"),
    data = bytes();
  await fs.writeFile(raw, data);
  await fs.writeFile(zip, zipSync({ "canvas.fig": data }));
  return { dir, raw, zip };
}
const css = "*{box-sizing:border-box}body{margin:24px;background:white}";
const literalText = (x, y, label) =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:120px;height:20px;color:black;font:14px Arial;white-space:pre-wrap">${label}</div>`;
const badgeReference = (large, label, mark, custom) =>
  `<div style="position:relative;width:${large ? 100 : 80}px;height:${large ? 60 : 48}px;background:${large ? "red" : "blue"}">${literalText(8, 6, label)}${mark ? `<div style="position:absolute;left:8px;top:${large ? 42 : 30}px;width:12px;height:12px;background:lime"></div>` : ""}<div style="position:absolute;left:${large ? 76 : 56}px;top:${large ? 36 : 24}px;width:16px;height:16px;background:${custom ? "yellow" : "rgb(128,0,128)"}">${custom ? "" : '<div style="position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:blue"></div>'}</div></div>`;
const parentReference = (updated = false) =>
  `<div style="position:relative;width:560px;height:240px;background:white"><div style="position:absolute;left:20px;top:20px;width:200px;height:120px"><div style="transform:scale(2,2);transform-origin:0 0">${badgeReference(true, "Assigned", false, true)}</div></div><div style="position:absolute;left:260px;top:20px">${badgeReference(false, "Direct", false, true)}</div><div style="position:absolute;left:260px;top:100px">${badgeReference(false, "Deep &lt;&amp;&gt;", true, false)}</div>${updated ? '<div style="position:absolute;left:380px;top:20px;width:80px;height:48px;background:purple"></div>' : ""}${literalText(380, 100, updated ? "Changed &lt;script&gt;" : "Parent label")}${updated ? "" : '<div style="position:absolute;left:530px;top:100px;width:16px;height:16px;background:lime"></div>'}</div>`;
async function consumer(dir, output, name) {
  await fs.writeFile(
    path.join(dir, name + ".jsx"),
    `import React from 'react';import {createRoot} from 'react-dom/client';import {Card} from './${output}/components/Card.jsx';import {Badge} from './${output}/components/Badge.jsx';
 const parent={},child={size:'sm',active:true,label:'Live'};const p=createRoot(document.getElementById('parent')),c=createRoot(document.getElementById('child'));
 const slot=<div data-supplied-slot style={{width:80,height:48,background:'purple'}}/>;const icon=<div style={{width:16,height:16,background:'yellow'}}/>;
 function render(){p.render(<Card {...parent} slot={parent.slot==='supplied'?slot:undefined}/>);c.render(<Badge {...child} icon={child.icon==='custom'?icon:undefined}/>)}
 window.updateParent=patch=>{Object.assign(parent,patch);render()};window.updateChild=patch=>{Object.assign(child,patch);render()};render();`,
  );
  await bundle(path.join(dir, name + ".jsx"), path.join(dir, name + ".js"));
  await fs.writeFile(
    path.join(dir, name + ".html"),
    `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style><div id="parent"></div><div id="child"></div><script src="${name}.js"></script></html>`,
  );
}
async function samples(page, png, points, dimensions) {
  return page.evaluate(
    async ({ png, points, dimensions }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + png;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return points.map(([x, y]) => [
        ...context.getImageData(
          Math.floor((x * image.width) / dimensions[0]),
          Math.floor((y * image.height) / dimensions[1]),
          1,
          1,
        ).data,
      ]);
    },
    { png: png.toString("base64"), points, dimensions },
  );
}

test("selected instance components retain local dependency closure, typed variants, overrides, external slots and bounded cycles without changing source", async (t) => {
  const { dir, raw, zip } = await fixture(t),
    original = [await fs.readFile(raw), await fs.readFile(zip)];
  for (const [name, input] of [
    ["raw", raw],
    ["zip", zip],
  ]) {
    const result = await importFig(
      "components",
      input,
      path.join(dir, name),
      "1:1",
    );
    const items = JSON.parse(
      await fs.readFile(path.join(dir, name, "components.json"), "utf8"),
    );
    assert.deepEqual(
      new Set(items.map((item) => item.name)),
      new Set(["Card", "Badge", "SwapIcon", "DefaultIcon"]),
    );
    assert.deepEqual(
      items.filter((item) => item.requested).map((item) => item.name),
      ["Card"],
    );
    assert.ok(
      !items.some((item) =>
        ["Unrelated", "Cycle", "NestedContainer"].includes(item.name),
      ),
    );
    const card = await fs.readFile(
      path.join(dir, name, "components/Card.jsx"),
      "utf8",
    );
    assert.match(card, /import \{Badge\}/);
    assert.match(card, /label=\{"Assigned"\}/);
    assert.match(card, /label=\{"Direct"\}/);
    assert.match(card, /size=\{"lg"\}/);
    assert.match(card, /active=\{false\}/);
    assert.match(card, /showMark=\{false\}/);
    assert.match(card, /Deep <&>/);
    assert.match(card, /data-external/);
    assert.ok(!card.includes("Stale cache"));
    const declaration = await fs.readFile(
      path.join(dir, name, "components/Badge.d.ts"),
      "utf8",
    );
    assert.match(declaration, /size\?: "sm" \| "lg"/);
    assert.match(declaration, /active\?: boolean/);
    assert.match(declaration, /label\?: string/);
    assert.match(declaration, /showMark\?: boolean/);
    assert.match(declaration, /icon\?: React.ReactNode/);
    assert.match(
      result.warnings.join("\n"),
      /complex instance overrides baked/,
    );
    assert.match(result.warnings.join("\n"), /external component 1:999/);
  }
  const variant = path.join(dir, "variant");
  await importFig("components", raw, variant, "1:102");
  assert.ok(await fs.stat(path.join(variant, "components/Badge.jsx")));
  const cycle = await importFig(
    "components",
    raw,
    path.join(dir, "cycle"),
    "1:400",
  );
  assert.match(
    cycle.warnings.join("\n"),
    /recursive component instance|symbol cycle/,
  );
  const cycleSource = await fs.readFile(
    path.join(dir, "cycle/components/Cycle.jsx"),
    "utf8",
  );
  assert.ok(cycleSource.length < 50000);
  assert.ok(!cycleSource.includes("<Cycle "));
  assert.deepEqual(await fs.readFile(raw), original[0]);
  assert.deepEqual(await fs.readFile(zip), original[1]);
});

test("raw and ZIP generated local instances and live props match an independently authored CSS oracle", async (t) => {
  const { dir, raw, zip } = await fixture(t);
  for (const [name, input] of [
    ["raw", raw],
    ["zip", zip],
  ]) {
    await importFig("components", input, path.join(dir, name), "1:1");
    await consumer(dir, name, name + "-consumer");
  }
  await fs.writeFile(
    path.join(dir, "reference.html"),
    `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style><section id="parent-default">${parentReference()}</section><section id="parent-updated">${parentReference(true)}</section><section id="child-small">${badgeReference(false, "Live", true, false)}</section><section id="child-large">${badgeReference(true, "Updated", false, true)}</section></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const expected = await withPage(url + "reference.html", async (page) =>
    Object.fromEntries(
      await Promise.all(
        ["parent-default", "parent-updated", "child-small", "child-large"].map(
          async (id) => [
            id,
            await page.locator("#" + id + " > div").screenshot(),
          ],
        ),
      ),
    ),
  );
  for (const name of ["raw", "zip"])
    await withPage(url + name + "-consumer.html", async (page, errors) => {
      const parent = page.locator("#parent > div"),
        child = page.locator("#child > div");
      await parent.waitFor();
      await child.waitFor();
      assert.deepEqual(await parent.screenshot(), expected["parent-default"]);
      assert.deepEqual(await child.screenshot(), expected["child-small"]);
      await page.evaluate(() =>
        updateParent({
          label: "Changed <script>",
          showFlag: false,
          slot: "supplied",
        }),
      );
      await page.locator("#parent [data-supplied-slot]").waitFor();
      assert.deepEqual(await parent.screenshot(), expected["parent-updated"]);
      assert.equal(await page.locator("#parent script").count(), 0);
      await page.evaluate(() =>
        updateChild({
          size: "lg",
          active: false,
          label: "Updated",
          showMark: false,
          icon: "custom",
        }),
      );
      await page.waitForFunction(
        () =>
          document.querySelector("#child > div").getBoundingClientRect()
            .width === 100,
      );
      assert.deepEqual(await child.screenshot(), expected["child-large"]);
      assert.deepEqual(errors, []);
      if (process.env.CODEX_CAPTURE_FIGMA_COMPONENT_INSTANCES) {
        await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_COMPONENT_INSTANCES, {
          recursive: true,
        });
        await parent.screenshot({
          path: path.join(
            process.env.CODEX_CAPTURE_FIGMA_COMPONENT_INSTANCES,
            name + ".png",
          ),
        });
        await exportArtifact(
          "html",
          path.join(dir, name + "-consumer.html"),
          path.join(
            process.env.CODEX_CAPTURE_FIGMA_COMPONENT_INSTANCES,
            name + ".html",
          ),
        );
      }
    });
});

test("compiled instance samples and actual portable React PNG survive deletion of Figma and generated dependency sources", async (t) => {
  const { dir, raw, zip } = await fixture(t),
    system = path.join(dir, "system");
  await importFig("design-system", zip, system);
  const inspected = await inspect(system);
  assert.ok(inspected.spec.components.some((c) => c.name === "Card"));
  await compile(system);
  await preview(system);
  await fs.copyFile(
    path.join(system, "preview.html"),
    path.join(dir, "review.html"),
  );
  await consumer(dir, "system", "portable-consumer");
  await exportArtifact(
    "html",
    path.join(dir, "portable-consumer.html"),
    path.join(dir, "portable.html"),
  );
  await fs.rm(system, { recursive: true, force: true });
  await fs.rm(raw);
  await fs.rm(zip);
  await fs.rm(path.join(dir, "portable-consumer.js"));
  await fs.rm(path.join(dir, "portable-consumer.jsx"));
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const points = [
      [30, 30],
      [270, 60],
      [540, 110],
    ],
    expected = [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [0, 255, 0, 255],
    ];
  await withPage(url + "review.html", async (page, errors) => {
    const board = page
      .locator('[data-figma-id="1:1"]')
      .filter({ hasText: "Assigned" })
      .first();
    await board.waitFor();
    assert.deepEqual(
      await samples(page, await board.screenshot(), points, [560, 240]),
      expected,
    );
    assert.match(await board.textContent(), /Direct/);
    assert.match(await board.textContent(), /Deep <&>/);
    assert.deepEqual(errors, []);
    if (process.env.CODEX_CAPTURE_FIGMA_COMPONENT_INSTANCES) {
      await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_COMPONENT_INSTANCES, {
        recursive: true,
      });
      await board.screenshot({
        path: path.join(
          process.env.CODEX_CAPTURE_FIGMA_COMPONENT_INSTANCES,
          "review.png",
        ),
      });
      await fs.copyFile(
        path.join(dir, "review.html"),
        path.join(
          process.env.CODEX_CAPTURE_FIGMA_COMPONENT_INSTANCES,
          "review.html",
        ),
      );
    }
  });
  await withPage(url + "portable.html", async (page, errors) => {
    const board = page.locator("#parent > div");
    await board.waitFor();
    assert.deepEqual(
      await samples(page, await board.screenshot(), points, [560, 240]),
      expected,
    );
    await page.evaluate(() =>
      updateParent({
        label: "Portable value",
        showFlag: false,
        slot: "supplied",
      }),
    );
    await page.locator("#parent [data-supplied-slot]").waitFor();
    assert.match(await board.textContent(), /Portable value/);
    assert.deepEqual(errors, []);
  });
  const png = path.join(dir, "portable.png");
  await exportArtifact("png", url + "portable.html", png);
  if (process.env.CODEX_CAPTURE_FIGMA_COMPONENT_INSTANCES) {
    await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_COMPONENT_INSTANCES, {
      recursive: true,
    });
    await fs.copyFile(
      png,
      path.join(
        process.env.CODEX_CAPTURE_FIGMA_COMPONENT_INSTANCES,
        "portable.png",
      ),
    );
    await fs.copyFile(
      path.join(dir, "portable.html"),
      path.join(
        process.env.CODEX_CAPTURE_FIGMA_COMPONENT_INSTANCES,
        "portable.html",
      ),
    );
  }
  await withPage(url + "portable.html", async (page) =>
    assert.deepEqual(
      await samples(
        page,
        await fs.readFile(png),
        points.map(([x, y]) => [x + 24, y + 24]),
        [1440, 1000],
      ),
      expected,
    ),
  );
});
