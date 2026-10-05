import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary } from "./helpers.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";
import { renderPdf } from "../skills/forma/scripts/lib/pdf.mjs";
import { exportArtifact } from "../skills/forma/scripts/export.mjs";
import { inlineHtml } from "../skills/forma/scripts/lib/inline.mjs";
import {
  injectFixedSheet,
  needsFixedSheet,
} from "../skills/forma/scripts/lib/fixed-sheet.mjs";
async function fixture(
  t,
  {
    body = '<main id="sheet"><h1>Original sheet</h1></main>',
    style = "body{margin:0}main{width:1200px;height:800px}",
    head = "",
    files = {},
    text = false,
  } = {},
) {
  const dir = await temporary(t);
  const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixed sheet contract</title><style>${style}</style>${head}</head><body>${body}</body></html>`;
  await fs.writeFile(path.join(dir, "index.html"), source);
  for (const [name, data] of Object.entries(files))
    await fs.writeFile(path.join(dir, name), data);
  const { server, url } = await serve(
    dir,
    0,
    text ? { textFile: "index.html" } : {},
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url, source };
}
function close(actual, expected, tolerance = 0.8) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} != ${expected}`,
  );
}
function pages(file) {
  const text = execFileSync("pdftotext", ["-bbox", file, "-"], {
    encoding: "utf8",
  });
  return [
    ...text.matchAll(
      /<page width="([^"]+)" height="([^"]+)">([\s\S]*?)<\/page>/g,
    ),
  ].map((match) => ({
    width: Number(match[1]),
    height: Number(match[2]),
    content: match[3],
  }));
}
test("fixed-sheet injection is parsed, idempotent and leaves ordinary source files untouched", async (t) => {
  assert.equal(needsFixedSheet("<p>Plain text</p>"), false);
  const html =
    '<!doctype html><main style="width:1200px;height:800px">An authored sheet</main>';
  const injected = await injectFixedSheet(html);
  assert.equal(needsFixedSheet(injected), false);
  assert.equal(await injectFixedSheet(injected), injected);
  assert.equal(
    needsFixedSheet(
      "<style>main{--sheet-width:1200px;width:var(--sheet-width)}</style><main></main>",
    ),
    true,
  );
  assert.equal(
    needsFixedSheet('<link rel="stylesheet" href="local.css"><main></main>'),
    true,
  );
  const { url, dir, source } = await fixture(t);
  const response = await fetch(url);
  assert.match(await response.text(), /data-codex-fixed-sheet-runtime/);
  assert.equal(await fs.readFile(path.join(dir, "index.html"), "utf8"), source);
});
test("fixed sheets fit narrow screens while exact dimensions, author nodes, selectors and actions survive", async (t) => {
  const { url } = await fixture(t, {
    style:
      "body{margin:0;padding:20px}body>main{position:relative;background:#245745;color:white;font:48px Georgia;box-sizing:border-box;padding:80px}body>main>h1{font-size:90px}",
    head: '<link rel="stylesheet" href="sheet.css">',
    files: {
      "sheet.css": '@import "size.css";main{height:1800px}',
      "size.css": ":root{--sheet-width:1200px}main{width:var(--sheet-width)}",
    },
    body: '<main id="sheet" style="transform:translateX(0)"><h1 id="title">Original sheet</h1><button id="action">Retained action</button><p contenteditable="true" id="draft">Editable draft</p></main><script>window.authored=document.getElementById("sheet");window.count=0;document.getElementById("action").addEventListener("click",()=>count++)</script>',
  });
  await withPage(url, async (page) => {
    assert.deepEqual(await page.evaluate(() => CodexFixedSheet.dimensions), {
      width: 1200,
      height: 1800,
    });
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(
        () =>
          document.getElementById("sheet").getBoundingClientRect().right <=
          innerWidth,
      );
      const geometry = await page.locator("#sheet").evaluate((element) => ({
        width: element.offsetWidth,
        rect: element.getBoundingClientRect().toJSON(),
        scale: CodexFixedSheet.previewScale,
        font: getComputedStyle(element.querySelector("h1")).fontSize,
        style: element.getAttribute("style"),
        parent: element.parentNode === document.body,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      close(geometry.width, 1200);
      close(geometry.rect.width, 1200 * geometry.scale);
      assert.ok(geometry.rect.bottom <= viewport.height + 1);
      assert.equal(geometry.font, "90px");
      assert.equal(geometry.style, "transform:translateX(0)");
      assert.equal(geometry.parent, true);
      assert.equal(geometry.overflow, false);
      await page.locator("#action").click();
    }
    assert.equal(
      await page.evaluate(
        () => authored === document.getElementById("sheet") && count === 2,
      ),
      true,
    );
    await page.locator("#draft").fill("Edited on a fitted sheet");
    await page.evaluate(() => CodexFixedSheet.setPreview("actual-size"));
    close(
      await page
        .locator("#sheet")
        .evaluate((element) => element.getBoundingClientRect().width),
      1200,
    );
    await page.evaluate(() => CodexFixedSheet.setPreview("fit"));
    assert.ok(await page.evaluate(() => CodexFixedSheet.previewScale < 1));
    assert.equal(
      await page.locator("#draft").textContent(),
      "Edited on a fitted sheet",
    );
    await page
      .locator("#sheet")
      .evaluate((element) => (element.style.width = "100%"));
    await page.waitForFunction(() => CodexFixedSheet.reason === "fluid");
    assert.equal(await page.evaluate(() => CodexFixedSheet.dimensions), null);
  });
});
test("raw fixed PDF uses the border box, keeps bottom artwork and clips overflow without a second page", async (t) => {
  const { dir, url } = await fixture(t, {
    style:
      "body{margin:30px}main{position:relative;width:1200px;height:800px;padding:20px;border:4px solid #245745;background:#eff6ef}h1{margin:0}.bottom{position:absolute;bottom:10px}.outside{position:absolute;top:1200px}",
    body: '<main><h1>TOP_MARK</h1><p class="bottom">BOTTOM_MARK</p><p class="outside">CLIPPED_MARK</p></main>',
  });
  const file = path.join(dir, "sheet.pdf");
  await exportArtifact("pdf", url, file, {
    paper: "a4",
    orientation: "landscape",
  });
  const result = pages(file);
  assert.equal(result.length, 1);
  close(result[0].width, 1248 * 0.75);
  close(result[0].height, 848 * 0.75);
  assert.match(result[0].content, /TOP_MARK/);
  assert.match(result[0].content, /BOTTOM_MARK/);
  assert.doesNotMatch(result[0].content, /CLIPPED_MARK/);
});

test("script-authored fixed roots are detected after creation, replacement and resizing", async (t) => {
  const { dir, url } = await fixture(t, {
    style: "body{margin:0}",
    body: '<main id="sheet"></main><script>const root=document.getElementById("sheet");root.style.width="600px";root.style.height="400px";root.textContent="GENERATED_MARK"</script>',
  });
  await withPage(url, async (page) => {
    assert.deepEqual(await page.evaluate(() => CodexFixedSheet.dimensions), {
      width: 600,
      height: 400,
    });
    await page.locator("#sheet").evaluate((element) => {
      const replacement = element.cloneNode(true);
      replacement.textContent = "REPLACED_MARK";
      replacement.style.height = "700px";
      element.replaceWith(replacement);
    });
    await page.waitForFunction(() => CodexFixedSheet.dimensions.height === 700);
    const file = path.join(dir, "generated.pdf");
    await renderPdf(page, file);
    assert.equal(pages(file).length, 1);
    close(pages(file)[0].width, 450);
    close(pages(file)[0].height, 525);
    assert.match(pages(file)[0].content, /REPLACED_MARK/);
  });
});

test("an SVG's authored pixel width establishes one physical vector sheet", async (t) => {
  const { dir, url } = await fixture(t, {
    style: "body{margin:0}",
    body: '<svg width="600" height="400" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="400" fill="#245745"/><text x="30" y="80" font-size="48" fill="white">VECTOR_MARK</text></svg>',
  });
  await withPage(url, async (page) => {
    assert.deepEqual(await page.evaluate(() => CodexFixedSheet.dimensions), {
      width: 600,
      height: 400,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => document.querySelector("svg").getBoundingClientRect().width <= 390,
    );
    assert.equal(
      await page.locator("svg").getAttribute("viewBox"),
      "0 0 600 400",
    );
    const file = path.join(dir, "vector.pdf");
    await renderPdf(page, file);
    assert.equal(pages(file).length, 1);
    close(pages(file)[0].width, 450);
    close(pages(file)[0].height, 300);
    assert.match(pages(file)[0].content, /VECTOR_MARK/);
  });
});
test("width-only sheets measure live natural height and survive physical print restoration", async (t) => {
  const { dir, url } = await fixture(t, {
    style:
      "body{margin:0}main{width:600px;display:flow-root}.part{height:300px}",
    body: '<main><section class="part">FIRST_PART</section></main>',
  });
  await withPage(url, async (page) => {
    assert.deepEqual(await page.evaluate(() => CodexFixedSheet.dimensions), {
      width: 600,
      height: 300,
    });
    await page.locator("main").evaluate((element) => {
      const section = document.createElement("section");
      section.className = "part";
      section.textContent = "SECOND_PART";
      element.append(section);
    });
    await page.waitForFunction(() => CodexFixedSheet.dimensions.height === 600);
    const scale = await page.evaluate(() => CodexFixedSheet.previewScale);
    const output = path.join(dir, "live.pdf");
    await renderPdf(page, output);
    const result = pages(output);
    assert.equal(result.length, 1);
    close(result[0].width, 450);
    close(result[0].height, 450);
    assert.match(result[0].content, /FIRST_PART/);
    assert.match(result[0].content, /SECOND_PART/);
    await page.emulateMedia({ media: "screen" });
    await page.waitForFunction(() => CodexFixedSheet.previewScale !== 1);
    close(await page.evaluate(() => CodexFixedSheet.previewScale), scale, 0.01);
  });
});
test("fluid, ambiguous, opted-out and existing print-owned pages retain their author contract", async (t) => {
  const { url, dir } = await fixture(t, {
    style: "body{margin:0}main{width:100%;max-width:1200px;height:800px}",
    body: '<main id="sheet">Fluid surface</main>',
  });
  await withPage(url, async (page) => {
    assert.equal(await page.evaluate(() => CodexFixedSheet.reason), "fluid");
    await page
      .locator("main")
      .evaluate((element) => (element.style.width = "1200px"));
    await page.waitForFunction(() => CodexFixedSheet.reason === "fixed");
    await page.evaluate(() => {
      const aside = document.createElement("aside");
      aside.textContent = "Outside controls";
      document.body.append(aside);
    });
    await page.waitForFunction(() => CodexFixedSheet.reason === "ambiguous");
    await page
      .locator("main")
      .evaluate((element) => element.setAttribute("data-fixed-sheet", ""));
    await page.waitForFunction(() => CodexFixedSheet.reason === "fixed");
    await page.evaluate(() => {
      window.opt = document.createElement("meta");
      opt.name = "codex-fixed-sheet";
      opt.content = "off";
      document.head.append(opt);
    });
    await page.waitForFunction(() => CodexFixedSheet.reason === "owned");
    assert.equal(await page.evaluate(() => CodexFixedSheet.dimensions), null);
    await page.evaluate(() => opt.remove());
    await page.waitForFunction(() => CodexFixedSheet.reason === "fixed");
    await page.evaluate(() => {
      const rules = document.createElement("style");
      rules.textContent = "@media print{@page{size:100mm 150mm;margin:0}}";
      document.head.append(rules);
    });
    const file = path.join(dir, "authored.pdf");
    await renderPdf(page, file);
    close(pages(file)[0].width, (100 / 25.4) * 72);
    close(pages(file)[0].height, (150 / 25.4) * 72);
  });
});
test("body sheets preserve real source-backed text edits and keep the owned editor outside screen scaling", async (t) => {
  const { dir, url, source } = await fixture(t, {
    style:
      "body{margin:0;box-sizing:border-box;padding:24px;width:1200px;height:800px;background:#245745;color:white}h1{font-size:90px}",
    body: '<h1 id="title">Original sheet</h1><p>A body-sized page</p>',
    text: true,
  });
  await withPage(url, async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => CodexFixedSheet.previewScale < 0.4);
    assert.equal(
      await page
        .locator("text-editor")
        .evaluate((element) => element.parentNode === document.documentElement),
      true,
    );
    await page
      .locator("text-editor")
      .getByRole("button", { name: "Edit text", exact: true })
      .click();
    await page.locator("#title").click();
    await page
      .locator("text-editor")
      .getByRole("textbox", { name: "Selected text", exact: true })
      .fill("Saved body headline");
    await page.evaluate(() => document.querySelector("text-editor").flush());
    assert.equal(
      await fs.readFile(path.join(dir, "index.html"), "utf8"),
      source.replace("Original sheet", "Saved body headline"),
    );
    const file = path.join(dir, "saved.pdf");
    await renderPdf(page, file);
    assert.equal(pages(file).length, 1);
    close(pages(file)[0].width, 900);
    close(pages(file)[0].height, 600);
    assert.match(pages(file)[0].content, /Saved/);
    assert.doesNotMatch(pages(file)[0].content, /Edit text/);
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.body).padding),
      "24px",
    );
    execFileSync("pdftoppm", [
      "-f",
      "1",
      "-singlefile",
      "-scale-to-x",
      "600",
      "-scale-to-y",
      "-1",
      "-png",
      file,
      path.join(dir, "body"),
    ]);
    const png = await fs.readFile(path.join(dir, "body.png"));
    const corner = await page.evaluate(async (data) => {
      const image = new Image();
      image.src = "data:image/png;base64," + data;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return [...context.getImageData(4, 4, 1, 1).data];
    }, png.toString("base64"));
    assert.deepEqual(corner, [36, 87, 69, 255]);
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => CodexFixedSheet.destroy());
    assert.equal(
      await page
        .locator("text-editor")
        .evaluate((element) => element.parentNode === document.body),
      true,
    );
  });
});
test("portable fixed sheets retain CSS, image bytes, automatic fitting and physical PDF output after source removal", async (t) => {
  const { dir, url } = await fixture(t, {
    style: "body{margin:0}main{width:1200px;height:800px}",
    head: '<link rel="stylesheet" href="sheet.css">',
    body: '<main><h1>PORTABLE_MARK</h1><img src="art.svg" alt="Original local vector"></main>',
    files: {
      "sheet.css":
        "main{box-sizing:border-box;padding:60px;background:#245745;color:white}img{width:200px;height:100px}",
      "art.svg":
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#e6bc51"/></svg>',
    },
  });
  await fs.writeFile(
    path.join(dir, "portable.html"),
    await inlineHtml(path.join(dir, "index.html")),
  );
  await fs.rm(path.join(dir, "sheet.css"));
  await fs.rm(path.join(dir, "art.svg"));
  await fs.rm(path.join(dir, "index.html"));
  await withPage(url + "portable.html", async (page) => {
    assert.equal(
      await page.locator("script[data-codex-fixed-sheet-runtime]").count(),
      1,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => CodexFixedSheet.previewScale < 0.4);
    assert.equal(
      await page
        .locator("img")
        .evaluate(
          (element) => element.complete && element.naturalWidth === 200,
        ),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
  });
  const file = path.join(dir, "portable.pdf");
  await exportArtifact("pdf", url + "portable.html", file);
  assert.equal(pages(file).length, 1);
  close(pages(file)[0].width, 900);
  close(pages(file)[0].height, 600);
  assert.match(pages(file)[0].content, /PORTABLE_MARK/);
});
