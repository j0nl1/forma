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
  renderDocument,
  select,
} from "../packages/exports/src/lib/figma.mjs";
import {
  applyNodeLayout,
  axisHugsContent,
  counterStretches,
  layoutChildrenStretched,
} from "../packages/exports/src/lib/figma-layout.mjs";
import { importFig } from "../packages/cli/src/commands/figma.mjs";
import {
  compile,
  preview,
} from "../packages/cli/src/commands/design-system.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";
const guid = (localID) => ({ sessionID: 1, localID });
const matrix = (x = 0, y = 0) => ({
  m00: 1,
  m01: 0,
  m02: x,
  m10: 0,
  m11: 1,
  m12: y,
});
const paint = (r, g, b) => ({ type: "SOLID", color: { r, g, b, a: 1 } });
async function fixture(t) {
  const dir = await temporary(t, "figma-layout-");
  // Compile only this independently owned constant schema; imported schemas remain data.
  const schema = parseSchema(`
    enum Type{DOCUMENT=0;SYMBOL=1;FRAME=2;TEXT=3;} struct Guid{uint sessionID;uint localID;}struct Vec{float x;float y;}struct Parent{Guid guid;string position;}
    struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;}struct Color{float r;float g;float b;float a;}message Paint{string type=1;Color color=2;}
    message Text{string characters=1;}message Font{string family=1;string style=2;}message Metric{float value=1;string units=2;}message Limit{Vec value=1;}message Glyph{uint commandsBlob=1;Vec position=2;float fontSize=3;}message Derived{Glyph[] glyphs=1;}message Blob{byte[] bytes=1;}
    message Initial{Text textValue=1;bool boolValue=2;}message Def{Guid id=1;string name=2;string type=3;Initial initialValue=4;}message Ref{Guid defID=1;string componentPropNodeField=2;}
    message Node{Guid guid=1;Parent parentIndex=2;Type type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;string stackMode=8;string stackPrimarySizing=9;string stackCounterSizing=10;float stackSpacing=11;float stackCounterSpacing=12;float stackPaddingTop=13;float stackPaddingRight=14;float stackPaddingBottom=15;float stackPaddingLeft=16;string stackPrimaryAlignItems=17;string stackCounterAlignItems=18;string stackWrap=19;float stackChildPrimaryGrow=20;string stackChildAlignSelf=21;string stackPositioning=22;Text textData=23;Font fontName=24;float fontSize=25;Metric lineHeight=26;string textAutoResize=27;Def[] componentPropDefs=28;Ref[] componentPropRefs=29;Limit minSize=30;Limit maxSize=31;bool visible=32;Derived derivedTextData=33;}
    message Message{Node[] nodeChanges=1;Blob[] blobs=2;}
  `);
  const node = (id, parent, name, x, y, w, h, extra = {}) => ({
    guid: guid(id),
    parentIndex: {
      guid: parent === 0 ? { sessionID: 0, localID: 0 } : guid(parent),
      position: String(id).padStart(3, "0"),
    },
    type: "FRAME",
    name,
    size: { x: w, y: h },
    transform: matrix(x, y),
    ...extra,
  });
  const text = (id, parent, name, x, y, w, h, extra = {}) =>
    node(id, parent, name, x, y, w, h, {
      type: "TEXT",
      textData: { characters: name },
      fontName: { family: "Arial", style: "Regular" },
      fontSize: 20,
      lineHeight: { value: 20, units: "PIXELS" },
      fillPaints: [paint(0, 0, 1)],
      ...extra,
    });
  const refs = (id, field) => [
    { defID: guid(id), componentPropNodeField: field },
  ];
  const nodes = [
    { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Document" },
    node(1, 0, "Responsive row", 0, 0, 400, 80, {
      type: "SYMBOL",
      stackMode: "HORIZONTAL",
      stackPrimarySizing: "FIXED",
      stackCounterSizing: "FIXED",
      stackSpacing: 10,
      stackPaddingTop: 10,
      stackPaddingRight: 10,
      stackPaddingBottom: 10,
      stackPaddingLeft: 10,
      stackCounterAlignItems: "CENTER",
      fillPaints: [paint(230 / 255, 230 / 255, 230 / 255)],
      minSize: { value: { x: 240, y: 44 } },
      maxSize: { value: { x: 600, y: 140 } },
      componentPropDefs: [
        {
          id: guid(91),
          name: "Label",
          type: "TEXT",
          initialValue: { textValue: { characters: "Short" } },
        },
        {
          id: guid(92),
          name: "Show leading",
          type: "BOOL",
          initialValue: { boolValue: true },
        },
      ],
    }),
    node(2, 1, "Leading", 10, 10, 40, 60, {
      fillPaints: [paint(0, 1, 0)],
      componentPropRefs: refs(92, "VISIBLE"),
    }),
    text(3, 1, "Short", 60, 20, 280, 40, {
      stackChildPrimaryGrow: 1,
      textAutoResize: "HEIGHT",
      componentPropRefs: refs(91, "TEXT_DATA"),
    }),
    node(4, 1, "Trailing", 350, 10, 40, 60, { fillPaints: [paint(1, 1, 0)] }),
    node(5, 1, "Absolute badge", 360, 0, 40, 8, {
      stackPositioning: "ABSOLUTE",
      fillPaints: [paint(1, 0, 0)],
    }),
    node(10, 0, "Hug pill", 0, 0, 140, 40, {
      type: "SYMBOL",
      stackMode: "HORIZONTAL",
      stackPrimarySizing: "RESIZE_TO_FIT",
      stackCounterSizing: "RESIZE_TO_FIT",
      stackSpacing: 8,
      stackPaddingTop: 8,
      stackPaddingRight: 10,
      stackPaddingBottom: 8,
      stackPaddingLeft: 10,
      stackCounterAlignItems: "CENTER",
      fillPaints: [paint(0.8, 1, 1)],
      componentPropDefs: [
        {
          id: guid(93),
          name: "Caption",
          type: "TEXT",
          initialValue: { textValue: { characters: "Go" } },
        },
      ],
    }),
    node(11, 10, "Pill mark", 10, 12, 16, 16, { fillPaints: [paint(0, 1, 0)] }),
    text(12, 10, "Go", 34, 8, 72, 24, {
      textAutoResize: "WIDTH_AND_HEIGHT",
      lineHeight: { value: 24, units: "PIXELS" },
      componentPropRefs: refs(93, "TEXT_DATA"),
    }),
    node(20, 0, "Wrap panel", 0, 0, 260, 100, {
      type: "SYMBOL",
      stackMode: "HORIZONTAL",
      stackPrimarySizing: "FIXED",
      stackCounterSizing: "FIXED",
      stackWrap: "WRAP",
      stackSpacing: 8,
      stackCounterSpacing: 12,
      stackPaddingTop: 8,
      stackPaddingRight: 8,
      stackPaddingBottom: 8,
      stackPaddingLeft: 8,
      fillPaints: [paint(230 / 255, 230 / 255, 230 / 255)],
    }),
    node(21, 20, "First tile", 8, 8, 72, 28, { fillPaints: [paint(1, 0, 0)] }),
    node(22, 20, "Second tile", 88, 8, 72, 28, {
      fillPaints: [paint(0, 1, 0)],
    }),
    node(23, 20, "Third tile", 168, 8, 72, 28, {
      fillPaints: [paint(0, 0, 1)],
    }),
  ];
  nodes.push(
    node(30, 0, "Vertical column", 0, 0, 180, 150, {
      type: "SYMBOL",
      stackMode: "VERTICAL",
      stackPrimarySizing: "FIXED",
      stackCounterSizing: "FIXED",
      stackSpacing: 8,
      stackPaddingTop: 10,
      stackPaddingRight: 10,
      stackPaddingBottom: 10,
      stackPaddingLeft: 10,
      stackCounterAlignItems: "CENTER",
      fillPaints: [paint(230 / 255, 230 / 255, 230 / 255)],
      componentPropDefs: [
        {
          id: guid(94),
          name: "Message",
          type: "TEXT",
          initialValue: { textValue: { characters: "Stack" } },
        },
      ],
    }),
    node(31, 30, "Column header", 10, 10, 160, 24, {
      fillPaints: [paint(1, 0, 0)],
    }),
    text(32, 30, "Stack", 10, 42, 160, 66, {
      stackChildPrimaryGrow: 1,
      textAutoResize: "HEIGHT",
      componentPropRefs: refs(94, "TEXT_DATA"),
    }),
    node(33, 30, "Column footer", 50, 116, 80, 24, {
      stackChildAlignSelf: "MIN",
      fillPaints: [paint(0, 1, 0)],
    }),
  );

  nodes.push(
    node(40, 0, "Saved label", 0, 0, 120, 40, {
      type: "SYMBOL",
      stackMode: "HORIZONTAL",
      stackPrimarySizing: "RESIZE_TO_FIT",
      stackCounterSizing: "RESIZE_TO_FIT",
      stackPaddingTop: 8,
      stackPaddingRight: 10,
      stackPaddingBottom: 8,
      stackPaddingLeft: 10,
      fillPaints: [paint(0.8, 1, 1)],
    }),
    text(41, 40, "Fixed label", 10, 8, 100, 24, {
      textAutoResize: "WIDTH_AND_HEIGHT",
      lineHeight: { value: 24, units: "PIXELS" },
      derivedTextData: {
        glyphs: [{ commandsBlob: 0, position: { x: 0, y: 20 }, fontSize: 20 }],
      },
    }),
  );
  const glyphBytes = Buffer.concat(
    [[1, 0, 0], [2, 1, 0], [2, 1, 1], [2, 0, 1], [0]].map(
      ([code, ...values]) => {
        const out = Buffer.alloc(1 + values.length * 4);
        out[0] = code;
        values.forEach((value, i) => out.writeFloatLE(value, 1 + i * 4));
        return out;
      },
    ),
  );
  const header = Buffer.alloc(12);
  header.write("fig-kiwi");
  header.writeUInt32LE(14, 8);
  const chunks = [
    encodeBinarySchema(schema),
    compileSchema(schema).encodeMessage({
      nodeChanges: nodes,
      blobs: [{ bytes: [...glyphBytes] }],
    }),
  ].map((data) => {
    const compressed = deflateRawSync(data),
      size = Buffer.alloc(4);
    size.writeUInt32LE(compressed.length);
    return Buffer.concat([size, compressed]);
  });
  const raw = path.join(dir, "layout.fig"),
    zip = path.join(dir, "layout-zip.fig");
  await fs.writeFile(raw, Buffer.concat([header, ...chunks]));
  await fs.writeFile(zip, zipSync({ "canvas.fig": await fs.readFile(raw) }));
  return { dir, raw, zip };
}
const css =
  "*{box-sizing:border-box}body{margin:24px;background:white;font-family:Arial}#row,#pill,#wrap,#column,#saved{margin-bottom:24px}";
function reference({
  width = 400,
  rowHeight = 80,
  label = "Short",
  leading = true,
  caption = "Go",
  wrapWidth = 260,
  columnHeight = 150,
  columnWidth = 180,
  message = "Stack",
} = {}) {
  return `<div id="row"><div style="position:relative;display:flex;flex-direction:row;justify-content:flex-start;align-items:center;gap:10px;padding:10px;min-width:240px;min-height:44px;max-width:600px;max-height:140px;width:${typeof width === "string" ? width : width + "px"};height:${rowHeight}px;background:rgb(230,230,230)">${leading ? '<div style="position:relative;width:40px;flex-shrink:0;align-self:stretch;background:lime"></div>' : ""}<div style="position:relative;flex-grow:1;color:blue;font:20px/20px Arial;white-space:pre-wrap">${label}</div><div style="position:relative;width:40px;flex-shrink:0;align-self:stretch;background:yellow"></div><div style="position:absolute;left:360px;top:0;width:40px;height:8px;background:red"></div></div></div><div id="pill"><div style="position:relative;display:flex;flex-direction:row;justify-content:flex-start;align-items:center;gap:8px;padding:8px 10px;width:fit-content;background:rgb(204,255,255)"><div style="position:relative;width:16px;height:16px;flex-shrink:0;background:lime"></div><div style="position:relative;flex-shrink:0;color:blue;font:20px/24px Arial;white-space:pre-wrap">${caption}</div></div></div><div id="wrap"><div style="position:relative;display:flex;flex-direction:row;justify-content:flex-start;align-items:flex-start;gap:12px 8px;padding:8px;flex-wrap:wrap;width:${wrapWidth}px;height:100px;background:rgb(230,230,230)">${["red", "lime", "blue"].map((color) => `<div style="position:relative;width:72px;height:28px;flex-shrink:0;background:${color}"></div>`).join("")}</div></div><div id="column"><div style="position:relative;display:flex;flex-direction:column;justify-content:flex-start;align-items:center;gap:8px;padding:10px;width:${columnWidth}px;height:${columnHeight}px;background:rgb(230,230,230)"><div style="position:relative;height:24px;flex-shrink:0;align-self:stretch;background:red"></div><div style="position:relative;flex-grow:1;align-self:stretch;color:blue;font:20px/20px Arial;white-space:pre-wrap">${message}</div><div style="position:relative;width:80px;height:24px;flex-shrink:0;background:lime"></div></div></div><div id="saved"><div style="position:relative;display:flex;flex-direction:row;justify-content:flex-start;align-items:flex-start;padding:8px 10px;width:fit-content;background:rgb(204,255,255)"><div style="position:relative;flex-shrink:0;color:blue;font:20px/24px Arial;white-space:pre-wrap">Fixed label</div></div></div>`;
}
async function consumer(dir, system, name) {
  await fs.writeFile(
    path.join(dir, name + ".jsx"),
    `import React from 'react';import {createRoot} from 'react-dom/client';import {ResponsiveRow} from './${system}/components/ResponsiveRow.jsx';import {HugPill} from './${system}/components/HugPill.jsx';import {WrapPanel} from './${system}/components/WrapPanel.jsx';import {VerticalColumn} from './${system}/components/VerticalColumn.jsx';import {SavedLabel} from './${system}/components/SavedLabel.jsx';const root=createRoot(document.getElementById('app'));const state={width:400,rowHeight:80,label:'Short',leading:true,caption:'Go',wrapWidth:260,columnHeight:150,columnWidth:180,message:'Stack'};window.update=patch=>{Object.assign(state,patch);render()};function render(){root.render(<><div id="row"><ResponsiveRow label={state.label} showLeading={state.leading} style={{width:state.width,height:state.rowHeight}}/></div><div id="pill"><HugPill caption={state.caption}/></div><div id="wrap"><WrapPanel style={{width:state.wrapWidth}}/></div><div id="column"><VerticalColumn message={state.message} style={{height:state.columnHeight,width:state.columnWidth}}/></div><div id="saved"><SavedLabel/></div></>)}render();`,
  );
  await bundle(path.join(dir, name + ".jsx"), path.join(dir, name + ".js"));
  await fs.writeFile(
    path.join(dir, name + ".html"),
    `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style><div id="app"></div><script src="${name}.js"></script></html>`,
  );
}
test("generated layout infers source fill/hug behavior, retained rotation/absolute geometry and finite min/max constraints", async (t) => {
  const { raw } = await fixture(t),
    before = await fs.readFile(raw),
    doc = await loadFig(raw),
    row = select(doc, "1:1"),
    lead = select(doc, "1:2");
  const warnings = [],
    base = {
      position: "absolute",
      left: "10px",
      top: "10px",
      width: "40px",
      height: "60px",
    };
  const result = applyNodeLayout({ ...base }, lead, {
    parent: row,
    parentStretched: true,
    warnings,
  });
  assert.equal(result.position, "relative");
  assert.equal(result.alignSelf, "stretch");
  assert.equal(result.height, undefined);
  assert.equal(result.left, undefined);
  assert.equal(counterStretches(lead, row, true), true);
  assert.equal(layoutChildrenStretched(row, null, { isRoot: true }), true);
  const inferred = {
    ...row,
    size: { x: 110, y: 80 },
    children: [lead, { ...lead, size: { x: 40, y: 60 } }],
  };
  assert.equal(axisHugsContent(inferred, "primary"), true);
  const hug = applyNodeLayout(
    { width: "110px", height: "80px" },
    { ...inferred, stackPrimarySizing: undefined },
    { isRoot: true, warnings },
  );
  assert.equal(hug.width, "fit-content");
  const text = applyNodeLayout(
    { width: "280px", height: "40px" },
    select(doc, "1:3"),
    { parent: row, warnings },
  );
  assert.equal(text.flexGrow, "1");
  assert.equal(text.width, undefined);
  assert.equal(text.height, undefined);
  const abs = applyNodeLayout({ ...base }, select(doc, "1:5"), {
    parent: row,
    warnings,
  });
  assert.equal(abs.position, "absolute");
  assert.equal(abs.left, "10px");
  const rotated = { ...lead, transform: { ...matrix(), m01: 0.2 } };
  assert.equal(
    applyNodeLayout({ ...base }, rotated, { parent: row, warnings }).position,
    "absolute",
  );
  assert.match(warnings.join("\n"), /rotated auto-layout/);
  applyNodeLayout({}, { ...row, stackMode: "GRID" }, { warnings });
  assert.match(warnings.join("\n"), /GRID.*saved geometry/);
  applyNodeLayout(
    {},
    { ...row, stackSpacing: -2, minSize: { value: { x: NaN } } },
    { warnings },
  );
  assert.match(warnings.join("\n"), /negative auto-layout gap/);
  assert.match(warnings.join("\n"), /invalid minSize/);
  const verticalWrapped = applyNodeLayout(
    {},
    {
      ...row,
      stackMode: "VERTICAL",
      stackWrap: "WRAP",
      stackSpacing: 8,
      stackCounterSpacing: 12,
    },
    { warnings },
  );
  assert.equal(
    verticalWrapped.gap,
    "12px 8px",
    "preserves the inspected source React row/column gap order",
  );
  const distributed = applyNodeLayout(
    {},
    { ...row, stackPrimaryAlignItems: "SPACE_EVENLY" },
    { warnings },
  );
  assert.equal(distributed.justifyContent, "space-between");
  assert.equal(distributed.gap, undefined);
  const scaled = applyNodeLayout(
    { ...base, transform: "matrix(2,0,0,1,0,0)", transformOrigin: "0 0" },
    { ...lead, transform: { ...matrix(10, 10), m00: 2 } },
    { parent: row, warnings },
  );
  assert.equal(scaled.position, "relative");
  assert.equal(scaled.transform, "matrix(2,0,0,1,0,0)");
  assert.equal(scaled.transformOrigin, undefined);
  const hugParent = { ...row, stackCounterSizing: "RESIZE_TO_FIT" };
  assert.equal(counterStretches(lead, hugParent, false), false);
  assert.equal(counterStretches(lead, hugParent, true), true);
  assert.equal(
    layoutChildrenStretched({ ...row, stackMode: "VERTICAL" }, row, {
      parentStretched: true,
    }),
    false,
  );
  assert.match(
    renderDocument(doc, select(doc, "1:40")).html,
    /<svg role="img"/,
  );
  const icon = applyNodeLayout(
    { ...base },
    {
      ...lead,
      type: "TEXT",
      textAutoResize: "WIDTH_AND_HEIGHT",
      derivedTextData: { glyphs: [{}] },
    },
    { parent: row, warnings },
  );
  assert.equal(icon.width, undefined);
  assert.equal(icon.height, undefined);
  assert.doesNotMatch(warnings.join("\n"), /glyph icon.*fixed layout/);
  const fixed = renderDocument(doc, row);
  assert.match(fixed.html, /left:60px/);
  assert.doesNotMatch(fixed.html, /display:flex/);
  assert.deepEqual(await fs.readFile(raw), before);
});
test("raw and ZIP generated React auto layout matches owned flex CSS while resizing, wrapping, growing text and toggling props", async (t) => {
  const { dir, raw, zip } = await fixture(t);
  for (const [name, input] of [
    ["raw", raw],
    ["zip", zip],
  ]) {
    await importFig("components", input, path.join(dir, name));
    await consumer(dir, name, name + "-consumer");
  }
  const cases = [
    {},
    {
      width: 300,
      rowHeight: 100,
      label: "Longer words wrap across multiple lines",
      caption: "A longer caption",
      wrapWidth: 180,
      columnHeight: 200,
      columnWidth: 300,
      message: "Responsive vertical text",
    },
    {
      width: 200,
      leading: false,
      label: "No leading marker",
      caption: "Done",
      wrapWidth: 160,
    },
    {
      width: 800,
      rowHeight: 160,
      label: "Maximum width",
      caption: "Go",
      wrapWidth: 260,
    },
    { width: "100%", viewport: 680, label: "Viewport sized label" },
    { width: "100%", viewport: 360, label: "Narrow viewport label" },
  ];
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const expected = [];
  for (const [index, state] of cases.entries()) {
    await fs.writeFile(
      path.join(dir, `reference-${index}.html`),
      `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style>${reference(state)}</html>`,
    );
    await withPage(url + `reference-${index}.html`, async (page) => {
      if (state.viewport)
        await page.setViewportSize({ width: state.viewport, height: 1000 });
      expected.push(
        await Promise.all(
          ["row", "pill", "wrap", "column", "saved"].map((id) =>
            page.locator(`#${id}>div`).screenshot(),
          ),
        ),
      );
    });
  }

  for (const name of ["raw-consumer.html", "zip-consumer.html"]) {
    await withPage(url + name, async (page) => {
      await page.locator('[data-figma-id="1:1"]').waitFor();
      for (const [index, state] of cases.entries()) {
        if (state.viewport)
          await page.setViewportSize({ width: state.viewport, height: 1000 });
        await page.evaluate(
          (patch) =>
            window.update({
              width: 400,
              rowHeight: 80,
              label: "Short",
              leading: true,
              caption: "Go",
              wrapWidth: 260,
              columnHeight: 150,
              columnWidth: 180,
              message: "Stack",
              ...patch,
            }),
          state,
        );
        await page.waitForTimeout(50);
        for (const [position, id] of [
          "row",
          "pill",
          "wrap",
          "column",
        ].entries())
          assert.deepEqual(
            await page.locator(`#${id}>div`).screenshot(),
            expected[index][position],
            `${name} case ${index} ${id}`,
          );
        if (index === 1) {
          assert.ok(
            (await page
              .locator('[data-figma-id="1:10"]')
              .evaluate((el) => el.getBoundingClientRect().width)) > 140,
          );
          assert.equal(
            await page
              .locator('[data-figma-id="1:2"]')
              .evaluate((el) => getComputedStyle(el).height),
            "80px",
          );
        }
        if (index === 2)
          assert.equal(
            await page
              .locator('[data-figma-id="1:1"]')
              .evaluate((el) => el.getBoundingClientRect().width),
            240,
          );
        if (index === 3)
          assert.equal(
            await page
              .locator('[data-figma-id="1:1"]')
              .evaluate((el) => el.getBoundingClientRect().width),
            600,
          );
      }
      if (process.env.CODEX_CAPTURE_FIGMA_LAYOUT) {
        await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_LAYOUT, {
          recursive: true,
        });
        await page.screenshot({
          path: path.join(
            process.env.CODEX_CAPTURE_FIGMA_LAYOUT,
            name + ".png",
          ),
          fullPage: true,
        });
      }
    });
  }
});
test("compiled auto-layout review and portable React HTML and PNG retain responsive prop behavior after deleting Figma and system sources", async (t) => {
  const { dir, raw, zip } = await fixture(t),
    system = path.join(dir, "system");
  await importFig("design-system", zip, system);
  await compile(system);
  await preview(system);
  await fs.copyFile(
    path.join(system, "preview.html"),
    path.join(dir, "review.html"),
  );
  await consumer(dir, "system", "portable-source");
  await exportArtifact(
    "html",
    path.join(dir, "portable-source.html"),
    path.join(dir, "portable.html"),
  );
  if (process.env.CODEX_CAPTURE_FIGMA_LAYOUT) {
    await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_LAYOUT, { recursive: true });
    await fs.copyFile(
      path.join(dir, "portable.html"),
      path.join(process.env.CODEX_CAPTURE_FIGMA_LAYOUT, "portable.html"),
    );
  }
  await fs.rm(raw);
  await fs.rm(zip);
  await fs.rm(system, { recursive: true });
  await fs.rm(path.join(dir, "portable-source.js"));
  await fs.rm(path.join(dir, "portable-source.jsx"));
  await fs.writeFile(
    path.join(dir, "portable-reference.html"),
    `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style>${reference()}</html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const referenceRegions = [];
  await withPage(url + "portable-reference.html", async (page) => {
    for (const id of ["row", "pill", "wrap", "column", "saved"]) {
      const el = page.locator(`#${id}>div`);
      referenceRegions.push({
        png: (await el.screenshot()).toString("base64"),
        bounds: await el.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            x: Math.floor(r.x),
            y: Math.floor(r.y),
            width: Math.ceil(r.width),
            height: Math.ceil(r.height),
          };
        }),
      });
    }
  });
  await withPage(url + "portable.html", async (page) => {
    await page.locator('[data-figma-id="1:1"]').waitFor();
    await page.evaluate(() =>
      window.update({
        width: 300,
        label: "Portable resized label",
        caption: "Portable caption",
        wrapWidth: 180,
      }),
    );
    await page.waitForTimeout(50);
    assert.ok(
      (await page
        .locator('[data-figma-id="1:40"]')
        .evaluate((el) => el.getBoundingClientRect().height)) > 0,
    );
    assert.equal(await page.locator('[data-figma-id="1:41"] svg').count(), 0);
    assert.equal(
      await page
        .locator('[data-figma-id="1:1"]')
        .evaluate((el) => el.getBoundingClientRect().width),
      300,
    );
    assert.ok(
      (await page
        .locator('[data-figma-id="1:10"]')
        .evaluate((el) => el.getBoundingClientRect().width)) > 140,
    );
    assert.ok(
      (await page
        .locator('[data-figma-id="1:23"]')
        .evaluate((el) => el.offsetTop)) > 8,
    );
  });
  await withPage(
    url + "review.html",
    async (page) => {
      const card = page.locator('article[data-card-name="ResponsiveRow"]');
      await card.locator('[data-figma-id="1:1"]').waitFor();
      assert.equal(
        await card
          .locator('[data-figma-id="1:1"]')
          .evaluate((el) => getComputedStyle(el).display),
        "flex",
      );
      assert.equal(
        await card
          .locator('[data-figma-id="1:2"]')
          .evaluate((el) => getComputedStyle(el).position),
        "relative",
      );
    },
    { width: 1440, height: 1000 },
  );
  await exportArtifact(
    "png",
    url + "portable.html",
    path.join(dir, "portable.png"),
  );
  await withPage(url + "portable.html", async (page) => {
    const output = (await fs.readFile(path.join(dir, "portable.png"))).toString(
      "base64",
    );
    const differences = await page.evaluate(
      async ({ output, regions }) => {
        const full = new Image();
        full.src = "data:image/png;base64," + output;
        await full.decode();
        const result = [];
        for (const region of regions) {
          const image = new Image();
          image.src = "data:image/png;base64," + region.png;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          const expected = ctx.getImageData(
            0,
            0,
            image.width,
            image.height,
          ).data;
          ctx.clearRect(0, 0, image.width, image.height);
          const r = region.bounds;
          ctx.drawImage(
            full,
            r.x,
            r.y,
            r.width,
            r.height,
            0,
            0,
            r.width,
            r.height,
          );
          const actual = ctx.getImageData(0, 0, image.width, image.height).data;
          let count = 0;
          for (let i = 0; i < actual.length; i++)
            if (actual[i] !== expected[i]) count++;
          result.push(count);
        }
        return result;
      },
      { output, regions: referenceRegions },
    );
    assert.deepEqual(
      differences,
      [0, 0, 0, 0, 0],
      "every portable PNG pixel matches owned CSS after deleting sources",
    );
  });
});
