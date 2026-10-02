import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import http from "node:http";
import { withPage } from "../skills/studio-design/scripts/lib/browser.mjs";
import { captureSlide } from "../skills/studio-design/scripts/lib/pptx-capture.mjs";
import { capturePptxImage } from "../skills/studio-design/scripts/lib/pptx-layers.mjs";
import {
  preparePptxMedia,
  preparePptxMediaElements,
} from "../skills/studio-design/scripts/lib/pptx-media.mjs";
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
  const result = await exportArtifact("pptx", url, out, {
    pptxAnimations: "static",
  });
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
    { pptxAnimations: "fake" },
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

test("PowerPoint isolates gradient slide backgrounds and reports identical artwork and indexed-note mismatches", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<section style="background:linear-gradient(#fff,#def)"><h1>Same</h1></section><section style="background:linear-gradient(#fff,#def)"><h1>Same</h1></section><script id="speaker-notes" type="application/json">["Only first"]</script>`,
  );
  const out = path.join(dir, "fallback.pptx");
  const result = await exportArtifact("pptx", url, out);
  assert.equal(result.editableObjects, 2);
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

test("PowerPoint keeps inseparable graphics, rotation and stacking as pictures but scales and translates native text", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<style>.decorated{position:relative}.decorated::before{content:"";position:absolute;inset:0;background:linear-gradient(#fff8,#def8)}</style><section><h1>Editable heading</h1><p class="decorated">Decorative layer</p><p style="color:color(display-p3 1 0 0)">Wide-gamut color</p><p style="direction:rtl">Right-to-left layout</p><p style="rotate:8deg">Authored rotation</p><p style="scale:0.8">Authored scale</p><p style="translate:12px 0">Authored translation</p></section><section><p style="position:relative;z-index:2">Explicit stacking</p></section>`,
  );
  const out = path.join(dir, "complex.pptx");
  const result = await exportArtifact("pptx", url, out);
  assert.equal(result.rasterObjects, 5);
  const zip = unzipSync(await fs.readFile(out));
  assert.match(xml(zip, "ppt/slides/slide1.xml"), /Editable heading/);
  assert.doesNotMatch(xml(zip, "ppt/slides/slide1.xml"), /Authored rotation/);
  assert.match(xml(zip, "ppt/slides/slide1.xml"), /Authored scale/);
  assert.match(xml(zip, "ppt/slides/slide1.xml"), /Authored translation/);
  assert.equal(
    (xml(zip, "ppt/slides/slide1.xml").match(/<p:pic>/g) || []).length,
    4,
  );
  assert.equal(
    (xml(zip, "ppt/slides/slide2.xml").match(/<p:pic>/g) || []).length,
    1,
  );
});

test("PowerPoint paint captures retain editable text, transparent shadows and exact source styles", async (t) => {
  const { url } = await fixture(
    t,
    `<section><h1>First</h1></section><section style="background:linear-gradient(#fff,#def)"><h1>Foreground heading</h1><div style="margin:35px;background:#f80;border-radius:18px;width:240px;height:90px;box-shadow:12px 12px 8px #0008">Editable card</div><p>Unrelated sibling</p></section>`,
  );
  await withPage(url, async (page) => {
    await page.evaluate(() =>
      document.querySelector("deck-stage").preparePrint(),
    );
    await page.emulateMedia({ media: "print" });
    const captured = await page.evaluate(captureSlide, 1);
    assert.ok(
      captured.objects.some((object) => object.text === "Foreground heading"),
    );
    assert.ok(
      captured.objects.some((object) => object.text === "Editable card"),
    );
    const styles = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("*")].map((element) =>
          element.getAttribute("style"),
        ),
      );
    const locator = page.locator("deck-stage > [data-deck-slide]").nth(1);
    const original = await locator.screenshot();
    const before = await styles();
    const paints = captured.objects.filter(
      (object) => object.layer === "paint",
    );
    assert.equal(paints.length, 2);
    const background = await capturePptxImage(page, locator, paints[0]);
    const card = await capturePptxImage(page, locator, paints[1]);
    assert.deepEqual(await styles(), before);
    assert.deepEqual(await locator.screenshot(), original);
    const sample = await page.evaluate(
      async ({ background, card }) => {
        const read = async (data) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          return (x, y) => [...context.getImageData(x, y, 1, 1).data];
        };
        const bg = await read(background),
          paint = await read(card);
        return {
          textArea: bg(40, 50),
          blankArea: bg(600, 50),
          outside: paint(10, 10),
          center: paint(150, 150),
          shadow: paint(309, 205),
        };
      },
      {
        background: background.toString("base64"),
        card: card.toString("base64"),
      },
    );
    assert.deepEqual(sample.textArea, sample.blankArea);
    assert.equal(sample.outside[3], 0);
    assert.equal(sample.center[3], 255);
    assert.ok(sample.shadow[3] > 0 && sample.shadow[3] < 255);
  });
});

test("PowerPoint keeps uniformly scaled, translated and safely rounded foreground editable", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<section style="padding:0;background:white">
    <div id="scaled" style="position:absolute;left:40px;top:40px;transform:translate(18px,10px) scale(1.25);transform-origin:0 0;width:260px;height:130px;background:#efe6d2;border:4px solid #123456">
      <p style="margin:12px;font-size:20px">Native scaled copy</p>
      <div style="margin:12px;translate:8px 6px;scale:.8;transform-origin:0 0;width:200px;height:35px;background:#d4ebd8"><span style="font-size:20px">Nested native</span></div>
    </div>
    <div id="rounded" style="position:absolute;left:420px;top:60px;width:300px;height:180px;box-sizing:border-box;padding:40px;border-radius:30px;overflow:hidden;background:linear-gradient(#daf0ff,#abd4ef)">
      <p style="margin:0;font-size:24px">Rounded native</p><div style="margin-top:18px;width:80px;height:30px;background:#207548"></div>
    </div>
    <div id="crossing" style="position:absolute;left:420px;top:280px;width:200px;height:80px;border-radius:30px;overflow:hidden;background:#dca"><p style="margin:0;font-size:24px">Clipped corner</p></div>
    <div id="alpha-border" style="position:absolute;left:50px;top:290px;width:250px;height:60px;padding:12px;background:#bcd;border:8px solid #3458"><p style="margin:0">Translucent border</p></div>
  </section>`,
  );
  await withPage(url, async (page) => {
    await page.evaluate(() =>
      document.querySelector("deck-stage").preparePrint(),
    );
    await page.emulateMedia({ media: "print" });
    const captured = await page.evaluate(captureSlide, 0);
    const scaled = captured.objects.find(
      (object) => object.text === "Native scaled copy",
    );
    const nested = captured.objects.find(
      (object) => object.text === "Nested native",
    );
    assert.ok(scaled, "Scaled text must remain a native text object");
    assert.equal(scaled.fontSize, 25);
    assert.equal(nested.fontSize, 20);
    const border = captured.objects.find(
      (object) => object.kind === "shape" && object.line.color === "123456",
    );
    assert.equal(border.line.width, 5);
    assert.deepEqual(
      { x: border.x, y: border.y, w: border.w, h: border.h },
      { x: 60.5, y: 52.5, w: 330, h: 167.5 },
      "The centered native stroke must retain the CSS outer border box",
    );
    assert.ok(
      captured.objects.some((object) => object.text === "Rounded native"),
    );
    assert.ok(
      !captured.objects.some((object) => object.text === "Clipped corner"),
    );
    assert.ok(
      captured.objects.some((object) => object.text === "Translucent border"),
    );
    const roundedId = await page
      .locator("#rounded")
      .getAttribute("data-codex-pptx-source");
    const paint = captured.objects.find(
      (object) => object.sourceId === roundedId && object.layer === "paint",
    );
    assert.ok(
      paint,
      "Rounded clipping must retain only its background as a picture",
    );
    const alphaId = await page
      .locator("#alpha-border")
      .getAttribute("data-codex-pptx-source");
    assert.ok(
      captured.objects.some(
        (object) => object.sourceId === alphaId && object.layer === "paint",
      ),
    );
    const locator = page.locator("deck-stage > [data-deck-slide]").first();
    const original = await locator.screenshot();
    const styles = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("*")].map((element) =>
          element.getAttribute("style"),
        ),
      );
    const before = await styles();
    await capturePptxImage(page, locator, paint);
    assert.deepEqual(await styles(), before);
    assert.deepEqual(await locator.screenshot(), original);
  });
  const output = path.join(dir, "css.pptx");
  await exportArtifact("pptx", url, output);
  const zip = unzipSync(await fs.readFile(output));
  const slide = xml(zip, "ppt/slides/slide1.xml");
  for (const value of [
    "Native scaled copy",
    "Nested native",
    "Rounded native",
    "Translucent border",
  ])
    assert.match(slide, new RegExp(`<a:t>${value}</a:t>`));
  assert.doesNotMatch(slide, /Clipped corner/);
  assert.match(slide, /sz="1875"/);
});

test("PowerPoint retains unsupported transform cases as explicit pictures", async (t) => {
  const cases = [
    ["Skewed", "transform:skewX(12deg)"],
    ["Stretched", "scale:1.2 .8"],
    ["Reflected", "scale:-1"],
    ["Perspective", "perspective:300px"],
    ["Zoomed", "zoom:1.2"],
  ];
  const { url } = await fixture(
    t,
    `<section>${cases
      .map(
        ([label, style]) =>
          `<div style="width:180px;height:40px;margin:12px;background:#234;${style}"><span>${label} content</span></div>`,
      )
      .join("")}</section>`,
  );
  await withPage(url, async (page) => {
    await page.evaluate(() =>
      document.querySelector("deck-stage").preparePrint(),
    );
    await page.emulateMedia({ media: "print" });
    const captured = await page.evaluate(captureSlide, 0);
    assert.equal(
      captured.objects.filter(
        (object) => object.kind === "image" && object.layer === "subtree",
      ).length,
      cases.length,
    );
    assert.ok(!captured.objects.some((object) => object.kind === "text"));
    assert.ok(
      captured.warnings.every((warning) => warning.includes("preserve CSS")),
    );
  });
});

test("PowerPoint embeds actual local video and audio bytes with native media relationships", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<section><h1>Playable sources</h1><video src="clip.mp4" width="180" height="150" style="object-fit:cover;border-radius:8px" loop muted></video><p>Between media objects</p><audio src="tone.wav" controls></audio><audio src="tone.wav"></audio></section>`,
  );
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=160x100:r=10:d=0.3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    path.join(dir, "clip.mp4"),
  ]);
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=0.3",
    "-c:a",
    "pcm_s16le",
    path.join(dir, "tone.wav"),
  ]);
  const out = path.join(dir, "media.pptx");
  const result = await exportArtifact("pptx", url, out);
  assert.equal(result.mediaObjects, 3);
  assert.equal(result.rasterObjects, 2);
  assert.ok(result.warnings.some((warning) => warning.includes("object-fit")));
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("complete original source"),
    ),
  );
  assert.ok(result.warnings.some((warning) => warning.includes("off-slide")));
  const zip = unzipSync(await fs.readFile(out));
  for (const name of ["clip.mp4", "tone.wav"]) {
    const source = await fs.readFile(path.join(dir, name));
    assert.ok(
      Object.values(zip).some((entry) => Buffer.from(entry).equals(source)),
      `${name} source bytes must be embedded unchanged`,
    );
  }
  const slide = xml(zip, "ppt/slides/slide1.xml");
  const rels = xml(zip, "ppt/slides/_rels/slide1.xml.rels");
  assert.equal((slide.match(/ppaction:\/\/media/g) || []).length, 3);
  assert.equal((slide.match(/<p14:media /g) || []).length, 3);
  assert.equal((slide.match(/<p:pic>/g) || []).length, 5);
  assert.match(rels, /relationships\/video/);
  assert.match(rels, /relationships\/audio/);
  assert.doesNotMatch(rels, /TargetMode="External"/);
  assert.equal((slide.match(/<a:audioFile /g) || []).length, 2);
  assert.equal((slide.match(/<a:videoFile /g) || []).length, 1);
  const ids = [...slide.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map(
    (match) => match[1],
  );
  assert.equal(new Set(ids).size, ids.length);
  const staticOut = path.join(dir, "media-static.pptx");
  await exportArtifact("pptx", url, staticOut, { pptxAnimations: "static" });
  const staticZip = unzipSync(await fs.readFile(staticOut));
  assert.equal(
    (xml(staticZip, "ppt/slides/slide1.xml").match(/<a:audioFile /g) || [])
      .length,
    2,
  );
});

test("PowerPoint media snapshots reject remote origins, redirect escapes and oversized sources", async (t) => {
  const server = http.createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "https://example.com/clip.mp4" });
      response.end();
    } else {
      response.writeHead(200, { "content-length": 128 * 1024 * 1024 + 1 });
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = { url: () => `${origin}/deck.html` };
  const base = { mediaType: "video", playbackRate: 1, volume: 1 };
  await assert.rejects(
    preparePptxMedia(
      page,
      { ...base, src: "https://example.com/clip.mp4" },
      Buffer.alloc(0),
    ),
    /loopback/,
  );
  await assert.rejects(
    preparePptxMedia(
      page,
      { ...base, src: "http://127.0.0.1:9/clip.mp4" },
      Buffer.alloc(0),
    ),
    /same loopback origin/,
  );
  await assert.rejects(
    preparePptxMedia(
      page,
      { ...base, src: `${origin}/redirect` },
      Buffer.alloc(0),
    ),
    /loopback/,
  );
  await assert.rejects(
    preparePptxMedia(page, { ...base, src: `${origin}/huge` }, Buffer.alloc(0)),
    /128 MiB/,
  );
});

test("PowerPoint raster fallback retains shadow-root artwork without surrounding slide paint", async (t) => {
  const { url } = await fixture(
    t,
    `<section style="background:#fff"><h1>Editable neighbor</h1><sample-card style="display:block;width:180px;height:80px"></sample-card></section><script>customElements.define("sample-card", class extends HTMLElement { constructor() { super(); this.attachShadow({mode:"open"}).innerHTML = '<div style="width:180px;height:80px;background:rgb(240,80,20);color:white">Shadow content</div>'; } });</script>`,
  );
  await withPage(url, async (page) => {
    await page.evaluate(() =>
      document.querySelector("deck-stage").preparePrint(),
    );
    await page.emulateMedia({ media: "print" });
    const captured = await page.evaluate(captureSlide, 0);
    const raster = captured.objects.find((object) => object.kind === "image");
    assert.ok(raster);
    assert.ok(
      captured.objects.some((object) => object.text === "Editable neighbor"),
    );
    const center = await page.locator("sample-card").evaluate((element) => {
      const box = element.getBoundingClientRect(),
        root = element.closest("section").getBoundingClientRect();
      return {
        x: box.x - root.x + box.width / 2,
        y: box.y - root.y + box.height / 2,
      };
    });
    const data = await capturePptxImage(
      page,
      page.locator("deck-stage > [data-deck-slide]").first(),
      raster,
    );
    const pixel = await page.evaluate(
      async ({ encoded, center }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${encoded}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return {
          art: [...context.getImageData(center.x, center.y, 1, 1).data],
          outside: [...context.getImageData(0, 0, 1, 1).data],
        };
      },
      { encoded: data.toString("base64"), center },
    );
    assert.deepEqual(pixel.art, [240, 80, 20, 255]);
    assert.equal(pixel.outside[3], 0);
  });
});

test("PowerPoint keeps source-less video posters as static artwork in both modes", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<section><h1>Static poster</h1><video width="180" height="120" poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='120'%3E%3Crect width='180' height='120' fill='blue'/%3E%3C/svg%3E"></video></section>`,
  );
  const editable = await exportArtifact(
    "pptx",
    url,
    path.join(dir, "poster.pptx"),
  );
  assert.equal(editable.mediaObjects, 0);
  assert.equal(editable.rasterObjects, 1);
  assert.ok(
    editable.warnings.some((warning) => warning.includes("no playable source")),
  );
  const screenshots = await exportArtifact(
    "pptx",
    url,
    path.join(dir, "poster-screenshots.pptx"),
    { pptxMode: "screenshots" },
  );
  assert.equal(screenshots.rasterObjects, 1);
});

test("PowerPoint isolates wide-gamut background paint while retaining ordinary foreground text", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<section style="background:color(display-p3 1 0.4 0.1);color:rgb(20,30,40)"><h1>Editable on wide-gamut paint</h1></section>`,
  );
  const out = path.join(dir, "wide-background.pptx");
  const result = await exportArtifact("pptx", url, out);
  assert.equal(result.editableObjects, 1);
  assert.equal(result.rasterObjects, 1);
  const zip = unzipSync(await fs.readFile(out));
  assert.match(
    xml(zip, "ppt/slides/slide1.xml"),
    /<a:t>Editable on wide-gamut paint<\/a:t>/,
  );
  await withPage(url, async (page) => {
    await page.evaluate(() =>
      document.querySelector("deck-stage").preparePrint(),
    );
    await page.emulateMedia({ media: "print" });
    const captured = await page.evaluate(captureSlide, 0);
    const data = await capturePptxImage(
      page,
      page.locator("deck-stage > [data-deck-slide]").first(),
      captured.objects.find((object) => object.layer === "paint"),
    );
    const pixel = await page.evaluate(async (encoded) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return [...context.getImageData(400, 300, 1, 1).data];
    }, data.toString("base64"));
    assert.equal(pixel[0], 255);
    assert.ok(pixel[1] > 50 && pixel[1] < 150);
    assert.ok(pixel[2] < 50);
    assert.equal(pixel[3], 255);
  });
});

test("PowerPoint media readiness settles native control artwork without changing the authored time or styles", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<section><video src="clip.mp4" controls width="320" height="200" style="display:block"></video></section>`,
  );
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x200:r=30:d=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    path.join(dir, "clip.mp4"),
  ]);
  await withPage(url, async (page) => {
    await page.evaluate(() =>
      document.querySelector("deck-stage").preparePrint(),
    );
    await page.emulateMedia({ media: "print" });
    const before = await page.evaluate(() => {
      const media = document.querySelector("video");
      media.currentTime = 0.125;
      return {
        time: media.currentTime,
        controls: media.controls,
        style: media.getAttribute("style"),
      };
    });
    const warnings = await preparePptxMediaElements(page, 0);
    assert.deepEqual(warnings, []);
    const after = await page.evaluate(() => {
      const media = document.querySelector("video");
      return {
        time: media.currentTime,
        controls: media.controls,
        style: media.getAttribute("style"),
      };
    });
    assert.deepEqual(after, before);
    const data = await page
      .locator("deck-stage > [data-deck-slide]")
      .first()
      .locator("video")
      .screenshot({ animations: "allow" });
    const darkPixels = await page.evaluate(async (encoded) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(110, 45, 100, 90).data;
      let dark = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i + 2] < 100) dark++;
      return dark;
    }, data.toString("base64"));
    assert.equal(
      darkPixels,
      0,
      "The blue poster must not contain Chromium's transient black loading spinner.",
    );
  });
});
