import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { compileSchema, parseSchema, encodeBinarySchema } from "kiwi-schema";
import { zipSync } from "fflate";
import { temporary } from "./helpers.mjs";
import { loadFig, select } from "../packages/figma/src/decode/document.mjs";
import {
  instanceSymbolId,
  resolveInstance,
} from "../packages/figma/src/render/instances.mjs";
import { importFig } from "../packages/cli/src/commands/figma.mjs";
import {
  compile,
  preview,
} from "../packages/cli/src/commands/design-system.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";
const identity = { m00: 1, m10: 0, m01: 0, m11: 1, m02: 0, m12: 0 };
const color = (r, g, b) => ({ r, g, b, a: 1 });
const white = color(1, 1, 1),
  red = color(1, 0, 0),
  blue = color(0, 0, 1),
  green = color(0, 1, 0);
const solid = (color) => ({ type: "SOLID", color });
const guid = (localID) => ({ sessionID: 1, localID });
const override = (ids, values) => ({
  guidPath: { guids: ids.map(guid) },
  ...values,
});
function fixtureBytes() {
  // Compile only this owned constant schema. Imported schemas are interpreted as data.
  const schema = parseSchema(`
    enum NodeType{DOCUMENT=0;SYMBOL=1;FRAME=2;INSTANCE=3;TEXT=4;ELLIPSE=5;VECTOR=6;}
    struct Guid{uint sessionID;uint localID;} struct Vec{float x;float y;}
    struct Parent{Guid guid;string position;} struct Color{float r;float g;float b;float a;}
    struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;}
    message Stop{float position=1;Color color=2;}
    message Paint{string type=1;Color color=2;Matrix transform=3;Stop[] stops=4;}
    message TextData{string characters=1;}
    message Font{string family=1;}
    message GuidPath{Guid[] guids=1;}
    message Value{bool boolValue=1;TextData textValue=2;Guid guidValue=3;}
    message Assignment{Guid defID=1;Value value=2;}
    message Ref{Guid defID=1;string componentPropNodeField=2;}
    message Override{GuidPath guidPath=1;Paint[] fillPaints=2;TextData textData=3;bool visible=4;float opacity=5;Matrix transform=6;Vec size=7;Guid overriddenSymbolID=8;Assignment[] componentPropAssignments=9;string blendMode=10;}
    message SymbolData{Guid symbolID=1;Override[] symbolOverrides=2;}
    message Geometry{uint commandsBlob=1;}
    message Blob{byte[] bytes=1;}
    message Node{Guid guid=1;Parent parentIndex=2;NodeType type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;SymbolData symbolData=8;Override[] derivedSymbolData=9;Guid overriddenSymbolID=10;Assignment[] componentPropAssignments=11;Ref[] componentPropRefs=12;Guid overrideKey=13;TextData textData=14;float fontSize=15;Font fontName=16;float opacity=17;bool visible=18;string blendMode=19;bool mask=20;Geometry[] fillGeometry=21;}
    message Message{Node[] nodeChanges=1;Blob[] blobs=2;}
  `);
  const node = (id, parent, type, x, y, size, extra = {}) => ({
    guid: guid(id),
    parentIndex: { guid: guid(parent), position: String(id).padStart(3, "0") },
    type,
    name: "Instance fixture " + id,
    transform: { ...identity, m02: x, m12: y },
    size: { x: size[0], y: size[1] },
    ...extra,
  });
  const gradient = (a, b) => ({
    type: "GRADIENT_LINEAR",
    transform: identity,
    stops: [
      { position: 0, color: a },
      { position: 1, color: b },
    ],
  });
  const nodes = [
    { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Document" },
    node(1, 0, "SYMBOL", 0, 0, [660, 360], {
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "a" },
      name: "Instance laboratory",
      fillPaints: [solid(white)],
    }),
    node(2, 1, "INSTANCE", 20, 20, [140, 100], {
      symbolData: {
        symbolID: guid(10),
        symbolOverrides: [
          override([], { fillPaints: [solid(blue)] }),
          override([10], { fillPaints: [solid(red)] }),
          override([11], { textData: { characters: "Earlier" } }),
          override([11], { textData: { characters: "Local" }, opacity: 0.5 }),
          override([120], {
            fillPaints: [solid(red)],
            transform: { ...identity, m02: 15, m12: 45 },
          }),
          override([14, 31], { fillPaints: [solid(green)] }),
          override([31], { fillPaints: [solid(blue)] }),
        ],
      },
      derivedSymbolData: [
        override([11], { textData: { characters: "Derived" }, opacity: 1 }),
      ],
      fillPaints: [solid(white)],
      componentPropAssignments: [
        { defID: guid(200), value: { textValue: { characters: "Assigned" } } },
        { defID: guid(201), value: { boolValue: false } },
        { defID: guid(202), value: { guidValue: guid(30) } },
      ],
    }),
    node(3, 1, "INSTANCE", 200, 20, [120, 80], {
      symbolData: { symbolID: guid(10) },
    }),
    node(4, 1, "INSTANCE", 380, 20, [100, 80], {
      symbolData: { symbolID: guid(10) },
      overriddenSymbolID: guid(40),
    }),
    node(5, 1, "INSTANCE", 20, 160, [120, 80], {
      symbolData: { symbolID: guid(10) },
      overriddenSymbolID: { sessionID: 4294967295, localID: 4294967295 },
    }),
    node(6, 1, "INSTANCE", 200, 160, [80, 80], {
      symbolData: { symbolID: guid(10) },
    }),
    node(60, 6, "FRAME", 5, 5, [50, 50], {
      fillPaints: [solid(color(1, 0, 1))],
    }),
    node(7, 1, "INSTANCE", 380, 160, [80, 40], {
      symbolData: {
        symbolID: guid(50),
        symbolOverrides: [
          override([51, 21], { transform: { ...identity, m02: 8 } }),
          override([52, 21], { transform: { ...identity, m02: -8 } }),
          override([51, 22], { fillPaints: [gradient(red, blue)] }),
          override([52, 22], { fillPaints: [gradient(green, color(1, 1, 0))] }),
        ],
      },
    }),
    node(10, 0, "SYMBOL", 0, 0, [120, 80], {
      name: "Local master",
      fillPaints: [solid(white)],
    }),
    node(11, 10, "TEXT", 10, 10, [100, 24], {
      textData: { characters: "Default" },
      fontSize: 16,
      fontName: { family: "Arial" },
      fillPaints: [solid(color(0, 0, 0))],
      componentPropRefs: [
        { defID: guid(200), componentPropNodeField: "TEXT_DATA" },
      ],
    }),
    node(12, 10, "FRAME", 10, 40, [20, 20], {
      overrideKey: guid(120),
      fillPaints: [solid(blue)],
    }),
    node(13, 10, "FRAME", 40, 40, [20, 20], {
      fillPaints: [solid(green)],
      componentPropRefs: [
        { defID: guid(201), componentPropNodeField: "VISIBLE" },
      ],
    }),
    node(14, 10, "INSTANCE", 70, 40, [30, 30], {
      symbolData: {
        symbolID: guid(20),
        symbolOverrides: [override([31], { fillPaints: [solid(red)] })],
      },
      componentPropRefs: [
        { defID: guid(202), componentPropNodeField: "OVERRIDDEN_SYMBOL_ID" },
      ],
    }),
    node(20, 0, "SYMBOL", 0, 0, [30, 30], { name: "Blue dot" }),
    node(21, 20, "ELLIPSE", 0, 0, [30, 30], { mask: true }),
    node(22, 20, "VECTOR", 0, 0, [30, 30], {
      fillPaints: [solid(blue)],
      fillGeometry: [{ commandsBlob: 0 }],
    }),
    node(30, 0, "SYMBOL", 0, 0, [30, 30], {
      name: "Swapped tile",
      opacity: 0.5,
      blendMode: "NORMAL",
    }),
    node(31, 30, "FRAME", 0, 0, [30, 30], { fillPaints: [solid(red)] }),
    node(50, 0, "SYMBOL", 0, 0, [80, 40], { name: "Paired masked dots" }),
    node(51, 50, "INSTANCE", 0, 0, [30, 30], {
      symbolData: { symbolID: guid(20) },
    }),
    node(52, 50, "INSTANCE", 40, 0, [30, 30], {
      symbolData: { symbolID: guid(20) },
    }),
    node(40, 0, "SYMBOL", 0, 0, [100, 80], {
      name: "Alternate master",
      fillPaints: [solid(white)],
    }),
    node(41, 40, "FRAME", 5, 5, [80, 60], { fillPaints: [solid(red)] }),
  ];
  const head = Buffer.alloc(12);
  head.write("fig-kiwi");
  head.writeUInt32LE(15, 8);
  const chunks = [
    deflateRawSync(encodeBinarySchema(schema)),
    deflateRawSync(
      compileSchema(schema).encodeMessage({
        nodeChanges: nodes,
        blobs: [
          {
            bytes: [
              1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 240, 65, 0, 0, 0, 0, 2, 0, 0,
              240, 65, 0, 0, 240, 65, 2, 0, 0, 0, 0, 0, 0, 240, 65, 0,
            ],
          },
        ],
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
    file = path.join(dir, "instances.fig"),
    raw = path.join(dir, "raw.fig"),
    data = fixtureBytes();
  await fs.writeFile(file, data.zip);
  await fs.writeFile(raw, data.raw);
  return { dir, file, raw };
}
const noFit = (html) =>
  html.replace(
    '<meta charset="utf-8">',
    '<meta charset="utf-8"><meta name="codex-fixed-sheet" content="off">',
  );
function reference() {
  const clipped = (x, y, cx, fill, key) => {
    const gradient = fill === "pair-red" || fill === "pair-green";
    const paint = gradient
      ? `<svg width="30" height="30"><defs><linearGradient id="${key}-colors" gradientUnits="userSpaceOnUse" x1="0" y1="15" x2="30" y2="15"><stop offset="0" stop-color="${fill === "pair-red" ? "red" : "lime"}"/><stop offset="1" stop-color="${fill === "pair-red" ? "blue" : "yellow"}"/></linearGradient></defs><rect width="30" height="30" fill="url(#${key}-colors)"/></svg>`
      : "";
    return `<div style="position:absolute;left:${x}px;top:${y}px;width:30px;height:30px"><svg width="0" height="0" style="position:absolute"><defs><clipPath id="${key}" clipPathUnits="userSpaceOnUse"><ellipse cx="${cx}" cy="15" rx="15" ry="15"/></clipPath></defs></svg><div style="position:absolute;inset:0;clip-path:url(#${key});${gradient ? "" : "background:" + fill}">${paint}</div></div>`;
  };
  const master = (x, y, changed = false) =>
    `<div style="position:absolute;left:${x}px;top:${y}px;width:${changed ? 140 : 120}px;height:${changed ? 100 : 80}px;background:white"><div style="position:absolute;left:10px;top:10px;width:100px;height:24px;font:16px Arial;white-space:pre-wrap">${changed ? "Assigned" : "Default"}</div><div style="position:absolute;left:${changed ? 15 : 10}px;top:${changed ? 45 : 40}px;width:20px;height:20px;background:${changed ? "red" : "blue"}"></div>${changed ? "" : '<div style="position:absolute;left:40px;top:40px;width:20px;height:20px;background:lime"></div>'}${changed ? '<div style="position:absolute;left:70px;top:40px;width:30px;height:30px;background:lime;opacity:.5"></div>' : clipped(70, 40, 15, "blue", `dot-${x}-${y}`)}</div>`;
  return (
    '<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>body{margin:24px;background:#edf0f4}#board{position:relative;width:660px;height:360px;background:white}</style><div id="board">' +
    master(20, 20, true) +
    master(200, 20) +
    '<div style="position:absolute;left:385px;top:25px;width:80px;height:60px;background:red"></div>' +
    master(20, 160) +
    '<div style="position:absolute;left:205px;top:165px;width:50px;height:50px;background:magenta"></div>' +
    clipped(380, 160, 23, "pair-red", "pair-a") +
    clipped(420, 160, 7, "pair-green", "pair-b") +
    "</div></html>"
  );
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

function assertNestedPaints(values) {
  assert.ok(
    values[0][2] > values[0][0] + 50 && values[0][1] === 0,
    "First nested master retains its red/blue gradient",
  );
  assert.ok(
    values[1][1] === 255 &&
      values[1][0] > 50 &&
      values[1][0] < 130 &&
      values[1][2] === 0,
    "Second nested master retains its independent green/yellow gradient",
  );
  assert.deepEqual(
    values.slice(2),
    [
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ],
    "Independent nested masks clip opposite sides",
  );
}
const nestedPoints = [
  [400, 175],
  [430, 175],
  [382, 175],
  [447, 175],
];

test("pure local instance expansion retains ordered path overrides, assignments, nested swaps and cloned data with missing/cycle/depth advisories", async (t) => {
  const { file } = await fixture(t),
    bytes = await fs.readFile(file),
    doc = await loadFig(file),
    before = JSON.stringify([...doc.nodes]),
    warnings = [];
  const original = select(doc, "1:2"),
    expanded = resolveInstance(doc, original, { warnings });
  assert.equal(warnings.length, 0);
  assert.equal(instanceSymbolId(original), "1:10");
  assert.equal(instanceSymbolId(select(doc, "1:4")), "1:40");
  assert.equal(instanceSymbolId(select(doc, "1:5")), "1:10");
  assert.equal(expanded.type, "FRAME");
  assert.deepEqual({ ...expanded.size }, { x: 140, y: 100 });
  assert.equal(expanded.transform.m02, 20);
  assert.equal(expanded.children[0].textData.characters, "Assigned");
  assert.equal(expanded.children[0].opacity, 1);
  assert.equal(expanded.children[1].transform.m02, 15);
  assert.equal(expanded.children[2].visible, false);
  assert.equal(expanded.instanceSymbol, "1:10");
  assert.equal(expanded.children[3].instanceSymbol, "1:30");
  assert.equal(expanded.children[3].opacity, 0.5);
  assert.equal(expanded.children[3].blendMode, "NORMAL");
  assert.equal(expanded.children[3].children[0].fillPaints[0].color.g, 1);
  expanded.children[0].textData.characters = "Mutated clone";
  assert.equal(JSON.stringify([...doc.nodes]), before);
  assert.deepEqual(await fs.readFile(file), bytes);
  const missing = structuredClone(original);
  missing.overriddenSymbolID = guid(999);
  assert.equal(resolveInstance(doc, missing, { warnings }), null);
  assert.match(warnings.join("\n"), /external or missing dependency/);
  const limited = resolveInstance(doc, original, { warnings, maxDepth: 0 });
  assert.equal(limited.children[3].type, "FRAME");
  assert.equal(limited.children[3].children.length, 0);
  assert.match(warnings.join("\n"), /depth exceeds 0/);
  const cyclic = structuredClone(doc.nodes.get("1:10"));
  cyclic.children.push({
    ...structuredClone(select(doc, "1:3")),
    guid: guid(90),
  });
  const cycleDoc = { ...doc, nodes: new Map(doc.nodes) };
  cycleDoc.nodes.set("1:10", cyclic);
  const result = resolveInstance(cycleDoc, select(doc, "1:3"), { warnings });
  assert.equal(result.children.at(-1).children.length, 0);
  assert.match(warnings.join("\n"), /symbol cycle/);
  const noData = { ...original, symbolData: undefined };
  assert.equal(resolveInstance(doc, noData, { warnings }), null);
  assert.match(warnings.join("\n"), /no symbolData/);
  assert.equal(JSON.stringify([...doc.nodes]), before);
});

test("raw and ZIP local instances with path overrides and assignments match independently authored CSS and preserve swapped alpha pixels", async (t) => {
  const { dir, file, raw } = await fixture(t);
  for (const [name, input] of [
    ["raw.html", raw],
    ["zip.html", file],
  ]) {
    await importFig("render", input, path.join(dir, name), "1:1");
    await fs.writeFile(
      path.join(dir, name),
      noFit(await fs.readFile(path.join(dir, name), "utf8")),
    );
  }
  await fs.writeFile(path.join(dir, "reference.html"), reference());
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  const expected = await withPage(url + "reference.html", (page) =>
    page.locator("#board").screenshot(),
  );
  for (const name of ["raw.html", "zip.html"])
    await withPage(url + name, async (page) => {
      const board = page.locator('[data-figma-id="1:1"]'),
        shot = await board.screenshot();
      if (process.env.CODEX_CAPTURE_FIGMA_INSTANCES) {
        await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_INSTANCES, {
          recursive: true,
        });
        await fs.writeFile(
          path.join(process.env.CODEX_CAPTURE_FIGMA_INSTANCES, name + ".png"),
          shot,
        );
        await fs.writeFile(
          path.join(process.env.CODEX_CAPTURE_FIGMA_INSTANCES, "reference.png"),
          expected,
        );
        await fs.copyFile(
          path.join(dir, name),
          path.join(process.env.CODEX_CAPTURE_FIGMA_INSTANCES, name),
        );
      }
      assert.deepEqual(shot, expected, name);
      const svgIds = await board
        .locator("svg [id]")
        .evaluateAll((nodes) => nodes.map((node) => node.id));
      assert.equal(
        new Set(svgIds).size,
        svgIds.length,
        "Nested saved geometry retains distinct SVG identifiers",
      );
      assert.equal(
        await board.getByText("Assigned", { exact: true }).count(),
        1,
      );
      assert.deepEqual(
        await pixels(page, shot, [
          [40, 70],
          [65, 65],
          [100, 70],
          [220, 70],
          [395, 35],
          [35, 210],
          [210, 170],
        ]),
        [
          [255, 0, 0, 255],
          [255, 255, 255, 255],
          [127, 255, 127, 255],
          [0, 0, 255, 255],
          [255, 0, 0, 255],
          [0, 0, 255, 255],
          [255, 0, 255, 255],
        ],
      );
      assertNestedPaints(await pixels(page, shot, nestedPoints));
    });
});

test("expanded local instances survive compiled review and portable HTML and PNG after deleting original Figma and materialized input", async (t) => {
  const { dir, file } = await fixture(t),
    material = path.join(dir, "material"),
    system = path.join(dir, "system");
  await importFig("materialize", file, material, "1:1");
  await fs.writeFile(
    path.join(material, "index.html"),
    noFit(await fs.readFile(path.join(material, "index.html"), "utf8")),
  );
  await importFig("design-system", file, system);
  await compile(system);
  await preview(system);
  const portable = path.join(dir, "portable.html");
  await exportArtifact("html", path.join(material, "index.html"), portable);
  await fs.rm(file);
  await fs.rm(material, { recursive: true });
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  for (const name of ["portable.html", "system/preview.html"])
    await withPage(url + name, async (page) => {
      const board = page.locator('[data-figma-id="1:1"]').first();
      await board.waitFor();
      const bounds = await board.boundingBox(),
        scale = bounds.width / 660,
        shot = await board.screenshot();
      assert.deepEqual(
        await pixels(
          page,
          shot,
          [
            [40, 70],
            [65, 65],
            [100, 70],
            [220, 70],
            [395, 35],
            [210, 170],
          ].map(([x, y]) => [Math.floor(x * scale), Math.floor(y * scale)]),
        ),
        [
          [255, 0, 0, 255],
          [255, 255, 255, 255],
          [127, 255, 127, 255],
          [0, 0, 255, 255],
          [255, 0, 0, 255],
          // Component synthesis follows the master, while raw HTML preserves saved instance children.
          name === "portable.html" ? [255, 0, 255, 255] : [255, 255, 255, 255],
        ],
        name,
      );
      assertNestedPaints(
        await pixels(
          page,
          shot,
          nestedPoints.map(([x, y]) => [
            Math.floor(x * scale),
            Math.floor(y * scale),
          ]),
        ),
      );
    });
  const png = path.join(dir, "portable.png");
  await exportArtifact("png", url + "portable.html", png);
  await withPage(url + "portable.html", async (page) => {
    assert.deepEqual(
      await pixels(page, await fs.readFile(png), [
        [64, 94],
        [124, 94],
        [419, 59],
        [234, 194],
      ]),
      [
        [255, 0, 0, 255],
        [127, 255, 127, 255],
        [255, 0, 0, 255],
        [255, 0, 255, 255],
      ],
    );
    assertNestedPaints(
      await pixels(
        page,
        await fs.readFile(png),
        nestedPoints.map(([x, y]) => [x + 24, y + 24]),
      ),
    );
  });
});
