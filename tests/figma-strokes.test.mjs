import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { compileSchema, parseSchema, encodeBinarySchema } from "kiwi-schema";
import { zipSync } from "fflate";
import { temporary } from "./helpers.mjs";
import {
  loadFig,
  select,
  renderDocument,
  extractedTokens,
} from "../skills/studio-design/scripts/lib/figma.mjs";
import { importFig } from "../skills/studio-design/scripts/figma.mjs";
import {
  compile,
  preview,
} from "../skills/studio-design/scripts/design-system.mjs";
import { serve } from "../skills/studio-design/scripts/preview.mjs";
import { withPage } from "../skills/studio-design/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/studio-design/scripts/export.mjs";

const white = { r: 1, g: 1, b: 1, a: 1 },
  red = { r: 1, g: 0, b: 0, a: 1 },
  blue = { r: 0, g: 0, b: 1, a: 1 },
  green = { r: 0, g: 1, b: 0, a: 1 },
  yellow = { r: 1, g: 1, b: 0, a: 1 };
const solid = (color, extra = {}) => ({ type: "SOLID", color, ...extra });
const identity = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
const ringD =
  "M -6 -6 L 106 -6 L 106 86 L -6 86 Z M 6 6 L 94 6 L 94 74 L 6 74 Z";
function pathBytes(commands) {
  const chunks = [];
  for (const [code, ...values] of commands) {
    const bytes = Buffer.alloc(1 + 4 * values.length);
    bytes[0] = code;
    values.forEach((value, i) => bytes.writeFloatLE(value, 1 + 4 * i));
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
function fixtureBytes() {
  // Compile this independently authored constant schema only; imported schemas remain data.
  const schema = parseSchema(`
    enum NodeType{DOCUMENT=0;SYMBOL=1;FRAME=2;VECTOR=3;LINE=4;TEXT=5;}
    enum PaintType{SOLID=0;GRADIENT_LINEAR=1;IMAGE=2;VIDEO=3;}
    struct Guid{uint sessionID;uint localID;} struct Vec{float x;float y;}
    struct Color{float r;float g;float b;float a;} struct Parent{Guid guid;string position;}
    struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;}
    struct Stop{float position;Color color;}
    message Paint{PaintType type=1;Color color=2;float opacity=3;bool visible=4;Matrix transform=5;Stop[] stops=6;}
    message Geometry{uint commandsBlob=1;string windingRule=2;}
    message Effect{string type=1;Color color=2;Vec offset=3;float radius=4;float spread=5;}
    message Blob{byte[] bytes=1;}
    message Node{Guid guid=1;Parent parentIndex=2;NodeType type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;Paint[] strokePaints=8;float strokeWeight=9;string strokeAlign=10;Geometry[] fillGeometry=11;Geometry[] strokeGeometry=12;bool borderStrokeWeightsIndependent=13;float borderTopWeight=14;float borderRightWeight=15;float borderBottomWeight=16;float borderLeftWeight=17;bool bordersTakeSpace=18;float[] dashPattern=19;float cornerRadius=20;Effect[] effects=21;string characters=22;}
    message Message{Node[] nodeChanges=1;Blob[] blobs=2;}
  `);
  const guid = (localID) => ({ sessionID: 1, localID });
  const node = (id, name, x, y, extra = {}) => ({
    guid: guid(id),
    parentIndex: { guid: guid(1), position: String(id).padStart(3, "0") },
    type: "FRAME",
    name,
    size: { x: 100, y: 70 },
    transform: { ...identity, m02: x, m12: y },
    fillPaints: [solid(blue)],
    strokePaints: [solid(red)],
    strokeWeight: 8,
    ...extra,
  });
  const vector = (id, align, x) =>
    node(id, align + " vector", x, 290, {
      type: "VECTOR",
      size: { x: 100, y: 80 },
      strokeAlign: align,
      strokeWeight: 12,
      fillGeometry: [{ commandsBlob: 0 }],
      strokeGeometry: [{ commandsBlob: 1, windingRule: "ODD" }],
    });
  const nodes = [
    { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Document" },
    {
      guid: guid(1),
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "a" },
      type: "SYMBOL",
      name: "Stroke laboratory",
      size: { x: 900, y: 540 },
      fillPaints: [solid(white)],
    },
    node(2, "Inside border and effects", 30, 30, {
      strokeAlign: "INSIDE",
      cornerRadius: 12,
      effects: [
        {
          type: "DROP_SHADOW",
          color: green,
          offset: { x: 0, y: 15 },
          radius: 4,
          spread: 2,
        },
        {
          type: "INNER_SHADOW",
          color: yellow,
          offset: { x: 3, y: 0 },
          radius: 0,
        },
      ],
    }),
    node(3, "Outside border", 180, 30, {
      strokeAlign: "OUTSIDE",
      cornerRadius: 14,
    }),
    node(4, "Centered border", 330, 30, {
      strokeAlign: "CENTER",
      cornerRadius: 10,
    }),
    node(5, "Inside dash", 480, 30, {
      strokeAlign: "INSIDE",
      strokeWeight: 6,
      dashPattern: [9, 3],
    }),
    node(6, "Centered dash", 610, 30, {
      strokeAlign: "CENTER",
      strokeWeight: 6,
      dashPattern: [9, 3],
    }),
    node(7, "Outside dash", 740, 30, {
      strokeAlign: "OUTSIDE",
      strokeWeight: 6,
      dashPattern: [9, 3],
    }),
    node(8, "Independent widths", 30, 170, {
      fillPaints: [solid(white)],
      borderStrokeWeightsIndependent: true,
      borderTopWeight: 3,
      borderRightWeight: 5,
      borderBottomWeight: 7,
      borderLeftWeight: 0,
    }),
    node(9, "Space-taking widths", 180, 170, {
      fillPaints: [solid(white)],
      borderStrokeWeightsIndependent: true,
      bordersTakeSpace: true,
      borderTopWeight: 5,
      borderRightWeight: 8,
      borderBottomWeight: 4,
      borderLeftWeight: 2,
    }),
    node(10, "Last visible solid", 330, 170, {
      fillPaints: [solid(white)],
      strokePaints: [
        solid(red),
        solid({ ...blue, a: 0.5 }, { opacity: 0.5 }),
        solid({ r: 1, g: 0, b: 1, a: 1 }, { visible: false }),
        { type: "IMAGE" },
      ],
    }),
    vector(11, "INSIDE", 30),
    vector(12, "OUTSIDE", 180),
    vector(13, "CENTER", 330),
    node(14, "Stroke-only alpha layers", 480, 290, {
      type: "VECTOR",
      size: { x: 100, y: 80 },
      fillPaints: [],
      strokeGeometry: [{ commandsBlob: 1, windingRule: "ODD" }],
      strokePaints: [
        solid(red, { opacity: 0.5 }),
        solid(blue, { opacity: 0.5 }),
        solid(yellow, { visible: false }),
      ],
    }),
    node(15, "Gradient contour", 650, 290, {
      type: "VECTOR",
      size: { x: 100, y: 80 },
      fillPaints: [],
      strokeGeometry: [{ commandsBlob: 1, windingRule: "ODD" }],
      strokePaints: [
        {
          type: "GRADIENT_LINEAR",
          transform: identity,
          opacity: 0.5,
          stops: [
            { position: 0, color: { ...green, a: 0.5 } },
            { position: 1, color: blue },
          ],
        },
      ],
    }),
    node(16, "Zero-height line", 30, 440, {
      type: "LINE",
      size: { x: 100, y: 0 },
      fillPaints: [],
      strokeGeometry: [{ commandsBlob: 2 }],
      strokePaints: [solid(red)],
      effects: [
        {
          type: "DROP_SHADOW",
          color: green,
          offset: { x: 0, y: 10 },
          radius: 0,
        },
      ],
    }),
    node(17, "Curved resolved outline", 180, 420, {
      type: "VECTOR",
      size: { x: 100, y: 80 },
      fillPaints: [],
      strokeGeometry: [{ commandsBlob: 3 }],
      strokePaints: [solid(blue)],
    }),
    node(20, "Independent fill and stroke gradients", 330, 420, {
      type: "VECTOR",
      size: { x: 100, y: 80 },
      fillGeometry: [{ commandsBlob: 0 }],
      strokeGeometry: [{ commandsBlob: 1, windingRule: "ODD" }],
      fillPaints: [
        {
          type: "GRADIENT_LINEAR",
          transform: identity,
          stops: [
            { position: 0, color: red },
            { position: 1, color: blue },
          ],
        },
      ],
      strokePaints: [
        {
          type: "GRADIENT_LINEAR",
          transform: identity,
          stops: [
            { position: 0, color: green },
            { position: 1, color: yellow },
          ],
        },
      ],
    }),
    node(21, "Overlapping resolved outlines", 480, 420, {
      type: "VECTOR",
      size: { x: 100, y: 80 },
      fillPaints: [],
      strokeGeometry: [{ commandsBlob: 4 }, { commandsBlob: 5 }],
      strokePaints: [
        solid(red, { opacity: 0.5 }),
        solid(blue, { opacity: 0.5 }),
      ],
    }),
    node(18, "Inside child", 0, 0, {
      parentIndex: { guid: guid(8), position: "a" },
      size: { x: 14, y: 14 },
      fillPaints: [solid(blue)],
      strokePaints: [],
    }),
    node(19, "Space-taking child", 0, 0, {
      parentIndex: { guid: guid(9), position: "a" },
      size: { x: 14, y: 14 },
      fillPaints: [solid(blue)],
      strokePaints: [],
    }),
  ];
  const paths = [
    [[1, 0, 0], [2, 100, 0], [2, 100, 80], [2, 0, 80], [0]],
    [
      [1, -6, -6],
      [2, 106, -6],
      [2, 106, 86],
      [2, -6, 86],
      [0],
      [1, 6, 6],
      [2, 94, 6],
      [2, 94, 74],
      [2, 6, 74],
      [0],
    ],
    [[1, 0, -4], [2, 100, -4], [2, 100, 4], [2, 0, 4], [0]],
    [[1, 10, 40], [4, 10, 0, 90, 0, 90, 40], [3, 50, 80, 10, 40], [0]],
    [[1, 0, 0], [2, 65, 0], [2, 65, 40], [2, 0, 40], [0]],
    [[1, 35, 0], [2, 100, 0], [2, 100, 40], [2, 35, 40], [0]],
  ];
  const head = Buffer.alloc(12);
  head.write("fig-kiwi");
  head.writeUInt32LE(15, 8);
  const chunks = [
    deflateRawSync(encodeBinarySchema(schema)),
    deflateRawSync(
      compileSchema(schema).encodeMessage({
        nodeChanges: nodes,
        blobs: paths.map((commands) => ({ bytes: [...pathBytes(commands)] })),
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
    file = path.join(dir, "strokes.fig"),
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
async function pixels(page, png, points) {
  return page.evaluate(
    async ({ png, points }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + png;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
    },
    { png: png.toString("base64"), points },
  );
}
function reference() {
  const positions = {
    2: [30, 30],
    3: [180, 30],
    4: [330, 30],
    5: [480, 30],
    6: [610, 30],
    7: [740, 30],
    8: [30, 170],
    9: [180, 170],
    10: [330, 170],
  };
  const css = {
    2: "border-radius:12px;box-shadow:inset 0 0 0 8px red,inset 3px 0 0 0 yellow,0 15px 4px 2px lime",
    3: "border-radius:14px;box-shadow:0 0 0 8px red",
    4: "border-radius:10px;box-shadow:inset 0 0 0 4px red,0 0 0 4px red",
    5: "outline:6px dashed red;outline-offset:-6px",
    6: "outline:6px dashed red;outline-offset:-3px",
    7: "outline:6px dashed red;outline-offset:0px",
    8: "background:white;border-top:3px solid red;border-right:5px solid red;border-bottom:7px solid red",
    9: "background:white;border-top:5px solid red;border-right:8px solid red;border-bottom:4px solid red;border-left:2px solid red",
    10: "background:white;box-shadow:inset 0 0 0 8px rgba(0,0,255,.25)",
  };
  let content = Object.entries(css)
    .map(
      ([id, style]) =>
        `<div style="position:absolute;left:${positions[id][0]}px;top:${positions[id][1]}px;width:100px;height:70px;box-sizing:border-box;background:blue;${style}">${["8", "9"].includes(id) ? '<div style="position:absolute;left:0;top:0;width:14px;height:14px;background:blue"></div>' : ""}</div>`,
    )
    .join("");
  for (const [id, x] of [
    [11, 30],
    [12, 180],
    [13, 330],
  ])
    content += `<div style="position:absolute;left:${x}px;top:290px;width:100px;height:80px"><svg width="100" height="80" style="position:absolute;overflow:visible"><defs><clipPath id="inside-${id}"><rect width="100" height="80"/></clipPath><mask id="outside-${id}" maskUnits="userSpaceOnUse" x="-50" y="-40" width="200" height="160"><rect x="-50" y="-40" width="200" height="160" fill="white"/><rect width="100" height="80" fill="black"/></mask></defs><rect width="100" height="80" fill="blue"/><path d="${ringD}" fill="red" fill-rule="evenodd" ${id === 11 ? `clip-path="url(#inside-${id})"` : id === 12 ? `mask="url(#outside-${id})"` : ""}/></svg></div>`;
  content +=
    '<svg width="100" height="80" style="position:absolute;left:180px;top:420px;overflow:visible"><path d="M 10 40 C 10 0 90 0 90 40 Q 50 80 10 40 Z" fill="blue"/></svg>';
  content += `<svg width="100" height="80" style="position:absolute;left:330px;top:420px;overflow:visible"><defs><linearGradient id="fill-colors" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="100" y2="40"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><linearGradient id="stroke-colors" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="100" y2="40"><stop offset="0" stop-color="lime"/><stop offset="1" stop-color="yellow"/></linearGradient></defs><rect width="100" height="80" fill="url(#fill-colors)"/><path d="${ringD}" fill="url(#stroke-colors)" fill-rule="evenodd"/></svg>`;
  content +=
    '<svg width="100" height="80" style="position:absolute;left:480px;top:420px;overflow:visible"><rect width="65" height="40" fill="rgba(255,0,0,.5)"/><rect width="65" height="40" fill="rgba(0,0,255,.5)"/><rect x="35" width="65" height="40" fill="rgba(255,0,0,.5)"/><rect x="35" width="65" height="40" fill="rgba(0,0,255,.5)"/></svg>';
  return (
    '<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>body{margin:24px;background:#edf0f4}#board{position:relative;width:900px;height:540px;background:white}</style><div id="board">' +
    content +
    "</div></html>"
  );
}

test("offline stroke inventory keeps source bytes, visible stroke colors and path rules and reports missing or unsupported stroke inputs", async (t) => {
  const { file } = await fixture(t),
    before = await fs.readFile(file),
    doc = await loadFig(file);
  const rendered = renderDocument(doc, select(doc, "1:1"));
  assert.match(rendered.html, /box-shadow:inset 0 0 0 8px/);
  assert.match(rendered.html, /fill-rule="evenodd"/);
  assert.match(rendered.html, /<mask/);
  assert.match(renderDocument(doc, select(doc, "1:14")).html, /<svg/);
  assert.ok(Object.values(extractedTokens(doc)).includes("rgba(0,255,0,0.25)"));
  assert.ok(!Object.values(extractedTokens(doc)).includes("rgba(255,0,255,1)"));
  assert.deepEqual(await fs.readFile(file), before);
  assert.ok(rendered.warnings.some((w) => /independent.*children/i.test(w)));
  assert.ok(rendered.warnings.some((w) => /dash.*approximation/i.test(w)));
  const only = select(doc, "1:14");
  only.strokePaints = [{ type: "VIDEO" }, { type: "VIDEO", visible: false }];
  assert.equal(
    renderDocument(doc, only).warnings.filter((w) => /VIDEO/.test(w)).length,
    1,
  );
  only.strokePaints = [solid(red)];
  only.strokeGeometry = [{ commandsBlob: 900 }];
  assert.match(
    renderDocument(doc, only).warnings.join("\n"),
    /stroke.*missing.*blob/i,
  );
  only.strokeGeometry = [{ commandsBlob: 0 }];
  doc.blobs[0] = { bytes: [1, 0] };
  assert.match(
    renderDocument(doc, only).warnings.join("\n"),
    /Truncated vector path/,
  );
  doc.blobs[0] = { bytes: [...pathBytes([[1, NaN, 0]])] };
  assert.match(
    renderDocument(doc, only).warnings.join("\n"),
    /Non-finite vector coordinate/,
  );
  const box = select(doc, "1:10");
  box.strokePaints = [solid(blue)];
  box.strokeAlign = "unknown";
  assert.match(
    renderDocument(doc, box).warnings.join("\n"),
    /unsupported stroke alignment/,
  );
  box.strokeWeight = -2;
  assert.match(
    renderDocument(doc, box).warnings.join("\n"),
    /invalid stroke weight/,
  );
  only.type = "TEXT";
  assert.match(
    renderDocument(doc, only).warnings.join("\n"),
    /resolved glyph geometry/,
  );
  only.type = "VECTOR";
  only.strokePaints = [{ type: "SOLID" }];
  assert.ok(!Object.values(extractedTokens(doc)).includes("rgba(0,0,0,1)"));
  only.strokePaints = {};
  assert.match(
    renderDocument(doc, only).warnings.join("\n"),
    /stroke paints must be an array/,
  );
  assert.deepEqual(await fs.readFile(file), before);
});

test("raw/ZIP border shadows, dash alignment, independent sides and masked vector outlines match independent CSS/SVG and preserve alpha and zero-height line pixels", async (t) => {
  const { dir, file, raw } = await fixture(t);
  for (const [name, source] of [
    ["raw.html", raw],
    ["zip.html", file],
  ]) {
    await importFig("render", source, path.join(dir, name), "1:1");
    await fs.writeFile(
      path.join(dir, name),
      noFit(await fs.readFile(path.join(dir, name), "utf8")),
    );
  }
  await fs.writeFile(path.join(dir, "reference.html"), reference());
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  const regions = [
    [30, 30],
    [180, 30],
    [330, 30],
    [480, 30],
    [610, 30],
    [740, 30],
    [30, 170],
    [180, 170],
    [330, 170],
    [30, 290],
    [180, 290],
    [330, 290],
    [180, 420],
    [330, 420],
    [480, 420],
  ];
  const referenceShots = await withPage(
    url + "reference.html",
    async (page) => {
      const shots = [];
      for (const [x, y] of regions)
        shots.push(
          await page.screenshot({
            clip: { x: 24 + x - 15, y: 24 + y - 15, width: 130, height: 115 },
          }),
        );
      return shots;
    },
  );
  let rawShot;
  for (const name of ["raw.html", "zip.html"])
    await withPage(url + name, async (page) => {
      for (const [i, [x, y]] of regions.entries())
        assert.deepEqual(
          await page.screenshot({
            clip: { x: 24 + x - 15, y: 24 + y - 15, width: 130, height: 115 },
          }),
          referenceShots[i],
          "Border/outline pixels at " + [x, y] + " in " + name,
        );
      const shot = await page.locator('[data-figma-id="1:1"]').screenshot();
      if (rawShot) assert.deepEqual(shot, rawShot);
      else rawShot = shot;
      const data = await pixels(page, shot, [
        [482, 330],
        [530, 330],
        [654, 294],
        [744, 294],
        [31, 438],
        [31, 448],
        [31, 455],
      ]);
      for (const [actual, value] of data[0].entries())
        assert.ok(
          Math.abs(value - [128, 64, 192, 255][actual]) <= 1,
          "Stroke layers retain alpha",
        );
      assert.deepEqual(
        data[1],
        [255, 255, 255, 255],
        "ODD winding retains the contour hole",
      );
      assert.ok(
        data[2][1] > data[2][2] + 35 && data[3][2] > data[3][1] + 75,
        "Gradient stroke follows node coordinates and paint alpha",
      );
      assert.deepEqual(
        data[4],
        [255, 0, 0, 255],
        "Zero-height line retains the resolved outline",
      );
      assert.deepEqual(
        data[5],
        [0, 255, 0, 255],
        "Stroke-only line shadow uses painted alpha",
      );
      assert.deepEqual(data[6], [255, 255, 255, 255]);
      if (process.env.CODEX_CAPTURE_FIGMA_STROKES) {
        await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_STROKES, {
          recursive: true,
        });
        await fs.writeFile(
          path.join(process.env.CODEX_CAPTURE_FIGMA_STROKES, name + ".png"),
          shot,
        );
        await fs.copyFile(
          path.join(dir, name),
          path.join(process.env.CODEX_CAPTURE_FIGMA_STROKES, name),
        );
      }
    });
});

test("materialized borders, vector masks and gradient contours remain visible in copied reviews and real portable HTML/PNG after deleting Figma input", async (t) => {
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
      const inside = page.locator('[data-figma-id="1:11"]').first();
      await inside.waitFor();
      const shot = await inside.screenshot();
      const values = await pixels(page, shot, [
        [2, 40],
        [12, 40],
      ]);
      assert.deepEqual(
        values,
        [
          [255, 0, 0, 255],
          [0, 0, 255, 255],
        ],
        "Contained stroke masks remain live in reviews",
      );
      const gradient = page.locator('[data-figma-id="1:15"]').first();
      const colors = await pixels(page, await gradient.screenshot(), [
        [4, 4],
        [94, 4],
      ]);
      assert.ok(
        colors[0][1] > colors[0][2] + 35 && colors[1][2] > colors[1][1] + 75,
      );
    });
  const png = path.join(dir, "export.png");
  await exportArtifact("png", url + "portable.html", png);
  await withPage(url + "portable.html", async (page) => {
    const values = await pixels(page, await fs.readFile(png), [
      [24 + 32, 24 + 330],
      [24 + 182, 24 + 330],
      [24 + 31, 24 + 448],
    ]);
    assert.deepEqual(values, [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [0, 255, 0, 255],
    ]);
  });
});
