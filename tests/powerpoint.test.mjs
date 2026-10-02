import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { temporary, root } from "./helpers.mjs";
import { serve } from "../skills/studio-design/scripts/preview.mjs";
import { exportArtifact } from "../skills/studio-design/scripts/export.mjs";

async function fixture(
  t,
  content = `<section style="background:#faf9f5"><h1>A real editable title</h1><p>Useful <b>bold</b> words.</p><ul><li>One visible bullet</li></ul><aside data-notes>Private presenter notes</aside></section><section data-deck-skip><h1>Skipped</h1></section><section style="background:#112233;color:white" data-speaker-notes="Final note"><h1>Final slide</h1><div data-anim="fade-in">Finished build</div><div style="background:linear-gradient(red,blue);width:100px;height:70px">Preserved artwork</div><img alt="Local mark" width="50" height="40" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='40'%3E%3Crect width='50' height='40' fill='green'/%3E%3C/svg%3E"></section>`,
) {
  const dir = await temporary(t);
  await fs.cp(
    path.join(root, "skills/studio-design/assets/starters"),
    path.join(dir, "starters"),
    { recursive: true },
  );
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PowerPoint fixture</title><style>body{margin:0}section{padding:30px;font:22px Arial}h1{font-size:40px;margin:0 0 15px}p{margin:0 0 10px}</style></head><body><deck-stage width="800" height="500">${content}</deck-stage><script src="starters/deck.js"></script></body></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url };
}
const xml = (zip, file) => strFromU8(zip[file]);

test("PowerPoint produces native text/shapes, local pictures, ordered slides and private notes", async (t) => {
  const { dir, url } = await fixture(t);
  const out = path.join(dir, "deck.pptx");
  const result = await exportArtifact("pptx", url, out);
  assert.equal(result.slides, 2);
  assert.equal(result.mode, "editable");
  assert.ok(result.editableObjects > 5);
  assert.equal(result.rasterObjects, 2);
  assert.ok(result.warnings.some((w) => w.includes("finished static artwork")));
  assert.ok(result.warnings.some((w) => w.includes("preserve CSS")));
  const zip = unzipSync(await fs.readFile(out));
  const first = xml(zip, "ppt/slides/slide1.xml");
  const last = xml(zip, "ppt/slides/slide2.xml");
  assert.match(first, /<a:t>A real editable title<\/a:t>/);
  assert.match(first, /<a:t>bold<\/a:t>/);
  assert.match(first, /<a:t>•<\/a:t>/);
  assert.doesNotMatch(first + last, /Skipped|Private presenter notes/);
  assert.match(last, /Final slide/);
  assert.match(last, /Finished build/);
  assert.equal((last.match(/<p:pic>/g) || []).length, 2);
  assert.match(
    xml(zip, "ppt/notesSlides/notesSlide1.xml"),
    /Private presenter notes/,
  );
  assert.match(xml(zip, "ppt/notesSlides/notesSlide2.xml"), /Final note/);
  assert.match(xml(zip, "ppt/presentation.xml"), /cx="7620000" cy="4762500"/);
  assert.equal(
    Object.keys(zip).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .length,
    2,
  );
  assert.ok(Object.keys(zip).some((f) => f.endsWith(".png")));
  assert.equal(
    (await fs.readdir(dir)).filter((f) => f.endsWith(".tmp")).length,
    0,
  );
  await assert.rejects(
    exportArtifact("pptx", url, out),
    /Refusing to overwrite/,
  );
});

test("PowerPoint screenshot CLI embeds one finished image per slide and retains indexed notes", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<section><h1>First</h1><p data-anim="fly-in">Fully visible</p></section><section><h1>Second</h1></section><script id="speaker-notes" type="application/json">["First note","Second note"]</script>`,
  );
  const out = path.join(dir, "snapshots.pptx");
  const stdout = await new Promise((resolve, reject) => {
    // Exercise argument parsing in a separate process while the fixture server keeps running.
    import("node:child_process").then(({ execFile }) =>
      execFile(
        process.execPath,
        [
          path.join(root, "skills/studio-design/scripts/export.mjs"),
          "pptx",
          url,
          out,
          "--pptx-mode",
          "screenshots",
          "--scale",
          "2",
        ],
        (error, stdout) => (error ? reject(error) : resolve(stdout)),
      ),
    );
  });
  const result = JSON.parse(stdout);
  assert.equal(result.editableObjects, 0);
  assert.equal(result.rasterObjects, 2);
  const zip = unzipSync(await fs.readFile(out));
  for (const number of [1, 2]) {
    const slide = xml(zip, `ppt/slides/slide${number}.xml`);
    assert.equal((slide.match(/<p:pic>/g) || []).length, 1);
    assert.doesNotMatch(slide, /<a:t>/);
  }
  assert.match(xml(zip, "ppt/notesSlides/notesSlide2.xml"), /Second note/);
  const png = Object.values(zip).find(
    (data) => data[0] === 137 && data[1] === 80,
  );
  assert.equal(Buffer.from(png).readUInt32BE(16), 1600);
  assert.equal(Buffer.from(png).readUInt32BE(20), 1000);
});

test("PowerPoint rejects invalid options and non-decks without leaving partial files", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<section data-deck-skip><h1>Skipped</h1></section>`,
  );
  const output = path.join(dir, "invalid.pptx");
  for (const options of [
    { pptxMode: "fake" },
    { deviceScaleFactor: 0 },
    { fontSwaps: [{ from: "Arial" }] },
  ])
    await assert.rejects(exportArtifact("pptx", url, output, options));
  await assert.rejects(
    exportArtifact("pptx", url, output),
    /non-skipped slide/,
  );
  await assert.rejects(
    exportArtifact("pptx", url, path.join(dir, "wrong.png")),
    /\.pptx extension/,
  );
  await assert.rejects(
    exportArtifact("pptx", "https://example.com", output),
    /loopback/,
  );
  await fs.writeFile(
    path.join(dir, "plain.html"),
    "<h1>A scrolling page is not a deck</h1>",
  );
  await assert.rejects(
    exportArtifact("pptx", `${url}plain.html`, output),
    /initialized deck-stage/,
  );
  assert.equal(
    (await fs.readdir(dir)).filter(
      (f) => f.endsWith(".pptx") || f.endsWith(".tmp"),
    ).length,
    0,
  );
});

test("PowerPoint preserves font substitutions, wrapped lines, links and empty-note precedence", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<section data-speaker-notes=""><h1 style="width:320px">A heading with several wrapped words</h1><p><a href="https://example.com/article">Read the source</a></p></section><script id="speaker-notes" type="application/json">["Ignored fallback"]</script>`,
  );
  const out = path.join(dir, "fonts.pptx");
  await exportArtifact("pptx", url, out, {
    fontSwaps: [{ from: "Arial", to: "Courier New" }],
  });
  const zip = unzipSync(await fs.readFile(out));
  const slide = xml(zip, "ppt/slides/slide1.xml");
  assert.match(slide, /typeface="Courier New"/);
  assert.ok((slide.match(/<a:t>/g) || []).length > 3);
  assert.match(
    xml(zip, "ppt/slides/_rels/slide1.xml.rels"),
    /https:\/\/example.com\/article/,
  );
  assert.doesNotMatch(
    xml(zip, "ppt/notesSlides/notesSlide1.xml"),
    /Ignored fallback/,
  );
});

test("PowerPoint handles complex slide roots and reports identical artwork and indexed-note mismatches", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<section style="background:linear-gradient(#fff,#def)"><h1>Same</h1></section><section style="background:linear-gradient(#fff,#def)"><h1>Same</h1></section><script id="speaker-notes" type="application/json">["Only first"]</script>`,
  );
  const out = path.join(dir, "fallback.pptx");
  const result = await exportArtifact("pptx", url, out);
  assert.equal(result.editableObjects, 0);
  assert.equal(result.rasterObjects, 2);
  assert.ok(result.warnings.some((w) => w.includes("identical artwork")));
  assert.ok(result.warnings.some((w) => w.includes("note count differs")));
  const zip = unzipSync(await fs.readFile(out));
  assert.equal(
    (xml(zip, "ppt/slides/slide1.xml").match(/<p:pic>/g) || []).length,
    1,
  );
});

test("PowerPoint fails on malformed notes and browser resource errors and cleans incomplete output", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<section data-speaker-notes="Explicit"><h1>Notes validation</h1></section><script id="speaker-notes" type="application/json">[42]</script>`,
  );
  const out = path.join(dir, "failure.pptx");
  await assert.rejects(exportArtifact("pptx", url, out), /array of strings/);
  const html = await fs.readFile(path.join(dir, "index.html"), "utf8");
  await fs.writeFile(
    path.join(dir, "index.html"),
    html
      .replace("[42]", "[]")
      .replace("Notes validation", 'Notes validation<img src="missing.png">'),
  );
  await assert.rejects(exportArtifact("pptx", url, out));
  assert.equal(
    (await fs.readdir(dir)).filter(
      (f) => f.endsWith(".pptx") || f.endsWith(".tmp"),
    ).length,
    0,
  );
});
