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
import { applyNodeLayout } from "../packages/exports/src/lib/figma-layout.mjs";
import { gridTemplate } from "../packages/exports/src/lib/figma-grid.mjs";
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
const fixed = (value) => ({ type: "FIXED", value });
const fraction = (value) => ({ type: "FLEX", value });
const trackSize = (minSizing, maxSizing = minSizing) => ({
  minSizing,
  maxSizing,
});
const tracks = (...ids) => ({
  entries: ids
    .map((id, index) => ({
      id: guid(id),
      position: String.fromCharCode(97 + index),
    }))
    .reverse(),
});
const sizes = (...entries) => ({
  entries: entries
    .map(([id, size]) => ({ id: guid(id), trackSize: size }))
    .reverse(),
});

async function fixture(t) {
  const dir = await temporary(t);
  // Only this owned constant schema is compiled. External schemas are interpreted as data.
  const schema = parseSchema(`
    enum Type{DOCUMENT=0;SYMBOL=1;FRAME=2;TEXT=3;}
    struct Guid{uint sessionID;uint localID;}struct Vec{float x;float y;}
    struct Parent{Guid guid;string position;}struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;}
    struct Color{float r;float g;float b;float a;}message Paint{string type=1;Color color=2;}
    message Text{string characters=1;}message Font{string family=1;string style=2;}message Metric{float value=1;string units=2;}
    message Initial{Text textValue=1;bool boolValue=2;}message Def{Guid id=1;string name=2;string type=3;Initial initialValue=4;}message Ref{Guid defID=1;string componentPropNodeField=2;}
    message Track{Guid id=1;string position=2;}message Tracks{Track[] entries=1;}
    message Bound{string type=1;float value=2;}message TrackSize{Bound minSizing=1;Bound maxSizing=2;}
    message Sizing{Guid id=1;TrackSize trackSize=2;}message Sizes{Sizing[] entries=1;}
    message Node{Guid guid=1;Parent parentIndex=2;Type type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;string stackMode=8;Tracks gridRows=9;Tracks gridColumns=10;Sizes gridRowsSizing=11;Sizes gridColumnsSizing=12;float gridRowGap=13;float gridColumnGap=14;float stackPaddingTop=15;float stackPaddingRight=16;float stackPaddingBottom=17;float stackPaddingLeft=18;float stackVerticalPadding=19;float stackHorizontalPadding=20;Guid gridRowAnchor=21;Guid gridColumnAnchor=22;uint gridRowSpan=23;uint gridColumnSpan=24;string gridChildHorizontalAlign=25;string gridChildVerticalAlign=26;string stackPositioning=27;Text textData=28;Font fontName=29;float fontSize=30;Metric lineHeight=31;string textAutoResize=32;Def[] componentPropDefs=33;Ref[] componentPropRefs=34;bool visible=35;string stackPrimarySizing=36;string stackCounterSizing=37;}
    message Message{Node[] nodeChanges=1;}
  `);
  const node = (id, parent, name, x, y, width, height, extra = {}) => ({
    guid: guid(id),
    parentIndex: {
      guid: parent ? guid(parent) : { sessionID: 0, localID: 0 },
      position: String(id).padStart(3, "0"),
    },
    type: "FRAME",
    name,
    transform: matrix(x, y),
    size: { x: width, y: height },
    ...extra,
  });
  const cell = (
    id,
    parent,
    name,
    color,
    row,
    column,
    width,
    height,
    extra = {},
  ) =>
    node(id, parent, name, 80 + id, 25 + id, width, height, {
      fillPaints: [paint(...color)],
      gridRowAnchor: guid(row),
      gridColumnAnchor: guid(column),
      ...extra,
    });
  const rows = tracks(101, 102, 103),
    columns = tracks(111, 112, 113);
  const nodes = [
    { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Document" },
    node(1, 0, "Track laboratory", 0, 0, 400, 240, {
      type: "SYMBOL",
      stackMode: "GRID",
      gridRows: rows,
      gridColumns: columns,
      gridRowsSizing: sizes(
        [101, trackSize(fixed(32))],
        [102, trackSize(fixed(24), fraction(1))],
        [103, trackSize({ type: "AUTO" })],
      ),
      gridColumnsSizing: sizes(
        [111, trackSize(fixed(64))],
        [112, trackSize(fixed(40), fraction(1))],
        [113, trackSize(fraction(2))],
      ),
      gridRowGap: 10,
      gridColumnGap: 12,
      stackPaddingTop: 8,
      stackPaddingRight: 12,
      stackPaddingBottom: 14,
      stackPaddingLeft: 16,
      // GRID retains its saved dimensions even when flex-style hug flags are present.
      stackPrimarySizing: "RESIZE_TO_FIT",
      stackCounterSizing: "RESIZE_TO_FIT",
      fillPaints: [paint(230 / 255, 230 / 255, 230 / 255)],
      componentPropDefs: [
        {
          id: guid(91),
          name: "Label",
          type: "TEXT",
          initialValue: { textValue: { characters: "Grid title" } },
        },
      ],
    }),
    cell(2, 1, "Stretch tile", [1, 0, 0], 101, 111, 20, 20, {
      gridChildHorizontalAlign: "STRETCH",
      gridChildVerticalAlign: "STRETCH",
    }),
    node(3, 1, "Grid title", 100, 22, 200, 24, {
      type: "TEXT",
      textData: { characters: "Grid title" },
      fontName: { family: "Arial", style: "Regular" },
      fontSize: 20,
      lineHeight: { value: 24, units: "PIXELS" },
      fillPaints: [paint(0, 0, 1)],
      textAutoResize: "WIDTH_AND_HEIGHT",
      gridRowAnchor: guid(101),
      gridColumnAnchor: guid(112),
      gridColumnSpan: 2,
      gridChildHorizontalAlign: "STRETCH",
      gridChildVerticalAlign: "MIN",
      componentPropRefs: [
        { defID: guid(91), componentPropNodeField: "TEXT_DATA" },
      ],
    }),
    cell(4, 1, "Two-column fill", [0, 1, 0], 102, 111, 50, 32, {
      gridColumnSpan: 2,
      gridChildHorizontalAlign: "STRETCH",
      gridChildVerticalAlign: "STRETCH",
    }),
    cell(5, 1, "Centered tile", [1, 1, 0], 102, 113, 28, 20, {
      gridChildHorizontalAlign: "CENTER",
      gridChildVerticalAlign: "CENTER",
    }),
    cell(6, 1, "Bottom span", [0, 1, 1], 103, 111, 20, 24, {
      gridColumnSpan: 3,
      gridChildHorizontalAlign: "STRETCH",
      gridChildVerticalAlign: "MAX",
    }),
    cell(7, 1, "Absolute badge", [1, 0, 1], 101, 111, 24, 8, {
      transform: matrix(350, 0),
      stackPositioning: "ABSOLUTE",
      gridRowSpan: 3,
      gridColumnSpan: 3,
      gridChildHorizontalAlign: "STRETCH",
      gridChildVerticalAlign: "STRETCH",
    }),
    node(20, 0, "Automatic laboratory", 0, 0, 240, 120, {
      type: "SYMBOL",
      stackMode: "GRID",
      gridRows: tracks(201, 202),
      gridColumns: tracks(211, 212),
      gridRowsSizing: sizes([202, trackSize(fixed(36))]),
      gridColumnsSizing: sizes(
        [211, trackSize(fixed(0))],
        [212, trackSize(fraction(1))],
      ),
      gridRowGap: 8,
      gridColumnGap: 6,
      stackVerticalPadding: 10,
      stackHorizontalPadding: 12,
      stackPaddingLeft: 14,
      fillPaints: [paint(230 / 255, 230 / 255, 230 / 255)],
    }),
    cell(21, 20, "Start tile", [1, 0, 0], 201, 211, 40, 24, {
      gridChildHorizontalAlign: "MIN",
      gridChildVerticalAlign: "MIN",
    }),
    cell(22, 20, "End tile", [0, 1, 0], 201, 212, 20, 20, {
      gridChildHorizontalAlign: "MAX",
      gridChildVerticalAlign: "MAX",
    }),
    node(23, 20, "Implicit tile", 13, 45, 32, 12, {
      fillPaints: [paint(1, 0, 1)],
    }),
    cell(24, 20, "Row span tile", [0, 0, 1], 201, 212, 8, 8, {
      gridRowSpan: 2,
      gridChildHorizontalAlign: "MIN",
      gridChildVerticalAlign: "CENTER",
    }),
  ];
  const header = Buffer.alloc(12);
  header.write("fig-kiwi");
  header.writeUInt32LE(14, 8);
  const chunks = [
    encodeBinarySchema(schema),
    compileSchema(schema).encodeMessage({ nodeChanges: nodes }),
  ].map((bytes) => {
    const compressed = deflateRawSync(bytes),
      size = Buffer.alloc(4);
    size.writeUInt32LE(compressed.length);
    return Buffer.concat([size, compressed]);
  });
  const raw = path.join(dir, "grid.fig"),
    zip = path.join(dir, "grid-zip.fig");
  await fs.writeFile(raw, Buffer.concat([header, ...chunks]));
  await fs.writeFile(zip, zipSync({ "canvas.fig": await fs.readFile(raw) }));
  return { dir, raw, zip };
}
const css =
  "*{box-sizing:border-box}body{margin:24px;background:white;font-family:Arial}#tracks,#automatic{margin-bottom:24px}";
const defaults = {
  width: 400,
  height: 240,
  label: "Grid title",
  autoWidth: 240,
  autoHeight: 120,
};
const dimension = (value) => (typeof value === "string" ? value : value + "px");
function reference(patch = {}) {
  const s = { ...defaults, ...patch };
  return `<div id="tracks"><div style="position:relative;display:grid;grid-template-rows:32px minmax(24px,1fr) auto;grid-template-columns:64px minmax(40px,1fr) 2fr;gap:10px 12px;padding:8px 12px 14px 16px;width:${dimension(s.width)};height:${s.height}px;background:rgb(230,230,230)"><div style="position:relative;grid-row:1;grid-column:1;justify-self:stretch;align-self:stretch;background:red"></div><div style="position:relative;grid-row:1;grid-column:2 / span 2;justify-self:stretch;align-self:start;height:24px;color:blue;font:20px/24px Arial;white-space:pre-wrap">${s.label}</div><div style="position:relative;grid-row:2;grid-column:1 / span 2;justify-self:stretch;align-self:stretch;background:lime"></div><div style="position:relative;grid-row:2;grid-column:3;justify-self:center;align-self:center;width:28px;height:20px;background:yellow"></div><div style="position:relative;grid-row:3;grid-column:1 / span 3;justify-self:stretch;align-self:end;height:24px;background:cyan"></div><div style="position:absolute;left:350px;top:0;width:24px;height:8px;background:magenta"></div></div></div><div id="automatic"><div style="position:relative;display:grid;grid-template-rows:auto 36px;grid-template-columns:auto 1fr;gap:8px 6px;padding:10px 12px 10px 14px;width:${dimension(s.autoWidth)};height:${s.autoHeight}px;background:rgb(230,230,230)"><div style="position:relative;grid-row:1;grid-column:1;justify-self:start;align-self:start;width:40px;height:24px;background:red"></div><div style="position:relative;grid-row:1;grid-column:2;justify-self:end;align-self:end;width:20px;height:20px;background:lime"></div><div style="position:relative;width:32px;height:12px;background:magenta"></div><div style="position:relative;grid-row:1 / span 2;grid-column:2;justify-self:start;align-self:center;width:8px;height:8px;background:blue"></div></div></div>`;
}
async function consumer(dir, system, name) {
  await fs.writeFile(
    path.join(dir, name + ".jsx"),
    `import React from 'react';import {createRoot} from 'react-dom/client';import {TrackLaboratory} from './${system}/components/TrackLaboratory.jsx';import {AutomaticLaboratory} from './${system}/components/AutomaticLaboratory.jsx';const root=createRoot(document.getElementById('app'));const state=${JSON.stringify(defaults)};window.update=patch=>{Object.assign(state,patch);render()};function render(){root.render(<><div id="tracks"><TrackLaboratory label={state.label} style={{width:state.width,height:state.height}}/></div><div id="automatic"><AutomaticLaboratory style={{width:state.autoWidth,height:state.autoHeight}}/></div></>)}render();`,
  );
  await bundle(path.join(dir, name + ".jsx"), path.join(dir, name + ".js"));
  await fs.writeFile(
    path.join(dir, name + ".html"),
    `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style><div id="app"></div><button onclick="window.update({width:'100%',autoWidth:'100%'})">Responsive width</button> <button onclick="window.update({label:'A longer live title that wraps inside fractional grid tracks',height:320,autoHeight:180})">Change content and height</button><script src="${name}.js"></script></html>`,
  );
}
const cases = [
  {},
  {
    width: 300,
    height: 320,
    label: "A longer title that wraps inside fractional tracks",
    autoWidth: 300,
    autoHeight: 180,
  },
  {
    width: 600,
    height: 180,
    label: "Wide grid",
    autoWidth: 360,
    autoHeight: 140,
  },
  { width: "100%", autoWidth: "100%", viewport: 680 },
  {
    width: "100%",
    autoWidth: "100%",
    viewport: 360,
    label: "Narrow viewport title",
  },
];

test("generated GRID declarations preserve ordered fixed/auto/fraction/minmax tracks, anchor spans, alignments and source child sizing", async (t) => {
  const { raw } = await fixture(t),
    before = await fs.readFile(raw),
    doc = await loadFig(raw),
    warnings = [];
  const root = select(doc, "1:1");
  const style = applyNodeLayout({ width: "400px", height: "240px" }, root, {
    isRoot: true,
    warnings,
  });
  assert.deepEqual(style, {
    width: "400px",
    height: "240px",
    display: "grid",
    gridTemplateRows: "32px minmax(24px, 1fr) auto",
    gridTemplateColumns: "64px minmax(40px, 1fr) 2fr",
    gap: "10px 12px",
    padding: "8px 12px 14px 16px",
    boxSizing: "border-box",
  });
  const base = {
    position: "absolute",
    left: "80px",
    top: "20px",
    width: "200px",
    height: "24px",
  };
  assert.deepEqual(
    applyNodeLayout({ ...base }, select(doc, "1:3"), {
      parent: root,
      warnings,
    }),
    {
      position: "relative",
      height: "24px",
      gridRow: "1",
      gridColumn: "2 / span 2",
      justifySelf: "stretch",
      alignSelf: "start",
    },
  );
  const stretched = applyNodeLayout({ ...base }, select(doc, "1:4"), {
    parent: root,
    warnings,
  });
  assert.equal(stretched.width, undefined);
  assert.equal(stretched.height, undefined);
  assert.equal(stretched.gridColumn, "1 / span 2");
  assert.deepEqual(
    applyNodeLayout({ ...base }, select(doc, "1:7"), {
      parent: root,
      warnings,
    }),
    base,
  );
  const transform = {
    ...base,
    transform: "matrix(0,1,-1,0,3,4)",
    transformOrigin: "0 0",
  };
  const rotated = applyNodeLayout(
    { ...transform },
    {
      ...select(doc, "1:5"),
      transform: { m00: 0, m01: -1, m02: 3, m10: 1, m11: 0, m12: 4 },
    },
    { parent: root, warnings },
  );
  assert.equal(rotated.position, "relative");
  assert.equal(rotated.transform, transform.transform);
  assert.equal(rotated.transformOrigin, "0 0");
  assert.equal(
    gridTemplate(
      tracks(11, 12, 13),
      sizes([11, trackSize(fraction(undefined))], [12, trackSize(fixed(0))]),
    ),
    "1fr auto auto",
  );
  assert.equal(
    gridTemplate(
      {
        entries: [
          { id: guid(13), position: "10" },
          { id: guid(11), position: "2" },
        ],
      },
      sizes([11, trackSize(fixed(22))], [13, trackSize(fixed(10))]),
    ),
    "10px 22px",
  );
  assert.deepEqual(warnings, []);
  const unknown = [];
  applyNodeLayout(
    {},
    {
      ...root,
      gridRowGap: -4,
      gridRowsSizing: sizes([101, trackSize(fixed(NaN))]),
    },
    { warnings: unknown },
  );
  applyNodeLayout(
    { ...base },
    {
      ...select(doc, "1:5"),
      gridRowAnchor: guid(999),
      gridColumnSpan: 0,
      gridChildVerticalAlign: "BASELINE",
    },
    { parent: root, warnings: unknown },
  );
  assert.match(unknown.join("\n"), /invalid row gap/);
  assert.match(unknown.join("\n"), /invalid track sizing/);
  assert.match(unknown.join("\n"), /anchor unresolved/);
  assert.match(unknown.join("\n"), /invalid gridColumn span/);
  assert.match(unknown.join("\n"), /unrecognized alignSelf/);
  const fixedHtml = renderDocument(doc, root).html;
  assert.doesNotMatch(fixedHtml, /display:grid|grid-template|grid-row:/);
  assert.match(fixedHtml, /left:100px/);
  assert.deepEqual(await fs.readFile(raw), before);
});

test("raw and ZIP generated React GRID matches independent CSS pixels through width/height resizing, text props and actual viewport changes", async (t) => {
  const { dir, raw, zip } = await fixture(t),
    original = await fs.readFile(raw);
  for (const [input, system, name] of [
    [raw, "raw-system", "raw-consumer"],
    [zip, "zip-system", "zip-consumer"],
  ]) {
    await importFig("design-system", input, path.join(dir, system));
    await consumer(dir, system, name);
  }
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
          ["tracks", "automatic"].map((id) =>
            page.locator(`#${id}>div`).screenshot(),
          ),
        ),
      );
    });
  }
  for (const name of ["raw-consumer", "zip-consumer"]) {
    await withPage(url + name + ".html", async (page) => {
      await page.locator('[data-figma-id="1:1"]').waitFor();
      for (const [index, state] of cases.entries()) {
        if (state.viewport)
          await page.setViewportSize({ width: state.viewport, height: 1000 });
        await page.evaluate((patch) => window.update(patch), {
          ...defaults,
          ...state,
        });
        await page.waitForTimeout(40);
        for (const [position, id] of ["tracks", "automatic"].entries())
          assert.deepEqual(
            await page.locator(`#${id}>div`).screenshot(),
            expected[index][position],
            `${name} state ${index} ${id}`,
          );
        if (index === 1) {
          assert.equal(
            await page
              .locator('[data-figma-id="1:1"]')
              .evaluate((el) => el.getBoundingClientRect().height),
            320,
          );
          assert.ok(
            (await page
              .locator('[data-figma-id="1:4"]')
              .evaluate((el) => el.getBoundingClientRect().height)) > 200,
          );
          assert.equal(
            await page.locator('[data-figma-id="1:3"]').textContent(),
            state.label,
          );
        }
      }
      if (process.env.CODEX_CAPTURE_FIGMA_GRID) {
        await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_GRID, {
          recursive: true,
        });
        await page.screenshot({
          path: path.join(process.env.CODEX_CAPTURE_FIGMA_GRID, name + ".png"),
          fullPage: true,
        });
      }
    });
  }
  assert.deepEqual(await fs.readFile(raw), original);
});

test("generated GRID survives copied review and responsive portable HTML/decoded PNG after deleting Figma and system sources", async (t) => {
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
  await fs.rm(raw);
  await fs.rm(zip);
  await fs.rm(system, { recursive: true });
  await fs.rm(path.join(dir, "portable-source.js"));
  await fs.rm(path.join(dir, "portable-source.jsx"));
  await fs.rm(path.join(dir, "portable-source.html"));
  const portable = await fs.readFile(path.join(dir, "portable.html"), "utf8");
  assert.doesNotMatch(portable, /src="portable-source.js"/);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await fs.writeFile(
    path.join(dir, "reference.html"),
    `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style>${reference()}</html>`,
  );
  const regions = [];
  await withPage(url + "reference.html", async (page) => {
    for (const id of ["tracks", "automatic"]) {
      const el = page.locator(`#${id}>div`);
      regions.push({
        png: (await el.screenshot()).toString("base64"),
        bounds: await el.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      });
    }
  });
  await withPage(url + "portable.html", async (page) => {
    await page.locator('[data-figma-id="1:1"]').waitFor();
    await page.getByRole("button", { name: "Responsive width" }).click();
    await page.setViewportSize({ width: 360, height: 1000 });
    await page.waitForTimeout(40);
    assert.equal(
      await page
        .locator('[data-figma-id="1:1"]')
        .evaluate((el) => el.getBoundingClientRect().width),
      312,
    );
    await page
      .getByRole("button", { name: "Change content and height" })
      .click();
    await page.waitForTimeout(40);
    assert.equal(
      await page
        .locator('[data-figma-id="1:1"]')
        .evaluate((el) => el.getBoundingClientRect().height),
      320,
    );
    assert.match(
      await page.locator('[data-figma-id="1:3"]').textContent(),
      /longer live title/,
    );
  });
  await withPage(
    url + "review.html",
    async (page) => {
      const card = page.locator('article[data-card-name="TrackLaboratory"]');
      await card.locator('[data-figma-id="1:1"]').waitFor();
      assert.equal(
        await card
          .locator('[data-figma-id="1:1"]')
          .evaluate((el) => getComputedStyle(el).display),
        "grid",
      );
      assert.equal(
        await card
          .locator('[data-figma-id="1:3"]')
          .evaluate((el) => getComputedStyle(el).gridColumn),
        "2 / span 2",
      );
      await page.evaluate(async () => {
        const { React, createRoot, Components } = window.CodexDesignSystem;
        const container = document.createElement("div");
        container.id = "live-grid-review";
        document.body.appendChild(container);
        createRoot(container).render(
          React.createElement(Components.TrackLaboratory, {
            label: "Copied review live title",
            style: { width: 300, height: 320 },
          }),
        );
      });
      await page.locator('#live-grid-review [data-figma-id="1:1"]').waitFor();
      assert.equal(
        await page
          .locator('#live-grid-review [data-figma-id="1:1"]')
          .evaluate((el) => el.getBoundingClientRect().width),
        300,
      );
      assert.equal(
        await page
          .locator('#live-grid-review [data-figma-id="1:3"]')
          .textContent(),
        "Copied review live title",
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
        const diffs = [];
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
          diffs.push(count);
        }
        return diffs;
      },
      { output, regions },
    );
    assert.deepEqual(differences, [0, 0], "portable decoded grid pixels");
  });
  if (process.env.CODEX_CAPTURE_FIGMA_GRID) {
    await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_GRID, { recursive: true });
    await fs.copyFile(
      path.join(dir, "portable.html"),
      path.join(process.env.CODEX_CAPTURE_FIGMA_GRID, "portable.html"),
    );
    await fs.copyFile(
      path.join(dir, "portable.png"),
      path.join(process.env.CODEX_CAPTURE_FIGMA_GRID, "portable.png"),
    );
    await fs.copyFile(
      path.join(dir, "review.html"),
      path.join(process.env.CODEX_CAPTURE_FIGMA_GRID, "review.html"),
    );
  }
});
