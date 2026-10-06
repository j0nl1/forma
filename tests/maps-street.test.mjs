import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { deflateSync } from "node:zlib";
import { temporary } from "./helpers.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";

// Synthetic solid tiles test interactions without contacting a public tile service.
function tilePNG() {
  const chunk = (type, data) => {
    const name = Buffer.from(type),
      bytes = Buffer.concat([name, data]);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const header = Buffer.alloc(4),
      trailer = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    trailer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, bytes, trailer]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(256, 0);
  header.writeUInt32BE(256, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc((256 * 4 + 1) * 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++)
      pixels.set([31, 122, 92, 255], y * 1025 + 1 + x * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const attribution =
  '© <a href="https://example.invalid/synthetic-license">Synthetic local tile fixture</a>';
async function fixture(
  t,
  { failing = false, template = "/tiles/{z}/{x}/{y}.png", inline = false } = {},
) {
  const dir = await temporary(t);
  await bundle(
    path.resolve("packages/runtime/src/browser/street-libraries.js"),
    path.join(dir, "street.bundle.js"),
  );
  await fs.copyFile(
    path.resolve("examples/maps-street.js"),
    path.join(dir, "maps-street.js"),
  );
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><link rel="stylesheet" href="street.bundle.css"><style>body{margin:24px;font:16px Arial}#street-map{height:360px;width:640px}p{color:#16392d}</style><button id="enable-tiles">Enable street tiles</button><div id="street-map" data-tile-url="${template}" data-tile-attribution='${attribution}' aria-label="Synthetic local street-map fixture"></div><p data-street-attribution>© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · <a href="https://www.openstreetmap.org/fixthemap">Report a map issue</a></p><p id="street-status" role="status"></p><script src="street.bundle.js" defer></script><script src="maps-street.js" defer></script></html>`;
  const document = inline
    ? html
        .replace(
          '<script src="street.bundle.js" defer></script><script src="maps-street.js" defer></script>',
          "",
        )
        .replace(
          "<style>",
          `<script>${await fs.readFile(path.join(dir, "street.bundle.js"), "utf8")}</script><script>${await fs.readFile(path.join(dir, "maps-street.js"), "utf8")}</script><style>`,
        )
    : html;
  await fs.writeFile(path.join(dir, "index.html"), document);
  const requests = [],
    png = tilePNG();
  const state = { failing };
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname.startsWith("/tiles/")) {
      requests.push(pathname);
      response.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      });
      response.end(
        state.failing ? Buffer.from("Synthetic invalid PNG tile") : png,
      );
      return;
    }
    const files = {
      "/index.html": ["index.html", "text/html"],
      "/street.bundle.js": ["street.bundle.js", "text/javascript"],
      "/street.bundle.css": ["street.bundle.css", "text/css"],
      "/maps-street.js": ["maps-street.js", "text/javascript"],
    };
    if (!files[pathname]) {
      response.writeHead(404);
      response.end();
      return;
    }
    const [name, type] = files[pathname];
    response.writeHead(200, { "Content-Type": type });
    response.end(await fs.readFile(path.join(dir, name)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    dir,
    html: document,
    requests,
    state,
    url: `http://127.0.0.1:${server.address().port}/index.html`,
  };
}
const loaded = (page) =>
  page.waitForFunction(() =>
    document
      .querySelector("#street-status")
      .textContent.includes("local tile fixture tiles loaded"),
  );
const mapState = (page) =>
  page.evaluate(() => ({
    center: window.CodexStreetMap.getCenter(),
    zoom: window.CodexStreetMap.getZoom(),
    controls: {
      scale: document.querySelectorAll(".leaflet-control-scale").length,
      zoom: document.querySelectorAll(".leaflet-control-zoom").length,
      attribution: document.querySelectorAll(".leaflet-control-attribution")
        .length,
    },
  }));

test("street tiles load only on activation; full Leaflet map pans, zooms and navigates by keyboard with actual attribution and decoded PNG pixels", async (t) => {
  const { dir, html, requests, url } = await fixture(t);
  await withPage(url, async (page, errors) => {
    await page.waitForTimeout(100);
    assert.equal(requests.length, 0);
    assert.equal(await page.evaluate(() => window.CodexStreetMap), undefined);
    assert.equal(
      await page.locator("[data-street-attribution]").innerText(),
      "© Synthetic local tile fixture",
    );
    assert.equal(
      await page.locator("[data-street-attribution] a").getAttribute("href"),
      "https://example.invalid/synthetic-license",
    );
    assert.equal(
      await page
        .locator("[data-street-attribution] a[href*='openstreetmap']")
        .count(),
      0,
    );
    await page.locator("#enable-tiles").click();
    await loaded(page);
    assert.ok(requests.length > 0);
    assert.equal(
      await page.evaluate(() => {
        const L = window.CodexLeaflet;
        return (
          L.version === "1.9.4" &&
          window.CodexStreetMap instanceof L.Map &&
          typeof L.marker === "function" &&
          typeof L.geoJSON === "function" &&
          typeof L.tileLayer.wms === "function" &&
          typeof L.CRS.EPSG3857.project === "function"
        );
      }),
      true,
    );
    const initial = await mapState(page);
    assert.equal(initial.zoom, 13);
    assert.ok(Math.abs(initial.center.lat - 38.7223) < 0.00001);
    assert.ok(Math.abs(initial.center.lng + 9.1393) < 0.00001);
    assert.deepEqual(initial.controls, { scale: 1, zoom: 1, attribution: 1 });
    assert.equal(
      await page
        .locator(
          ".leaflet-control-attribution a[href='https://example.invalid/synthetic-license']",
        )
        .count(),
      1,
    );
    const tile = await page
      .locator(".leaflet-tile-loaded")
      .first()
      .evaluate((image) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return {
          natural: [image.naturalWidth, image.naturalHeight],
          pixel: [...context.getImageData(0, 0, 1, 1).data],
          box: [
            image.getBoundingClientRect().width,
            image.getBoundingClientRect().height,
          ],
        };
      });
    assert.deepEqual(tile, {
      natural: [256, 256],
      pixel: [31, 122, 92, 255],
      box: [256, 256],
    });
    await page.locator(".leaflet-control-zoom-in").click();
    await page.waitForFunction(() => window.CodexStreetMap.getZoom() === 14);
    await page.waitForFunction(
      () => !document.querySelector(".leaflet-zoom-anim"),
    );
    await loaded(page);
    const beforePan = await mapState(page);
    await page.mouse.move(340, 210);
    await page.mouse.down();
    await page.mouse.move(440, 210, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(
      (longitude) =>
        Math.abs(window.CodexStreetMap.getCenter().lng - longitude) > 0.001,
      beforePan.center.lng,
    );
    await page.waitForTimeout(350);
    const beforeKeyboard = await mapState(page);
    await page.locator("#street-map").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      (longitude) => window.CodexStreetMap.getCenter().lng > longitude,
      beforeKeyboard.center.lng,
    );
    await page.keyboard.press("+");
    await page.waitForFunction(() => window.CodexStreetMap.getZoom() === 15);
    await loaded(page);
    if (process.env.CODEX_CAPTURE_MAPS_STREET) {
      await fs.mkdir(process.env.CODEX_CAPTURE_MAPS_STREET, {
        recursive: true,
      });
      await page.screenshot({
        path: path.join(
          process.env.CODEX_CAPTURE_MAPS_STREET,
          "synthetic-street-map.png",
        ),
      });
      await fs.writeFile(
        path.join(process.env.CODEX_CAPTURE_MAPS_STREET, "state.json"),
        JSON.stringify(await mapState(page), null, 2),
      );
    }
    assert.deepEqual(errors, []);
  });
  assert.equal(await fs.readFile(path.join(dir, "index.html"), "utf8"), html);
});

test("failed synthetic tiles retain honest state; retry preserves the actual map, controls, live view and one listener delivery", async (t) => {
  const { requests, state, url } = await fixture(t, { failing: true });
  await withPage(url, async (page, errors) => {
    assert.equal(requests.length, 0);
    await page.locator("#enable-tiles").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#street-status")
        .textContent.includes("tile loading failed"),
    );
    assert.equal(
      await page.locator("#enable-tiles").innerText(),
      "Retry street tiles",
    );
    assert.equal(await page.locator("#enable-tiles").isEnabled(), true);
    const initial = await mapState(page);
    await page.evaluate(() => {
      window.fixtureMap = window.CodexStreetMap;
      window.fixtureMoves = 0;
      window.fixtureMap.on("moveend", () => {
        window.fixtureMoves += 1;
      });
    });
    const failedRequests = requests.length;
    state.failing = false;
    await page.locator("#enable-tiles").click();
    await loaded(page);
    assert.ok(requests.length > failedRequests);
    assert.equal(
      await page.evaluate(() => window.fixtureMap === window.CodexStreetMap),
      true,
    );
    assert.deepEqual(await mapState(page), initial);
    await page.evaluate(() =>
      window.CodexStreetMap.panBy([40, 0], { animate: false }),
    );
    assert.equal(await page.evaluate(() => window.fixtureMoves), 1);
    await loaded(page);
    await page.locator("#enable-tiles").click();
    await loaded(page);
    assert.deepEqual((await mapState(page)).controls, initial.controls);
    await page.evaluate(() =>
      window.CodexStreetMap.panBy([40, 0], { animate: false }),
    );
    assert.equal(await page.evaluate(() => window.fixtureMoves), 2);
    assert.equal(
      await page.locator(".leaflet-tile-pane > .leaflet-layer").count(),
      1,
    );
    assert.equal(
      await page
        .locator(
          ".leaflet-control-attribution a[href='https://example.invalid/synthetic-license']",
        )
        .count(),
      1,
    );
    assert.deepEqual(errors, []);
  });
});

test("unsupported tile templates fail explicitly without creating a map or making requests; corrected local template retries", async (t) => {
  const { requests, url } = await fixture(t, {
    template: "/tiles/{z}/{x}/{unknown}.png",
  });
  await withPage(url, async (page, errors) => {
    await page.locator("#enable-tiles").click();
    assert.match(
      await page.locator("#street-status").innerText(),
      /tile template must contain/,
    );
    assert.equal(requests.length, 0);
    assert.equal(await page.evaluate(() => window.CodexStreetMap), undefined);
    await page.locator("#street-map").evaluate((map) => {
      map.dataset.tileUrl = "data:image/png;base64,{z}/{x}/{y}";
    });
    await page.locator("#enable-tiles").click();
    assert.match(
      await page.locator("#street-status").innerText(),
      /unsupported tile URL/,
    );
    assert.equal(requests.length, 0);
    await page.locator("#street-map").evaluate((map) => {
      map.dataset.tileUrl = "/tiles/{z}/{x}/{y}.png";
    });
    await page.locator("#enable-tiles").click();
    await loaded(page);
    assert.ok(requests.length > 0);
    assert.deepEqual(errors, []);
  });
});

test("portable inline head scripts mount after body parsing exactly once and retain button-only local tile loading", async (t) => {
  const { requests, url } = await fixture(t, { inline: true });
  await withPage(url, async (page, errors) => {
    assert.equal(requests.length, 0);
    assert.equal(await page.evaluate(() => window.CodexStreetMap), undefined);
    assert.match(
      await page.locator("#street-status").innerText(),
      /Street tiles are disabled/,
    );
    assert.equal(
      await page.locator("[data-street-attribution]").innerText(),
      "© Synthetic local tile fixture",
    );
    await page.locator("#enable-tiles").click();
    await loaded(page);
    assert.deepEqual((await mapState(page)).controls, {
      scale: 1,
      zoom: 1,
      attribution: 1,
    });
    assert.equal(
      await page.locator(".leaflet-tile-pane > .leaflet-layer").count(),
      1,
    );
    assert.ok(requests.length > 0);
    assert.deepEqual(errors, []);
  });
});

test("default Leaflet markers decode normal, retina and shadow assets from the local bundle at both pixel densities", async (t) => {
  const { url } = await fixture(t);
  for (const deviceScaleFactor of [1, 2]) {
    await withPage(
      url,
      async (page, errors) => {
        await page.locator("#enable-tiles").click();
        await loaded(page);
        const marker = await page.evaluate(async () => {
          const L = window.CodexLeaflet;
          L.marker([38.7223, -9.1393]).addTo(window.CodexStreetMap);
          const images = [
            document.querySelector(".leaflet-marker-icon"),
            document.querySelector(".leaflet-marker-shadow"),
          ];
          return Promise.all(
            images.map(async (image) => {
              let decoded = true;
              try {
                await image.decode();
              } catch {
                decoded = false;
              }
              return {
                decoded,
                src: image.src,
                natural: [image.naturalWidth, image.naturalHeight],
                display: [
                  image.getBoundingClientRect().width,
                  image.getBoundingClientRect().height,
                ],
              };
            }),
          );
        });
        assert.equal(marker.length, 2);
        assert.deepEqual(
          marker.map((image) => image.decoded),
          [true, true],
        );
        assert.deepEqual(
          marker.map((image) => image.natural),
          [deviceScaleFactor === 2 ? [50, 82] : [25, 41], [41, 41]],
        );
        assert.deepEqual(
          marker.map((image) => image.display),
          [
            [25, 41],
            [41, 41],
          ],
        );
        assert.ok(
          marker.every((image) => image.src.startsWith("data:image/png")),
          "actual marker and shadow use bundled image data",
        );
        const assets = await page.evaluate(async () =>
          Promise.all(
            ["iconUrl", "iconRetinaUrl", "shadowUrl"].map(async (key) => {
              const image = new Image();
              image.src =
                window.CodexLeaflet.Icon.Default.prototype.options[key];
              await image.decode();
              return {
                src: image.src,
                natural: [image.naturalWidth, image.naturalHeight],
              };
            }),
          ),
        );
        assert.deepEqual(
          assets.map((image) => image.natural),
          [
            [25, 41],
            [50, 82],
            [41, 41],
          ],
        );
        assert.ok(
          assets.every((image) => image.src.startsWith("data:image/png")),
        );
        assert.deepEqual(errors, []);
      },
      { deviceScaleFactor },
    );
  }
});
