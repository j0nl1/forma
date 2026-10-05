import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../skills/forma/scripts/build.mjs";
import { inlineHtml } from "../skills/forma/scripts/lib/inline.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";

async function fixture(t) {
  const dir = await temporary(t);
  const source = path.join(dir, "source");
  await fs.mkdir(source);
  for (const name of ["maps.html", "maps.js", "maps-street.js"])
    await fs.copyFile(
      path.join(root, "examples", name),
      path.join(source, name),
    );
  for (const [entry, output] of [
    ["geography-libraries.js", "geography.bundle.js"],
    ["street-libraries.js", "street.bundle.js"],
  ])
    await bundle(
      path.join(root, "skills/forma/assets/starters", entry),
      path.join(source, output),
    );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, source, url };
}
async function download(page, id, file) {
  const pending = page.waitForEvent("download");
  await page.click(id);
  const result = await pending;
  await result.saveAs(file);
  return result.suggestedFilename();
}

test("real geographic topology projects the world and selected regions with actual SVG/2x PNG downloads", async (t) => {
  const { dir, url } = await fixture(t);
  await withPage(`${url}source/maps.html`, async (page) => {
    assert.deepEqual(
      await page.evaluate(() => ({
        count: CodexVectorMap.countries.length,
        paths: document.querySelectorAll("#vector-map [data-country]").length,
        names: CodexVectorMap.countries.find((f) => String(f.id) === "620")
          .properties.name,
        topo: typeof CodexMaps.topojson.mesh,
        d3: typeof CodexMaps.d3.geoAlbersUsa,
        leaflet: typeof CodexLeaflet.Map,
        street: typeof window.CodexStreetMap,
      })),
      {
        count: 177,
        paths: 177,
        names: "Portugal",
        topo: "function",
        d3: "function",
        leaflet: "function",
        street: "undefined",
      },
    );
    await page.selectOption("#country", "620");
    const geometry = await page.evaluate(() => {
      const { projection, selected } = CodexVectorMap;
      const bounds = CodexMaps.d3.geoPath(projection).bounds(selected);
      return {
        bounds,
        path: document
          .querySelector('#vector-map [data-country="620"]')
          .getAttribute("d"),
        selected: selected.properties.name,
        projected: projection([-9.1393, 38.7223]),
      };
    });
    assert.equal(geometry.selected, "Portugal");
    assert.match(geometry.path, /^M/);
    assert.doesNotMatch(geometry.path, /NaN|Infinity/);
    for (const [x, y] of geometry.bounds) {
      assert.ok(x >= 35 && x <= 685);
      assert.ok(y >= 57 && y <= 375);
    }
    assert.ok(geometry.projected[0] > 36 && geometry.projected[0] < 684);
    assert.ok(geometry.projected[1] > 58 && geometry.projected[1] < 374);
    const svg = path.join(dir, "region.svg");
    const png = path.join(dir, "region.png");
    assert.equal(await download(page, "#save-svg", svg), "portugal-map.svg");
    assert.equal(await download(page, "#save-png", png), "portugal-map.png");
    const markup = await fs.readFile(svg, "utf8");
    assert.match(markup, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(markup, /Natural Earth 1:110m/);
    assert.match(markup, /Mercator/);
    assert.ok(markup.includes(geometry.path));
    assert.equal((markup.match(/data-country=/g) || []).length, 1);
    const bytes = await fs.readFile(png);
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), 1440);
    assert.equal(bytes.readUInt32BE(20), 840);
    const pixels = await page.evaluate(
      async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = image.width;
        c.height = image.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let land = 0;
        for (let i = 0; i < data.length; i += 4)
          if (
            data[i] === 48 &&
            data[i + 1] === 116 &&
            data[i + 2] === 87 &&
            data[i + 3] === 255
          )
            land++;
        return {
          land,
          background: Array.from(ctx.getImageData(2, 2, 1, 1).data),
        };
      },
      `data:image/png;base64,${bytes.toString("base64")}`,
    );
    assert.ok(pixels.land > 10000);
    assert.deepEqual(pixels.background, [228, 236, 231, 255]);
    await page.selectOption("#country", "242");
    const fiji = await page.evaluate(() =>
      CodexMaps.d3
        .geoPath(CodexVectorMap.projection)
        .bounds(CodexVectorMap.selected),
    );
    assert.ok(
      fiji[1][1] - fiji[0][1] > 200,
      "Dateline islands remain legible in their regional view",
    );
    await page.selectOption("#country", "name:Kosovo");
    assert.equal(
      await page.evaluate(() => CodexVectorMap.selected.properties.name),
      "Kosovo",
    );
    await page.click("#world-view");
    assert.equal(await page.locator("#vector-map [data-country]").count(), 177);
    await page
      .locator('#vector-map [data-country="620"]')
      .dispatchEvent("click");
    assert.equal(await page.locator("#country").inputValue(), "620");
    await page.setViewportSize({ width: 360, height: 850 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.ok((await page.locator("#vector-map").boundingBox()).width <= 328);
  });
});

test("standalone geography retains its data, projections and exports after its original source is removed", async (t) => {
  const { dir, source, url } = await fixture(t);
  await fs.writeFile(
    path.join(dir, "portable.html"),
    await inlineHtml(path.join(source, "maps.html")),
  );
  await fs.rm(source, { recursive: true, force: true });
  await withPage(`${url}portable.html`, async (page) => {
    assert.equal(await page.locator("#vector-map [data-country]").count(), 177);
    await page.selectOption("#country", "392");
    assert.equal(
      await page.evaluate(() => CodexVectorMap.selected.properties.name),
      "Japan",
    );
    assert.equal(
      await download(page, "#save-png", path.join(dir, "japan.png")),
      "japan-map.png",
    );
    assert.equal(await page.evaluate(() => typeof CodexStreetMap), "undefined");
    assert.match(await page.locator("#street-status").innerText(), /disabled/);
  });
});
