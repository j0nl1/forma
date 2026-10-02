import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { temporary, root } from "./helpers.mjs";
import { serve } from "../skills/studio-design/scripts/preview.mjs";
import { exportArtifact } from "../skills/studio-design/scripts/export.mjs";
import { withPage } from "../skills/studio-design/scripts/lib/browser.mjs";
import { captureSlide } from "../skills/studio-design/scripts/lib/pptx-capture.mjs";
import { capturePptxImage } from "../skills/studio-design/scripts/lib/pptx-layers.mjs";

test("isolated paint on a later print-layout slide retains its full extent and pixels", async (t) => {
  const dir = await temporary(t);
  await fs.cp(
    path.join(root, "skills/studio-design/assets/starters"),
    path.join(dir, "starters"),
    { recursive: true },
  );
  const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Later slide paint</title><style>body{margin:0}section{background:white}</style></head><body><deck-stage width="1280" height="720"><section><h1>First slide</h1></section><section><h1>Second slide</h1></section><section><div style="position:absolute;left:288px;top:144px;width:672px;height:384px;background:linear-gradient(red,red)"></div></section></deck-stage><script src="starters/deck.js"></script></body></html>`;
  await fs.writeFile(path.join(dir, "index.html"), source);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url, async (page) => {
    await page.evaluate(() =>
      document.querySelector("deck-stage").preparePrint(),
    );
    await page.emulateMedia({ media: "print" });
    const captured = await page.evaluate(captureSlide, 2);
    const object = captured.objects.find((object) => object.kind === "image");
    assert.ok(object);
    const locator = page.locator("deck-stage > [data-deck-slide]").nth(2);
    const styles = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("[data-codex-pptx-source]")].map(
          (element) => element.getAttribute("style"),
        ),
      );
    const before = await styles();
    const image = await capturePptxImage(page, locator, object);
    assert.deepEqual(await styles(), before);
    assert.deepEqual(
      [image.readUInt32BE(16), image.readUInt32BE(20)],
      [672, 384],
    );
    const pixels = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return [
        [5, 5],
        [336, 192],
        [666, 378],
      ].map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
    }, image.toString("base64"));
    assert.deepEqual(pixels, Array(3).fill([255, 0, 0, 255]));
  });
  const output = path.join(dir, "later-slide.pptx");
  const result = await exportArtifact("pptx", url, output);
  assert.equal(result.slides, 3);
  assert.equal(result.rasterObjects, 1);
  const images = Object.entries(unzipSync(await fs.readFile(output)))
    .filter(([name]) => /^ppt\/media\/.*\.png$/.test(name))
    .map(([, data]) => Buffer.from(data));
  assert.equal(images.length, 1);
  assert.deepEqual(
    [images[0].readUInt32BE(16), images[0].readUInt32BE(20)],
    [672, 384],
  );
  assert.equal(await fs.readFile(path.join(dir, "index.html"), "utf8"), source);
});
