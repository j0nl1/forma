import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../skills/codex-design/scripts/build.mjs";
import { serve } from "../skills/codex-design/scripts/preview.mjs";
import { withPage } from "../skills/codex-design/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/codex-design/scripts/export.mjs";
import { inlineHtml } from "../skills/codex-design/scripts/lib/inline.mjs";
import {
  length,
  pixels,
  geometry,
  printOptions,
} from "../skills/codex-design/assets/starters/document-model.js";
async function fixture(t, content, attributes = "", style = "", before = "") {
  const dir = await temporary(t);
  await bundle(
    path.join(root, "skills/codex-design/assets/starters/document.js"),
    path.join(dir, "document.js"),
  );
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Document contract fixture</title><style>body{margin:0}doc-page{font:16px/1.6 Arial,sans-serif}${style}</style>${before}</head><body><doc-page ${attributes}>${content}</doc-page><script src="document.js"></script></body></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url };
}
function pdfPages(file) {
  const output = execFileSync("pdftotext", ["-bbox", file, "-"], {
    encoding: "utf8",
  });
  return [
    ...output.matchAll(
      /<page width="([^"]+)" height="([^"]+)">([\s\S]*?)<\/page>/g,
    ),
  ].map((match) => ({
    width: Number(match[1]),
    height: Number(match[2]),
    words: [
      ...match[3].matchAll(
        /<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([\s\S]*?)<\/word>/g,
      ),
    ].map((word) => ({
      x: Number(word[1]),
      y: Number(word[2]),
      right: Number(word[3]),
      bottom: Number(word[4]),
      text: word[5],
    })),
  }));
}
function close(a, b, tolerance = 0.7) {
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
}
const paragraphs = Array.from(
  { length: 65 },
  (_, i) =>
    `<p>Paragraph ${i + 1}. A document keeps the entire argument in one text flow. Each paragraph carries ordinary editable HTML, measured margins and readable spacing. The print engine chooses page breaks from the real available paper.</p>`,
).join("");

test("document absolute lengths, exact fixed dimensions and fit options follow the source contract", () => {
  assert.equal(length("0"), "0px");
  assert.equal(length(" 2.5cm "), "2.5cm");
  for (const value of [
    "calc(1in)",
    "1em",
    "-2px",
    "1vh",
    "url(x)",
    "1in; color:red",
    "0.5",
  ])
    assert.equal(length(value, "fallback"), "fallback");
  close(pixels("1in"), 96);
  close(pixels("72pt"), 96);
  close(pixels("6pc"), 96);
  close(pixels("25.4mm"), 96);
  const attrs = new Map([
    ["width", "22in"],
    ["height", "30in"],
    ["orientation", "landscape"],
  ]);
  const element = { getAttribute: (key) => attrs.get(key) || null };
  const fixed = geometry(element, { paper: "a4" });
  assert.equal(fixed.pageWidth, "22in");
  assert.equal(fixed.pageHeight, "30in");
  assert.equal(fixed.fixed, true);
  attrs.clear();
  attrs.set("content-width", "1400px");
  attrs.set("content-height", "990px");
  assert.equal(geometry(element).fit, true);
  close(geometry(element).fitScale, 0.48, 0.000001);
  attrs.set("content-height", "0");
  assert.equal(geometry(element).fit, false);
  assert.throws(() => printOptions({ paper: "unknown" }), /Paper/);
  assert.throws(() => printOptions({ orientation: "up" }), /Orientation/);
});

test("document screen paper, live modes, running-slot measurement and authored DOM stay intact", async (t) => {
  const { url } = await fixture(
    t,
    '<header slot="header">Running heading</header><h1>First heading</h1><p contenteditable="true" id="text">Editable text</p><footer slot="footer">Running footer</footer>',
  );
  await withPage(url, async (page) => {
    const initial = await page.locator("doc-page").evaluate((element) => ({
      width: element.pageWidth,
      height: element.pageHeight,
      margin: element.pageMargin,
      mode: element.layoutMode,
      hostStyle: element.getAttribute("style"),
      headers: element.headerHeight,
    }));
    assert.deepEqual(
      { ...initial, headers: 0 },
      {
        width: "8.5in",
        height: "11in",
        margin: "0.75in",
        mode: "flow",
        hostStyle: null,
        headers: 0,
      },
    );
    assert.ok(initial.headers > 0);
    await page.locator("#text").fill("Edited text");
    await page.locator("doc-page").evaluate((element) => {
      window.oldSheet = element.sheet;
      element.setAttribute("size", "LEGAL");
      element.setAttribute("orientation", "landscape");
      element.setAttribute("margin", "0");
    });
    assert.deepEqual(
      await page
        .locator("doc-page")
        .evaluate((element) => [
          element.pageWidth,
          element.pageHeight,
          element.pageMargin,
        ]),
      ["14in", "8.5in", "0px"],
    );
    await page
      .locator("doc-page header")
      .evaluate((element) => (element.style.height = "60px"));
    await page.waitForFunction(
      () => document.querySelector("doc-page").headerHeight === 60,
    );
    await page.locator("doc-page").evaluate((element) => {
      element.querySelector("[slot=header]").remove();
      element.querySelector("[slot=footer]").remove();
      const section = document.createElement("section");
      section.className = "page";
      section.textContent = "A fixed page";
      element.append(section);
    });
    await page.waitForFunction(
      () => document.querySelector("doc-page").layoutMode === "paginated",
    );
    assert.equal(
      await page
        .locator("doc-page .page")
        .evaluate((element) => getComputedStyle(element).containerType),
      "size",
    );
    await page
      .locator("doc-page .page")
      .evaluate((element) => element.remove());
    await page.waitForFunction(
      () => document.querySelector("doc-page").layoutMode === "flow",
    );
    assert.equal(await page.locator("#text").innerText(), "Edited text");
    assert.equal(
      await page
        .locator("doc-page")
        .evaluate((element) => oldSheet === element.sheet),
      true,
    );
    assert.equal(
      await page
        .locator("h1")
        .evaluate((element) => getComputedStyle(element).textWrap),
      "balance",
    );
    await page
      .locator("h1")
      .evaluate((element) => (element.style.textWrap = "nowrap"));
    assert.equal(
      await page
        .locator("h1")
        .evaluate((element) => getComputedStyle(element).textWrap),
      "nowrap",
    );
    assert.equal(await page.locator("doc-page").getAttribute("style"), null);
  });
});

test("document metadata ownership, reconnect and cleanup preserve authored overrides", async (t) => {
  const { url } = await fixture(
    t,
    "<p>First document</p>",
    'width="22in" height="30in"',
  );
  await withPage(url, async (page) => {
    assert.equal(
      await page.locator("meta[name=codex-fixed-size]").getAttribute("content"),
      "2112,2880",
    );
    assert.equal(
      await page
        .locator("meta[name=codex-print-sizing]")
        .getAttribute("content"),
      "fixed",
    );
    await page.evaluate(() => {
      window.first = document.querySelector("doc-page");
      window.second = document.createElement("doc-page");
      second.setAttribute("orientation", "landscape");
      second.textContent = "Second document";
      document.body.append(second);
    });
    assert.equal(
      await page.locator("meta[name=codex-fixed-size]").getAttribute("content"),
      "2112,2880",
    );
    await page.evaluate(() => first.remove());
    assert.equal(await page.locator("meta[name=codex-fixed-size]").count(), 0);
    assert.equal(
      await page
        .locator("meta[name=codex-print-sizing]")
        .getAttribute("content"),
      "default-landscape",
    );
    await page.evaluate(() => document.body.append(first));
    assert.equal(
      await page.locator("meta[name=codex-fixed-size]").getAttribute("content"),
      "2112,2880",
    );
    await page.evaluate(() => {
      const authored = document.createElement("meta");
      authored.name = "codex-fixed-size";
      authored.content = "320,240";
      document.head.append(authored);
      first.setAttribute("width", "18in");
    });
    assert.equal(await page.locator("meta[name=codex-fixed-size]").count(), 1);
    assert.equal(
      await page.locator("meta[name=codex-fixed-size]").getAttribute("content"),
      "320,240",
    );
    await page.evaluate(() => {
      first.remove();
      second.remove();
    });
    assert.equal(await page.locator("style[data-codex-injected]").count(), 0);
    assert.equal(await page.locator("meta[name=codex-owns-print]").count(), 0);
    assert.equal(
      await page.locator("meta[name=codex-fixed-size]").getAttribute("content"),
      "320,240",
    );
  });
});

test("flowing PDF uses real chosen paper, repeats running content and protects every page margin", async (t) => {
  const { dir, url } = await fixture(
    t,
    `<header slot="header">RUNNING_HEADER</header><h1>Flowing report</h1>${paragraphs}<footer slot="footer">RUNNING_FOOTER</footer>`,
  );
  const counts = [];
  for (const [paper, width, height] of [
    ["letter", 612, 792],
    ["a4", 595.28, 841.89],
    ["legal", 612, 1008],
  ]) {
    const output = path.join(dir, paper + ".pdf");
    await exportArtifact("pdf", url, output, { paper });
    const pages = pdfPages(output);
    counts.push(pages.length);
    assert.ok(pages.length >= 3);
    for (const page of pages) {
      close(page.width, width);
      close(page.height, height);
      assert.equal(
        page.words.filter((word) => word.text === "RUNNING_HEADER").length,
        1,
      );
      assert.equal(
        page.words.filter((word) => word.text === "RUNNING_FOOTER").length,
        1,
      );
      const body = page.words.filter(
        (word) => !word.text.startsWith("RUNNING_"),
      );
      assert.ok(body.length);
      assert.ok(body.every((word) => word.x >= 53 && word.right <= width - 53));
      assert.ok(
        body.every((word) => word.y >= 53 && word.bottom <= height - 53),
      );
      const header = page.words.find((word) => word.text === "RUNNING_HEADER"),
        footer = page.words.find((word) => word.text === "RUNNING_FOOTER");
      assert.ok(
        body.every((word) => word.y > header.bottom && word.bottom < footer.y),
      );
    }
    assert.ok(pages.at(-1).words.some((word) => word.text === "65."));
  }
  assert.ok(counts[0] > counts[2]);
  assert.ok(counts[0] >= counts[1]);
});

test("explicit pages print exactly once, obey paper changes and clip overflowing designs", async (t) => {
  const content =
    '<section class="page" style="height:100%;padding:5%;background:#ddcfa4"><h1>OUTSIDE</h1><p>Flap Back Front</p><p style="position:absolute;top:120%">CLIPPED_OUTSIDE</p></section><section class="page" style="height:100%;padding:5%;background:#b9cabd"><h1>INSIDE</h1><p>Left Middle Right</p></section>';
  const { dir, url } = await fixture(
    t,
    content,
    'size="a4" orientation="landscape"',
  );
  const first = path.join(dir, "a4.pdf");
  await exportArtifact("pdf", url, first);
  let pages = pdfPages(first);
  assert.equal(pages.length, 2);
  close(pages[0].width, 841.89);
  close(pages[0].height, 595.28);
  assert.ok(pages[0].words.some((word) => word.text === "OUTSIDE"));
  assert.ok(pages[1].words.some((word) => word.text === "INSIDE"));
  assert.ok(
    !pages
      .flatMap((page) => page.words)
      .some((word) => word.text === "CLIPPED_OUTSIDE"),
  );
  const second = path.join(dir, "letter.pdf");
  await exportArtifact("pdf", url, second, { paper: "letter" });
  pages = pdfPages(second);
  assert.equal(pages.length, 2);
  close(pages[0].width, 792);
  close(pages[0].height, 612);
  await withPage(url, async (page) => {
    const original = await page
      .locator("doc-page")
      .evaluate((element) => element.outerHTML);
    await page.evaluate(() => CodexDocument.preparePrint({ paper: "letter" }));
    await page.emulateMedia({ media: "print" });
    assert.equal(
      await page
        .locator(".page")
        .first()
        .evaluate((element) => getComputedStyle(element).height),
      "816px",
    );
    await page.evaluate(() => CodexDocument.restorePrint());
    await page.emulateMedia({ media: "screen" });
    assert.equal(
      await page.locator("doc-page").evaluate((element) => element.outerHTML),
      original,
    );
  });
});

test("scaled-fit PDF keeps the authored canvas on one sheet with bottom content and clipping", async (t) => {
  const { dir, url } = await fixture(
    t,
    '<div class="design"><h1>Scaled composition</h1><p class="bottom">BOTTOM_CONTENT</p><p class="outside">CLIPPED_FIT</p></div>',
    'content-width="1400px" content-height="990px"',
    ".design{position:relative;width:1400px;height:990px;background:#dde9df}.bottom{position:absolute;bottom:12px}.outside{position:absolute;top:1200px}",
  );
  for (const paper of ["letter", "a4"]) {
    const output = path.join(dir, paper + ".pdf");
    await exportArtifact("pdf", url, output, { paper });
    const pages = pdfPages(output);
    assert.equal(pages.length, 1);
    assert.ok(pages[0].words.some((word) => word.text === "BOTTOM_CONTENT"));
    assert.ok(!pages[0].words.some((word) => word.text === "CLIPPED_FIT"));
  }
});

test("true-size poster PDF preserves exact dimensions without applying orientation twice", async (t) => {
  const { dir, url } = await fixture(
    t,
    '<section class="page" style="padding:5%"><h1>True size poster</h1><p>PRINT_AT_ACTUAL_SIZE</p></section>',
    'width="22in" height="30in" orientation="landscape"',
  );
  const output = path.join(dir, "poster.pdf");
  await exportArtifact("pdf", url, output, { paper: "a4" });
  const pages = pdfPages(output);
  assert.equal(pages.length, 1);
  close(pages[0].width, 1584);
  close(pages[0].height, 2160);
  assert.ok(
    pages[0].words.some((word) => word.text === "PRINT_AT_ACTUAL_SIZE"),
  );
});

test("true-size sheets fit viewport and container changes without rewriting author geometry or nodes", async (t) => {
  const { url } = await fixture(
    t,
    '<section class="page" style="padding:5%;background:#255d48"><button id="action">Retained action</button><p contenteditable="true" id="draft">Editable draft</p></section>',
    'width="18in" height="24in" style="font-family:Georgia"',
  );
  await withPage(url, async (page) => {
    await page.evaluate(() => {
      window.documentNode = document.querySelector("doc-page");
      window.authoredPage = document.querySelector(".page");
      window.actionCount = 0;
      document
        .querySelector("#action")
        .addEventListener("click", () => actionCount++);
    });
    const measure = () =>
      page.locator("doc-page").evaluate((element) => ({
        scale: element.previewScale,
        rawWidth: element.sheet.offsetWidth,
        width: element.sheet.getBoundingClientRect().width,
        height: element.sheet.getBoundingClientRect().height,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        authorStyle: element.getAttribute("style"),
      }));
    let actual = await measure();
    close(actual.rawWidth, 1728);
    close(actual.width, 1728 * actual.scale);
    assert.ok(actual.scale > 0 && actual.scale < 1);
    assert.ok(actual.height <= 905);
    assert.equal(actual.overflow, false);
    assert.equal(actual.authorStyle, "font-family:Georgia");
    await page.locator("#action").click();
    await page.locator("#draft").fill("Edited on the fitted sheet");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () =>
        document.querySelector("doc-page").sheet.getBoundingClientRect().width <
        350,
    );
    actual = await measure();
    close(actual.width, 342);
    close(actual.rawWidth, 1728);
    assert.equal(actual.overflow, false);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      const container = document.createElement("div");
      container.style.width = "300px";
      document.body.append(container);
      container.append(documentNode);
    });
    await page.waitForFunction(
      () => documentNode.sheet.getBoundingClientRect().width < 260,
    );
    close((await measure()).width, 252);
    await page.evaluate(
      () => (documentNode.parentElement.style.width = "500px"),
    );
    await page.waitForFunction(
      () => documentNode.sheet.getBoundingClientRect().width > 440,
    );
    close((await measure()).width, 452);
    assert.equal(
      await page.locator("#draft").innerText(),
      "Edited on the fitted sheet",
    );
    assert.equal(
      await page.evaluate(
        () => authoredPage === document.querySelector(".page"),
      ),
      true,
    );
    await page.locator("#action").click();
    assert.equal(await page.evaluate(() => actionCount), 2);
    await page
      .locator("doc-page")
      .evaluate((element) => element.setAttribute("preview", "actual-size"));
    actual = await measure();
    assert.equal(actual.scale, 1);
    close(actual.width, 1728);
    await page
      .locator("doc-page")
      .evaluate((element) => element.removeAttribute("preview"));
    close((await measure()).width, 452);
    await page.locator("doc-page").evaluate((element) => {
      element.setAttribute("width", "210mm");
      element.setAttribute("height", "297mm");
    });
    const metric = await page.locator("doc-page").evaluate((element) => ({
      natural: parseFloat(getComputedStyle(element.sheet).width),
      painted: element.sheet.getBoundingClientRect().width,
      reserved: element.shadowRoot
        .querySelector(".preview")
        .getBoundingClientRect().width,
      scale: element.previewScale,
    }));
    close(metric.natural, pixels("210mm"), 0.02);
    close(metric.painted, metric.natural * metric.scale, 0.02);
    close(metric.reserved, metric.painted, 0.02);
    await page.locator("doc-page").evaluate((element) => {
      element.setAttribute("width", "300px");
      element.setAttribute("height", "200px");
      element.setAttribute("margin", "0");
    });
    actual = await measure();
    assert.ok(actual.scale > 1);
    close(actual.rawWidth, 300);
    close(actual.width, 452);
    await page
      .locator("doc-page")
      .evaluate((element) => (element.style.display = "none"));
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.equal(
      await page
        .locator("doc-page")
        .evaluate(
          (element) =>
            Number.isFinite(element.previewScale) &&
            !element.shadowRoot
              .querySelector("[data-preview-vars]")
              .textContent.includes("NaN"),
        ),
      true,
    );
    await page
      .locator("doc-page")
      .evaluate((element) => (element.style.display = ""));
    await page.waitForFunction(
      () => documentNode.sheet.getBoundingClientRect().width > 440,
    );
    close((await measure()).width, 452);
    await page.locator("doc-page").evaluate((element) => {
      element.removeAttribute("width");
      element.removeAttribute("height");
    });
    assert.equal((await measure()).scale, 1);
    close((await measure()).width, 816);
  });
});

test("fixed-sheet preview leaves canvas ownership alone and resets scale for real print and portable output", async (t) => {
  const { dir, url } = await fixture(
    t,
    '<section class="page" style="padding:5%"><h1>TOP_MARK</h1><p style="position:absolute;bottom:5%">BOTTOM_MARK</p></section><section class="page" style="padding:5%"><h1>SECOND_MARK</h1></section>',
    'width="18in" height="24in"',
  );
  await withPage(url, async (page) => {
    await page.evaluate(
      () => (window.documentNode = document.querySelector("doc-page")),
    );
    const scale = await page.evaluate(() => documentNode.previewScale);
    assert.ok(scale < 1);
    const sections = await page.locator(".page").evaluateAll((elements) =>
      elements.map((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        rawWidth: element.offsetWidth,
      })),
    );
    assert.equal(sections.length, 2);
    close(sections[0].width, sections[1].width);
    close(sections[0].rawWidth, 1728);
    // Multiple pages share the same scale; the complete stack remains scrollable.
    assert.ok(sections[0].height > 850);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight > innerHeight,
      ),
    );
    await page.evaluate(() => {
      window.modeMarker = document.createElement("meta");
      modeMarker.name = "design_doc_mode";
      modeMarker.content = "canvas";
      document.head.append(modeMarker);
    });
    await page.waitForFunction(() => documentNode.previewScale === 1);
    close(
      await page
        .locator(".page")
        .first()
        .evaluate((element) => element.getBoundingClientRect().width),
      1728,
    );
    await page.evaluate(() => modeMarker.remove());
    await page.waitForFunction(() => documentNode.previewScale < 1);
    await page.evaluate(() => CodexDocument.preparePrint({ paper: "a4" }));
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.evaluate(() => documentNode.previewScale), 1);
    close(
      await page
        .locator(".page")
        .first()
        .evaluate((element) => element.getBoundingClientRect().width),
      1728,
    );
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => CodexDocument.restorePrint());
    await page.waitForFunction(() => documentNode.previewScale < 1);
    close(await page.evaluate(() => documentNode.previewScale), scale, 0.001);
  });
  await fs.writeFile(
    path.join(dir, "portable.html"),
    await inlineHtml(path.join(dir, "index.html")),
  );
  await fs.rm(path.join(dir, "document.js"));
  await withPage(url + "portable.html", async (page) => {
    assert.ok(
      await page
        .locator("doc-page")
        .evaluate((element) => element.previewScale < 1),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () =>
        document.querySelector("doc-page").sheet.getBoundingClientRect().width <
        350,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
  });
  const output = path.join(dir, "portable-poster.pdf");
  await exportArtifact("pdf", url + "portable.html", output, { paper: "a4" });
  const pages = pdfPages(output);
  assert.equal(pages.length, 2);
  close(pages[0].width, 1296);
  close(pages[0].height, 1728);
  assert.ok(pages[0].words.some((word) => word.text === "TOP_MARK"));
  assert.ok(pages[0].words.some((word) => word.text === "BOTTOM_MARK"));
  assert.ok(pages[1].words.some((word) => word.text === "SECOND_MARK"));
});

test("standalone document survives source removal and print finishes entrance animations", async (t) => {
  const { dir, url } = await fixture(
    t,
    '<div data-doc-controls>HIDDEN_CONTROLS</div><h1 class="fade">ANIMATION_FINISHED</h1><p>Standalone text</p>',
    'size="a4"',
    "@keyframes enter{from{opacity:0}to{opacity:1}}.fade{opacity:0;animation:enter 20s linear 100s forwards}",
  );
  await fs.writeFile(
    path.join(dir, "standalone.html"),
    await inlineHtml(path.join(dir, "index.html")),
  );
  await fs.rm(path.join(dir, "document.js"));
  const output = path.join(dir, "standalone.pdf");
  await exportArtifact("pdf", url + "standalone.html", output, { paper: "a4" });
  const pages = pdfPages(output);
  assert.equal(pages.length, 1);
  assert.ok(pages[0].words.some((word) => word.text === "ANIMATION_FINISHED"));
  assert.ok(!pages[0].words.some((word) => word.text === "HIDDEN_CONTROLS"));
  await withPage(url + "standalone.html", async (page) => {
    await page.emulateMedia({ media: "print" });
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector(".fade")).opacity === "1",
    );
    assert.equal(
      await page
        .locator("doc-page")
        .evaluate((element) => element.sheet.classList.contains("paginated")),
      false,
    );
  });
});

test("WebKit flowing geometry puts vertical margins in the page rule and avoids doubling spacers", async (t) => {
  const { url } = await fixture(
    t,
    "<h1>WebKit geometry branch</h1><p>Flowing content</p>",
    "",
    "",
    '<script>Object.defineProperty(navigator,"vendor",{value:"Apple Computer, Inc."})</script>',
  );
  await withPage(url, async (page) => {
    assert.match(
      await page.locator("#codex-document-print").textContent(),
      /margin:0.75in 0/,
    );
    await page.emulateMedia({ media: "print" });
    assert.equal(
      await page
        .locator("doc-page .hdr-space")
        .evaluate((element) => getComputedStyle(element).height),
      "0px",
    );
    await page.locator("doc-page").evaluate((element) => {
      const section = document.createElement("section");
      section.className = "page";
      section.textContent = "Fixed";
      element.replaceChildren(section);
    });
    await page.waitForFunction(
      () => document.querySelector("doc-page").paginated,
    );
    assert.match(
      await page.locator("#codex-document-print").textContent(),
      /margin:0}/,
    );
  });
});

test("fit layout isolation retains inline flow, tables and author-controlled grid layouts", async (t) => {
  const { url } = await fixture(
    t,
    '<span id="inline-a">Inline A</span><span id="inline-b">Inline B</span><table id="table"><tbody><tr><td>Cell A</td><td>Cell B</td></tr></tbody></table><div id="grid" style="display:grid;grid-template-columns:1fr 1fr"><p>Grid A</p><p>Grid B</p></div>',
    'content-width="1000px" content-height="800px"',
  );
  await withPage(url, async (page) => {
    const result = await page.evaluate(() => {
      const a = document.querySelector("#inline-a"),
        b = document.querySelector("#inline-b");
      const cells = [...document.querySelectorAll("td")].map((node) =>
        node.getBoundingClientRect().toJSON(),
      );
      const grid = [...document.querySelectorAll("#grid p")].map((node) =>
        node.getBoundingClientRect().toJSON(),
      );
      return {
        inline: [a.getBoundingClientRect().y, b.getBoundingClientRect().y],
        table: getComputedStyle(document.querySelector("#table")).display,
        cells,
        grid,
        contain: getComputedStyle(document.querySelector("#grid")).contain,
      };
    });
    close(result.inline[0], result.inline[1], 0.001);
    assert.equal(result.table, "table");
    assert.ok(result.cells[1].x > result.cells[0].x);
    close(result.cells[0].y, result.cells[1].y, 0.001);
    assert.ok(result.grid[1].x > result.grid[0].x);
    close(result.grid[0].y, result.grid[1].y, 0.001);
    assert.equal(result.contain, "layout");
  });
});

test("paper laboratory modes preserve named-paper geometry, panel order and native printing", async (t) => {
  const dir = await temporary(t);
  await fs.copyFile(
    path.join(root, "examples/documents.html"),
    path.join(dir, "index.html"),
  );
  await fs.copyFile(
    path.join(root, "examples/documents.js"),
    path.join(dir, "documents.js"),
  );
  await bundle(
    path.join(root, "skills/codex-design/assets/starters/document.js"),
    path.join(dir, "starters/document.js"),
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url, async (page) => {
    assert.equal(await page.locator("[slot=header]").count(), 1);
    assert.equal(await page.locator("#preview-choice").isVisible(), false);
    await page.locator("#mode").selectOption("poster");
    await page.waitForFunction(
      () => document.querySelector("doc-page").previewScale < 1,
    );
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => {
        const sheet = document
          .querySelector("doc-page")
          .sheet.getBoundingClientRect();
        return sheet.width <= innerWidth && sheet.bottom <= innerHeight;
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#actual-size").check();
    assert.equal(
      await page
        .locator("doc-page")
        .evaluate((element) => element.previewScale),
      1,
    );
    await page.locator("#actual-size").uncheck();
    assert.ok(
      await page
        .locator("doc-page")
        .evaluate((element) => element.previewScale < 1),
    );
    await page.locator("#mode").selectOption("brochure");
    assert.equal(await page.locator("#preview-choice").isVisible(), false);
    await page.waitForFunction(
      () => document.querySelector("doc-page").paginated,
    );
    assert.equal(await page.locator(".page").count(), 2);
    assert.deepEqual(
      await page.locator(".page").first().locator(".eyebrow").allTextContents(),
      [
        "Outside / Inside flap",
        "Outside / Back cover",
        "Outside / Front cover",
      ],
    );
    await page.locator("#paper").selectOption("a4");
    assert.deepEqual(
      await page
        .locator("doc-page")
        .evaluate((element) => [element.pageWidth, element.pageHeight]),
      ["297mm", "210mm"],
    );
    await page.locator("#mode").selectOption("fit");
    await page.waitForFunction(
      () => document.querySelector("doc-page").layoutMode === "fit",
    );
    assert.ok(await page.locator(".bottom").isVisible());
    await page.evaluate(
      () => (window.print = () => (window.printCalled = true)),
    );
    await page.locator("#print").click();
    assert.equal(await page.evaluate(() => window.printCalled), true);
    assert.equal(
      await page
        .locator("doc-page")
        .evaluate((element) => element.printOverride),
      undefined,
    );
  });
});

test("flowing preview size does not pin printed paper and repeated print passes do not inflate running bands", async (t) => {
  const { dir, url } = await fixture(
    t,
    '<header slot="header">Repeated header</header><h1>Paper choice</h1><p>Flowing content.</p><footer slot="footer">Repeated footer</footer>',
    'size="a4"',
  );
  const output = path.join(dir, "default.pdf");
  await exportArtifact("pdf", url, output);
  const pages = pdfPages(output);
  close(pages[0].width, 612);
  close(pages[0].height, 792);
  await withPage(url, async (page) => {
    const before = await page
      .locator("doc-page")
      .evaluate((element) => [element.headerHeight, element.footerHeight]);
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() =>
        CodexDocument.preparePrint({ paper: "letter" }),
      );
      await page.emulateMedia({ media: "print" });
      await page.evaluate(() => CodexDocument.restorePrint());
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      assert.deepEqual(
        await page
          .locator("doc-page")
          .evaluate((element) => [element.headerHeight, element.footerHeight]),
        before,
      );
      await page.emulateMedia({ media: "screen" });
    }
  });
  const invalid = path.join(dir, "invalid.pdf");
  await assert.rejects(
    exportArtifact("pdf", url, invalid, { paper: "invalid" }),
    /Paper/,
  );
  assert.equal(
    await fs.stat(invalid).then(
      () => true,
      () => false,
    ),
    false,
  );
});

test("local font, SVG/image colors and long-table rows survive real PDF pagination", async (t) => {
  const rows = Array.from(
    { length: 32 },
    (_, i) =>
      `<tr><td>ROW_START_${i + 1}</td><td>A longer table cell keeps its complete text with its row while the print engine repeats the table heading on each sheet. Readability and source text remain intact. ROW_END_${i + 1}</td></tr>`,
  ).join("");
  const { dir, url } = await fixture(
    t,
    `<header slot="header" class="running-font">LARGE_HEADER<br>SECOND_HEADER_LINE</header><h1>Real fonts and media</h1><figure><img src="image.svg" width="120" height="80" alt="Local green vector image"><svg width="120" height="80"><rect width="120" height="80" fill="#c32844"/><text x="4" y="40" font-size="12" fill="white">VECTOR_MARK</text></svg><figcaption>FIGURE_CAPTION</figcaption></figure><table class="data"><thead><tr><th colspan="2">TABLE_HEADER</th></tr></thead><tbody>${rows}</tbody></table><footer slot="footer">MEDIA_FOOTER</footer>`,
    "",
    "@font-face{font-family:LocalFixture;src:url(font.ttf)}doc-page{font-family:LocalFixture}.running-font{font:28px/1.4 LocalFixture}.data{width:100%;border-collapse:collapse}.data td{padding:8px;border-bottom:1px solid #aaa;vertical-align:top}.data td:first-child{width:150px}",
  );
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
  ];
  let selected;
  for (const font of candidates)
    if (
      await fs.stat(font).then(
        () => true,
        () => false,
      )
    ) {
      selected = font;
      break;
    }
  assert.ok(
    selected,
    "An installed TTF font is required for PDF font verification.",
  );
  await fs.copyFile(selected, path.join(dir, "font.ttf"));
  await fs.writeFile(
    path.join(dir, "image.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#327554"/></svg>',
  );
  const output = path.join(dir, "media.pdf");
  await exportArtifact("pdf", url, output, { paper: "a4" });
  const pages = pdfPages(output);
  assert.ok(pages.length >= 3);
  assert.ok(pages[0].words.some((word) => word.text === "FIGURE_CAPTION"));
  assert.ok(pages[0].words.some((word) => word.text === "VECTOR_MARK"));
  for (const page of pages) {
    assert.ok(page.words.some((word) => word.text === "LARGE_HEADER"));
    assert.ok(page.words.some((word) => word.text === "SECOND_HEADER_LINE"));
    assert.ok(page.words.some((word) => word.text === "MEDIA_FOOTER"));
    assert.ok(page.words.some((word) => word.text === "TABLE_HEADER"));
    const runningBottom = Math.max(
      ...page.words
        .filter(
          (word) =>
            word.text === "LARGE_HEADER" || word.text === "SECOND_HEADER_LINE",
        )
        .map((word) => word.bottom),
    );
    assert.ok(
      page.words
        .filter((word) => word.text.startsWith("ROW_"))
        .every((word) => word.y > runningBottom),
    );
  }
  for (let i = 1; i <= 32; i++) {
    const starts = pages
      .map((page, index) =>
        page.words.some((word) => word.text === `ROW_START_${i}`) ? index : -1,
      )
      .filter((index) => index >= 0);
    const ends = pages
      .map((page, index) =>
        page.words.some((word) => word.text === `ROW_END_${i}`) ? index : -1,
      )
      .filter((index) => index >= 0);
    assert.equal(starts.length, 1);
    assert.deepEqual(ends, starts);
  }
  const fonts = execFileSync("pdffonts", [output], { encoding: "utf8" });
  assert.match(fonts, /DejaVuSans|Arial/);
  execFileSync("pdftoppm", [
    "-png",
    "-r",
    "72",
    "-f",
    "1",
    "-singlefile",
    output,
    path.join(dir, "media"),
  ]);
  const png = await fs.readFile(path.join(dir, "media.png"));
  await withPage(url, async (page) => {
    const counts = await page.evaluate(async (data) => {
      const image = new Image();
      image.src = "data:image/png;base64," + data;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let green = 0,
        red = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          Math.abs(pixels[i] - 50) < 4 &&
          Math.abs(pixels[i + 1] - 117) < 4 &&
          Math.abs(pixels[i + 2] - 84) < 4
        )
          green++;
        if (
          Math.abs(pixels[i] - 195) < 4 &&
          Math.abs(pixels[i + 1] - 40) < 4 &&
          Math.abs(pixels[i + 2] - 68) < 4
        )
          red++;
      }
      return { green, red };
    }, png.toString("base64"));
    assert.ok(counts.green > 1000);
    assert.ok(counts.red > 1000);
  });
});

test("real multi-column text flows across sheets without losing or duplicating paragraphs", async (t) => {
  const content = Array.from(
    { length: 42 },
    (_, i) =>
      `<p>COLUMN_${i + 1} Each paragraph remains part of one continuous text flow. Real columns let the print engine move the text across the sheet and onto later pages while preserving the complete document.</p>`,
  ).join("");
  const { dir, url } = await fixture(
    t,
    `<h1>A two-column document</h1><div class="columns">${content}</div>`,
    "",
    ".columns{column-count:2;column-gap:24px;hyphens:auto}",
  );
  const output = path.join(dir, "columns.pdf");
  await exportArtifact("pdf", url, output, { paper: "letter" });
  const pages = pdfPages(output);
  assert.ok(pages.length >= 2);
  const words = pages.flatMap((page) => page.words);
  for (let i = 1; i <= 42; i++)
    assert.equal(words.filter((word) => word.text === `COLUMN_${i}`).length, 1);
  assert.ok(
    pages[0].words.some(
      (word) => word.text.startsWith("COLUMN_") && word.x > 310,
    ),
  );
  assert.ok(words.every((word) => word.x >= 53 && word.right <= 559));
});

test("PDF paper choices also work for plain HTML while default export preserves authored print geometry", async (t) => {
  const { dir, url } = await fixture(t, "<p>Unused component</p>");
  await fs.writeFile(
    path.join(dir, "plain.html"),
    '<!doctype html><html><head><style>@page{size:A4 portrait;margin:0}</style></head><body><h1>Plain document</h1><script src="document.js"></script></body></html>',
  );
  const defaults = path.join(dir, "plain-default.pdf");
  await exportArtifact("pdf", url + "plain.html", defaults);
  let pages = pdfPages(defaults);
  close(pages[0].width, 595.28);
  close(pages[0].height, 841.89);
  const chosen = path.join(dir, "plain-chosen.pdf");
  await exportArtifact("pdf", url + "plain.html", chosen, {
    paper: "legal",
    orientation: "landscape",
  });
  pages = pdfPages(chosen);
  close(pages[0].width, 1008);
  close(pages[0].height, 612);
});
