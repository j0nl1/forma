import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { parseSchema, compileSchema, encodeBinarySchema } from "kiwi-schema";
import { zipSync } from "fflate";
import { temporary } from "./helpers.mjs";
import {
  loadFig,
  select,
  renderDocument,
} from "../packages/exports/src/lib/figma.mjs";
import { applyNodeLayout } from "../packages/exports/src/lib/figma-layout.mjs";
import { importFig } from "../packages/cli/src/commands/figma.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";

const guid = (localID) => ({ sessionID: 1, localID });
const identity = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
const fill = (r, g, b) => [{ type: "SOLID", color: { r, g, b, a: 1 } }];
async function fixture(t) {
  const dir = await temporary(t);
  // The encoder compiles only this owned constant schema; imported schemas remain data.
  const schema = parseSchema(`
    enum Type{DOCUMENT=0;SYMBOL=1;FRAME=2;INSTANCE=3;}
    struct Guid{uint sessionID;uint localID;}struct Parent{Guid guid;string position;}struct Vec{float x;float y;}struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;}struct Color{float r;float g;float b;float a;}
    message Paint{string type=1;Color color=2;}message SymbolData{Guid symbolID=1;}
    message Track{Guid id=1;string position=2;}message Tracks{Track[] entries=1;}message Bound{string type=1;float value=2;}message TrackSize{Bound minSizing=1;Bound maxSizing=2;}message Sizing{Guid id=1;TrackSize trackSize=2;}message Sizes{Sizing[] entries=1;}
    message Node{Guid guid=1;Parent parentIndex=2;Type type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;string stackMode=8;float stackHorizontalPadding=9;float stackVerticalPadding=10;float stackSpacing=11;float stackChildPrimaryGrow=12;string stackChildAlignSelf=13;string stackPrimarySizing=14;string stackCounterSizing=15;SymbolData symbolData=16;Tracks gridRows=17;Tracks gridColumns=18;Sizes gridRowsSizing=19;Sizes gridColumnsSizing=20;float gridColumnGap=21;Guid gridRowAnchor=22;Guid gridColumnAnchor=23;string gridChildHorizontalAlign=24;string gridChildVerticalAlign=25;}
    message Message{Node[] nodeChanges=1;}
  `);
  const node = (id, parent, type, name, width, height, extra = {}) => ({
    guid: guid(id),
    parentIndex: {
      guid: parent ? guid(parent) : { sessionID: 0, localID: 0 },
      position: String(id).padStart(3, "0"),
    },
    type,
    name,
    size: { x: width, y: height },
    transform: identity,
    ...extra,
  });
  const parent = {
    stackHorizontalPadding: 10,
    stackVerticalPadding: 10,
    stackPrimarySizing: "FIXED",
    stackCounterSizing: "FIXED",
    fillPaints: fill(230 / 255, 230 / 255, 230 / 255),
  };
  const rows = { entries: [{ id: guid(91), position: "a" }] },
    columns = {
      entries: [
        { id: guid(93), position: "b" },
        { id: guid(92), position: "a" },
      ],
    };
  const size = (id) => ({
    id: guid(id),
    trackSize: {
      minSizing: { type: "FLEX", value: 1 },
      maxSizing: { type: "FLEX", value: 1 },
    },
  });
  const nodes = [
    { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Document" },
    node(1, 0, "SYMBOL", "Horizontal calls", 400, 100, {
      ...parent,
      stackMode: "HORIZONTAL",
      stackSpacing: 10,
    }),
    node(2, 1, "FRAME", "Horizontal marker", 40, 80, {
      fillPaints: fill(1, 0, 0),
    }),
    node(3, 1, "INSTANCE", "Growing blue", 100, 80, {
      symbolData: { symbolID: guid(70) },
      stackChildPrimaryGrow: 1,
      stackChildAlignSelf: "STRETCH",
    }),
    node(10, 0, "SYMBOL", "Vertical calls", 180, 240, {
      ...parent,
      stackMode: "VERTICAL",
      stackSpacing: 8,
    }),
    node(11, 10, "FRAME", "Vertical marker", 160, 24, {
      fillPaints: fill(1, 0, 0),
    }),
    node(12, 10, "INSTANCE", "Growing green", 80, 50, {
      symbolData: { symbolID: guid(80) },
      stackChildPrimaryGrow: 1,
      stackChildAlignSelf: "STRETCH",
    }),
    node(20, 0, "SYMBOL", "Grid calls", 300, 120, {
      ...parent,
      stackMode: "GRID",
      gridRows: rows,
      gridColumns: columns,
      gridRowsSizing: { entries: [size(91)] },
      gridColumnsSizing: { entries: [size(92), size(93)] },
      gridColumnGap: 12,
    }),
    node(21, 20, "INSTANCE", "Grid both stretch", 100, 50, {
      symbolData: { symbolID: guid(70) },
      gridRowAnchor: guid(91),
      gridColumnAnchor: guid(92),
      gridChildHorizontalAlign: "STRETCH",
      gridChildVerticalAlign: "STRETCH",
    }),
    node(22, 20, "INSTANCE", "Grid horizontal stretch", 80, 30, {
      symbolData: { symbolID: guid(80) },
      gridRowAnchor: guid(91),
      gridColumnAnchor: guid(93),
      gridChildHorizontalAlign: "STRETCH",
      gridChildVerticalAlign: "MIN",
    }),
    node(70, 0, "SYMBOL", "Blue unit", 100, 50, { fillPaints: fill(0, 0, 1) }),
    node(80, 0, "SYMBOL", "Green unit", 80, 30, { fillPaints: fill(0, 1, 0) }),
  ];
  const header = Buffer.alloc(12);
  header.write("fig-kiwi");
  header.writeUInt32LE(14, 8);
  const chunks = [
    encodeBinarySchema(schema),
    compileSchema(schema).encodeMessage({ nodeChanges: nodes }),
  ].map((value) => {
    const bytes = deflateRawSync(value),
      length = Buffer.alloc(4);
    length.writeUInt32LE(bytes.length);
    return Buffer.concat([length, bytes]);
  });
  const raw = path.join(dir, "instance-layout.fig"),
    zip = path.join(dir, "instance-layout-zip.fig");
  await fs.writeFile(raw, Buffer.concat([header, ...chunks]));
  await fs.writeFile(zip, zipSync({ "canvas.fig": await fs.readFile(raw) }));
  return { dir, raw, zip };
}
const css =
  "*{box-sizing:border-box}body{margin:24px;background:white}#horizontal,#vertical,#grid{margin-bottom:24px}";
const defaults = {
  horizontalWidth: 400,
  horizontalHeight: 100,
  verticalWidth: 180,
  verticalHeight: 240,
  gridWidth: 300,
  gridHeight: 120,
};
function reference(patch) {
  const s = { ...defaults, ...patch };
  return `<div id="horizontal"><div style="position:relative;display:flex;flex-direction:row;align-items:flex-start;justify-content:flex-start;padding:10px;gap:10px;width:${s.horizontalWidth}px;height:${s.horizontalHeight}px;background:rgb(230,230,230)"><div style="position:relative;flex-shrink:0;align-self:stretch;width:40px;background:red"></div><div style="position:relative;flex-grow:1;align-self:stretch;width:auto;height:auto;background:blue"></div></div></div><div id="vertical"><div style="position:relative;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;padding:10px;gap:8px;width:${s.verticalWidth}px;height:${s.verticalHeight}px;background:rgb(230,230,230)"><div style="position:relative;flex-shrink:0;align-self:stretch;height:24px;background:red"></div><div style="position:relative;flex-grow:1;align-self:stretch;width:auto;height:auto;background:lime"></div></div></div><div id="grid"><div style="position:relative;display:grid;grid-template-rows:1fr;grid-template-columns:1fr 1fr;gap:0 12px;padding:10px;width:${s.gridWidth}px;height:${s.gridHeight}px;background:rgb(230,230,230)"><div style="position:relative;grid-row:1;grid-column:1;justify-self:stretch;align-self:stretch;width:100px;height:auto;background:blue"></div><div style="position:relative;grid-row:1;grid-column:2;justify-self:stretch;align-self:start;width:80px;height:30px;background:lime"></div></div></div>`;
}

test("instance call grow/stretch overrides referenced master sizes across H/V resizing and preserves inspected GRID width asymmetry without mutating source", async (t) => {
  const { dir, raw, zip } = await fixture(t),
    before = await fs.readFile(raw),
    doc = await loadFig(raw),
    original = JSON.stringify([...doc.nodes]);
  const parent = select(doc, "1:1"),
    call = select(doc, "1:3");
  const style = applyNodeLayout(
    {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "100px",
      height: "80px",
    },
    call,
    { parent, parentStretched: true },
  );
  assert.equal(style.flexGrow, "1");
  assert.equal(style.alignSelf, "stretch");
  assert.equal(style.width, undefined);
  assert.equal(style.height, undefined);
  assert.equal(JSON.stringify([...doc.nodes]), original);
  assert.doesNotMatch(renderDocument(doc, parent).html, /display:flex/);
  for (const [input, system, name] of [
    [raw, "raw-system", "raw"],
    [zip, "zip-system", "zip"],
  ]) {
    await importFig("design-system", input, path.join(dir, system));
    const source = await fs.readFile(
      path.join(dir, system, "components", "HorizontalCalls.jsx"),
      "utf8",
    );
    assert.match(source, /<BlueUnit\b/);
    if (process.env.CODEX_CAPTURE_FIGMA_INSTANCE_LAYOUT) {
      await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_INSTANCE_LAYOUT, {
        recursive: true,
      });
      await fs.copyFile(
        path.join(dir, system, "components", "GridCalls.jsx"),
        path.join(
          process.env.CODEX_CAPTURE_FIGMA_INSTANCE_LAYOUT,
          name + "-GridCalls.jsx",
        ),
      );
    }
    await fs.writeFile(
      path.join(dir, name + ".jsx"),
      `import React from 'react';import {createRoot} from 'react-dom/client';import {HorizontalCalls} from './${system}/components/HorizontalCalls.jsx';import {VerticalCalls} from './${system}/components/VerticalCalls.jsx';import {GridCalls} from './${system}/components/GridCalls.jsx';const root=createRoot(document.getElementById('app'));const state=${JSON.stringify(defaults)};window.update=patch=>{Object.assign(state,patch);render()};function render(){root.render(<><div id="horizontal"><HorizontalCalls style={{width:state.horizontalWidth,height:state.horizontalHeight}}/></div><div id="vertical"><VerticalCalls style={{width:state.verticalWidth,height:state.verticalHeight}}/></div><div id="grid"><GridCalls style={{width:state.gridWidth,height:state.gridHeight}}/></div></>)}render();`,
    );
    await bundle(path.join(dir, name + ".jsx"), path.join(dir, name + ".js"));
    await fs.writeFile(
      path.join(dir, name + ".html"),
      `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style><div id="app"></div><script src="${name}.js"></script></html>`,
    );
  }
  const cases = [
    {},
    {
      horizontalWidth: 300,
      horizontalHeight: 160,
      verticalWidth: 240,
      verticalHeight: 320,
      gridWidth: 400,
      gridHeight: 180,
    },
    {
      horizontalWidth: 550,
      horizontalHeight: 80,
      verticalWidth: 160,
      verticalHeight: 180,
      gridWidth: 280,
      gridHeight: 90,
    },
  ];
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const expected = [];
  for (const [index, state] of cases.entries()) {
    await fs.writeFile(
      path.join(dir, `reference-${index}.html`),
      `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style>${reference(state)}</html>`,
    );
    await withPage(url + `reference-${index}.html`, async (page) =>
      expected.push(
        await Promise.all(
          ["horizontal", "vertical", "grid"].map((id) =>
            page.locator(`#${id}>div`).screenshot(),
          ),
        ),
      ),
    );
  }
  for (const name of ["raw", "zip"]) {
    await withPage(url + name + ".html", async (page) => {
      await page.locator('#horizontal [data-figma-id="1:70"]').waitFor();
      assert.deepEqual(
        await page
          .locator('#horizontal [data-figma-id="1:70"]')
          .evaluate((el) => [el.style.width, el.style.height]),
        ["auto", "auto"],
      );
      assert.deepEqual(
        await page
          .locator('#vertical [data-figma-id="1:80"]')
          .evaluate((el) => [el.style.width, el.style.height]),
        ["auto", "auto"],
      );
      assert.deepEqual(
        await page
          .locator('#grid [data-figma-id="1:70"]')
          .evaluate((el) => [el.style.width, el.style.height]),
        ["100px", "auto"],
      );
      assert.deepEqual(
        await page
          .locator('#grid [data-figma-id="1:80"]')
          .evaluate((el) => [el.style.width, el.style.height]),
        ["80px", "30px"],
      );
      for (const [index, state] of cases.entries()) {
        await page.evaluate((state) => window.update(state), {
          ...defaults,
          ...state,
        });
        await page.waitForTimeout(40);
        for (const [position, id] of [
          "horizontal",
          "vertical",
          "grid",
        ].entries())
          assert.deepEqual(
            await page.locator(`#${id}>div`).screenshot(),
            expected[index][position],
            `${name} state ${index} ${id}`,
          );
        const s = { ...defaults, ...state };
        assert.equal(
          await page
            .locator('#horizontal [data-figma-id="1:70"]')
            .evaluate((el) => el.getBoundingClientRect().width),
          s.horizontalWidth - 70,
        );
        assert.equal(
          await page
            .locator('#vertical [data-figma-id="1:80"]')
            .evaluate((el) => el.getBoundingClientRect().height),
          s.verticalHeight - 52,
        );
        assert.equal(
          await page
            .locator('#grid [data-figma-id="1:70"]')
            .evaluate((el) => el.getBoundingClientRect().height),
          s.gridHeight - 20,
        );
      }
    });
  }
  assert.deepEqual(await fs.readFile(raw), before);
  assert.equal(JSON.stringify([...doc.nodes]), original);
});
