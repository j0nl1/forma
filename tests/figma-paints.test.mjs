import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateSync, deflateRawSync } from "node:zlib";
import { parseSchema, compileSchema, encodeBinarySchema } from "kiwi-schema";
import { zipSync } from "fflate";
import { temporary } from "./helpers.mjs";
import {
  loadFig,
  renderDocument,
  select,
  extractedTokens,
} from "../skills/codex-design/scripts/lib/figma.mjs";
import { importFig } from "../skills/codex-design/scripts/figma.mjs";
import {
  compile,
  preview,
} from "../skills/codex-design/scripts/design-system.mjs";
import { exportArtifact } from "../skills/codex-design/scripts/export.mjs";
import { serve } from "../skills/codex-design/scripts/preview.mjs";
import { withPage } from "../skills/codex-design/scripts/lib/browser.mjs";

const red = { r: 1, g: 0, b: 0, a: 1 },
  blue = { r: 0, g: 0, b: 1, a: 1 },
  yellow = { r: 1, g: 1, b: 0, a: 1 },
  white = { r: 1, g: 1, b: 1, a: 1 };
const identity = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
const solid = (color, extra = {}) => ({ type: "SOLID", color, ...extra });
const gradient = (type, extra = {}) => ({
  type,
  transform: identity,
  stops: [
    { position: 0, color: red },
    { position: 1, color: blue },
  ],
  ...extra,
});
function png() {
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const byte of bytes) {
      c ^= byte;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, bytes) => {
    const body = Buffer.concat([Buffer.from(name), bytes]),
      header = Buffer.alloc(4),
      tail = Buffer.alloc(4);
    header.writeUInt32BE(bytes.length);
    tail.writeUInt32BE(crc(body));
    return Buffer.concat([header, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.from([
    0, 255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255,
  ]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat([row, row]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function fixtureData() {
  // Only this constant owned fixture schema is compiled; input schemas use the data-only decoder.
  const schema = parseSchema(
    `enum NodeType{DOCUMENT=0;SYMBOL=1;FRAME=2;VECTOR=3;TEXT=4;} enum PaintType{SOLID=0;GRADIENT_LINEAR=1;GRADIENT_RADIAL=2;GRADIENT_ANGULAR=3;GRADIENT_DIAMOND=4;IMAGE=5;VIDEO=6;} struct Guid{uint sessionID;uint localID;} struct Vec{float x;float y;} struct Color{float r;float g;float b;float a;} struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;} struct Parent{Guid guid;string position;} struct Stop{float position;Color color;} struct ImageRef{byte[] hash;} struct Font{string family;} message Paint{PaintType type=1;Color color=2;float opacity=3;bool visible=4;Matrix transform=5;Stop[] stops=6;ImageRef image=7;string imageScaleMode=8;float scale=9;float originalImageWidth=10;float originalImageHeight=11;string blendMode=12;} message Geometry{uint commandsBlob=1;} message Blob{byte[] bytes=1;} message Node{Guid guid=1;Parent parentIndex=2;NodeType type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;Geometry[] fillGeometry=8;string characters=9;float fontSize=10;Font fontName=11;} message Message{Node[] nodeChanges=1;Blob[] blobs=2;}`,
  );
  const guid = (localID) => ({ sessionID: 1, localID });
  const node = (id, name, x, y, w, h, fillPaints, extra = {}) => ({
    guid: guid(id),
    parentIndex: { guid: guid(1), position: String(id).padStart(3, "0") },
    type: "FRAME",
    name,
    size: { x: w, y: h },
    transform: { ...identity, m02: x, m12: y },
    fillPaints,
    ...extra,
  });
  const image = (imageScaleMode, extra = {}) => ({
    type: "IMAGE",
    image: { hash: [17, 34] },
    imageScaleMode,
    originalImageWidth: 4,
    originalImageHeight: 2,
    ...extra,
  });
  const nodes = [
    { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Document" },
    {
      guid: guid(1),
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "a" },
      type: "SYMBOL",
      name: "Paint laboratory",
      size: { x: 700, y: 460 },
      fillPaints: [solid(white)],
    },
    node(2, "Layered alpha", 20, 20, 160, 80, [
      solid(blue),
      solid(red, { opacity: 0.5 }),
      solid(yellow, { visible: false }),
    ]),
    node(3, "Linear", 200, 20, 160, 80, [gradient("GRADIENT_LINEAR")]),
    node(4, "Diagonal", 390, 20, 160, 80, [
      gradient("GRADIENT_LINEAR", {
        transform: {
          m00: 0.5,
          m01: -0.5,
          m02: 0.5,
          m10: 0.5,
          m11: 0.5,
          m12: 0,
        },
      }),
    ]),
    node(5, "Radial", 20, 130, 160, 80, [gradient("GRADIENT_RADIAL")]),
    node(6, "Angular", 200, 130, 160, 80, [gradient("GRADIENT_ANGULAR")]),
    node(7, "Diamond advisory", 390, 130, 160, 80, [
      gradient("GRADIENT_DIAMOND"),
    ]),
    node(8, "Screen blend", 20, 240, 160, 80, [
      solid(red),
      solid(blue, { blendMode: "SCREEN" }),
    ]),
    node(9, "Fit with alpha", 200, 240, 80, 80, [
      solid(yellow),
      image("FIT", { opacity: 0.5 }),
    ]),
    node(10, "Fill", 300, 240, 80, 80, [solid(yellow), image("FILL")]),
    node(11, "Tile", 400, 240, 80, 80, [
      solid(yellow),
      image("TILE", { scale: 10 }),
    ]),
    node(12, "Crop", 500, 240, 80, 80, [
      solid(yellow),
      image("CROP", { transform: { ...identity, m00: 0.5, m02: 0.5 } }),
    ]),
    node(15, "Stretch", 600, 240, 80, 80, [
      solid(yellow),
      image("STRETCH", { transform: { ...identity, m00: 0.5, m02: 0.25 } }),
    ]),
    node(
      13,
      "Vector layers",
      20,
      350,
      80,
      80,
      [solid(blue), gradient("GRADIENT_LINEAR", { opacity: 0.5 })],
      { type: "VECTOR", fillGeometry: [{ commandsBlob: 0 }] },
    ),
    node(
      14,
      "Text gradient",
      180,
      350,
      150,
      60,
      [gradient("GRADIENT_LINEAR")],
      {
        type: "TEXT",
        characters: "Gradient",
        fontSize: 32,
        fontName: { family: "Arial" },
      },
    ),
  ];
  const commands = Buffer.alloc(28);
  commands[0] = 1;
  commands.writeFloatLE(5, 1);
  commands.writeFloatLE(5, 5);
  commands[9] = 2;
  commands.writeFloatLE(75, 10);
  commands.writeFloatLE(5, 14);
  commands[18] = 2;
  commands.writeFloatLE(5, 19);
  commands.writeFloatLE(75, 23);
  commands[27] = 0;
  const header = Buffer.alloc(12);
  header.write("fig-kiwi");
  header.writeUInt32LE(15, 8);
  const chunks = [
    deflateRawSync(encodeBinarySchema(schema)),
    deflateRawSync(
      compileSchema(schema).encodeMessage({
        nodeChanges: nodes,
        blobs: [{ bytes: [...commands] }],
      }),
    ),
  ];
  const raw = Buffer.concat([
    header,
    ...chunks.flatMap((bytes) => {
      const size = Buffer.alloc(4);
      size.writeUInt32LE(bytes.length);
      return [size, bytes];
    }),
  ]);
  return { raw, zip: zipSync({ "canvas.fig": raw, "images/1122": png() }) };
}
async function fixture(t) {
  const dir = await temporary(t),
    file = path.join(dir, "paints.fig"),
    raw = path.join(dir, "raw.fig"),
    data = fixtureData();
  await fs.writeFile(file, data.zip);
  await fs.writeFile(raw, data.raw);
  return { dir, file, raw };
}
const noFit = (html) =>
  html.replace(
    '<meta charset="utf-8">',
    '<meta charset="utf-8"><meta name="codex-fixed-sheet" content="off">',
  );
async function imagePixels(page, png, points) {
  return page.evaluate(
    async ({ png, points }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + png;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const c = canvas.getContext("2d");
      c.drawImage(image, 0, 0);
      return points.map(([x, y]) => [...c.getImageData(x, y, 1, 1).data]);
    },
    { png: png.toString("base64"), points },
  );
}

test("offline paint inventory preserves ordered visible layers, gradient stops and explicit approximation/input advisories without modifying source", async (t) => {
  const { file, raw } = await fixture(t),
    before = await fs.readFile(file),
    doc = await loadFig(file),
    html = renderDocument(doc, select(doc, "1:1"));
  assert.equal(html.warnings.length, 1);
  assert.match(html.warnings[0], /DIAMOND.*radial/i);
  assert.match(html.html, /linear-gradient/);
  assert.match(html.html, /radial-gradient/);
  assert.match(html.html, /conic-gradient/);
  assert.deepEqual(await fs.readFile(file), before);
  assert.match(
    renderDocument(
      await loadFig(raw),
      select(await loadFig(raw), "1:1"),
    ).warnings.join("\n"),
    /image asset missing/,
  );
  const tokens = Object.values(extractedTokens(doc));
  assert.ok(tokens.includes("rgba(255,0,0,0.5)"));
  const gradientNode = select(doc, "1:3");
  gradientNode.fillPaints = [
    gradient("GRADIENT_LINEAR", {
      opacity: 0.25,
      stops: [
        { position: 0, color: { r: 0, g: 1, b: 0, a: 0.5 } },
        { position: 1, color: blue },
      ],
    }),
    solid({ r: 1, g: 0, b: 1, a: 1 }, { visible: false }),
  ];
  assert.ok(
    Object.values(extractedTokens(doc)).includes("rgba(0,255,0,0.125)"),
  );
  assert.ok(!Object.values(extractedTokens(doc)).includes("rgba(255,0,255,1)"));
  gradientNode.fillPaints = [
    gradient("GRADIENT_LINEAR", { transform: { ...identity, m00: 0, m11: 0 } }),
    { type: "VIDEO" },
    { type: "VIDEO", visible: false },
  ];
  const fallback = renderDocument(doc, gradientNode);
  const warnings = fallback.warnings;
  assert.match(fallback.html, /linear-gradient/);
  assert.ok(warnings.some((w) => /singular/i.test(w)));
  assert.equal(warnings.filter((w) => /VIDEO/.test(w)).length, 1);
});

test("paint gradients match an independent CSS rendition and images retain fitting, tiling, crop and per-layer alpha in actual decoded pixels", async (t) => {
  const { dir, file } = await fixture(t);
  await importFig("render", file, path.join(dir, "render.html"), "1:1");
  await fs.writeFile(
    path.join(dir, "render.html"),
    noFit(await fs.readFile(path.join(dir, "render.html"), "utf8")),
  );
  const styles = {
    2: "linear-gradient(rgba(255,0,0,.5),rgba(255,0,0,.5)),linear-gradient(blue,blue)",
    3: "linear-gradient(90deg,red 0%,blue 100%)",
    4: "linear-gradient(63.43494882292201deg,red 0%,blue 100%)",
    5: "radial-gradient(80px 40px at 50% 50%,red 0%,blue 100%)",
    6: "conic-gradient(from 90deg at 50% 50%,red 0deg,blue 360deg)",
    7: "radial-gradient(80px 40px at 50% 50%,red 0%,blue 100%)",
    8: "linear-gradient(blue,blue),linear-gradient(red,red)",
  };
  const spots = {
    2: [20, 20],
    3: [200, 20],
    4: [390, 20],
    5: [20, 130],
    6: [200, 130],
    7: [390, 130],
    8: [20, 240],
  };
  await fs.writeFile(
    path.join(dir, "reference.html"),
    '<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>body{margin:24px;background:#edf0f4}#board{position:relative;width:700px;height:460px;background:white}</style><div id="board">' +
      Object.entries(styles)
        .map(
          ([id, bg]) =>
            `<div id="ref-${id}" style="position:absolute;left:${spots[id][0]}px;top:${spots[id][1]}px;width:160px;height:80px;background:${bg};${id == 8 ? "background-blend-mode:screen,normal" : ""}"></div>`,
        )
        .join("") +
      '<div id="ref-text" style="position:absolute;left:180px;top:350px;width:150px;height:60px;box-sizing:border-box;background:linear-gradient(90deg,red 0%,blue 100%);background-clip:text;color:transparent;font:400 32px Arial;white-space:pre-wrap;text-align:left">Gradient</div></div></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  const reference = {};
  let referenceText;
  await withPage(url + "reference.html", async (page) => {
    referenceText = await page.locator("#ref-text").screenshot();
    for (const id of Object.keys(styles))
      reference[id] = await page.locator("#ref-" + id).screenshot();
  });
  await withPage(url + "render.html", async (page) => {
    for (const id of Object.keys(styles))
      assert.deepEqual(
        await page.locator(`[data-figma-id="1:${id}"]`).screenshot(),
        reference[id],
        "Rendered paint " + id + " matches independent CSS",
      );
    const shot = await page.locator('[data-figma-id="1:1"]').screenshot();
    const points = [
      [205, 245],
      [210, 280],
      [270, 280],
      [315, 280],
      [365, 280],
      [405, 245],
      [425, 245],
      [445, 245],
      [465, 245],
      [550, 280],
      [610, 280],
      [670, 280],
      [80, 415],
    ];
    const pixels = await imagePixels(page, shot, points);
    assert.deepEqual(
      pixels[0],
      [255, 255, 0, 255],
      "FIT leaves the underlying yellow visible",
    );
    assert.ok(
      pixels[1][0] === 255 &&
        Math.abs(pixels[1][1] - 128) <= 1 &&
        pixels[1][2] === 0,
      "Image alpha blends only its own layer",
    );
    assert.ok(pixels[2].slice(0, 3).every((v) => Math.abs(v - 128) <= 1));
    for (const [index, expected] of [
      [3, [255, 0, 0, 255]],
      [4, [0, 0, 255, 255]],
      [5, [255, 0, 0, 255]],
      [6, [0, 0, 255, 255]],
      [7, [255, 0, 0, 255]],
      [8, [0, 0, 255, 255]],
      [9, [0, 0, 255, 255]],
      [10, [255, 0, 0, 255]],
      [11, [0, 0, 255, 255]],
      [12, [255, 255, 255, 255]],
    ])
      assert.deepEqual(
        pixels[index],
        expected,
        "Image mode or vector transparency at " + points[index],
      );
    const vector = await imagePixels(
      page,
      await page.locator('[data-figma-id="1:13"]').screenshot(),
      [
        [15, 15],
        [60, 60],
      ],
    );
    assert.ok(vector[0][0] > 70 && vector[0][2] > 120);
    assert.deepEqual(vector[1], [255, 255, 255, 255]);
    const textShot = await page.locator('[data-figma-id="1:14"]').screenshot();
    assert.deepEqual(
      textShot,
      referenceText,
      "Text retains real glyphs and gradient coordinates",
    );
    const text = await page.evaluate(async (png) => {
      const image = new Image();
      image.src = "data:image/png;base64," + png;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const b = ctx.getImageData(0, 0, image.width, image.height).data;
      let red = false,
        blue = false;
      for (let i = 0; i < b.length; i += 4) {
        if (b[i] > b[i + 2] + 60) red = true;
        if (b[i + 2] > b[i] + 60) blue = true;
      }
      return { red, blue };
    }, textShot.toString("base64"));
    assert.deepEqual(text, { red: true, blue: true });
    if (process.env.CODEX_CAPTURE_FIGMA_PAINTS) {
      await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_PAINTS, {
        recursive: true,
      });
      await fs.writeFile(
        path.join(process.env.CODEX_CAPTURE_FIGMA_PAINTS, "paints.png"),
        shot,
      );
      await fs.copyFile(
        path.join(dir, "render.html"),
        path.join(process.env.CODEX_CAPTURE_FIGMA_PAINTS, "paints.html"),
      );
    }
  });
  const doc = await loadFig(file),
    tile = select(doc, "1:11");
  delete tile.fillPaints[1].originalImageWidth;
  delete tile.fillPaints[1].originalImageHeight;
  const formats = await withPage(url + "render.html", (page) =>
    page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 4;
      canvas.height = 2;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "red";
      ctx.fillRect(0, 0, 2, 2);
      ctx.fillStyle = "blue";
      ctx.fillRect(2, 0, 2, 2);
      return ["image/png", "image/jpeg", "image/webp"].map((type) =>
        canvas.toDataURL(type, 1),
      );
    }),
  );
  for (const [index, data] of formats.entries()) {
    doc.images["1122"] = Buffer.from(data.split(",")[1], "base64");
    const rendered = renderDocument(doc, tile);
    assert.deepEqual(rendered.warnings, []);
    await fs.writeFile(
      path.join(dir, `tile-${index}.html`),
      noFit(rendered.html),
    );
    await withPage(url + `tile-${index}.html`, async (page) => {
      const pixels = await imagePixels(
        page,
        await page.locator('[data-figma-id="1:11"]').screenshot(),
        [
          [5, 10],
          [25, 10],
          [45, 10],
          [65, 10],
        ],
      );
      for (const [i, pixel] of pixels.entries())
        assert.ok(
          i % 2 ? pixel[2] > pixel[0] + 160 : pixel[0] > pixel[2] + 160,
          "Intrinsic tile dimensions survive PNG/JPEG/WebP without source dimension hints",
        );
    });
  }
});

test("image assets and gradient/vector fills survive materialization, system review and portable HTML/PNG after deleting the original Figma file", async (t) => {
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
      const vector = page.locator('[data-figma-id="1:13"]').first();
      await vector.waitFor();
      const rgba = await imagePixels(page, await vector.screenshot(), [
        [15, 15],
        [60, 60],
      ]);
      assert.ok(rgba[0][0] > 70 && rgba[0][2] > 120);
    });
  const pngOut = path.join(dir, "export.png");
  await exportArtifact("png", url + "portable.html", pngOut);
  await withPage(url + "portable.html", async (page) => {
    const pixels = await imagePixels(page, await fs.readFile(pngOut), [
      [24 + 550, 24 + 280],
    ]);
    assert.deepEqual(pixels[0], [0, 0, 255, 255]);
  });
});
