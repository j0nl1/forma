import { copyCatalogResource } from "./helpers.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary } from "./helpers.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";

const svg = (id, attribute) =>
  `<svg width="120" height="80" aria-label="Green reference tile"><defs><rect id="${id}" x="10" y="10" width="80" height="50" fill="lime"/></defs><use ${attribute}="#${id}"/></svg>`;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><style>body{margin:0}design-canvas{height:100vh}svg{display:block}</style><design-canvas id="svg-exports"><design-section id="references" title="SVG references"><design-board id="legacy" label="Legacy reference" width="120" height="80">${svg("legacy-tile", "xlink:href")}</design-board></design-section><design-section id="modern-references" title="Modern SVG references"><design-board id="modern" label="Modern reference" width="120" height="80">${svg("modern-tile", "href")}</design-board></design-section></design-canvas><script src="starters/canvas.js"></script></html>`;

test("artboard PNG downloads preserve SVG xlink/href references and exact solid pixels; portable HTML survives deleting runtime sources", async (t) => {
  const dir = await temporary(t);
  await copyCatalogResource("design-canvas", path.join(dir, "starters"));
  await fs.writeFile(path.join(dir, "canvas.html"), html);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const pngs = [];
  const portablePaths = [];
  await withPage(url + "canvas.html", async (page) => {
    await page.waitForFunction(
      () => document.querySelector("design-canvas")?.ready,
    );
    assert.equal(
      await page
        .locator("#legacy use")
        .evaluate((node) => node.getAttributeNode("xlink:href").namespaceURI),
      "http://www.w3.org/1999/xlink",
    );
    for (const [id, filename, scale] of [
      ["legacy", "Legacy-reference", 0.5],
      ["modern", "Modern-reference", 1.7],
    ]) {
      const board = page.locator(`#${id}`);
      await page
        .locator("design-canvas")
        .evaluate(
          (canvas, scale) => canvas.viewport.set({ x: 0, y: 0, scale }),
          scale,
        );
      await board.locator("summary[aria-label='Artboard actions']").click();
      const pngDownload = page.waitForEvent("download", { timeout: 5000 });
      await board.getByRole("button", { name: "Download PNG" }).click();
      const png = await pngDownload;
      assert.equal(png.suggestedFilename(), filename + ".png");
      const pngPath = path.join(dir, filename + ".png");
      await png.saveAs(pngPath);
      pngs.push((await fs.readFile(pngPath)).toString("base64"));
      await board.locator("summary[aria-label='Artboard actions']").click();
      const htmlDownload = page.waitForEvent("download");
      await board.getByRole("button", { name: "Download HTML" }).click();
      const portable = await htmlDownload;
      assert.equal(portable.suggestedFilename(), filename + ".html");
      const portablePath = path.join(dir, filename + ".html");
      await portable.saveAs(portablePath);
      portablePaths.push(portablePath);
      if (process.env.CODEX_CAPTURE_CANVAS_SVG_EXPORT) {
        await fs.mkdir(process.env.CODEX_CAPTURE_CANVAS_SVG_EXPORT, {
          recursive: true,
        });
        await fs.copyFile(
          pngPath,
          path.join(
            process.env.CODEX_CAPTURE_CANVAS_SVG_EXPORT,
            filename + ".png",
          ),
        );
        await fs.copyFile(
          portablePath,
          path.join(
            process.env.CODEX_CAPTURE_CANVAS_SVG_EXPORT,
            filename + ".html",
          ),
        );
      }
    }
    const decoded = await page.evaluate(async (images) => {
      const result = [];
      for (const encoded of images) {
        const image = new Image();
        image.src = "data:image/png;base64," + encoded;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, image.width, image.height).data;
        let differences = 0;
        for (let y = 0; y < image.height; y++)
          for (let x = 0; x < image.width; x++) {
            const expected =
              x >= 30 && x < 270 && y >= 30 && y < 180
                ? [0, 255, 0, 255]
                : [255, 255, 255, 255];
            for (let c = 0; c < 4; c++)
              if (data[(y * image.width + x) * 4 + c] !== expected[c])
                differences++;
          }
        result.push({ width: image.width, height: image.height, differences });
      }
      return result;
    }, pngs);
    assert.deepEqual(decoded, [
      { width: 360, height: 240, differences: 0 },
      { width: 360, height: 240, differences: 0 },
    ]);
    assert.equal(
      await fs.readFile(path.join(dir, "canvas.html"), "utf8"),
      html,
    );
  });
  await fs.rm(path.join(dir, "starters"), { recursive: true });
  await fs.rm(path.join(dir, "canvas.html"));
  for (const portablePath of portablePaths) {
    const source = await fs.readFile(portablePath, "utf8");
    assert.doesNotMatch(source, /<script\b|src="starters\//);
    await withPage(url + path.basename(portablePath), async (page) => {
      const image = await page.evaluate(async () => {
        const svg = document.querySelector("svg");
        const snapshot = new XMLSerializer().serializeToString(svg);
        const image = new Image();
        image.src =
          "data:image/svg+xml;charset=utf-8," + encodeURIComponent(snapshot);
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 120;
        canvas.height = 80;
        const context = canvas.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, 120, 80);
        context.drawImage(image, 0, 0);
        return {
          inside: [...context.getImageData(20, 20, 1, 1).data],
          outside: [...context.getImageData(100, 70, 1, 1).data],
        };
      });
      assert.deepEqual(image, {
        inside: [0, 255, 0, 255],
        outside: [255, 255, 255, 255],
      });
    });
  }
});
