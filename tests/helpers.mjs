import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { compileSchema, parseSchema, encodeBinarySchema } from "kiwi-schema";
export const root = fileURLToPath(new URL("..", import.meta.url));
export async function temporary(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-design-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
export function figFixture({ duplicateName = false, cycle = false } = {}) {
  const schema = parseSchema(
    `enum NodeType { DOCUMENT = 0; CANVAS = 1; FRAME = 2; TEXT = 3; SYMBOL = 4; } enum PaintType { SOLID = 0; } struct Guid { uint sessionID; uint localID; } struct Parent { Guid guid; string position; } struct Vec { float x; float y; } struct Color { float r; float g; float b; float a; } message Paint { PaintType type = 1; Color color = 2; } message Node { Guid guid = 1; Parent parentIndex = 2; NodeType type = 3; string name = 4; Vec size = 5; Paint[] fillPaints = 6; string characters = 7; } message Message { Node[] nodeChanges = 1; }`,
  );
  const guid = (sessionID, localID) => ({ sessionID, localID });
  const message = {
    nodeChanges: [
      { guid: guid(0, 0), type: "DOCUMENT", name: "Document" },
      {
        guid: guid(1, 0),
        parentIndex: { guid: cycle ? guid(1, 2) : guid(0, 0), position: "a" },
        type: "CANVAS",
        name: "Page",
      },
      {
        guid: guid(1, 1),
        parentIndex: { guid: guid(1, 0), position: "a" },
        type: "FRAME",
        name: "Reading room",
        size: { x: 400, y: 300 },
        fillPaints: [{ type: "SOLID", color: { r: 0.9, g: 0.95, b: 1, a: 1 } }],
      },
      {
        guid: guid(1, 2),
        parentIndex: { guid: guid(1, 1), position: "b" },
        type: "TEXT",
        name: duplicateName ? "Reading room" : "Title",
        characters: "Safe <title> & useful content",
        size: { x: 350, y: 40 },
      },
      {
        guid: guid(1, 3),
        parentIndex: { guid: guid(1, 0), position: "b" },
        type: "SYMBOL",
        name: "Button",
        size: { x: 160, y: 50 },
        fillPaints: [
          { type: "SOLID", color: { r: 0.1, g: 0.3, b: 0.7, a: 1 } },
        ],
      },
    ],
  };
  const compiled = compileSchema(schema);
  const chunks = [
    deflateRawSync(encodeBinarySchema(schema)),
    deflateRawSync(compiled.encodeMessage(message)),
  ];
  const header = Buffer.alloc(12);
  header.write("fig-kiwi");
  header.writeUInt32LE(15, 8);
  return Buffer.concat([
    header,
    ...chunks.flatMap((chunk) => {
      const length = Buffer.alloc(4);
      length.writeUInt32LE(chunk.length);
      return [length, chunk];
    }),
  ]);
}
