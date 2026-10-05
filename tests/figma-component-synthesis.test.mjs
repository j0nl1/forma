import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { compileSchema, parseSchema, encodeBinarySchema } from "kiwi-schema";
import { zipSync } from "fflate";
import { temporary } from "./helpers.mjs";
import { planSynthesis } from "../skills/forma/scripts/lib/figma-component-synthesis.mjs";
import { importFig } from "../skills/forma/scripts/figma.mjs";
import {
  compile,
  preview,
} from "../skills/forma/scripts/design-system.mjs";
import { bundle } from "../skills/forma/scripts/build.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/forma/scripts/export.mjs";
const guid = (localID) => ({ sessionID: 1, localID });
const ref = (id, field) => ({ defID: guid(id), componentPropNodeField: field });
const matrix = (x = 0, y = 0) => ({
  m00: 1,
  m01: 0,
  m02: x,
  m10: 0,
  m11: 1,
  m12: y,
});
const paint = (r, g, b) => ({ type: "SOLID", color: { r, g, b, a: 1 } });
test("synthesis planning preserves DFS aliases, declared bindings, source exclusions, limits and collision gates without mutation", () => {
  const model = {
    props: [
      { key: "show", kind: "BOOL" },
      { key: "label", kind: "TEXT" },
      { key: "slot", kind: "INSTANCE_SWAP" },
    ],
    byId: new Map([
      ["1:90", { key: "show", kind: "BOOL" }],
      ["1:91", { key: "label", kind: "TEXT" }],
      ["1:92", { key: "slot", kind: "INSTANCE_SWAP" }],
    ]),
  };
  const n = (id, type = "TEXT", extra = {}) => ({
    guid: guid(id),
    type,
    textData: { characters: "Text " + id },
    size: { x: 16, y: 16 },
    children: [],
    ...extra,
  });
  const root = n(1, "FRAME", {
    children: [
      n(2, "TEXT", { overrideKey: guid(200) }),
      n(3, "TEXT", { visible: false }),
      n(4, "TEXT", { visible: false, componentPropRefs: [ref(90, "VISIBLE")] }),
      n(5, "TEXT", { fontName: { family: "Material Symbols Outlined" } }),
      n(6, "TEXT", {
        textData: { characters: "Mixed", characterStyleIDs: [0, 1] },
      }),
      n(7, "TEXT", { componentPropRefs: [ref(91, "TEXT_DATA")] }),
      n(8, "TEXT", { textData: { characters: " \n\t " } }),
      n(9, "VARIABLE", { children: [n(10)] }),
      n(11, "FRAME", { internalOnly: true, children: [n(12)] }),
      n(13, "VECTOR", { children: [n(14)] }),
      n(15, "INSTANCE", { overrideKey: guid(150), children: [n(16)] }),
      n(17, "INSTANCE", { size: { x: 73, y: 16 } }),
      n(18, "INSTANCE", { size: { x: 16, y: 0 } }),
      n(19, "INSTANCE", {
        componentPropRefs: [ref(92, "OVERRIDDEN_SYMBOL_ID")],
      }),
      n(20, "INSTANCE", { visible: false }),
      n(21, "INSTANCE", {
        visible: false,
        componentPropRefs: [ref(90, "VISIBLE")],
      }),
      n(22, "FRAME", {
        children: [
          n(23, "TEXT", {
            textData: { characters: "Uniform", characterStyleIDs: [4, 4] },
          }),
          n(24, "INSTANCE", { size: { x: 72, y: 72 } }),
        ],
      }),
      n(25),
      n(26),
      n(27, "INSTANCE"),
      n(28, "INSTANCE"),
    ],
  });
  const before = JSON.stringify(root),
    plan = planSynthesis(root, model);
  assert.deepEqual(
    [...plan.text],
    [
      ["1:2", 0],
      ["1:200", 0],
      ["1:4", 1],
      ["1:23", 2],
      ["1:25", 3],
    ],
  );
  assert.deepEqual(
    [...plan.icon].map(([id, v]) => [id, v.i]),
    [
      ["1:15", 0],
      ["1:150", 0],
      ["1:21", 1],
      ["1:24", 2],
      ["1:27", 3],
    ],
  );
  assert.deepEqual(plan.icon.get("1:24"), { i: 2, w: 72, h: 72 });
  assert.equal(plan.icon.get("1:15"), plan.icon.get("1:150"));
  assert.equal(JSON.stringify(root), before);
  assert.equal(model.props.length, 3);
  for (const key of ["text1", "text4"]) {
    const result = planSynthesis(root, {
      ...model,
      props: [...model.props, { key }],
    });
    assert.equal(result.textEnabled, false);
    assert.equal(result.iconEnabled, false);
    assert.equal(result.text.size, 0);
    assert.equal(result.icon.size, 0);
  }
  const iconCollision = planSynthesis(root, {
    ...model,
    props: [...model.props, { key: "icon2" }],
  });
  assert.equal(iconCollision.textEnabled, true);
  assert.equal(iconCollision.iconEnabled, false);
  assert.equal(iconCollision.text.size, 5);
  assert.equal(iconCollision.icon.size, 0);
  const deleted = n(30, "TEXT", {
    componentPropRefs: [{ ...ref(91, "TEXT_DATA"), isDeleted: true }],
  });
  assert.equal(planSynthesis(deleted, model).text.get("1:30"), 0);
  assert.equal(
    planSynthesis(
      n(31, "TEXT", {
        visible: false,
        componentPropRefs: [ref(91, "VISIBLE")],
      }),
      model,
    ).text.size,
    0,
    "Only a declared boolean VISIBLE binding retains hidden content",
  );
  assert.equal(
    planSynthesis(
      n(32, "TEXT", { textData: { characters: "Only this variant" } }),
      model,
    ).text.get("1:32"),
    0,
    "Slot indexes restart per variant",
  );
});
function bytes() {
  // Only this independently authored fixture schema is compiled; imported schemas remain data.
  const schema = parseSchema(
    `enum Type{DOCUMENT=0;FRAME=1;SYMBOL=2;TEXT=3;INSTANCE=4;ELLIPSE=5;}struct Guid{uint sessionID;uint localID;}struct Vec{float x;float y;}struct Parent{Guid guid;string position;}struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;}struct Color{float r;float g;float b;float a;}message Paint{string type=1;Color color=2;}message Text{string characters=1;uint[] characterStyleIDs=2;}message Value{Text textValue=1;bool boolValue=2;Guid guidValue=3;}message Def{Guid id=1;string name=2;string type=3;string sortPosition=4;Value initialValue=5;}message Ref{Guid defID=1;string componentPropNodeField=2;}message Order{string property=1;string[] values=2;}message GuidPath{Guid[] guids=1;}message Override{GuidPath guidPath=1;Text textData=2;Guid overriddenSymbolID=3;}message SymbolData{Guid symbolID=1;Override[] symbolOverrides=2;}message Font{string family=1;string style=2;}message Node{Guid guid=1;Parent parentIndex=2;Type type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;bool isStateGroup=8;Def[] componentPropDefs=9;Ref[] componentPropRefs=10;Order[] stateGroupPropertyValueOrders=11;Text textData=12;Font fontName=13;float fontSize=14;SymbolData symbolData=15;Guid overrideKey=16;}message Message{Node[] nodeChanges=1;}`,
  );
  const zero = { sessionID: 0, localID: 0 };
  const n = (id, parent, type, w, h, x = 0, y = 0, extra = {}) => ({
    guid: guid(id),
    parentIndex: {
      guid: parent ? guid(parent) : zero,
      position: String(id).padStart(4, "0"),
    },
    type,
    name: "Synthetic fixture " + id,
    size: { x: w, y: h },
    transform: matrix(x, y),
    ...extra,
  });
  const text = (id, parent, label, x = 10, y = 10) =>
    n(id, parent, "TEXT", 130, 20, x, y, {
      textData: { characters: label },
      fontName: { family: "Arial", style: "Regular" },
      fontSize: 14,
      fillPaints: [paint(1, 1, 1)],
    });
  const icon = (id, parent, x, y, w = 16, target = 100) =>
    n(id, parent, "INSTANCE", w, w, x, y, {
      symbolData: { symbolID: guid(target) },
    });
  const nodes = [
    { guid: zero, type: "DOCUMENT", name: "Document" },
    n(1, 0, "FRAME", 200, 100, 0, 0, {
      name: "Caption badge",
      isStateGroup: true,
      componentPropDefs: [
        { id: guid(90), name: "Size", type: "VARIANT", sortPosition: "a" },
      ],
      stateGroupPropertyValueOrders: [
        { property: "Size", values: ["Small", "Large"] },
      ],
    }),
    n(100, 0, "SYMBOL", 16, 16, 0, 0, { name: "Green icon" }),
    n(1001, 100, "ELLIPSE", 16, 16, 0, 0, { fillPaints: [paint(0, 1, 0)] }),
    n(101, 0, "SYMBOL", 32, 32, 0, 0, {
      name: "Swap icon",
      fillPaints: [paint(1, 1, 0)],
    }),
    n(400, 0, "SYMBOL", 400, 140, 0, 0, {
      name: "Holder",
      fillPaints: [paint(1, 1, 1)],
    }),
    n(401, 400, "INSTANCE", 160, 80, 10, 10, {
      symbolData: {
        symbolID: guid(2),
        symbolOverrides: [
          {
            guidPath: { guids: [guid(21)] },
            textData: { characters: "Instance title" },
          },
          { guidPath: { guids: [guid(23)] }, overriddenSymbolID: guid(101) },
        ],
      },
    }),
    n(500, 0, "SYMBOL", 160, 80, 0, 0, {
      name: "Text collision",
      componentPropDefs: [
        {
          id: guid(590),
          name: "Text1",
          type: "TEXT",
          initialValue: { textValue: { characters: "Declared default" } },
        },
      ],
    }),
    text(501, 500, "Untouched"),
    icon(502, 500, 130, 10),
    n(600, 0, "SYMBOL", 160, 80, 0, 0, {
      name: "Icon collision",
      componentPropDefs: [
        { id: guid(690), name: "Icon1", type: "INSTANCE_SWAP" },
      ],
    }),
    text(601, 600, "Still synthetic"),
    icon(602, 600, 130, 10),
    n(700, 0, "SYMBOL", 400, 160, 0, 0, { name: "Limit badge" }),
  ];
  for (const [id, label, w, h, c] of [
    [2, "Small", 160, 80, paint(0, 0, 1)],
    [3, "Large", 200, 100, paint(1, 0, 0)],
  ])
    nodes.push(
      n(id, 1, "SYMBOL", w, h, 0, 0, {
        name: "Size=" + label,
        fillPaints: [c],
      }),
      text(
        id * 10 + 1,
        id,
        label + " title",
        id === 2 ? 10 : 12,
        id === 2 ? 10 : 12,
      ),
      text(
        id * 10 + 2,
        id,
        label + " detail",
        id === 2 ? 10 : 12,
        id === 2 ? 36 : 42,
      ),
      icon(
        id * 10 + 3,
        id,
        id === 2 ? 130 : 164,
        id === 2 ? 10 : 12,
        id === 2 ? 16 : 24,
      ),
    );
  for (let i = 0; i < 5; i++)
    nodes.push(
      text(701 + i, 700, "Limit " + (i + 1), 10, 10 + i * 26),
      icon(711 + i, 700, 200 + i * 26, 20),
    );
  const head = Buffer.alloc(12);
  head.write("fig-kiwi");
  head.writeUInt32LE(15, 8);
  const chunks = [
    deflateRawSync(encodeBinarySchema(schema)),
    deflateRawSync(compileSchema(schema).encodeMessage({ nodeChanges: nodes })),
  ];
  return Buffer.concat([
    head,
    ...chunks.flatMap((chunk) => {
      const length = Buffer.alloc(4);
      length.writeUInt32LE(chunk.length);
      return [length, chunk];
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
function reference(large = false, title, detail, replace = false) {
  const x = large ? 12 : 10,
    y = large ? 12 : 10,
    d = large ? 42 : 36;
  title ??= large ? "Large title" : "Small title";
  detail ??= large ? "Large detail" : "Small detail";
  const icon = replace
    ? `<div style="width:100%;height:100%;background:purple"></div>`
    : `<div style="position:relative;width:16px;height:16px;transform:scale(${large ? 1.5 : 1},${large ? 1.5 : 1});transform-origin:0 0"><div style="position:absolute;width:16px;height:16px;border-radius:50%;background:lime"></div></div>`;
  return `<div style="position:relative;width:${large ? 200 : 160}px;height:${large ? 100 : 80}px;background:${large ? "red" : "blue"}"><div style="position:absolute;left:${x}px;top:${y}px;width:130px;height:20px;font:14px Arial;color:white;white-space:pre-wrap">${title}</div><div style="position:absolute;left:${x}px;top:${d}px;width:130px;height:20px;font:14px Arial;color:white;white-space:pre-wrap">${detail}</div><div style="position:absolute;left:${large ? 164 : 130}px;top:${large ? 12 : 10}px;width:${large ? 24 : 16}px;height:${large ? 24 : 16}px">${icon}</div></div>`;
}
async function consumer(dir, folder, name) {
  await fs.writeFile(
    path.join(dir, name + ".jsx"),
    `import React from 'react';import {createRoot} from 'react-dom/client';import {CaptionBadge} from './${folder}/components/CaptionBadge.jsx';import {Holder} from './${folder}/components/Holder.jsx';const props={size:'sm'},root=createRoot(document.getElementById('root'));const icon=<div data-custom-icon style={{width:'100%',height:'100%',background:'purple'}}/>;function render(){root.render(<CaptionBadge {...props} icon1={props.icon1==='replace'?icon:undefined}/>)}window.updateSynthetic=patch=>{Object.assign(props,patch);render()};render();createRoot(document.getElementById('holder')).render(<Holder/>);`,
  );
  await bundle(path.join(dir, name + ".jsx"), path.join(dir, name + ".js"));
  await fs.writeFile(
    path.join(dir, name + ".html"),
    `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style><div id="root"></div><div id="holder"></div><script src="${name}.js"></script></html>`,
  );
}
async function pixels(page, png, points, dimensions) {
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

test("raw and ZIP modules retain synthetic contracts, collision gates, limits and direct instance override dependencies", async (t) => {
  const { dir, raw, zip } = await fixture(t),
    original = [await fs.readFile(raw), await fs.readFile(zip)];
  for (const [name, input] of [
    ["raw", raw],
    ["zip", zip],
  ]) {
    await importFig("components", input, path.join(dir, name));
    const decl = await fs.readFile(
      path.join(dir, name, "components/CaptionBadge.d.ts"),
      "utf8",
    );
    assert.match(decl, /text1\?: string/);
    assert.match(decl, /text2\?: string/);
    assert.match(decl, /icon1\?: React.ReactNode/);
    assert.ok(!decl.includes("text3?"));
    const holder = await fs.readFile(
      path.join(dir, name, "components/Holder.jsx"),
      "utf8",
    );
    assert.match(holder, /text1=\{"Instance title"\}/);
    assert.match(holder, /icon1=\{<SwapIcon/);
    assert.match(holder, /import \{SwapIcon\}/);
    const textCollision = await fs.readFile(
      path.join(dir, name, "components/TextCollision.d.ts"),
      "utf8",
    );
    assert.equal((textCollision.match(/text1\?/g) || []).length, 1);
    assert.ok(!textCollision.includes("icon1?"));
    const iconCollision = await fs.readFile(
      path.join(dir, name, "components/IconCollision.d.ts"),
      "utf8",
    );
    assert.match(iconCollision, /text1\?: string/);
    assert.equal((iconCollision.match(/icon1\?/g) || []).length, 1);
    const limit = await fs.readFile(
      path.join(dir, name, "components/LimitBadge.d.ts"),
      "utf8",
    );
    assert.match(limit, /text4\?: string/);
    assert.match(limit, /icon4\?: React.ReactNode/);
    assert.ok(!limit.includes("text5?"));
    assert.ok(!limit.includes("icon5?"));
    await consumer(dir, name, name + "-consumer");
  }
  assert.deepEqual(await fs.readFile(raw), original[0]);
  assert.deepEqual(await fs.readFile(zip), original[1]);
});

test("synthetic text and icon props retain per-variant fallbacks and match independent CSS pixels including resized instance swaps", async (t) => {
  const { dir, raw, zip } = await fixture(t);
  for (const [name, input] of [
    ["raw", raw],
    ["zip", zip],
  ]) {
    await importFig("components", input, path.join(dir, name));
    await consumer(dir, name, name + "-consumer");
  }
  const refs = [
    reference(),
    reference(true),
    reference(true, "Changed &lt;&amp;&gt;", "Detail", true),
    reference(true, "", "Large detail"),
  ];
  const holderReference = `<div style="position:relative;width:400px;height:140px;background:white"><div style="position:absolute;left:10px;top:10px">${reference(false, "Instance title").replace('<div style="position:relative;width:16px;height:16px;transform:scale(1,1);transform-origin:0 0"><div style="position:absolute;width:16px;height:16px;border-radius:50%;background:lime"></div></div>', '<div style="position:relative;width:32px;height:32px;transform:scale(.5,.5);transform-origin:0 0;background:yellow"></div>')}</div></div>`;
  await fs.writeFile(
    path.join(dir, "reference.html"),
    `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style>${refs.map((html, i) => `<section id="reference-${i}">${html}</section>`).join("")}<section id="reference-holder">${holderReference}</section></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const expected = await withPage(url + "reference.html", async (page) => {
    const values = [];
    for (let i = 0; i < refs.length; i++)
      values.push(
        await page.locator("#reference-" + i + " > div").screenshot(),
      );
    return {
      values,
      holder: await page.locator("#reference-holder > div").screenshot(),
    };
  });
  for (const name of ["raw", "zip"])
    await withPage(url + name + "-consumer.html", async (page, errors) => {
      const root = page.locator("#root > div"),
        holder = page.locator("#holder > div");
      await root.waitFor();
      await holder.waitFor();
      assert.deepEqual(await root.screenshot(), expected.values[0]);
      assert.deepEqual(await holder.screenshot(), expected.holder);
      await page.evaluate(() => updateSynthetic({ size: "lg" }));
      await page.waitForFunction(
        () =>
          document.querySelector("#root > div").getBoundingClientRect()
            .width === 200,
      );
      assert.deepEqual(await root.screenshot(), expected.values[1]);
      await page.evaluate(() =>
        updateSynthetic({
          text1: "Changed <&>",
          text2: "Detail",
          icon1: "replace",
        }),
      );
      await page.locator("[data-custom-icon]").waitFor();
      assert.deepEqual(await root.screenshot(), expected.values[2]);
      assert.equal(await page.locator("#root script").count(), 0);
      await page.evaluate(() =>
        updateSynthetic({ text1: "", text2: null, icon1: null }),
      );
      await page.waitForFunction(
        () => !document.querySelector("[data-custom-icon]"),
      );
      assert.deepEqual(await root.screenshot(), expected.values[3]);
      assert.deepEqual(errors, []);
      if (process.env.CODEX_CAPTURE_FIGMA_SYNTHESIS) {
        await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_SYNTHESIS, {
          recursive: true,
        });
        await page.screenshot({
          path: path.join(
            process.env.CODEX_CAPTURE_FIGMA_SYNTHESIS,
            name + ".png",
          ),
        });
        await exportArtifact(
          "html",
          path.join(dir, name + "-consumer.html"),
          path.join(process.env.CODEX_CAPTURE_FIGMA_SYNTHESIS, name + ".html"),
        );
      }
    });
});

test("copied synthesis review and actual portable HTML PNG retain synthetic props and instance swaps after source deletion", async (t) => {
  const { dir, raw, zip } = await fixture(t),
    system = path.join(dir, "system");
  await importFig("design-system", zip, system);
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
      [15, 15],
      [148, 28],
    ],
    expected = [
      [0, 0, 255, 255],
      [255, 255, 0, 255],
    ];
  await withPage(url + "review.html", async (page, errors) => {
    const board = page
      .locator('[data-figma-id="1:400"]')
      .filter({ hasText: "Instance title" })
      .first();
    await board.waitFor();
    assert.deepEqual(
      await pixels(page, await board.screenshot(), points, [400, 140]),
      expected,
    );
    assert.deepEqual(errors, []);
  });
  await withPage(url + "portable.html", async (page, errors) => {
    await page.locator("#root > div").waitFor();
    await page.evaluate(() =>
      updateSynthetic({
        size: "lg",
        text1: "Portable title",
        icon1: "replace",
      }),
    );
    await page.locator("[data-custom-icon]").waitFor();
    assert.match(await page.locator("#root").textContent(), /Portable title/);
    assert.deepEqual(
      await pixels(
        page,
        await page.locator("#holder > div").screenshot(),
        points,
        [400, 140],
      ),
      expected,
    );
    assert.deepEqual(errors, []);
  });
  const output = path.join(dir, "portable.png");
  await exportArtifact("png", url + "portable.html", output);
  await withPage(url + "portable.html", async (page) =>
    assert.deepEqual(
      await pixels(
        page,
        await fs.readFile(output),
        points.map(([x, y]) => [x + 24, y + 104]),
        [1440, 1000],
      ),
      expected,
    ),
  );
  if (process.env.CODEX_CAPTURE_FIGMA_SYNTHESIS) {
    await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_SYNTHESIS, {
      recursive: true,
    });
    await fs.copyFile(
      output,
      path.join(process.env.CODEX_CAPTURE_FIGMA_SYNTHESIS, "portable.png"),
    );
    await fs.copyFile(
      path.join(dir, "portable.html"),
      path.join(process.env.CODEX_CAPTURE_FIGMA_SYNTHESIS, "portable.html"),
    );
    await fs.copyFile(
      path.join(dir, "review.html"),
      path.join(process.env.CODEX_CAPTURE_FIGMA_SYNTHESIS, "review.html"),
    );
  }
});
