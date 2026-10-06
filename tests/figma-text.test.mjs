import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateRawSync, deflateSync } from "node:zlib";
import { compileSchema, parseSchema, encodeBinarySchema } from "kiwi-schema";
import { zipSync } from "fflate";
import { temporary } from "./helpers.mjs";
import {
  loadFig,
  select,
  renderDocument,
} from "../packages/figma/src/decode/document.mjs";
import { importFig } from "../packages/cli/src/commands/figma.mjs";
import {
  compile,
  preview,
} from "../packages/cli/src/commands/design-system.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";
const white = { r: 1, g: 1, b: 1, a: 1 },
  red = { r: 1, g: 0, b: 0, a: 1 },
  blue = { r: 0, g: 0, b: 1, a: 1 },
  green = { r: 0, g: 1, b: 0, a: 1 };
const solid = (color) => ({ type: "SOLID", color });
const identity = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
const gradient = {
  type: "GRADIENT_LINEAR",
  transform: identity,
  stops: [
    { position: 0, color: red },
    { position: 1, color: blue },
  ],
};
function pathBytes(commands) {
  return Buffer.concat(
    commands.map(([code, ...values]) => {
      const bytes = Buffer.alloc(1 + values.length * 4);
      bytes[0] = code;
      values.forEach((v, i) => bytes.writeFloatLE(v, 1 + i * 4));
      return bytes;
    }),
  );
}
function imageBytes() {
  const chunk = (type, payload) => {
    const name = Buffer.from(type),
      data = Buffer.concat([name, payload]);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const out = Buffer.alloc(payload.length + 12);
    out.writeUInt32BE(payload.length);
    name.copy(out, 4);
    payload.copy(out, 8);
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, payload.length + 8);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanline = Buffer.from([
    0, 255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255,
  ]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat([scanline, scanline]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
async function fixture(t) {
  const dir = await temporary(t, "figma-text-");
  // Only this owned constant schema is compiled; imported schemas remain interpreted data.
  const schema = parseSchema(`
    enum NodeType{DOCUMENT=0;SYMBOL=1;TEXT=2;FRAME=3;} enum PaintType{SOLID=0;GRADIENT_LINEAR=1;VIDEO=2;IMAGE=3;}
    struct Guid{uint sessionID;uint localID;} struct Vec{float x;float y;}
    struct Color{float r;float g;float b;float a;} struct Parent{Guid guid;string position;}
    struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;}
    struct Stop{float position;Color color;} struct ImageRef{byte[] hash;}
    message Paint{PaintType type=1;Color color=2;float opacity=3;bool visible=4;Matrix transform=5;Stop[] stops=6;ImageRef image=7;string imageScaleMode=8;float scale=9;float originalImageWidth=10;float originalImageHeight=11;}
    message Font{string family=1;string style=2;} message Metric{float value=1;string units=2;}
    message Glyph{uint commandsBlob=1;Vec position=2;float fontSize=3;float rotation=4;}
    message FontMeta{float fontWeight=1;string fontStyle=2;}
    message Derived{Glyph[] glyphs=1;FontMeta[] fontMetaData=2;Vec layoutSize=3;}
    message Variation{uint axisTag=1;float value=2;}
    message Style{uint styleID=1;Font fontName=2;float fontSize=3;Paint[] fillPaints=4;string textDecoration=5;string textCase=6;string fontVariantCaps=7;string fontVariantPosition=8;Variation[] fontVariations=9;string[] toggledOnOTFeatures=10;}
    message TextLine{string lineType=1;uint indentationLevel=2;} message Text{string characters=1;uint[] characterStyleIDs=2;Style[] styleOverrideTable=3;TextLine[] lines=4;}
    message Effect{string type=1;Color color=2;Vec offset=3;float radius=4;}
    message Blob{byte[] bytes=1;}
    message Node{Guid guid=1;Parent parentIndex=2;NodeType type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;Paint[] strokePaints=8;float strokeWeight=9;string strokeAlign=10;Text textData=11;Derived derivedTextData=12;Font fontName=13;float fontSize=14;float fontWeight=15;Metric lineHeight=16;Metric letterSpacing=17;string textAlignHorizontal=18;string textDecoration=19;string textCase=20;Effect[] effects=21;bool clipsContent=22;}
    message Message{Node[] nodeChanges=1;Blob[] blobs=2;}
  `);
  const guid = (localID) => ({ sessionID: 1, localID });
  const node = (id, x, y, extra = {}) => ({
    guid: guid(id),
    parentIndex: { guid: guid(1), position: String(id).padStart(3, "0") },
    type: "TEXT",
    name: `Text case ${id}`,
    size: { x: 180, y: 60 },
    transform: { ...identity, m02: x, m12: y },
    fontName: { family: "Arial", style: "Semi Bold Italic" },
    fontSize: 20,
    fillPaints: [solid(red)],
    textData: { characters: "Motion <&>\nsecond" },
    ...extra,
  });
  const glyph = (id, x, align, extra = {}) =>
    node(id, x, 200, {
      size: { x: 100, y: 80 },
      fontName: { family: "Unavailable Owned Font", style: "Regular" },
      textData: { characters: "Saved O" },
      derivedTextData: {
        glyphs: [{ commandsBlob: 0, position: { x: 10, y: 50 }, fontSize: 40 }],
      },
      fillPaints: [solid(blue)],
      strokePaints: [solid(red)],
      strokeWeight: 4,
      strokeAlign: align,
      ...extra,
    });
  const nodes = [
    { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Document" },
    {
      guid: guid(1),
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "a" },
      type: "SYMBOL",
      name: "Typography laboratory",
      size: { x: 700, y: 720 },
      fillPaints: [solid(white)],
    },
    node(2, 20, 20, {
      lineHeight: { value: 28, units: "PIXELS" },
      letterSpacing: { value: 5, units: "PERCENT" },
      textAlignHorizontal: "CENTER",
      textDecoration: "UNDERLINE",
    }),
    node(3, 240, 20, {
      fontName: { family: "Arial", style: "Light" },
      derivedTextData: {
        fontMetaData: [{ fontWeight: 800, fontStyle: "ITALIC" }],
      },
      lineHeight: { value: 150, units: "PERCENT" },
      letterSpacing: { value: -1, units: "PIXELS" },
      textAlignHorizontal: "RIGHT",
      textDecoration: "STRIKETHROUGH",
    }),
    node(4, 460, 20, {
      fontName: { family: "Arial", style: "Extra Light Oblique" },
      lineHeight: { value: 1.4, units: "RAW" },
      textCase: "UPPER",
    }),
    node(5, 20, 110, {
      fontName: { family: "Arial", style: "Regular" },
      textData: {
        characters: "ABC DEF",
        characterStyleIDs: [0, 0, 0, 0, 7, 7, 7],
        styleOverrideTable: [
          {
            styleID: 7,
            fontName: { family: "Arial", style: "Black Italic" },
            fontSize: 24,
            fillPaints: [solid(blue)],
            textDecoration: "UNDERLINE",
            textCase: "LOWER",
            fontVariations: [{ axisTag: 0x77676874, value: 725 }],
          },
        ],
      },
    }),
    glyph(6, 20, "OUTSIDE"),
    glyph(7, 160, "CENTER"),
    glyph(8, 300, "INSIDE"),
    glyph(9, 440, "CENTER", {
      fillPaints: [gradient],
      strokePaints: [
        {
          ...gradient,
          stops: [
            { position: 0, color: green },
            { position: 1, color: white },
          ],
        },
      ],
    }),
    glyph(10, 580, "CENTER", {
      strokePaints: [],
      derivedTextData: {
        glyphs: [
          {
            commandsBlob: 0,
            position: { x: 50, y: 50 },
            fontSize: 40,
            rotation: Math.PI / 2,
          },
        ],
      },
      effects: [
        {
          type: "DROP_SHADOW",
          color: green,
          offset: { x: 10, y: 0 },
          radius: 0,
        },
      ],
    }),
  ];
  for (const [id, x, mode] of [
    [11, 20, "FIT"],
    [12, 160, "TILE"],
    [13, 300, "CROP"],
  ])
    nodes.push(
      glyph(id, x, "CENTER", {
        transform: { ...identity, m02: x, m12: 290 },
        strokePaints: [],
        derivedTextData: {
          glyphs: [
            { commandsBlob: 0, position: { x: 10, y: 75 }, fontSize: 80 },
          ],
        },
        fillPaints: [
          {
            type: "IMAGE",
            image: { hash: [17, 34] },
            imageScaleMode: mode,
            opacity: mode === "FIT" ? 0.5 : 1,
            scale: 10,
            originalImageWidth: 4,
            originalImageHeight: 2,
            transform: { ...identity, m00: 0.5, m02: 0.5 },
          },
        ],
      }),
    );
  nodes.push(
    glyph(14, 440, "CENTER", {
      transform: { ...identity, m02: 440, m12: 290 },
      strokePaints: [],
      fillPaints: [],
    }),
  );
  nodes.push(
    glyph(15, 580, "CENTER", {
      transform: { ...identity, m02: 580, m12: 290 },
      strokePaints: [],
      fillPaints: [{ type: "IMAGE", image: { hash: [99] } }],
    }),
  );

  nodes.push(
    node(16, 240, 110, {
      type: "FRAME",
      size: { x: 100, y: 80 },
      fillPaints: [
        {
          type: "IMAGE",
          image: { hash: [17, 34] },
          imageScaleMode: "TILE",
          scale: 5,
          originalImageWidth: 4,
          originalImageHeight: 2,
        },
      ],
    }),
  );
  nodes.push(
    glyph(17, 240, "CENTER", {
      transform: { ...identity, m02: 240, m12: 110 },
      strokePaints: [],
      fillPaints: [{ ...solid(white), opacity: 0 }],
      derivedTextData: {
        glyphs: [{ commandsBlob: 0, position: { x: 10, y: 75 }, fontSize: 80 }],
      },
      effects: [{ type: "BACKGROUND_BLUR", radius: 6 }],
    }),
  );

  const richLines = [
    "Alpha",
    "Beta",
    "Gamma",
    "Delta",
    "Plain",
    "Reset",
    "Sub",
    "Caps",
  ];
  const richIds = richLines.flatMap((line, index) => [
    ...Array(line.length).fill([0, 7, 8, 9, 0, 0, 10, 11][index]),
    ...(index < richLines.length - 1 ? [0] : []),
  ]);
  nodes.push(
    node(18, 20, 400, {
      size: { x: 340, y: 280 },
      fontName: { family: "Arial", style: "Regular" },
      lineHeight: { value: 30, units: "PIXELS" },
      textData: {
        characters: richLines.join("\n"),
        characterStyleIDs: richIds,
        styleOverrideTable: [
          {
            styleID: 7,
            fontName: { family: "Arial", style: "Bold" },
            fillPaints: [solid(blue)],
            textDecoration: "UNDERLINE",
          },
          {
            styleID: 8,
            fillPaints: [solid(green)],
            textDecoration: "STRIKETHROUGH",
            textCase: "UPPER",
          },
          { styleID: 9, toggledOnOTFeatures: ["SUPS"] },
          { styleID: 10, fontVariantPosition: "SUB" },
          { styleID: 11, toggledOnOTFeatures: ["SMCP"] },
        ],
        lines: [
          { lineType: "ORDERED_LIST", indentationLevel: 1 },
          { lineType: "ORDERED_LIST", indentationLevel: 2 },
          { lineType: "UNORDERED_LIST", indentationLevel: 2 },
          { lineType: "ORDERED_LIST", indentationLevel: 1 },
          { lineType: "NONE" },
          { lineType: "ORDERED_LIST", indentationLevel: 1 },
          { lineType: "NONE" },
          { lineType: "NONE" },
        ],
      },
    }),
  );
  nodes.push(
    node(19, 400, 400, {
      size: { x: 260, y: 150 },
      fontName: { family: "Arial", style: "Regular" },
      lineHeight: { value: 30, units: "PIXELS" },
      textData: {
        characters: "One\nTwo\nPlain",
        lines: [
          { lineType: "UNORDERED_LIST", indentationLevel: 1 },
          { lineType: "ORDERED_LIST", indentationLevel: 3 },
          { lineType: "NONE" },
        ],
      },
    }),
  );
  // The square ring is a deliberately non-font outline: installed fonts cannot reproduce it.
  const blob = pathBytes([
    [1, 0.1, 0.1],
    [2, 0.9, 0.1],
    [2, 0.9, 0.9],
    [2, 0.1, 0.9],
    [0],
    [1, 0.35, 0.35],
    [2, 0.35, 0.65],
    [2, 0.65, 0.65],
    [2, 0.65, 0.35],
    [0],
  ]);
  const data = compileSchema(schema).encodeMessage({
    nodeChanges: nodes,
    blobs: [{ bytes: [...blob] }],
  });
  const header = Buffer.alloc(12);
  header.write("fig-kiwi");
  header.writeUInt32LE(14, 8);
  const chunks = [encodeBinarySchema(schema), data].map((bytes) => {
    const compressed = deflateRawSync(bytes),
      length = Buffer.alloc(4);
    length.writeUInt32LE(compressed.length);
    return Buffer.concat([length, compressed]);
  });
  const raw = path.join(dir, "text-raw.fig"),
    file = path.join(dir, "text.fig");
  await fs.writeFile(raw, Buffer.concat([header, ...chunks]));
  await fs.writeFile(
    file,
    zipSync({
      "canvas.fig": await fs.readFile(raw),
      "images/1122": imageBytes(),
    }),
  );
  return { dir, file, raw };
}
const noFit = (source) =>
  source.replace(
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
  const content = [
    [
      2,
      20,
      "font-weight:600;font-style:italic;line-height:28px;letter-spacing:.05em;text-align:center;text-decoration:underline",
    ],
    [
      3,
      240,
      "font-weight:800;font-style:italic;line-height:150%;letter-spacing:-1px;text-align:right;text-decoration:line-through",
    ],
    [
      4,
      460,
      "font-weight:200;font-style:italic;line-height:1.4;text-transform:uppercase",
    ],
  ]
    .map(
      ([id, x, css]) =>
        `<div id="text-${id}" style="position:absolute;left:${x}px;top:20px;width:180px;height:60px;font:20px Arial,sans-serif;color:red;white-space:pre-wrap;${css}">Motion &lt;&amp;&gt;\nsecond</div>`,
    )
    .join("");
  const ring =
    "M 14 46 L 46 46 L 46 14 L 14 14 Z M 24 36 L 24 24 L 36 24 L 36 36 Z";
  const glyphs = [
    [6, 20, "OUTSIDE"],
    [7, 160, "CENTER"],
    [8, 300, "INSIDE"],
  ]
    .map(
      ([id, x, align]) =>
        `<svg id="text-${id}" width="100" height="80" style="position:absolute;left:${x}px;top:200px;overflow:visible"><defs><clipPath id="clip-${id}"><path d="${ring}"/></clipPath><mask id="mask-${id}" maskUnits="userSpaceOnUse" x="-50" y="-40" width="200" height="160"><rect x="-50" y="-40" width="200" height="160" fill="white"/><path d="${ring}" fill="black"/></mask></defs><path d="${ring}" fill="blue"/><path d="${ring}" fill="none" stroke="red" stroke-width="${align === "CENTER" ? 4 : 8}" ${align === "INSIDE" ? `clip-path="url(#clip-${id})"` : align === "OUTSIDE" ? `mask="url(#mask-${id})"` : ""}/></svg>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>body{margin:24px;background:#edf0f4}#board{position:relative;width:700px;height:380px;background:white}</style><div id="board">${content}${glyphs}</div></html>`;
}

test("offline text styling retains literal input, saved glyph contracts and advisories for unresolved typography", async (t) => {
  const { file } = await fixture(t),
    before = await fs.readFile(file),
    doc = await loadFig(file);
  const rendered = renderDocument(doc, select(doc, "1:1"));
  assert.match(rendered.html, /font-weight:600/);
  assert.match(rendered.html, /font-style:italic/);
  assert.match(rendered.html, /line-height:28px/);
  assert.match(rendered.html, /letter-spacing:0.05em/);
  assert.match(rendered.html, /text-align:justify|text-align:center/);
  assert.match(rendered.html, /codex-figma-glyph/);
  assert.match(rendered.html, /Motion &lt;&amp;&gt;/);
  assert.deepEqual(await fs.readFile(file), before);
  const node = select(doc, "1:6");
  node.derivedTextData.glyphs[0].commandsBlob = 900;
  const missing = renderDocument(doc, node);
  assert.match(
    missing.warnings.join("\n"),
    /glyph outline|glyph outlines unavailable/,
  );
  assert.match(missing.html, /Saved O/);
  assert.match(missing.html, /color:rgba\(0,0,255,1\)/);
  node.derivedTextData.glyphs[0].commandsBlob = 0;
  doc.blobs[0].bytes = [1, 0];
  assert.match(
    renderDocument(doc, node).warnings.join("\n"),
    /Truncated vector path/,
  );
  node.derivedTextData.glyphs[0].rotation = NaN;
  assert.match(
    renderDocument(doc, node).warnings.join("\n"),
    /invalid glyph outline/,
  );
  const literal = select(doc, "1:2");
  literal.lineHeight = { units: "unknown", value: 9 };
  literal.textData.characterStyleIDs = [7];
  literal.textData.styleOverrideTable = [];
  assert.match(
    renderDocument(doc, literal).warnings.join("\n"),
    /lineHeight.*units/,
  );
  assert.match(
    renderDocument(doc, literal).warnings.join("\n"),
    /mapping incomplete/,
  );
  literal.textData = {
    characters: "A\n😀B",
    characterStyleIDs: [0, 0, 7, 7],
    styleOverrideTable: [{ styleID: 7, textDecoration: "UNDERLINE" }],
    lines: [
      { lineType: "ORDERED_LIST", indentationLevel: 1 },
      { lineType: "ORDERED_LIST", indentationLevel: 2 },
    ],
  };
  const partial = renderDocument(doc, literal);
  assert.match(partial.html, /1\. A\n  2\. <span[^>]+>😀<\/span>B/);
  assert.match(partial.warnings.join("\n"), /mapping incomplete/);
  literal.textData.lines[0].indentationLevel = 900;
  assert.match(
    renderDocument(doc, literal).warnings.join("\n"),
    /invalid list indentation/,
  );
  literal.textData.lines = {};
  assert.match(
    renderDocument(doc, literal).warnings.join("\n"),
    /line metadata must be an array/,
  );
  node.derivedTextData.glyphs[0] = {
    commandsBlob: 0,
    position: { x: 10, y: 50 },
    fontSize: 40,
  };
  doc.blobs[0].bytes = [...pathBytes([[1, 0, 0], [2, 1, 0], [2, 1, 1], [0]])];
  node.textData.styleOverrideTable = [{ styleID: 7, fillPaints: [solid(red)] }];
  node.textDecoration = "UNDERLINE";
  assert.match(
    renderDocument(doc, node).warnings.join("\n"),
    /per-glyph style resolution/,
  );
  assert.match(
    renderDocument(doc, node).warnings.join("\n"),
    /resolved decoration geometry/,
  );
});

test("raw and ZIP typography and saved glyph stroke silhouettes match owned CSS and SVG; node gradients, rotation and alpha shadows survive real pixels", async (t) => {
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
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const expected = new Map();
  await withPage(
    url + "reference.html",
    async (page) => {
      for (const id of [2, 3, 4, 6, 7, 8])
        expected.set(id, await page.locator(`#text-${id}`).screenshot());
    },
    { width: 900, height: 600 },
  );
  for (const name of ["raw.html", "zip.html"]) {
    await withPage(
      url + name,
      async (page) => {
        for (const id of [2, 3, 4, 6, 7, 8])
          assert.deepEqual(
            await page.locator(`[data-figma-id="1:${id}"]`).screenshot(),
            expected.get(id),
            `${name} case ${id}`,
          );
        const run = page.locator('[data-figma-id="1:5"] span');
        assert.equal(await run.textContent(), "DEF");
        const style = await run.evaluate((el) => {
          const s = getComputedStyle(el);
          return [
            s.color,
            s.fontWeight,
            s.fontStyle,
            s.fontVariationSettings,
            s.textTransform,
          ];
        });
        assert.deepEqual(style, [
          "rgb(0, 0, 255)",
          "900",
          "italic",
          '"wght" 725',
          "lowercase",
        ]);
        const gradientPng = await page
          .locator('[data-figma-id="1:9"]')
          .screenshot();
        const gradientPixels = await pixels(page, gradientPng, [
          [18, 30],
          [43, 30],
          [28, 28],
          [14, 30],
        ]);
        assert.ok(
          gradientPixels[0][0] > gradientPixels[0][2],
          "fill left is red",
        );
        assert.ok(
          gradientPixels[1][0] > gradientPixels[1][2],
          "fill middle retains node coordinates",
        );
        assert.deepEqual(
          gradientPixels[2],
          [255, 255, 255, 255],
          "glyph hole retained",
        );
        assert.ok(gradientPixels[3][1] > 200, "stroke green gradient");
        const rotated = await page
          .locator('[data-figma-id="1:10"]')
          .screenshot();
        const rotationPixels = await pixels(page, rotated, [
          [20, 20],
          [35, 32],
          [48, 20],
        ]);
        assert.deepEqual(rotationPixels[0], [0, 0, 255, 255]);
        assert.deepEqual(rotationPixels[1], [255, 255, 255, 255]);
        assert.deepEqual(
          rotationPixels[2],
          [0, 255, 0, 255],
          "glyph alpha shadow retains silhouette",
        );
        if (name === "zip.html") {
          for (const [id, points, expected] of [
            [
              11,
              [
                [20, 8],
                [20, 20],
                [75, 20],
                [50, 35],
              ],
              [
                [255, 255, 255, 255],
                [255, 127, 127, 255],
                [127, 127, 255, 255],
                [255, 255, 255, 255],
              ],
            ],
            [
              12,
              [
                [30, 10],
                [45, 10],
                [65, 10],
              ],
              [
                [0, 0, 255, 255],
                [255, 0, 0, 255],
                [0, 0, 255, 255],
              ],
            ],
            [
              13,
              [
                [30, 10],
                [75, 10],
              ],
              [
                [0, 0, 255, 255],
                [0, 0, 255, 255],
              ],
            ],
            [14, [[20, 30]], [[0, 0, 0, 255]]],
            [15, [[20, 30]], [[255, 255, 255, 255]]],
          ]) {
            const png = await page
              .locator(`[data-figma-id="1:${id}"]`)
              .screenshot();
            assert.deepEqual(
              await pixels(page, png, points),
              expected,
              `glyph image/default case ${id}`,
            );
          }
        }
        if (name === "zip.html") {
          const blur = page.locator('[data-figma-id="1:17"]');
          await blur.evaluate((el) => (el.style.visibility = "hidden"));
          const baseline = await page
            .locator('[data-figma-id="1:16"]')
            .screenshot();
          await blur.evaluate((el) => (el.style.visibility = "visible"));
          const blurred = await blur.screenshot();
          const points = [
            [5, 10],
            [50, 35],
            [25, 10],
          ];
          const before = await pixels(page, baseline, points),
            after = await pixels(page, blurred, points);
          assert.deepEqual(
            after[0],
            before[0],
            "background blur does not cover glyph box corner",
          );
          assert.deepEqual(
            after[1],
            before[1],
            "background blur preserves glyph hole",
          );
          assert.ok(
            after[2][2] > before[2][2] + 30,
            "backdrop mixes colors through glyph silhouette",
          );
        }
        if (process.env.CODEX_CAPTURE_FIGMA_TEXT) {
          await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_TEXT, {
            recursive: true,
          });
          await page.screenshot({
            path: path.join(
              process.env.CODEX_CAPTURE_FIGMA_TEXT,
              name + ".png",
            ),
          });
          await fs.copyFile(
            path.join(dir, name),
            path.join(process.env.CODEX_CAPTURE_FIGMA_TEXT, name),
          );
        }
      },
      { width: 900, height: 600 },
    );
  }
});

test("materialized typography and saved glyph masks survive copied review, HTML and PNG after deleting source", async (t) => {
  const { dir, file, raw } = await fixture(t),
    material = path.join(dir, "material"),
    system = path.join(dir, "system");
  await importFig("materialize", file, material, "1:1");
  const input = path.join(material, "index.html");
  await fs.writeFile(input, noFit(await fs.readFile(input, "utf8")));
  await importFig("design-system", file, system);
  await compile(system);
  await preview(system);
  await fs.copyFile(
    path.join(system, "preview.html"),
    path.join(dir, "review.html"),
  );
  const portable = path.join(dir, "portable.html");
  await exportArtifact("html", input, portable);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await fs.rm(file);
  await fs.rm(raw);
  await fs.rm(material, { recursive: true });
  await fs.rm(system, { recursive: true });
  await exportArtifact(
    "png",
    url + "portable.html",
    path.join(dir, "portable.png"),
    {
      width: 900,
      height: 600,
    },
  );

  await withPage(
    url + "portable.html",
    async (page) => {
      const imagePng = await page
        .locator('[data-figma-id="1:13"]')
        .screenshot();
      assert.deepEqual(await pixels(page, imagePng, [[30, 10]]), [
        [0, 0, 255, 255],
      ]);
      const png = await page.locator('[data-figma-id="1:8"]').screenshot();
      assert.deepEqual(
        await pixels(page, png, [
          [14, 30],
          [19, 30],
          [30, 30],
        ]),
        [
          [255, 0, 0, 255],
          [0, 0, 255, 255],
          [255, 255, 255, 255],
        ],
      );
    },
    { width: 900, height: 600 },
  );
  await withPage(
    url + "review.html",
    async (page) => {
      const example = page.locator(
        'article[data-card-name="Typography laboratory"]',
      );
      const imagePng = await example
        .locator('[data-figma-id="1:13"]')
        .screenshot();
      assert.deepEqual(await pixels(page, imagePng, [[30, 10]]), [
        [0, 0, 255, 255],
      ]);
      const glyph = example.locator('[data-figma-id="1:6"]');
      assert.equal(await glyph.count(), 1);
      const png = await glyph.screenshot();
      assert.deepEqual(
        await pixels(page, png, [
          [14, 30],
          [20, 30],
          [30, 30],
        ]),
        [
          [0, 0, 255, 255],
          [0, 0, 255, 255],
          [255, 255, 255, 255],
        ],
      );
    },
    { width: 1100, height: 700 },
  );
  await withPage(
    url + "portable.html",
    async (page) => {
      const png = await fs.readFile(path.join(dir, "portable.png"));
      assert.deepEqual(
        await pixels(page, png, [
          [44 + 14, 224 + 30],
          [44 + 30, 224 + 30],
          [324 + 30, 314 + 10],
        ]),
        [
          [0, 0, 255, 255],
          [255, 255, 255, 255],
          [0, 0, 255, 255],
        ],
      );
    },
    { width: 900, height: 600 },
  );
});

function richReference() {
  return `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>body{margin:24px;background:#edf0f4}#board{position:relative;width:700px;height:720px;background:white}.rich{position:absolute;top:400px;font:20px Arial,sans-serif;line-height:30px;color:red;white-space:pre-wrap;box-sizing:border-box}</style><div id="board"><div id="rich" class="rich" style="left:20px;width:340px;height:280px">1. Alpha\n  2. <span style="font-weight:700;color:blue;text-decoration:underline">Beta</span>\n  • <span style="color:lime;text-decoration:line-through;text-transform:uppercase">Gamma</span>\n1. <span style="vertical-align:super;font-size:.72em">Delta</span>\nPlain\n1. Reset\n<span style="vertical-align:sub;font-size:.72em">Sub</span>\n<span style="font-variant-caps:small-caps;font-feature-settings:'smcp' 1">Caps</span></div><div id="plain-list" class="rich" style="left:400px;width:260px;height:150px">• One\n    1. Two\nPlain</div></div></html>`;
}

test("source-supported literal list prefixes, newline style offsets, decorations and SUPS fallback match owned CSS and remain portable", async (t) => {
  const { dir, file, raw } = await fixture(t);
  await fs.writeFile(path.join(dir, "rich-reference.html"), richReference());
  for (const [name, input] of [
    ["rich-raw.html", raw],
    ["rich-zip.html", file],
  ]) {
    await importFig("render", input, path.join(dir, name), "1:1");
    await fs.writeFile(
      path.join(dir, name),
      noFit(await fs.readFile(path.join(dir, name), "utf8")),
    );
  }
  const material = path.join(dir, "rich-material"),
    system = path.join(dir, "rich-system");
  await importFig("materialize", file, material, "1:1");
  await fs.writeFile(
    path.join(material, "index.html"),
    noFit(await fs.readFile(path.join(material, "index.html"), "utf8")),
  );
  await exportArtifact(
    "html",
    path.join(material, "index.html"),
    path.join(dir, "rich-portable.html"),
  );
  await importFig("design-system", file, system);
  await compile(system);
  await preview(system);
  await fs.copyFile(
    path.join(system, "preview.html"),
    path.join(dir, "rich-review.html"),
  );
  await fs.rm(file);
  await fs.rm(raw);
  await fs.rm(material, { recursive: true });
  await fs.rm(system, { recursive: true });
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const expected = [];
  await withPage(
    url + "rich-reference.html",
    async (page) => {
      expected.push(
        await page.locator("#rich").screenshot(),
        await page.locator("#plain-list").screenshot(),
      );
    },
    { width: 1440, height: 1000 },
  );
  if (process.env.CODEX_CAPTURE_FIGMA_TEXT) {
    await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_TEXT, { recursive: true });
    await fs.writeFile(
      path.join(process.env.CODEX_CAPTURE_FIGMA_TEXT, "rich-reference.png"),
      expected[0],
    );
  }
  for (const name of [
    "rich-raw.html",
    "rich-zip.html",
    "rich-portable.html",
    "rich-review.html",
  ]) {
    await withPage(
      url + name,
      async (page) => {
        const scope =
          name === "rich-review.html"
            ? page.locator('article[data-card-name="Typography laboratory"]')
            : page;
        if (name === "rich-review.html") {
          // Align only the review host's layout origin for nominal pixel comparison.
          await scope.locator('[data-figma-id="1:1"]').evaluate((el) => {
            const host = el.getRootNode().host,
              r = host.getBoundingClientRect();
            host.style.left = `${Math.round(r.left) - r.left}px`;
            host.style.top = `${Math.round(r.top) - r.top}px`;
          });
        }
        for (const [index, id] of [18, 19].entries()) {
          const actual = await scope
            .locator(`[data-figma-id="1:${id}"]`)
            .screenshot();
          if (name !== "rich-review.html")
            assert.deepEqual(actual, expected[index], `${name} list ${id}`);
          else {
            // Fractional review placement can add one white screenshot row. Compare every nominal pixel.
            const equality = await page.evaluate(
              async ({ actual, expected }) => {
                async function decode(base64) {
                  const image = new Image();
                  image.src = "data:image/png;base64," + base64;
                  await image.decode();
                  const canvas = document.createElement("canvas");
                  canvas.width = image.width;
                  canvas.height = image.height;
                  const ctx = canvas.getContext("2d");
                  ctx.drawImage(image, 0, 0);
                  return {
                    width: image.width,
                    height: image.height,
                    data: ctx.getImageData(0, 0, image.width, image.height)
                      .data,
                  };
                }
                const [a, b] = await Promise.all([
                  decode(actual),
                  decode(expected),
                ]);
                if (
                  a.width !== b.width ||
                  a.height < b.height ||
                  a.height > b.height + 1
                )
                  return false;
                for (let i = 0; i < b.data.length; i++)
                  if (a.data[i] !== b.data[i]) return false;
                for (let i = b.data.length; i < a.data.length; i++)
                  if (a.data[i] !== 255) return false;
                return true;
              },
              {
                actual: actual.toString("base64"),
                expected: expected[index].toString("base64"),
              },
            );
            assert.equal(
              equality,
              true,
              `${name} exact nominal list region ${id}`,
            );
          }
        }
        const delta = scope
          .locator('[data-figma-id="1:18"] span')
          .filter({ hasText: "Delta" });
        assert.deepEqual(
          await delta.evaluate((el) => {
            const s = getComputedStyle(el);
            return [s.verticalAlign, s.fontSize];
          }),
          ["super", "14.4px"],
        );
        if (
          name === "rich-portable.html" &&
          process.env.CODEX_CAPTURE_FIGMA_TEXT
        ) {
          await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_TEXT, {
            recursive: true,
          });
          await page.screenshot({
            path: path.join(
              process.env.CODEX_CAPTURE_FIGMA_TEXT,
              "rich-portable.png",
            ),
            fullPage: true,
          });
          await fs.copyFile(
            path.join(dir, name),
            path.join(process.env.CODEX_CAPTURE_FIGMA_TEXT, name),
          );
        }
      },
      { width: 1440, height: 1000 },
    );
  }
  await exportArtifact(
    "png",
    url + "rich-portable.html",
    path.join(dir, "rich-output.png"),
  );
  await withPage(url + "rich-portable.html", async (page) => {
    const output = await fs.readFile(path.join(dir, "rich-output.png"));
    const crop = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = "data:image/png;base64," + base64;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 340;
      canvas.height = 280;
      canvas
        .getContext("2d")
        .drawImage(image, 44, 424, 340, 280, 0, 0, 340, 280);
      return canvas.toDataURL("image/png").split(",")[1];
    }, output.toString("base64"));
    const mismatches = await page.evaluate(
      async ({ actual, expected }) => {
        async function decode(base64) {
          const image = new Image();
          image.src = "data:image/png;base64," + base64;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          return {
            width: image.width,
            height: image.height,
            data: ctx.getImageData(0, 0, image.width, image.height).data,
          };
        }
        const [a, b] = await Promise.all([decode(actual), decode(expected)]);
        if (a.width !== b.width || a.height !== b.height) return -1;
        let count = 0;
        for (let i = 0; i < a.data.length; i++)
          if (a.data[i] !== b.data[i]) count++;
        return count;
      },
      { actual: crop, expected: expected[0].toString("base64") },
    );
    assert.equal(
      mismatches,
      0,
      "every exported rich-text pixel matches literal CSS after source deletion",
    );
  });
});
