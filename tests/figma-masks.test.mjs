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
} from "../packages/exports/src/lib/figma.mjs";
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
const red = color(1, 0, 0),
  blue = color(0, 0, 1),
  green = color(0, 1, 0),
  yellow = color(1, 1, 0);
function commands(items) {
  return Buffer.concat(
    items.map(([code, ...values]) => {
      const bytes = Buffer.alloc(1 + 4 * values.length);
      bytes[0] = code;
      values.forEach((value, i) => bytes.writeFloatLE(value, 1 + i * 4));
      return bytes;
    }),
  );
}
function fixtureBytes() {
  // Only this independently authored constant schema is compiled. Imported schemas are data.
  const schema = parseSchema(`
    enum NodeType{DOCUMENT=0;SYMBOL=1;FRAME=2;VECTOR=3;TEXT=4;ELLIPSE=5;GROUP=6;}
    struct Guid{uint sessionID;uint localID;} struct Vec{float x;float y;}
    struct Parent{Guid guid;string position;} struct Color{float r;float g;float b;float a;}
    struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;}
    message Paint{string type=1;Color color=2;float opacity=3;}
    message Geometry{uint commandsBlob=1;string windingRule=2;}
    message Glyph{uint commandsBlob=1;Vec position=2;float fontSize=3;float rotation=4;}
    message TextData{Glyph[] glyphs=1;}
    message Blob{byte[] bytes=1;}
    message Node{Guid guid=1;Parent parentIndex=2;NodeType type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;Geometry[] fillGeometry=8;bool mask=9;bool visible=10;float cornerRadius=11;TextData derivedTextData=12;bool isMask=13;string maskType=14;float opacity=15;}
    message Message{Node[] nodeChanges=1;Blob[] blobs=2;}
  `);
  const guid = (id) => ({ sessionID: 1, localID: id });
  const node = (id, x, y, extra = {}) => ({
    guid: guid(id),
    parentIndex: { guid: guid(1), position: String(id).padStart(3, "0") },
    type: "FRAME",
    name: "Mask fixture " + id,
    size: { x: 80, y: 80 },
    transform: { ...identity, m02: x, m12: y },
    ...extra,
  });
  const mask = (id, x, y, extra = {}) =>
    node(id, x, y, { mask: true, ...extra });
  const paint = (id, c, extra = {}) =>
    node(id, 0, 0, {
      size: { x: 580, y: 380 },
      fillPaints: [{ type: "SOLID", color: c }],
      ...extra,
    });
  const nodes = [
    { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Document" },
    {
      guid: guid(1),
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "a" },
      type: "SYMBOL",
      name: "Mask laboratory",
      size: { x: 580, y: 380 },
      fillPaints: [{ type: "SOLID", color: color(1, 1, 1) }],
    },
    mask(2, 20, 20, {
      type: "ELLIPSE",
      maskType: "ALPHA",
      opacity: 0,
      fillPaints: [{ type: "SOLID", color: red, opacity: 0 }],
    }),
    paint(3, blue),
    mask(4, 120, 20, {
      cornerRadius: 16,
      maskType: "LUMINANCE",
      fillPaints: [{ type: "SOLID", color: color(0, 0, 0) }],
    }),
    paint(5, red),
    mask(6, 220, 20, { type: "VECTOR", fillGeometry: [{ commandsBlob: 0 }] }),
    paint(7, blue),
    mask(8, 400, 20, {
      type: "GROUP",
      transform: { m00: 0, m10: 1, m01: -1, m11: 0, m02: 400, m12: 20 },
    }),
    paint(9, green),
    mask(10, 20, 150, {
      type: "TEXT",
      derivedTextData: {
        glyphs: [
          {
            commandsBlob: 1,
            position: { x: 0, y: 60 },
            fontSize: 60,
            rotation: 0,
          },
        ],
      },
    }),
    paint(11, red),
    mask(12, 120, 150, {
      type: "VECTOR",
      fillGeometry: [{ commandsBlob: 2, windingRule: "ODD" }],
    }),
    paint(13, blue),
    mask(14, 220, 150, { visible: false }),
    paint(15, yellow, {
      transform: { ...identity, m02: 220, m12: 150 },
      size: { x: 80, y: 80 },
    }),
    mask(16, 320, 150, { type: "VECTOR" }),
    paint(17, red, {
      transform: { ...identity, m02: 320, m12: 150 },
      size: { x: 120, y: 80 },
    }),
    mask(18, 420, 150, { type: "ELLIPSE" }),
    paint(19, green),
    mask(20, 420, 250, { isMask: true, mask: false }),
    paint(21, blue),
    mask(24, 20, 250, { type: "VECTOR", size: { x: 0, y: 0 } }),
    paint(25, yellow, {
      transform: { ...identity, m02: 20, m12: 250 },
      size: { x: 80, y: 80 },
    }),
    node(22, 0, 0, {
      parentIndex: { guid: guid(8), position: "a" },
      size: { x: 20, y: 40 },
    }),
    node(23, 30, 0, {
      parentIndex: { guid: guid(8), position: "b" },
      size: { x: 40, y: 40 },
      type: "VECTOR",
      fillGeometry: [{ commandsBlob: 3 }],
    }),
  ];
  const paths = [
    [[1, 0, 0], [2, 80, 0], [2, 0, 80], [0]],
    [[1, 0, 0], [2, 1, 0], [2, 0, 1], [0]],
    [
      [1, 0, 0],
      [2, 80, 0],
      [2, 80, 80],
      [2, 0, 80],
      [0],
      [1, 20, 20],
      [2, 60, 20],
      [2, 60, 60],
      [2, 20, 60],
      [0],
    ],
    [[1, 0, 0], [2, 40, 0], [2, 0, 40], [0]],
  ];
  const head = Buffer.alloc(12);
  head.write("fig-kiwi");
  head.writeUInt32LE(15, 8);
  const chunks = [
    deflateRawSync(encodeBinarySchema(schema)),
    deflateRawSync(
      compileSchema(schema).encodeMessage({
        nodeChanges: nodes,
        blobs: paths.map((items) => ({ bytes: [...commands(items)] })),
      }),
    ),
  ];
  const raw = Buffer.concat([
    head,
    ...chunks.flatMap((bytes) => {
      const length = Buffer.alloc(4);
      length.writeUInt32LE(bytes.length);
      return [length, bytes];
    }),
  ]);
  return { raw, zip: zipSync({ "canvas.fig": raw }) };
}
async function fixture(t) {
  const dir = await temporary(t),
    file = path.join(dir, "masks.fig"),
    raw = path.join(dir, "raw.fig"),
    bytes = fixtureBytes();
  await fs.writeFile(file, bytes.zip);
  await fs.writeFile(raw, bytes.raw);
  return { dir, file, raw };
}
const noFit = (html) =>
  html.replace(
    '<meta charset="utf-8">',
    '<meta charset="utf-8"><meta name="codex-fixed-sheet" content="off">',
  );
function reference() {
  const groups = [
    ['<ellipse cx="60" cy="60" rx="40" ry="40"/>', "blue"],
    ['<rect x="120" y="20" width="80" height="80" rx="16"/>', "red"],
    ['<path d="M220 20 L300 20 L220 100Z"/>', "blue"],
    [
      '<rect x="360" y="20" width="40" height="20"/><path d="M400 50 L400 90 L360 50Z"/>',
      "lime",
    ],
    ['<path d="M20 210 L80 210 L20 150Z"/>', "red"],
    [
      '<path d="M120 150H200V230H120Z M140 170H180V210H140Z" clip-rule="evenodd"/>',
      "blue",
    ],
    ['<ellipse cx="460" cy="190" rx="40" ry="40"/>', "lime"],
    ['<rect x="420" y="250" width="80" height="80"/>', "blue"],
  ];
  let content = "";
  for (const [i, [shape, fill]] of groups.entries())
    content += `<svg width="0" height="0" style="position:absolute"><defs><clipPath id="r${i}" clipPathUnits="userSpaceOnUse">${shape}</clipPath></defs></svg><div style="position:absolute;inset:0;clip-path:url(#r${i})"><div style="position:absolute;width:580px;height:380px;background:${fill}"></div></div>`;
  content +=
    '<div style="position:absolute;left:220px;top:150px;width:80px;height:80px;background:yellow"></div><div style="position:absolute;left:320px;top:150px;width:80px;height:80px;background:red"></div><div style="position:absolute;left:20px;top:250px;width:80px;height:80px;background:yellow"></div>';
  return (
    '<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>body{margin:24px;background:#edf0f4}#board{position:relative;width:580px;height:380px;background:white}</style><div id="board">' +
    content +
    "</div></html>"
  );
}
async function pixels(page, shot, points) {
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
    { png: shot.toString("base64"), points },
  );
}

test("sibling mask grouping preserves hidden boundaries and reports missing contours and unsupported compositing without mutating source", async (t) => {
  const { file } = await fixture(t),
    before = await fs.readFile(file),
    doc = await loadFig(file),
    result = renderDocument(doc, select(doc, "1:1"));
  assert.equal((result.html.match(/data-figma-mask-group=/g) || []).length, 9);
  assert.ok(!result.html.includes('data-figma-id="1:2"'));
  assert.ok(!result.html.includes('data-figma-id="1:14"'));
  assert.ok(result.html.includes('data-figma-id="1:15"'));
  assert.match(result.html, /clip-rule="evenodd"/);
  assert.match(
    result.warnings.join("\n"),
    /mask has no usable geometry; rendering siblings unmasked/,
  );
  assert.ok(!result.warnings.some((w) => /mask needs visual review/.test(w)));
  assert.match(
    result.warnings.join("\n"),
    /1:16: vector mask.*box contour fallback/,
  );
  assert.match(result.warnings.join("\n"), /1:24: mask has no usable geometry/);
  assert.match(
    result.warnings.join("\n"),
    /LUMINANCE mask mode.*contour fallback/,
  );
  select(doc, "1:2").maskType = "ALPHA";
  assert.match(
    renderDocument(doc, select(doc, "1:1")).warnings.join("\n"),
    /ALPHA mask mode.*contour fallback/,
  );
  select(doc, "1:10").derivedTextData = { glyphs: [] };
  assert.match(
    renderDocument(doc, select(doc, "1:1")).warnings.join("\n"),
    /text mask has no saved glyph geometry/,
  );
  select(doc, "1:6").fillGeometry = [{ commandsBlob: 900 }];
  assert.match(
    renderDocument(doc, select(doc, "1:1")).warnings.join("\n"),
    /fill geometry missing command blob/,
  );
  assert.deepEqual(await fs.readFile(file), before);
});

test("raw and ZIP ellipse, rounded box, vector holes, glyph and transformed composite masks match an independent SVG silhouette", async (t) => {
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
  // The inspected renderer uses child contours before the box fallback for every container type.
  for (const type of ["FRAME", "ELLIPSE"]) {
    const doc = await loadFig(file);
    select(doc, "1:8").type = type;
    await fs.writeFile(
      path.join(dir, type + ".html"),
      noFit(renderDocument(doc, select(doc, "1:1")).html),
    );
  }
  const rotatedDoc = await loadFig(file);
  select(rotatedDoc, "1:10").derivedTextData.glyphs = [
    {
      commandsBlob: 1,
      position: { x: 60, y: 60 },
      fontSize: 20,
      rotation: Math.PI / 2,
    },
  ];
  await fs.writeFile(
    path.join(dir, "rotated.html"),
    noFit(renderDocument(rotatedDoc, select(rotatedDoc, "1:1")).html),
  );
  const emptyChildrenDoc = await loadFig(file);
  select(emptyChildrenDoc, "1:8").type = "FRAME";
  select(emptyChildrenDoc, "1:22").visible = false;
  select(emptyChildrenDoc, "1:23").visible = false;
  await fs.writeFile(
    path.join(dir, "empty-children.html"),
    noFit(
      renderDocument(emptyChildrenDoc, select(emptyChildrenDoc, "1:1")).html,
    ),
  );
  await fs.writeFile(path.join(dir, "reference.html"), reference());
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  const expected = await withPage(url + "reference.html", (page) =>
    page.locator("#board").screenshot(),
  );
  await withPage(url + "rotated.html", async (page) => {
    const shot = await page.locator('[data-figma-id="1:1"]').screenshot();
    assert.deepEqual(
      await pixels(page, shot, [
        [78, 205],
        [62, 192],
      ]),
      [
        [255, 0, 0, 255],
        [255, 255, 255, 255],
      ],
      "Saved radians rotate scaled glyph outlines",
    );
  });
  await withPage(url + "empty-children.html", async (page) => {
    const shot = await page.locator('[data-figma-id="1:1"]').screenshot();
    assert.deepEqual(
      await pixels(page, shot, [
        [330, 30],
        [410, 30],
      ]),
      [
        [0, 255, 0, 255],
        [255, 255, 255, 255],
      ],
      "Empty child unions retain the positive-size frame contour fallback",
    );
  });
  for (const name of ["raw.html", "zip.html", "FRAME.html", "ELLIPSE.html"])
    await withPage(url + name, async (page) => {
      const shot = await page.locator('[data-figma-id="1:1"]').screenshot();
      assert.deepEqual(shot, expected, "Actual silhouette pixels in " + name);
      assert.deepEqual(
        await pixels(page, shot, [
          [21, 21],
          [60, 60],
          [160, 190],
          [230, 160],
          [330, 160],
          [430, 260],
          [410, 160],
          [30, 260],
        ]),
        [
          [255, 255, 255, 255],
          [0, 0, 255, 255],
          [255, 255, 255, 255],
          [255, 255, 0, 255],
          [255, 0, 0, 255],
          [0, 0, 255, 255],
          [255, 255, 255, 255],
          [255, 255, 0, 255],
        ],
      );
      if (process.env.CODEX_CAPTURE_FIGMA_MASKS) {
        await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_MASKS, {
          recursive: true,
        });
        await fs.writeFile(
          path.join(process.env.CODEX_CAPTURE_FIGMA_MASKS, name + ".png"),
          shot,
        );
        await fs.copyFile(
          path.join(dir, name),
          path.join(process.env.CODEX_CAPTURE_FIGMA_MASKS, name),
        );
      }
    });
});

test("materialized sibling masks survive compiled shadow-root reviews and portable HTML and PNG after deleting the Figma input", async (t) => {
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
      const box = await board.boundingBox(),
        shot = await board.screenshot();
      const scale = box.width / 580;
      const points = [
        [21, 21],
        [60, 60],
        [160, 190],
        [230, 160],
        [330, 160],
        [430, 260],
        [410, 160],
        [30, 260],
      ].map(([x, y]) => [Math.floor(x * scale), Math.floor(y * scale)]);
      assert.deepEqual(
        await pixels(page, shot, points),
        [
          [255, 255, 255, 255],
          [0, 0, 255, 255],
          [255, 255, 255, 255],
          [255, 255, 0, 255],
          [255, 0, 0, 255],
          [0, 0, 255, 255],
          [255, 255, 255, 255],
          [255, 255, 0, 255],
        ],
        name,
      );
    });
  const png = path.join(dir, "portable.png");
  await exportArtifact("png", url + "portable.html", png);
  await withPage(url + "portable.html", async (page) =>
    assert.deepEqual(
      await pixels(page, await fs.readFile(png), [
        [84, 84],
        [184, 214],
        [254, 184],
        [434, 184],
        [54, 284],
      ]),
      [
        [0, 0, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 0, 255],
        [255, 255, 255, 255],
        [255, 255, 0, 255],
      ],
    ),
  );
});
