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
  renderDocument,
  select,
} from "../packages/exports/src/lib/figma.mjs";
import { importFig } from "../packages/cli/src/commands/figma.mjs";
import {
  compile,
  preview,
} from "../packages/cli/src/commands/design-system.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";

const red = { r: 1, g: 0, b: 0, a: 1 },
  blue = { r: 0, g: 0, b: 1, a: 1 },
  white = { r: 1, g: 1, b: 1, a: 1 };
const shadow = (
  type,
  color = red,
  offset = { x: 6, y: 0 },
  radius = 0,
  spread = 0,
) => ({ type, color, offset, radius, spread });
function fixtureBytes() {
  // Compile only this owned constant test schema, never a schema from imported data.
  const schema = parseSchema(
    `enum NodeType{DOCUMENT=0;CANVAS=1;FRAME=2;SYMBOL=3;TEXT=4;VECTOR=5;} enum PaintType{SOLID=0;} enum EffectType{DROP_SHADOW=0;INNER_SHADOW=1;LAYER_BLUR=2;BACKGROUND_BLUR=3;FOREGROUND_BLUR=4;NOISE=5;} struct Guid{uint sessionID;uint localID;} struct Vec{float x;float y;} struct Color{float r;float g;float b;float a;} struct Parent{Guid guid;string position;} struct Transform{float m00;float m01;float m02;float m10;float m11;float m12;} message Paint{PaintType type=1;Color color=2;} message Effect{EffectType type=1;Color color=2;Vec offset=3;float radius=4;float spread=5;bool visible=6;string blendMode=7;string blurType=8;} message Geometry{uint commandsBlob=1;} message Blob{byte[] bytes=1;} message Node{Guid guid=1;Parent parentIndex=2;NodeType type=3;string name=4;Vec size=5;Transform transform=6;Paint[] fillPaints=7;Effect[] effects=8;float cornerRadius=9;Geometry[] fillGeometry=10;string characters=11;float fontSize=12;} message Message{Node[] nodeChanges=1;Blob[] blobs=2;}`,
  );
  const guid = (localID) => ({ sessionID: 1, localID });
  const node = (id, name, x, y, w, h, color, effects = [], extra = {}) => ({
    guid: guid(id),
    parentIndex: { guid: guid(1), position: String(id).padStart(4, "0") },
    type: "FRAME",
    name,
    size: { x: w, y: h },
    transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
    fillPaints: [{ type: "SOLID", color }],
    effects,
    ...extra,
  });
  const nodes = [
    { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Document" },
    {
      guid: guid(1),
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "a" },
      type: "SYMBOL",
      name: "Effects board",
      size: { x: 640, y: 400 },
      fillPaints: [{ type: "SOLID", color: white }],
    },
    node(
      2,
      "Layered box",
      20,
      30,
      110,
      90,
      blue,
      [
        shadow("DROP_SHADOW", red, { x: 12, y: 8 }, 0, 3),
        shadow(
          "DROP_SHADOW",
          { r: 0, g: 1, b: 0, a: 0.5 },
          { x: -8, y: 16 },
          4,
          -2,
        ),
        shadow("INNER_SHADOW", { r: 1, g: 1, b: 0, a: 1 }, { x: 4, y: 6 }),
        { ...shadow("DROP_SHADOW"), visible: false },
      ],
      { cornerRadius: 8 },
    ),
    node(
      3,
      "Vector drop",
      210,
      25,
      80,
      80,
      blue,
      [shadow("DROP_SHADOW", red, { x: 10, y: 8 })],
      { type: "VECTOR", fillGeometry: [{ commandsBlob: 0 }] },
    ),
    node(4, "Vector inner", 330, 25, 80, 80, blue, [shadow("INNER_SHADOW")], {
      type: "VECTOR",
      fillGeometry: [{ commandsBlob: 0 }],
    }),
    node(
      5,
      "Text drop",
      20,
      160,
      150,
      50,
      blue,
      [shadow("DROP_SHADOW", red, { x: 4, y: 4 }, 1)],
      { type: "TEXT", fontSize: 32, characters: "Shadow" },
    ),
    node(6, "Layer blur", 20, 260, 90, 70, blue, [
      { type: "LAYER_BLUR", radius: 3 },
    ]),
    node(7, "Foreground alias", 130, 260, 50, 70, blue, [
      { type: "FOREGROUND_BLUR", radius: 2 },
    ]),
    node(
      8,
      "Text inner",
      400,
      160,
      170,
      50,
      blue,
      [shadow("INNER_SHADOW", red, { x: 2, y: 2 })],
      { type: "TEXT", fontSize: 32, characters: "Shadow" },
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      node(
        10 + i,
        "Stripe " + i,
        200 + i * 20,
        170,
        20,
        80,
        i % 2 ? blue : red,
      ),
    ),
    node(20, "Background blur", 210, 180, 100, 60, { ...white, a: 0.2 }, [
      { type: "BACKGROUND_BLUR", radius: 5 },
    ]),
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
  return Buffer.concat([
    header,
    ...chunks.flatMap((bytes) => {
      const size = Buffer.alloc(4);
      size.writeUInt32LE(bytes.length);
      return [size, bytes];
    }),
  ]);
}
async function fixture(t) {
  const dir = await temporary(t),
    file = path.join(dir, "effects.fig");
  await fs.writeFile(file, fixtureBytes());
  return { dir, file };
}

test("offline effect rendering retains shadow stacks, alpha silhouettes and blur families while reporting unsupported effect inputs", async (t) => {
  const { file } = await fixture(t),
    doc = await loadFig(file),
    node = select(doc, "1:1");
  const rendered = renderDocument(doc, node);
  assert.deepEqual(rendered.warnings, []);
  assert.match(rendered.html, /box-shadow:/);
  assert.match(rendered.html, /drop-shadow\(/);
  assert.match(rendered.html, /backdrop-filter:blur\(5px\)/);
  assert.match(rendered.html, /feComposite/);
  node.effects = [
    { type: "NOISE" },
    { type: "GLASS", visible: false },
    { type: "LAYER_BLUR", radius: 10, blurType: "PROGRESSIVE" },
    { ...shadow("DROP_SHADOW"), blendMode: "MULTIPLY" },
  ];
  const warnings = renderDocument(doc, node).warnings;
  assert.ok(warnings.some((w) => /NOISE/.test(w)));
  assert.ok(warnings.some((w) => /PROGRESSIVE/.test(w)));
  assert.ok(warnings.some((w) => /MULTIPLY/.test(w)));
  assert.equal(
    warnings.some((w) => /GLASS/.test(w)),
    false,
  );
});

test("raw and zipped Figma outputs draw actual shadow pixels, preserve transparent vector corners and match independently authored box effects", async (t) => {
  const { dir, file } = await fixture(t),
    zip = path.join(dir, "zipped.fig");
  await fs.writeFile(zip, zipSync({ "canvas.fig": fixtureBytes() }));
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  await fs.writeFile(
    path.join(dir, "reference.html"),
    '<!doctype html><html lang="en"><style>body{margin:24px;background:#edf0f4}#stage{position:relative;width:640px;height:400px;background:white}#box{position:absolute;left:20px;top:30px;width:110px;height:90px;background:blue;border-radius:8px;box-shadow:inset 4px 6px 0 0 yellow,-8px 16px 4px -2px rgba(0,255,0,.5),12px 8px 0 3px red}</style><div id="stage"><div id="box"></div></div></html>',
  );
  let reference;
  await withPage(url + "reference.html", async (page) => {
    const scale = (await page.locator("#stage").boundingBox()).width / 640;
    reference = await page.screenshot({
      clip: { x: 24, y: 24, width: 170 * scale, height: 145 * scale },
    });
  });
  for (const [input, out] of [
    [file, "raw.html"],
    [zip, "zip.html"],
  ]) {
    const result = await importFig("render", input, path.join(dir, out), "1:1");
    assert.deepEqual(result.warnings, []);
    await withPage(url + out, async (page) => {
      const scale =
        (await page.locator('[data-figma-id="1:1"]').boundingBox()).width / 640;
      assert.deepEqual(
        await page.screenshot({
          clip: { x: 24, y: 24, width: 170 * scale, height: 145 * scale },
        }),
        reference,
      );
      const computed = await page
        .locator('[data-figma-id="1:3"]')
        .evaluate((el) => ({
          background: getComputedStyle(el).backgroundColor,
          filter: getComputedStyle(el).filter,
        }));
      assert.equal(computed.background, "rgba(0, 0, 0, 0)");
      assert.match(computed.filter, /drop-shadow/);
      const shot = await page.locator('[data-figma-id="1:1"]').screenshot();
      if (process.env.CODEX_CAPTURE_FIGMA_EFFECTS) {
        await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_EFFECTS, {
          recursive: true,
        });
        await fs.writeFile(
          path.join(process.env.CODEX_CAPTURE_FIGMA_EFFECTS, out + ".png"),
          shot,
        );
        await fs.writeFile(
          path.join(process.env.CODEX_CAPTURE_FIGMA_EFFECTS, out),
          await fs.readFile(path.join(dir, out)),
        );
      }
      const pixels = await page.evaluate(async (encoded) => {
        const img = new Image();
        img.src = "data:image/png;base64," + encoded;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const c = canvas.getContext("2d");
        c.drawImage(img, 0, 0);
        return [
          [338, 40],
          [350, 40],
          [390, 85],
          [280, 95],
          [220, 205],
          [19, 290],
        ].map(([x, y]) => [
          ...c.getImageData(
            Math.floor((x * img.width) / 640),
            Math.floor((y * img.height) / 400),
            1,
            1,
          ).data,
        ]);
      }, shot.toString("base64"));
      assert.deepEqual(
        pixels[0],
        [255, 0, 0, 255],
        "Inner shadow follows the triangle's left edge",
      );
      assert.deepEqual(
        pixels[1],
        [0, 0, 255, 255],
        "Inner vector face remains blue",
      );
      assert.deepEqual(
        pixels[2],
        [255, 255, 255, 255],
        "The transparent corner stays transparent",
      );
      assert.deepEqual(
        pixels[3],
        [255, 255, 255, 255],
        "Drop shadow uses the triangle alpha rather than its bounding box",
      );
      assert.ok(
        pixels[4][0] > 60 && pixels[4][2] > 60,
        "Backdrop blur actually mixes the underlying red and blue stripes",
      );
      assert.ok(
        pixels[5][0] > 30 && pixels[5][2] === 255,
        "Layer blur extends soft blue pixels outside the original rectangle",
      );
      const textPixels = await page.evaluate(
        async (png) => {
          const img = new Image();
          img.src = "data:image/png;base64," + png;
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const c = canvas.getContext("2d");
          c.drawImage(img, 0, 0);
          const bytes = c.getImageData(0, 0, img.width, img.height).data;
          let red = false,
            blue = false;
          for (let i = 0; i < bytes.length; i += 4) {
            if (bytes[i] > 200 && bytes[i + 2] < 80) red = true;
            if (bytes[i + 2] > 200 && bytes[i] < 80) blue = true;
          }
          return { red, blue };
        },
        (await page.locator('[data-figma-id="1:8"]').screenshot()).toString(
          "base64",
        ),
      );
      assert.deepEqual(
        textPixels,
        { red: true, blue: true },
        "Text inner shadow paints inside the original blue glyphs",
      );
      if (process.env.CODEX_CAPTURE_FIGMA_EFFECTS) {
        await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_EFFECTS, {
          recursive: true,
        });
        await fs.writeFile(
          path.join(process.env.CODEX_CAPTURE_FIGMA_EFFECTS, out + ".png"),
          shot,
        );
        await fs.writeFile(
          path.join(
            process.env.CODEX_CAPTURE_FIGMA_EFFECTS,
            "reference-box.png",
          ),
          reference,
        );
      }
    });
  }
});

test("materialized effects, compiled system reviews and exported HTML/PNG remain usable after deleting the Figma source", async (t) => {
  const { dir, file } = await fixture(t),
    material = path.join(dir, "material"),
    system = path.join(dir, "system");
  await importFig("materialize", file, material, "1:1");
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
      const node = page.locator('[data-figma-id="1:2"]').first();
      await node.waitFor();
      assert.notEqual(
        await node.evaluate((el) => getComputedStyle(el).boxShadow),
        "none",
      );
      const vector = page.locator('[data-figma-id="1:4"]').first();
      assert.match(
        await vector.evaluate((el) => getComputedStyle(el).filter),
        /url/,
      );
      const pixel = await page.evaluate(
        async (png) => {
          const image = new Image();
          image.src = "data:image/png;base64," + png;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const c = canvas.getContext("2d");
          c.drawImage(image, 0, 0);
          return [
            ...c.getImageData(
              Math.floor((8 * image.width) / 80),
              Math.floor((15 * image.height) / 80),
              1,
              1,
            ).data,
          ];
        },
        (await vector.screenshot()).toString("base64"),
      );
      assert.deepEqual(
        pixel,
        [255, 0, 0, 255],
        "Inner SVG filters also paint inside portable review shadow roots",
      );
    });
  const png = path.join(dir, "export.png");
  await exportArtifact("png", url + "portable.html", png);
  assert.ok((await fs.stat(png)).size > 1000);
  await withPage(url + "portable.html", async (page) => {
    const bounds = await page.locator('[data-figma-id="1:1"]').boundingBox();
    const rgba = await page.evaluate(
      async (encoded) => {
        const image = new Image();
        image.src = "data:image/png;base64," + encoded.png;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = image.width;
        c.height = image.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return [
          ...ctx.getImageData(
            Math.floor(encoded.bounds.x + (338 * encoded.bounds.width) / 640),
            Math.floor(encoded.bounds.y + (40 * encoded.bounds.height) / 400),
            1,
            1,
          ).data,
        ];
      },
      { png: (await fs.readFile(png)).toString("base64"), bounds },
    );
    assert.deepEqual(rgba, [255, 0, 0, 255]);
  });
});
