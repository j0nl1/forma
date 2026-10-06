import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";

const formats = [
  ["instagramPost", 1080, 1080],
  ["instagramPortrait", 1080, 1350],
  ["story", 1080, 1920],
  ["xPost", 1200, 675],
  ["facebook", 1200, 630],
  ["linkedin", 1200, 627],
  ["pinterest", 1000, 1500],
  ["reddit", 1200, 675],
  ["youtubeThumbnail", 1280, 720],
  ["tiktok", 1080, 1920],
  ["xDesktop", 1200, 675],
  ["linkedinDesktop", 1200, 627],
  ["facebookDesktop", 1200, 630],
  ["redditDesktop", 1200, 675],
];
async function fixture(t) {
  const dir = await temporary(t);
  await fs.mkdir(path.join(dir, "starters"));
  const html = await fs.readFile(
    path.join(root, "examples/campaign.html"),
    "utf8",
  );
  await fs.writeFile(path.join(dir, "campaign.html"), html);
  await bundle(
    path.join(root, "examples/campaign/main.jsx"),
    path.join(dir, "campaign.bundle.js"),
  );
  await bundle(
    path.join(root, "packages/runtime/src/browser/plain-canvas.js"),
    path.join(dir, "starters/plain-canvas.js"),
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, html, url: url + "campaign.html" };
}
const ready = (page) =>
  page.waitForFunction(
    () =>
      window.CodexCampaign &&
      window.CodexPlainCanvas &&
      document.querySelector("social-frames")?.records.size === 14,
  );
const geometry = (page) =>
  page.evaluate(() => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const glyphs = (element) => {
      const nodes = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const result = [];
      while (nodes.nextNode()) {
        if (!nodes.currentNode.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(nodes.currentNode);
        result.push(
          ...[...range.getClientRects()]
            .filter((rect) => rect.width > 0)
            .map((rect) => ({
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
            })),
        );
      }
      return result;
    };
    return {
      viewport: innerWidth,
      main: box(document.querySelector("main")),
      header: box(document.querySelector("header")),
      headerGlyphs: glyphs(document.querySelector("header")),
      result: box(document.querySelector("#campaign-result")),
      formats: [...document.querySelectorAll("[data-campaign-format]")].map(
        (unit) => unit.dataset.campaignFormat,
      ),
      artwork: [...document.querySelectorAll(".campaign-art")].map((art) => ({
        asset: box(art.assignedSlot?.parentElement || art.parentElement),
        glyphs: glyphs(art),
        title: art.querySelector("h2").textContent,
      })),
      contexts: [...document.querySelectorAll("[data-campaign-unit]")].map(
        (unit) => box(unit.firstElementChild),
      ),
      frameLabels: document
        .querySelector("social-frames")
        .frames()
        .map((frame) => frame.getAttribute("data-codex-frame-label")),
      canvas: window.CodexPlainCanvas.viewport.value,
    };
  });

function assertIntro(state) {
  assert.ok(
    state.header.left >= 23 && state.header.right <= state.viewport - 23,
    `intro stays within ${state.viewport}px viewport`,
  );
  for (const glyph of state.headerGlyphs)
    assert.ok(
      glyph.left >= 23 && glyph.right <= state.viewport - 23,
      `actual intro glyph range ${glyph.left}..${glyph.right} fits ${state.viewport}px`,
    );
  assert.ok(
    state.result.left >= 23 && state.result.right <= state.viewport - 23,
    "download result fits the readable viewport",
  );
  assert.equal(
    state.main.width,
    2800,
    "the authored panning scene keeps its full size",
  );
  assert.equal(state.canvas.scale, 1);
  assert.deepEqual(
    state.formats,
    formats.map(([key]) => key),
  );
  assert.equal(state.artwork.length, 14);
  for (const { title, glyphs, asset } of state.artwork)
    for (const glyph of glyphs)
      assert.ok(
        glyph.left >= asset.left - 1 &&
          glyph.right <= asset.right + 1 &&
          glyph.top >= asset.top - 1 &&
          glyph.bottom <= asset.bottom + 1,
        `${title} fits its actual asset independently of viewport`,
      );
  state.frameLabels.forEach((label, index) =>
    assert.ok(
      label.endsWith(`${formats[index][1]}×${formats[index][2]}`),
      label,
    ),
  );
}

test("campaign intro and real text glyphs fit desktop/360/390px views while all fourteen fixed contexts retain artwork, nominal formats and live node identity", async (t) => {
  const { dir, html, url } = await fixture(t);
  await withPage(url, async (page, errors) => {
    await ready(page);
    await page.evaluate(() => {
      window.retainedCampaignNodes = [
        ...document.querySelectorAll(
          "[data-campaign-unit],social-frames image-slot,.campaign-art",
        ),
      ];
    });
    let originalContexts;
    for (const width of [1440, 360, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() =>
        window.CodexPlainCanvas.viewport.set({ x: 0, y: 0, scale: 1 }),
      );
      await page.waitForTimeout(100);
      const state = await geometry(page);
      assertIntro(state);
      const sizes = state.contexts.map(({ width, height }) => [width, height]);
      originalContexts ||= sizes;
      assert.deepEqual(
        sizes,
        originalContexts,
        "responsive intro does not shrink the physical phone/browser contexts",
      );
      assert.equal(
        await page.evaluate(() =>
          window.retainedCampaignNodes.every((node) => node.isConnected),
        ),
        true,
      );
      if (process.env.CODEX_CAPTURE_CAMPAIGN_OVERFLOW) {
        await fs.mkdir(process.env.CODEX_CAPTURE_CAMPAIGN_OVERFLOW, {
          recursive: true,
        });
        await page.screenshot({
          path: path.join(
            process.env.CODEX_CAPTURE_CAMPAIGN_OVERFLOW,
            `after-${width}.png`,
          ),
        });
        await fs.writeFile(
          path.join(
            process.env.CODEX_CAPTURE_CAMPAIGN_OVERFLOW,
            `after-${width}.json`,
          ),
          JSON.stringify(state, null, 2),
        );
      }
    }
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    const launcher = page.getByRole("button", {
      name: "Campaign formats",
      exact: true,
    });
    const launcherBox = await launcher.boundingBox();
    assert.ok(
      launcherBox.x >= 0 &&
        launcherBox.x + launcherBox.width <= 390 &&
        launcherBox.y + launcherBox.height <= 1000,
      "Fit keeps the unscaled campaign launcher inside the viewport",
    );
    await launcher.click();
    const panel = page.getByRole("dialog", {
      name: "Campaign formats",
      exact: true,
    });
    const panelBox = await panel.boundingBox();
    assert.ok(
      panelBox.x >= 0 &&
        panelBox.x + panelBox.width <= 390 &&
        panelBox.y >= 0 &&
        panelBox.y + panelBox.height <= 1000,
      "all format controls remain reachable after Fit",
    );
    assert.equal(await panel.getByRole("switch").count(), 16);
    await page
      .getByRole("button", { name: "Close tweaks", exact: true })
      .click();
    await page.evaluate(() =>
      window.CodexPlainCanvas.viewport.set({ x: -800, y: -600, scale: 1 }),
    );
    assert.equal(
      await page.evaluate(() => window.CodexPlainCanvas.viewport.value.x),
      -800,
      "panning remains available for full-size placements",
    );
    assert.equal(
      await page.evaluate(() =>
        window.retainedCampaignNodes.every((node) => node.isConnected),
      ),
      true,
    );
    assert.deepEqual(errors, []);
  });
  assert.equal(
    await fs.readFile(path.join(dir, "campaign.html"), "utf8"),
    html,
  );
});
async function archive(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(() => document.querySelector("social-frames").exportAll()),
  ]);
  return unzipSync(await fs.readFile(await download.path()));
}

test("responsive campaign introduction preserves actual single PNG and all fourteen ZIP asset dimensions and pixels across mobile resize and pan", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page, errors) => {
    await ready(page);
    const desktop = await archive(page);
    assert.equal(Object.keys(desktop).length, 14);
    const [single] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate(() => {
        const board = document.querySelector("social-frames");
        return board.exportFrame(board.frames()[0]);
      }),
    ]);
    assert.deepEqual(
      await fs.readFile(await single.path()),
      Buffer.from(desktop[Object.keys(desktop)[0]]),
      "single PNG contains the same complete artwork as the archive",
    );
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.evaluate(() =>
      window.CodexPlainCanvas.viewport.set({ x: -650, y: -480, scale: 0.7 }),
    );
    const mobile = await archive(page);
    assert.deepEqual(Object.keys(mobile), Object.keys(desktop));
    for (const [index, filename] of Object.keys(desktop).entries()) {
      const bytes = Buffer.from(mobile[filename]);
      assert.equal(bytes.readUInt32BE(16), formats[index][1], filename);
      assert.equal(bytes.readUInt32BE(20), formats[index][2], filename);
      assert.deepEqual(
        bytes,
        Buffer.from(desktop[filename]),
        `${filename} pixels are unaffected by readable-page sizing or pan`,
      );
      const decoded = await page.evaluate(async (encoded) => {
        const image = new Image();
        image.src = "data:image/png;base64," + encoded;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return {
          width: image.naturalWidth,
          height: image.naturalHeight,
          pixel: [...context.getImageData(1, 1, 1, 1).data],
        };
      }, bytes.toString("base64"));
      assert.equal(decoded.width, formats[index][1]);
      assert.equal(decoded.height, formats[index][2]);
      assert.equal(
        decoded.pixel[3],
        255,
        "actual artwork is opaque and decoded",
      );
    }
    assert.deepEqual(errors, []);
  });
});
