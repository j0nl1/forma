import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { compileSchema, parseSchema, encodeBinarySchema } from "kiwi-schema";
import { zipSync } from "fflate";
import { temporary } from "./helpers.mjs";
import { importFig } from "../skills/forma/scripts/figma.mjs";
import {
  loadFig,
  renderDocument,
  select,
} from "../skills/forma/scripts/lib/figma.mjs";
import {
  decodeVectorNetwork,
  vectorNetworkPaths,
} from "../skills/forma/scripts/lib/figma-vector-network.mjs";
import {
  compile,
  preview,
} from "../skills/forma/scripts/design-system.mjs";
import { bundle } from "../skills/forma/scripts/build.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/forma/scripts/export.mjs";

const ring = {
  vertices: [
    [5, 5],
    [95, 5],
    [95, 95],
    [5, 95],
    [30, 30],
    [70, 30],
    [70, 70],
    [30, 70],
  ],
  segments: [
    [0, 1],
    [2, 1],
    [2, 3],
    [0, 3],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
  ],
  regions: [
    {
      winding: 1,
      loops: [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
      ],
    },
  ],
};
const curve = {
  vertices: [
    [0, 40],
    [40, 0],
    [80, 40],
    [40, 80],
  ],
  segments: [
    [0, 1, 0, -22, -22, 0],
    [2, 1, 0, -22, 22, 0],
    [2, 3, 0, 22, 22, 0],
    [3, 0, -22, 0, 0, 22],
  ],
  regions: [{ winding: 0, loops: [[0, 1, 2, 3]] }],
};
const regions = {
  vertices: [
    [0, 0],
    [80, 0],
    [0, 80],
    [20, 20],
    [100, 20],
    [20, 100],
  ],
  segments: [
    [0, 1],
    [1, 2],
    [2, 0],
    [3, 4],
    [4, 5],
    [5, 3],
  ],
  regions: [
    { winding: 0, loops: [[0, 1, 2]] },
    { winding: 0, loops: [[3, 4, 5]] },
  ],
};
const ringPath =
  "M 6 6 L 114 6 L 114 114 L 6 114 L 6 6 Z M 36 36 L 84 36 L 84 84 L 36 84 L 36 36 Z";
const curvePath =
  "M 0 60 C 0 27 36 0 80 0 C 124 0 160 27 160 60 C 160 93 124 120 80 120 C 36 120 0 93 0 60 Z";
function networkBytes({ vertices, segments, regions }) {
  const result = Buffer.alloc(
    12 +
      vertices.length * 12 +
      segments.length * 28 +
      regions.reduce(
        (n, r) => n + 8 + r.loops.reduce((m, l) => m + 4 + l.length * 4, 0),
        0,
      ),
  );
  let offset = 0;
  const uint = (value) => {
    result.writeUInt32LE(value, offset);
    offset += 4;
  };
  const float = (value) => {
    result.writeFloatLE(value, offset);
    offset += 4;
  };
  uint(vertices.length);
  uint(segments.length);
  uint(regions.length);
  for (const [x, y] of vertices) {
    uint(7);
    float(x);
    float(y);
  }
  for (const [start, end, x1 = 0, y1 = 0, x2 = 0, y2 = 0] of segments) {
    uint(9);
    uint(start);
    float(x1);
    float(y1);
    uint(end);
    float(x2);
    float(y2);
  }
  for (const region of regions) {
    uint(region.winding);
    uint(region.loops.length);
    for (const loop of region.loops) {
      uint(loop.length);
      loop.forEach(uint);
    }
  }
  return result;
}
function triangleBytes() {
  return Buffer.concat(
    [[1, 0, 0], [2, 120, 0], [2, 0, 120], [0]].map(([code, ...values]) => {
      const bytes = Buffer.alloc(1 + values.length * 4);
      bytes[0] = code;
      values.forEach((value, i) => bytes.writeFloatLE(value, 1 + i * 4));
      return bytes;
    }),
  );
}
const guid = (localID) => ({ sessionID: 1, localID });
const identity = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
const paint = (r, g, b, opacity = 1) => ({
  type: "SOLID",
  color: { r, g, b, a: 1 },
  opacity,
});
function fixtureBytes() {
  // Only this independently authored constant schema is compiled, never imported schemas.
  const schema = parseSchema(`
    enum Type{DOCUMENT=0;SYMBOL=1;VECTOR=2;}
    struct Guid{uint sessionID;uint localID;}struct Vec{float x;float y;}struct Parent{Guid guid;string position;}
    struct Matrix{float m00;float m01;float m02;float m10;float m11;float m12;}struct Color{float r;float g;float b;float a;}
    message Paint{string type=1;Color color=2;float opacity=3;}message Geometry{uint commandsBlob=1;string windingRule=2;}
    message Vector{uint vectorNetworkBlob=1;Vec normalizedSize=2;}message Blob{byte[] bytes=1;}
    message Node{Guid guid=1;Parent parentIndex=2;Type type=3;string name=4;Vec size=5;Matrix transform=6;Paint[] fillPaints=7;Vector vectorData=8;Geometry[] fillGeometry=9;}
    message Message{Node[] nodeChanges=1;Blob[] blobs=2;}
  `);
  const node = (
    id,
    x,
    y,
    width,
    height,
    blob,
    c,
    normalized = { x: 100, y: 100 },
  ) => ({
    guid: guid(id),
    parentIndex: { guid: guid(1), position: String(id) },
    type: "VECTOR",
    name: "Network shape " + id,
    size: { x: width, y: height },
    transform: { ...identity, m02: x, m12: y },
    fillPaints: [c],
    vectorData: { vectorNetworkBlob: blob, normalizedSize: normalized },
  });
  const nonzero = { ...ring, regions: [{ ...ring.regions[0], winding: 0 }] };
  const nodes = [
    { guid: { sessionID: 0, localID: 0 }, type: "DOCUMENT", name: "Document" },
    {
      guid: guid(1),
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "a" },
      type: "SYMBOL",
      name: "Network laboratory",
      size: { x: 520, y: 320 },
      fillPaints: [paint(1, 1, 1)],
    },
    node(2, 20, 20, 120, 120, 0, paint(1, 0, 0)),
    node(3, 180, 20, 160, 120, 1, paint(0, 1, 0), { x: 80, y: 80 }),
    {
      ...node(4, 380, 20, 120, 120, 0, paint(0, 0, 1)),
      fillGeometry: [{ commandsBlob: 2 }],
    },
    node(5, 20, 180, 120, 120, 3, paint(0, 0, 1)),
    node(6, 180, 180, 100, 100, 4, paint(0, 1, 0, 0.5)),
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
          networkBytes(ring),
          networkBytes(curve),
          triangleBytes(),
          networkBytes(nonzero),
          networkBytes(regions),
        ].map((bytes) => ({ bytes: [...bytes] })),
      }),
    ),
  ];
  return Buffer.concat([
    head,
    ...chunks.flatMap((bytes) => {
      const size = Buffer.alloc(4);
      size.writeUInt32LE(bytes.length);
      return [size, bytes];
    }),
  ]);
}
async function fixture(t) {
  const dir = await temporary(t);
  const raw = path.join(dir, "raw.fig"),
    zip = path.join(dir, "zip.fig");
  const bytes = fixtureBytes();
  await fs.writeFile(raw, bytes);
  await fs.writeFile(zip, zipSync({ "canvas.fig": bytes }));
  return { dir, raw, zip };
}
const style = "*{box-sizing:border-box}body{margin:24px;background:white}";
const reference = `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${style}</style><div id="board" style="position:relative;width:520px;height:320px;background:white">
<svg width="120" height="120" style="position:absolute;left:20px;top:20px"><path d="M6 6H114V114H6Z M36 36H84V84H36Z" fill="red" fill-rule="evenodd"/></svg>
<svg width="160" height="120" style="position:absolute;left:180px;top:20px"><path d="M0 60C0 27 36 0 80 0C124 0 160 27 160 60C160 93 124 120 80 120C36 120 0 93 0 60Z" fill="lime"/></svg>
<svg width="120" height="120" style="position:absolute;left:380px;top:20px"><path d="M0 0L120 0L0 120Z" fill="blue"/></svg>
<svg width="120" height="120" style="position:absolute;left:20px;top:180px"><path d="M6 6H114V114H6Z M36 36H84V84H36Z" fill="blue" fill-rule="nonzero"/></svg>
<svg width="100" height="100" style="position:absolute;left:180px;top:180px"><path d="M0 0H80L0 80Z" fill="rgba(0,255,0,.5)"/><path d="M20 20H100L20 100Z" fill="rgba(0,255,0,.5)"/></svg></div></html>`;
async function consumer(dir, output, name) {
  await fs.writeFile(
    path.join(dir, name + ".jsx"),
    `import React from 'react';import {createRoot} from 'react-dom/client';import {NetworkLaboratory} from './${output}/components/NetworkLaboratory.jsx';createRoot(document.getElementById('root')).render(<NetworkLaboratory/>);`,
  );
  await bundle(path.join(dir, name + ".jsx"), path.join(dir, name + ".js"));
  await fs.writeFile(
    path.join(dir, name + ".html"),
    `<!doctype html><html lang="en"><meta name="codex-fixed-sheet" content="off"><style>${style}</style><div id="root"></div><script src="${name}.js"></script></html>`,
  );
}
async function sampledPixels(page, png, points, dimensions) {
  return page.evaluate(
    async ({ png, points, dimensions }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + png;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return points.map(([x, y]) => [
        ...context.getImageData(
          Math.floor((x * image.width) / dimensions[0]),
          Math.floor((y * image.height) / dimensions[1]),
          1,
          1,
        ).data,
      ]);
    },
    { png: png.toString("base64"), points, dimensions },
  );
}

test("network regions retain normalized loops, reversed curves, winding and finite malformed-input advisories", () => {
  const node = {
    size: { x: 120, y: 120 },
    vectorData: { normalizedSize: { x: 100, y: 100 }, vectorNetworkBlob: 0 },
  };
  assert.deepEqual(decodeVectorNetwork(networkBytes(ring), node), [
    { d: ringPath, rule: "evenodd" },
  ]);
  assert.deepEqual(
    decodeVectorNetwork(networkBytes(curve), {
      size: { x: 160, y: 120 },
      vectorData: { normalizedSize: { x: 80, y: 80 } },
    }),
    [{ d: curvePath, rule: "nonzero" }],
  );
  const rounded = {
    vertices: [
      [-0.0625, -0],
      [0.0625, 1.0625],
    ],
    segments: [[0, 1]],
    regions: [{ winding: 0, loops: [[0]] }],
  };
  assert.deepEqual(decodeVectorNetwork(networkBytes(rounded)), [
    { d: "M -0.062 0 L 0.063 1.063 Z", rule: "nonzero" },
  ]);
  const padded = Buffer.concat([
    Buffer.alloc(7),
    networkBytes(ring),
    Buffer.alloc(9),
  ]);
  assert.deepEqual(
    decodeVectorNetwork(padded.subarray(7, padded.length - 9), node),
    [{ d: ringPath, rule: "evenodd" }],
  );
  assert.equal(
    decodeVectorNetwork(networkBytes({ ...ring, regions: [] }), node).length,
    0,
    "Open segment networks do not synthesize closed region paths",
  );
  const warnings = [];
  const read = (bytes) =>
    vectorNetworkPaths({ blobs: [{ bytes }] }, node, (message) =>
      warnings.push(message),
    );
  assert.deepEqual(read(Buffer.alloc(11)), []);
  assert.match(warnings.pop(), /truncated counts header/);
  const badCount = Buffer.from(networkBytes(ring));
  badCount.writeUInt32LE(0xffffffff, 0);
  assert.deepEqual(read(badCount), []);
  assert.match(warnings.pop(), /truncated vertex or segment table/);
  const badVertex = Buffer.from(networkBytes(ring));
  badVertex.writeFloatLE(NaN, 16);
  const finitePaths = read(badVertex);
  assert.ok(finitePaths.every((p) => !p.d.includes("NaN")));
  assert.ok(warnings.some((w) => /non-finite coordinate/.test(w)));
  warnings.length = 0;
  const badReference = Buffer.from(networkBytes(ring));
  badReference.writeUInt32LE(500, 12 + ring.vertices.length * 12 + 4);
  read(badReference);
  assert.ok(warnings.some((w) => /vertex reference out of range/.test(w)));
  warnings.length = 0;
  const badSegment = {
    ...regions,
    regions: [regions.regions[0], { winding: 1, loops: [[900]] }],
  };
  assert.equal(read(networkBytes(badSegment)).length, 1);
  assert.match(warnings.pop(), /segment reference out of range/);
  const truncated = networkBytes(regions).subarray(
    0,
    networkBytes(regions).length - 1,
  );
  assert.equal(read(truncated).length, 1);
  assert.match(warnings.pop(), /truncated loop segment list/);
  assert.deepEqual(
    vectorNetworkPaths({ blobs: [] }, node, (m) => warnings.push(m)),
    [],
  );
  assert.match(warnings.pop(), /missing blob/);
  assert.deepEqual(vectorNetworkPaths({}, {}), []);
  assert.throws(
    () =>
      decodeVectorNetwork(networkBytes(ring), {
        size: { x: Infinity },
        vectorData: { normalizedSize: { x: 100 } },
      }),
    /non-finite normalized size/,
  );
});

test("raw and ZIP generated network components match independent SVG regions while raw materialization retains its inspected boundary", async (t) => {
  const { dir, raw, zip } = await fixture(t);
  const originals = [await fs.readFile(raw), await fs.readFile(zip)];
  const doc = await loadFig(raw),
    rawResult = renderDocument(doc, select(doc, "1:1"));
  assert.equal(
    (rawResult.html.match(/<path /g) || []).length,
    1,
    "Raw renderer keeps saved geometry and does not invent network contours",
  );
  assert.match(rawResult.warnings.join("\n"), /vector fill geometry missing/);
  for (const [name, input] of [
    ["raw", raw],
    ["zip", zip],
  ]) {
    const result = await importFig(
      "components",
      input,
      path.join(dir, name),
      "1:1",
    );
    assert.deepEqual(result.warnings, []);
    const source = await fs.readFile(
      path.join(dir, name, "components/NetworkLaboratory.jsx"),
      "utf8",
    );
    assert.ok(source.includes(ringPath));
    assert.ok(source.includes(curvePath));
    await consumer(dir, name, name + "-consumer");
  }
  await fs.writeFile(path.join(dir, "reference.html"), reference);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  const expected = await withPage(url + "reference.html", (page) =>
    page.locator("#board").screenshot(),
  );
  for (const name of ["raw", "zip"])
    await withPage(url + name + "-consumer.html", async (page, errors) => {
      const board = page.locator('#root > [data-figma-id="1:1"]');
      await board.waitFor();
      assert.deepEqual(await board.screenshot(), expected);
      assert.deepEqual(errors, []);
      if (process.env.CODEX_CAPTURE_FIGMA_NETWORK) {
        await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_NETWORK, {
          recursive: true,
        });
        await board.screenshot({
          path: path.join(
            process.env.CODEX_CAPTURE_FIGMA_NETWORK,
            name + ".png",
          ),
        });
        await exportArtifact(
          "html",
          path.join(dir, name + "-consumer.html"),
          path.join(process.env.CODEX_CAPTURE_FIGMA_NETWORK, name + ".html"),
        );
      }
    });
  assert.deepEqual(await fs.readFile(raw), originals[0]);
  assert.deepEqual(await fs.readFile(zip), originals[1]);
});

test("compiled network component review and actual portable PNG preserve regions after Figma and generated sources are deleted", async (t) => {
  const { dir, raw, zip } = await fixture(t),
    system = path.join(dir, "system");
  await importFig("design-system", zip, system);
  await compile(system);
  await preview(system);
  await fs.copyFile(
    path.join(system, "preview.html"),
    path.join(dir, "review.html"),
  );
  await consumer(dir, "system", "portable-consumer");
  await exportArtifact(
    "html",
    path.join(dir, "portable-consumer.html"),
    path.join(dir, "portable.html"),
  );
  await fs.rm(system, { recursive: true, force: true });
  await fs.rm(raw);
  await fs.rm(zip);
  await fs.rm(path.join(dir, "portable-consumer.js"));
  await fs.rm(path.join(dir, "portable-consumer.jsx"));
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  const points = [
      [30, 60],
      [80, 80],
      [260, 80],
      [180, 20],
      [80, 240],
      [190, 190],
      [215, 215],
    ],
    colors = [
      [255, 0, 0, 255],
      [255, 255, 255, 255],
      [0, 255, 0, 255],
      [255, 255, 255, 255],
      [0, 0, 255, 255],
      [127, 255, 127, 255],
      [63, 255, 63, 255],
    ];
  await withPage(url + "review.html", async (page, errors) => {
    const board = page
      .locator('[data-figma-id="1:1"]')
      .filter({ has: page.locator('[data-figma-id="1:2"] path') })
      .first();
    await board.waitFor();
    assert.deepEqual(
      await sampledPixels(page, await board.screenshot(), points, [520, 320]),
      colors,
    );
    assert.deepEqual(errors, []);
    if (process.env.CODEX_CAPTURE_FIGMA_NETWORK) {
      await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_NETWORK, {
        recursive: true,
      });
      await board.screenshot({
        path: path.join(process.env.CODEX_CAPTURE_FIGMA_NETWORK, "review.png"),
      });
      await fs.copyFile(
        path.join(dir, "review.html"),
        path.join(process.env.CODEX_CAPTURE_FIGMA_NETWORK, "review.html"),
      );
    }
  });
  await withPage(url + "portable.html", async (page, errors) => {
    const board = page.locator('#root > [data-figma-id="1:1"]');
    await board.waitFor();
    assert.deepEqual(
      await sampledPixels(page, await board.screenshot(), points, [520, 320]),
      colors,
    );
    assert.deepEqual(errors, []);
  });
  const output = path.join(dir, "portable.png");
  await exportArtifact("png", url + "portable.html", output);
  if (process.env.CODEX_CAPTURE_FIGMA_NETWORK) {
    await fs.mkdir(process.env.CODEX_CAPTURE_FIGMA_NETWORK, {
      recursive: true,
    });
    await fs.copyFile(
      output,
      path.join(process.env.CODEX_CAPTURE_FIGMA_NETWORK, "portable.png"),
    );
    await fs.copyFile(
      path.join(dir, "portable.html"),
      path.join(process.env.CODEX_CAPTURE_FIGMA_NETWORK, "portable.html"),
    );
  }
  await withPage(url + "portable.html", async (page) =>
    assert.deepEqual(
      await sampledPixels(
        page,
        await fs.readFile(output),
        points.map(([x, y]) => [x + 24, y + 24]),
        [1440, 1000],
      ),
      colors,
    ),
  );
});
