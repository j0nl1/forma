import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { compileSchema, parseSchema, encodeBinarySchema } from "kiwi-schema";
import { zipSync } from "fflate";
import { temporary } from "./helpers.mjs";
import { loadFig } from "../packages/figma/src/decode/document.mjs";
import {
  iconComponent,
  isIconFont,
} from "../packages/figma/src/components/icons.mjs";
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
const rgb = (r, g, b) => ({ r, g, b, a: 1 });
function fixtureBytes() {
  // The compiled schema and glyph bytes below are independently authored constants.
  const schema = parseSchema(`
    enum NodeType{DOCUMENT=0;SYMBOL=1;TEXT=2;}
    struct Guid{uint sessionID;uint localID;}struct Vec{float x;float y;}struct Parent{Guid guid;string position;}
    struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;}struct Color{float r;float g;float b;float a;}
    message Paint{string type=1;Color color=2;bool visible=3;float opacity=4;}
    message Text{string characters=1;}message Font{string family=1;string style=2;}
    message Glyph{uint commandsBlob=1;Vec position=2;float fontSize=3;float rotation=4;}message Glyphs{Glyph[] glyphs=1;}
    message Initial{Text textValue=1;}message Def{Guid id=1;string name=2;string type=3;Initial initialValue=4;}
    message Ref{Guid defID=1;string componentPropNodeField=2;}
    message Blob{byte[] bytes=1;}
    message Node{Guid guid=1;Parent parentIndex=2;NodeType type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;Font fontName=8;Text textData=9;Glyphs derivedTextData=10;float fontSize=11;string stackMode=12;float stackSpacing=13;float stackHorizontalPadding=14;float stackVerticalPadding=15;string stackCounterAlignItems=16;float stackChildPrimaryGrow=17;Def[] componentPropDefs=18;Ref[] componentPropRefs=19;string textAutoResize=20;}
    message Message{Node[] nodeChanges=1;Blob[] blobs=2;}
  `);
  const node = (id, parent, type, w, h, extra = {}) => ({
    guid: guid(id),
    parentIndex: { guid: guid(parent), position: String(id).padStart(3, "0") },
    type,
    name: "Icon fixture " + id,
    size: { x: w, y: h },
    transform: matrix(),
    ...extra,
  });
  const glyph = {
    commandsBlob: 0,
    position: { x: 0, y: 24 },
    fontSize: 24,
    rotation: 0,
  };
  const nodes = [
    { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Document" },
    node(1, 0, "SYMBOL", 200, 40, {
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "a" },
      name: "Icon row",
      fillPaints: [{ type: "SOLID", color: rgb(1, 1, 1) }],
      stackMode: "HORIZONTAL",
      stackSpacing: 8,
      stackHorizontalPadding: 8,
      stackVerticalPadding: 8,
      stackCounterAlignItems: "CENTER",
      componentPropDefs: [
        {
          id: guid(90),
          name: "Label",
          type: "TEXT",
          initialValue: { textValue: { characters: "Bound" } },
        },
      ],
    }),
    node(2, 1, "TEXT", 24, 24, {
      fontName: { family: "Material Symbols" },
      textData: { characters: "triangle" },
      derivedTextData: { glyphs: [glyph] },
    }),
    node(3, 1, "TEXT", 24, 24, {
      fontName: { family: "Font Awesome" },
      textData: { characters: "rotated" },
      derivedTextData: {
        glyphs: [
          { ...glyph, position: { x: 24, y: 24 }, rotation: Math.PI / 2 },
        ],
      },
      fillPaints: [
        { type: "SOLID", color: rgb(1, 0, 0), visible: false },
        { type: "SOLID", color: rgb(0, 0, 1) },
        { type: "SOLID", color: rgb(0, 1, 0) },
      ],
    }),
    node(4, 1, "TEXT", 60, 24, {
      fontName: { family: "Material Icons" },
      fontSize: 16,
      textAutoResize: "NONE",
      textData: { characters: "Original" },
      derivedTextData: { glyphs: [glyph] },
      componentPropRefs: [
        { defID: guid(90), componentPropNodeField: "TEXT_DATA" },
      ],
      stackChildPrimaryGrow: 1,
    }),
    node(5, 1, "TEXT", 20, 24, {
      fontName: { family: "Material Icons" },
      fontSize: 16,
      textAutoResize: "NONE",
      textData: { characters: "F" },
      fillPaints: [{ type: "SOLID", color: rgb(0, 0, 1) }],
    }),
  ];
  const pathBytes = [
    1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 128, 63, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0,
    0, 128, 63, 0,
  ];
  const head = Buffer.alloc(12);
  head.write("fig-kiwi");
  head.writeUInt32LE(15, 8);
  const chunks = [
    deflateRawSync(encodeBinarySchema(schema)),
    deflateRawSync(
      compileSchema(schema).encodeMessage({
        nodeChanges: nodes,
        blobs: [{ bytes: pathBytes }],
      }),
    ),
  ];
  const raw = Buffer.concat([
    head,
    ...chunks.flatMap((bytes) => {
      const size = Buffer.alloc(4);
      size.writeUInt32LE(bytes.length);
      return [size, bytes];
    }),
  ]);
  return { raw, zip: zipSync({ "canvas.fig": raw }) };
}
async function fixture(t) {
  const dir = await temporary(t),
    raw = path.join(dir, "raw.fig"),
    zip = path.join(dir, "icons.fig"),
    data = fixtureBytes();
  await fs.writeFile(raw, data.raw);
  await fs.writeFile(zip, data.zip);
  return { dir, raw, zip };
}
const css =
  "*{box-sizing:border-box}body{margin:24px;background:white;font-family:Arial}";
async function consumer(dir, system, name) {
  await fs.writeFile(
    path.join(dir, name + ".jsx"),
    `import React from 'react';import {createRoot} from 'react-dom/client';import {IconRow} from './${system}/components/IconRow.jsx';const state={style:{width:200,height:40,color:'red'}};window.update=(patch)=>{Object.assign(state,patch);render()};const root=createRoot(document.getElementById('root'));function render(){root.render(<IconRow {...state}/>)}render();`,
  );
  await bundle(path.join(dir, name + ".jsx"), path.join(dir, name + ".js"));
  await fs.writeFile(
    path.join(dir, name + ".html"),
    `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style><div id="root"></div><script src="./${name}.js"></script></html>`,
  );
}
function reference(width, color, label) {
  return `<div id="reference" style="position:relative;display:flex;align-items:center;gap:8px;padding:8px;width:${width}px;height:40px;background:white;color:${color}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><path d="M0 0L1 0L0 1Z" transform="translate(0 24) scale(24 -24)" fill="currentColor"/></svg><svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;color:blue"><path d="M0 0L1 0L0 1Z" transform="translate(24 24) scale(24 -24) rotate(90)" fill="currentColor"/></svg><div style="height:24px;flex:1 1 0;min-width:0;font-family:'Material Icons',sans-serif;font-size:16px;font-weight:400;white-space:pre-wrap">${label}</div><div style="width:20px;height:24px;flex-shrink:0;font-family:'Material Icons',sans-serif;font-size:16px;font-weight:400;white-space:pre-wrap;color:blue">F</div></div>`;
}
async function pixels(page, shot, points) {
  return page.evaluate(
    async ({ png, points }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + png;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
    },
    { png: shot.toString("base64"), points },
  );
}

test("generated icon glyph helper retains finite saved geometry and currentColor while bound, ordinary or missing glyph text falls back without mutation", async (t) => {
  const { raw } = await fixture(t),
    doc = await loadFig(raw),
    before = await fs.readFile(raw),
    node = doc.nodes.get("1:2"),
    inputNodes = JSON.stringify([...doc.nodes]),
    warnings = [];
  assert.ok(isIconFont(node));
  const icon = iconComponent(doc, node, { warnings });
  assert.deepEqual(icon.style, {});
  assert.match(icon.markup, /width="24" height="24" viewBox="0 0 24 24"/);
  assert.match(icon.markup, /fill="currentColor"/);
  assert.doesNotMatch(icon.markup, /position:absolute|<div/);
  assert.equal(iconComponent(doc, node, { boundText: true }), null);
  assert.equal(
    iconComponent(doc, { ...node, fontName: { family: "Arial" } }),
    null,
  );
  assert.equal(
    iconComponent(doc, doc.nodes.get("1:3")).style.color,
    "rgba(0,0,255,1)",
  );
  assert.match(iconComponent(doc, doc.nodes.get("1:3")).markup, /rotate\(90\)/);
  assert.equal(iconComponent(doc, doc.nodes.get("1:5"), { warnings }), null);
  assert.match(warnings.join("\n"), /no saved glyph paths/);
  const invalid = structuredClone(node);
  invalid.derivedTextData.glyphs[0].position.x = Infinity;
  assert.equal(iconComponent(doc, invalid, { warnings }), null);
  assert.match(warnings.join("\n"), /unresolved geometry or placement/);
  invalid.derivedTextData.glyphs[0].position.x = 0;
  invalid.derivedTextData.glyphs[0].commandsBlob = 99;
  assert.equal(iconComponent(doc, invalid, { warnings }), null);
  const malformed = { ...doc, blobs: [{ bytes: [1, 0] }] };
  assert.equal(iconComponent(malformed, node, { warnings }), null);
  assert.match(warnings.join("\n"), /Truncated vector path/);
  assert.equal(
    iconComponent({ blobs: [{ bytes: [0, 0] }] }, node, { warnings }),
    null,
    "Close-only glyphs have no source-renderable path",
  );
  const precise = structuredClone(node);
  precise.size.x = 24.0625;
  precise.derivedTextData.glyphs[0].position = { x: -1.0625, y: 24.00001 };
  const roundingBytes = Buffer.alloc(9);
  roundingBytes[0] = 1;
  roundingBytes.writeFloatLE(-0.0625, 1);
  roundingBytes.writeFloatLE(0.12345679, 5);
  const rounded = iconComponent({ blobs: [{ bytes: roundingBytes }] }, precise);
  assert.match(rounded.markup, /width="24.063"/);
  assert.match(rounded.markup, /translate\(-1.063 24\)/);
  assert.match(rounded.markup, /d="M -0.063 0.123"/);
  assert.deepEqual(await fs.readFile(raw), before);
  assert.equal(JSON.stringify([...doc.nodes]), inputNodes);
});

test("raw and ZIP generated icon SVGs remain in responsive flex flow and match independent currentColor paths with live root style and literal text bindings", async (t) => {
  const { dir, raw, zip } = await fixture(t);
  for (const [name, input] of [
    ["raw", raw],
    ["zip", zip],
  ]) {
    await importFig("components", input, path.join(dir, name));
    await consumer(dir, name, name + "-consumer");
  }
  await fs.writeFile(
    path.join(dir, "reference.html"),
    `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${css}</style>${reference(200, "red", "Bound")}</html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  const expected = await withPage(url + "reference.html", (page) =>
    page.locator("#reference").screenshot(),
  );
  for (const name of ["raw", "zip"])
    await withPage(url + name + "-consumer.html", async (page) => {
      const row = page.locator('[data-figma-id="1:1"]');
      await row.waitFor();
      const shot = await row.screenshot();
      if (process.env.CODEX_CAPTURE_COMPONENT_ICONS) {
        await fs.mkdir(process.env.CODEX_CAPTURE_COMPONENT_ICONS, {
          recursive: true,
        });
        await fs.writeFile(
          path.join(process.env.CODEX_CAPTURE_COMPONENT_ICONS, name + ".png"),
          shot,
        );
        await fs.writeFile(
          path.join(process.env.CODEX_CAPTURE_COMPONENT_ICONS, "reference.png"),
          expected,
        );
      }
      assert.deepEqual(shot, expected, name);
      assert.equal(await row.locator("svg").count(), 2);
      assert.equal(await row.getByText("Bound", { exact: true }).count(), 1);
      assert.equal(await row.locator('[data-figma-id="1:4"] svg').count(), 0);
      assert.deepEqual(
        await pixels(page, shot, [
          [12, 24],
          [56, 24],
        ]),
        [
          [255, 0, 0, 255],
          [0, 0, 255, 255],
        ],
      );
      const before = await row.locator('[data-figma-id="1:5"]').boundingBox();
      await page.evaluate(() =>
        window.update({
          label: "Updated",
          style: { width: 320, height: 40, color: "lime" },
        }),
      );
      await row.getByText("Updated", { exact: true }).waitFor();
      const after = await row.locator('[data-figma-id="1:5"]').boundingBox();
      assert.equal(Math.round(after.x - before.x), 120);
      const changed = await row.screenshot();
      assert.deepEqual(
        await pixels(page, changed, [
          [12, 24],
          [56, 24],
        ]),
        [
          [0, 255, 0, 255],
          [0, 0, 255, 255],
        ],
      );
    });
});

test("flow icon glyphs retain currentColor, literal bindings and copied reviews and portable PNG after generated systems and Figma sources are deleted", async (t) => {
  const { dir, raw, zip } = await fixture(t),
    system = path.join(dir, "system");
  await importFig("design-system", zip, system);
  await compile(system);
  await preview(system);
  await consumer(dir, "system", "consumer");
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  await fs.rm(raw);
  await fs.rm(zip);
  await withPage(url + "system/preview.html", async (page) => {
    const row = page.locator('[data-figma-id="1:1"]').first();
    await row.waitFor();
    assert.equal(await row.locator("svg").count(), 2);
    const icon = row.locator('[data-figma-id="1:2"]');
    assert.notEqual(
      await icon.evaluate((node) => getComputedStyle(node).position),
      "absolute",
    );
    const inherited = await icon.evaluate(
      (node) => getComputedStyle(node).color,
    );
    const expectedColor = await page.evaluate((color) => {
      const canvas = document.createElement("canvas"),
        ctx = canvas.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    }, inherited);
    assert.deepEqual(
      await pixels(page, await icon.screenshot(), [[4, 16]]),
      [expectedColor],
      "Copied review icon follows its actual inherited currentColor",
    );
    assert.deepEqual(
      await pixels(
        page,
        await row.locator('[data-figma-id="1:3"]').screenshot(),
        [[16, 16]],
      ),
      [[0, 0, 255, 255]],
      "Copied review icon retains first visible solid color",
    );
  });
  const portable = path.join(dir, "portable.html");
  await exportArtifact("html", path.join(dir, "consumer.html"), portable);
  await fs.rm(system, { recursive: true });
  await fs.rm(path.join(dir, "consumer.js"));
  await withPage(url + "portable.html", async (page) => {
    const row = page.locator('[data-figma-id="1:1"]');
    await row.waitFor();
    assert.equal(await row.locator("svg").count(), 2);
    assert.deepEqual(
      await pixels(page, await row.screenshot(), [
        [12, 24],
        [56, 24],
      ]),
      [
        [255, 0, 0, 255],
        [0, 0, 255, 255],
      ],
    );
    await page.evaluate(() =>
      window.update({
        label: "Portable update",
        style: { width: 320, height: 40, color: "lime" },
      }),
    );
    await row.getByText("Portable update", { exact: true }).waitFor();
    assert.deepEqual(
      await pixels(page, await row.screenshot(), [
        [12, 24],
        [56, 24],
      ]),
      [
        [0, 255, 0, 255],
        [0, 0, 255, 255],
      ],
    );
  });
  const png = path.join(dir, "portable.png");
  await exportArtifact("png", url + "portable.html", png);
  await withPage(url + "portable.html", async (page) =>
    assert.deepEqual(
      await pixels(page, await fs.readFile(png), [
        [36, 48],
        [80, 48],
      ]),
      [
        [255, 0, 0, 255],
        [0, 0, 255, 255],
      ],
    ),
  );
});
