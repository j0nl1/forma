import { copyCatalogResource } from "./helpers.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import PptxGenJS from "pptxgenjs";
import { unzipSync, strFromU8 } from "fflate";
import { temporary, root } from "./helpers.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import {
  readPptxFont,
  encodePptxFont,
} from "../packages/exports/src/lib/pptx-fonts-metadata.mjs";
import {
  loadPptxFonts,
  preparePptxFonts,
  embedPptxFonts,
} from "../packages/exports/src/lib/pptx-fonts.mjs";

const execute = promisify(execFile);

// Use redistributable distro fonts already available to the test runner. Keep
// their license records and rename only the test copy; no font is installed.
const candidates = [
  ...[
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/dejavu",
    "/usr/share/fonts/TTF",
  ].map((dir) => ({
    dir,
    sourceFamily: "DejaVu Sans Mono",
    sourcePostscript: "DejaVuSansMono",
    family: "Pptx Font Sample",
    files: [
      "DejaVuSansMono.ttf",
      "DejaVuSansMono-Bold.ttf",
      "DejaVuSansMono-Oblique.ttf",
      "DejaVuSansMono-BoldOblique.ttf",
    ],
  })),
  ...[
    "/usr/share/fonts/truetype/liberation2",
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts/liberation-mono",
  ].map((dir) => ({
    dir,
    sourceFamily: "Liberation Mono",
    sourcePostscript: "LiberationMono",
    family: "Pptx Font Test1",
    files: [
      "LiberationMono-Regular.ttf",
      "LiberationMono-Bold.ttf",
      "LiberationMono-Italic.ttf",
      "LiberationMono-BoldItalic.ttf",
    ],
  })),
];
let fixture;
for (const candidate of candidates)
  if (
    (
      await Promise.all(
        candidate.files.map((file) =>
          fs.stat(path.join(candidate.dir, file)).catch(() => null),
        ),
      )
    ).every(Boolean)
  ) {
    fixture = candidate;
    break;
  }
assert.ok(
  fixture,
  "Font integration tests require the distro DejaVu Sans Mono or Liberation Mono family.",
);
const family = fixture.family;
function tableDirectory(bytes) {
  return new Map(
    Array.from({ length: bytes.readUInt16BE(4) }, (_, index) => {
      const at = 12 + index * 16;
      return [
        bytes.toString("ascii", at, at + 4),
        {
          at,
          offset: bytes.readUInt32BE(at + 8),
          length: bytes.readUInt32BE(at + 12),
        },
      ];
    }),
  );
}
function checksum(bytes) {
  let value = 0;
  for (let i = 0; i < bytes.length; i += 4)
    for (let j = 0; j < 4; j++)
      value = (value + (bytes[i + j] ?? 0) * 2 ** (24 - j * 8)) >>> 0;
  return value;
}
function repairChecksums(bytes) {
  const tables = tableDirectory(bytes),
    head = tables.get("head");
  bytes.writeUInt32BE(0, head.offset + 8);
  for (const { at, offset, length } of tables.values())
    bytes.writeUInt32BE(
      checksum(bytes.subarray(offset, offset + length)),
      at + 4,
    );
  bytes.writeUInt32BE((0xb1b0afba - checksum(bytes)) >>> 0, head.offset + 8);
  return bytes;
}
function renamedFont(input) {
  const bytes = Buffer.from(input),
    table = tableDirectory(bytes).get("name");
  const start = table.offset,
    count = bytes.readUInt16BE(start + 2),
    storage = start + bytes.readUInt16BE(start + 4);
  for (let i = 0; i < count; i++) {
    const at = start + 6 + i * 12,
      id = bytes.readUInt16BE(at + 6),
      platform = bytes.readUInt16BE(at);
    if (![1, 3, 4, 6, 16].includes(id)) continue;
    const offset = storage + bytes.readUInt16BE(at + 10),
      length = bytes.readUInt16BE(at + 8);
    const data = bytes.subarray(offset, offset + length);
    if (platform === 0 || platform === 3) {
      const text = new TextDecoder("utf-16be")
        .decode(data)
        .replaceAll(fixture.sourceFamily, family)
        .replaceAll(fixture.sourcePostscript, "PptxFontSample");
      const encoded = Buffer.from(text, "utf16le").swap16();
      assert.equal(encoded.length, length);
      encoded.copy(bytes, offset);
    } else if (platform === 1) {
      const text = data
        .toString("latin1")
        .replaceAll(fixture.sourceFamily, family)
        .replaceAll(fixture.sourcePostscript, "PptxFontSample");
      const encoded = Buffer.from(text, "latin1");
      assert.equal(encoded.length, length);
      encoded.copy(bytes, offset);
    }
  }
  return repairChecksums(bytes);
}
async function fontFixture(t) {
  const dir = await temporary(t),
    paths = [];
  for (const name of fixture.files) {
    const target = path.join(dir, name);
    await fs.writeFile(
      target,
      renamedFont(await fs.readFile(path.join(fixture.dir, name))),
    );
    paths.push(target);
  }
  return { dir, paths };
}
const decodeEot = (bytes) => {
  assert.equal(bytes.readUInt32LE(0), bytes.length);
  assert.equal(bytes.readUInt32LE(8), 0x20001);
  assert.equal(bytes.readUInt32LE(12), 0);
  assert.equal(bytes.readUInt16LE(34), 0x504c);
  const names = [];
  let at = 80;
  for (let i = 0; i < 5; i++) {
    assert.equal(bytes.readUInt16LE(at), 0);
    const length = bytes.readUInt16LE(at + 2);
    names.push(bytes.subarray(at + 4, at + 4 + length).toString("utf16le"));
    at += 4 + length;
  }
  assert.equal(bytes.length - at, bytes.readUInt32LE(4));
  return { names, font: bytes.subarray(at) };
};
const xml = (zip, name) => strFromU8(zip[name]);

test("PowerPoint font snapshots validate real names/styles and preserve complete font bytes in EOT", async (t) => {
  const { paths } = await fontFixture(t),
    plan = await loadPptxFonts(paths.map((path) => ({ path })));
  assert.equal(plan.faces.length, 4);
  assert.deepEqual(
    plan.faces.map((face) => face.slot),
    ["regular", "bold", "italic", "boldItalic"],
  );
  for (const face of plan.faces) {
    assert.equal(face.family, family);
    assert.equal(face.fsType, 0);
    assert.equal(face.covers(65), true);
    assert.equal(face.covers(0x10ffff), false);
    const decoded = decodeEot(face.eot);
    assert.equal(decoded.names[0], family);
    assert.equal(decoded.names[1], face.subfamily);
    assert.equal(decoded.names[4], "");
    assert.deepEqual(decoded.font, await fs.readFile(face.path));
  }
  const otf = "/usr/share/fonts/opentype/PowerlineSymbols.otf";
  if (await fs.stat(otf).catch(() => null)) {
    const bytes = await fs.readFile(otf),
      font = readPptxFont(bytes);
    assert.equal(font.family, "PowerlineSymbols");
    assert.deepEqual(decodeEot(encodePptxFont(bytes, font)).font, bytes);
  }
});

test("PowerPoint fonts reject malformed data, forbidden permissions, variable fonts and ambiguous faces", async (t) => {
  const { dir, paths } = await fontFixture(t);
  for (const entries of [
    "font.ttf",
    [{ path: "relative.ttf" }],
    [{ path: "https://example.com/font.ttf" }],
    [{ path: paths[0], family: "False name" }],
  ])
    await assert.rejects(loadPptxFonts(entries), /absolute local/);
  await assert.rejects(
    loadPptxFonts([{ path: paths[0] }, { path: paths[0] }]),
    /more than one supplied regular/,
  );
  const original = await fs.readFile(paths[0]),
    os2 = tableDirectory(original).get("OS/2").offset;
  for (const [flags, pattern] of [
    [2, /restricted-license/],
    [4, /preview-and-print/],
    [512, /bitmap-only/],
  ]) {
    const bytes = Buffer.from(original);
    if (flags === 512) bytes.writeUInt16BE(2, os2);
    bytes.writeUInt16BE(flags, os2 + 8);
    const file = path.join(dir, `restricted-${flags}.ttf`);
    await fs.writeFile(file, repairChecksums(bytes));
    await assert.rejects(loadPptxFonts([{ path: file }]), pattern);
  }
  const allowed = Buffer.from(original);
  allowed.writeUInt16BE(2, os2);
  allowed.writeUInt16BE(256 | 8, os2 + 8);
  const font = readPptxFont(allowed);
  assert.equal(font.fsType, 256 | 8);
  assert.equal(
    decodeEot(encodePptxFont(allowed, font)).font.length,
    allowed.length,
  );
  const invalid = Buffer.from(original);
  invalid.writeUInt32BE(invalid.length + 100, 20);
  assert.throws(() => readPptxFont(invalid), /outside|directory/);
  assert.throws(
    () => readPptxFont(Buffer.from("wOF2 invalid font bytes")),
    /static TrueType/,
  );
  const variable = Buffer.from(original);
  const extraTable = [...tableDirectory(variable)].find(
    ([tag]) =>
      ![
        "cmap",
        "head",
        "hhea",
        "hmtx",
        "maxp",
        "name",
        "OS/2",
        "post",
        "glyf",
        "loca",
      ].includes(tag),
  );
  assert.ok(extraTable, "The fixture contains an optional layout table.");
  variable.write("fvar", extraTable[1].at, 4, "ascii");
  assert.throws(() => readPptxFont(variable), /variable fonts/);
});

test("PowerPoint uses explicit font snapshots in Chromium and packages all editable variants", async (t) => {
  const { dir, paths } = await fontFixture(t);
  await copyCatalogResource("slide-deck", path.join(dir, "starters"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Portable fonts</title><style>body{margin:0}section{padding:30px;font:25px "Source Alias",sans-serif}h1{font-size:38px}</style></head><body><deck-stage width="800" height="500"><section><h1>Portable editable heading</h1><p>Regular <b>bold</b> <i>italic</i> <b><i>bold italic</i></b></p></section></deck-stage><script src="starters/deck.js"></script></body></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const entries = paths.map((path) => ({ path })),
    plan = await loadPptxFonts(entries);
  await withPage(url, async (page) => {
    // An existing CSS face deliberately points at different bytes. Supplying
    // the regular file must replace its visible glyphs, not only add metadata.
    const before = await page.evaluate(
      async ({ family, data }) => {
        const style = document.createElement("style");
        style.textContent = `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${data});font-weight:400;font-style:normal}`;
        document.head.append(style);
        await document.fonts.load(`30px "${family}"`);
        const canvas = document.createElement("canvas");
        canvas.width = 300;
        canvas.height = 50;
        const context = canvas.getContext("2d");
        context.font = `30px "${family}"`;
        context.fillText("Specific glyphs", 0, 35);
        return canvas.toDataURL();
      },
      { family, data: plan.faces[2].bytes.toString("base64") },
    );
    await preparePptxFonts(page, plan);
    const widths = await page.evaluate(
      async ({ family, data }) => {
        const canvas = document.createElement("canvas"),
          context = canvas.getContext("2d");
        canvas.width = 300;
        canvas.height = 50;
        context.font = `30px "${family}"`;
        context.fillText("Specific glyphs", 0, 35);
        const actual = canvas.toDataURL(),
          thin = context.measureText("iiiiiiii").width,
          wide = context.measureText("WWWWWWWW").width;
        const reference = new FontFace(
          "Expected Snapshot",
          Uint8Array.from(atob(data), (character) => character.charCodeAt(0)),
        );
        await reference.load();
        document.fonts.add(reference);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = '30px "Expected Snapshot"';
        context.fillText("Specific glyphs", 0, 35);
        return {
          thin,
          wide,
          actual,
          reference: canvas.toDataURL(),
        };
      },
      { family, data: plan.faces[0].bytes.toString("base64") },
    );
    assert.equal(widths.thin, widths.wide);
    assert.notEqual(widths.actual, before);
    assert.equal(widths.actual, widths.reference);
  });
  const out = path.join(dir, "portable.pptx"),
    result = await exportArtifact("pptx", url, out, {
      pptxFonts: entries,
      fontSwaps: [{ from: "Source Alias", to: family }],
    });
  assert.equal(result.embeddedFonts.length, 1);
  assert.equal(result.embeddedFonts[0].family, family);
  assert.equal(result.embeddedFonts[0].faces.length, 4);
  assert.ok(
    !result.warnings.some((warning) =>
      /not embedded|no supplied|does not map/.test(warning),
    ),
  );
  const zip = unzipSync(await fs.readFile(out)),
    presentation = xml(zip, "ppt/presentation.xml"),
    rels = xml(zip, "ppt/_rels/presentation.xml.rels");
  assert.match(presentation, /embedTrueTypeFonts="1"/);
  assert.match(presentation, /saveSubsetFonts="0"/);
  assert.match(presentation, /<p:notesSz[^>]*\/><p:embeddedFontLst>/);
  for (const slot of ["regular", "bold", "italic", "boldItalic"])
    assert.match(presentation, new RegExp(`<p:${slot} r:id="rId\\d+"/>`));
  assert.equal((rels.match(/relationships\/font"/g) || []).length, 4);
  assert.match(
    xml(zip, "[Content_Types].xml"),
    /Extension="fntdata" ContentType="application\/x-fontdata"/,
  );
  assert.match(
    xml(zip, "ppt/slides/slide1.xml"),
    /<a:t>Portable editable heading<\/a:t>/,
  );
  assert.match(
    xml(zip, "ppt/slides/slide1.xml"),
    new RegExp(`typeface="${family}"`),
  );
  const recovered = Object.entries(zip)
    .filter(([name]) => name.endsWith(".fntdata"))
    .map(([, data]) => decodeEot(Buffer.from(data)).font);
  assert.equal(recovered.length, 4);
  for (const face of plan.faces)
    assert.ok(recovered.some((bytes) => bytes.equals(face.bytes)));
});

test("PowerPoint font diagnostics distinguish missing families, styles and glyphs without embedding unused fonts", async (t) => {
  const { paths } = await fontFixture(t),
    plan = await loadPptxFonts([{ path: paths[0] }]);
  const deck = new PptxGenJS();
  deck.addSlide().addText("Test", { fontFace: family });
  const buffer = await deck.write({ outputType: "nodebuffer" });
  const text = (fontFace, text, bold = false) => ({
    kind: "text",
    fontFace,
    text,
    bold,
  });
  const empty = embedPptxFonts(buffer, { faces: [] }, [
    { objects: [text(family, "Test")] },
  ]);
  assert.equal(empty.embeddedFonts.length, 0);
  assert.match(empty.warnings[0], /not embedded/);
  assert.equal(empty.buffer, buffer);
  const result = embedPptxFonts(buffer, plan, [
    {
      objects: [
        text(family, "Test", true),
        text(family, "\u{10FFFF}"),
        text("Unsupplied Sans", "Other"),
      ],
    },
  ]);
  assert.ok(
    result.warnings.some((warning) => warning.includes("no supplied bold")),
  );
  assert.ok(result.warnings.some((warning) => warning.includes("U+10FFFF")));
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("Unsupplied Sans is not embedded"),
    ),
  );
  const unused = embedPptxFonts(buffer, plan, [
    { objects: [text("Unsupplied Sans", "Other")] },
  ]);
  assert.equal(unused.embeddedFonts.length, 0);
  assert.ok(unused.warnings.some((warning) => warning.includes("not used")));
  assert.equal(unused.buffer, buffer);
});

test(
  "LibreOffice uses every embedded style of an uninstalled font while the control deck substitutes",
  { skip: process.env.STUDIO_TEST_IMPRESS !== "1" },
  async (t) => {
    const soffice = process.env.STUDIO_TEST_FONT_SOFFICE || "soffice";
    const { stdout: version } = await execute(soffice, ["--version"], {
      timeout: 15000,
    });
    t.diagnostic(`Embedded-font consumer: ${soffice}: ${version.trim()}`);
    const release = version.match(/LibreOffice(?:Dev)? (\d+)\.(\d+)/);
    assert.ok(
      release &&
        (Number(release[1]) > 25 ||
          (Number(release[1]) === 25 && Number(release[2]) >= 8)),
      `PPTX embedded-font import requires LibreOffice 25.8 or newer with EOT support; received ${version.trim()}. Set STUDIO_TEST_FONT_SOFFICE to the supported consumer binary.`,
    );
    const { dir, paths } = await fontFixture(t),
      plan = await loadPptxFonts(paths.map((path) => ({ path }))),
      deck = new PptxGenJS(),
      objects = [];
    deck.layout = "LAYOUT_WIDE";
    const slide = deck.addSlide();
    for (const [index, face] of plan.faces.entries()) {
      const text = `${face.slot}: iiiii WWWWW ffi 0123456789`;
      slide.addText(text, {
        x: 1,
        y: 0.5 + index * 1.2,
        w: 11,
        h: 0.7,
        fontFace: family,
        fontSize: 32,
        bold: face.bold,
        italic: face.italic,
      });
      objects.push({
        kind: "text",
        text,
        fontFace: family,
        bold: face.bold,
        italic: face.italic,
      });
    }
    const buffer = await deck.write({ outputType: "nodebuffer" }),
      embedded = embedPptxFonts(buffer, plan, [{ objects }]).buffer;
    await fs.writeFile(path.join(dir, "control.pptx"), buffer);
    await fs.writeFile(path.join(dir, "embedded.pptx"), embedded);
    // Each document gets a new process and profile so a previously loaded font
    // or cached substitution cannot make either half of the comparison pass.
    for (const name of ["control", "embedded"])
      await execute(
        soffice,
        [
          `-env:UserInstallation=${pathToFileURL(path.join(dir, `${name}-profile`)).href}`,
          "--headless",
          "--convert-to",
          "pdf",
          "--outdir",
          dir,
          path.join(dir, `${name}.pptx`),
        ],
        { timeout: 60000 },
      );
    const control = await execute("pdffonts", [path.join(dir, "control.pdf")]),
      actual = await execute("pdffonts", [path.join(dir, "embedded.pdf")]);
    assert.doesNotMatch(control.stdout, /PptxFontSample/);
    const embeddedStyles = actual.stdout
      .split("\n")
      .filter((line) => line.includes("PptxFontSample"));
    assert.equal(embeddedStyles.length, 4, actual.stdout);
    const italic =
      fixture.sourceFamily === "DejaVu Sans Mono" ? "Oblique" : "Italic";
    assert.deepEqual(
      embeddedStyles
        .map((line) =>
          line
            .trim()
            .split(/\s+/)[0]
            .replace(/^[A-Z]{6}\+/, ""),
        )
        .sort(),
      [
        "PptxFontSample",
        "PptxFontSample-Bold",
        `PptxFontSample-${italic}`,
        `PptxFontSample-Bold${italic}`,
      ].sort(),
      actual.stdout,
    );
    for (const line of embeddedStyles)
      assert.match(line, /TrueType\s+\w+\s+yes\s+yes/);
  },
);
