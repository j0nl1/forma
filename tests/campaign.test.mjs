import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../skills/studio-design/scripts/build.mjs";
import { serve } from "../skills/studio-design/scripts/preview.mjs";
import { withPage } from "../skills/studio-design/scripts/lib/browser.mjs";
import { inlineHtml } from "../skills/studio-design/scripts/lib/inline.mjs";
import {
  campaignDefaults,
  campaignFormats,
  validateCampaignUnits,
} from "../skills/studio-design/assets/starters/campaign-model.js";
const keys = [
  "instagramPost",
  "instagramPortrait",
  "story",
  "xPost",
  "facebook",
  "linkedin",
  "pinterest",
  "reddit",
  "youtubeThumbnail",
  "tiktok",
  "xDesktop",
  "linkedinDesktop",
  "facebookDesktop",
  "redditDesktop",
];
async function fixture(
  t,
  { source = false, portable = false, solid = false } = {},
) {
  const dir = await temporary(t);
  await fs.mkdir(path.join(dir, "starters"));
  await fs.mkdir(path.join(dir, "social"));
  await fs.copyFile(
    path.join(root, "examples/campaign.html"),
    path.join(dir, "campaign.html"),
  );
  if (solid)
    await fs.writeFile(
      path.join(dir, "social/portrait.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="160"><rect width="90" height="160" fill="#365bcf"/></svg>',
    );
  else
    await fs.copyFile(
      path.join(root, "examples/social/portrait.svg"),
      path.join(dir, "social/portrait.svg"),
    );
  let entry = path.join(root, "examples/campaign/main.jsx");
  if (solid) {
    const blue =
      "data:image/svg+xml," +
      encodeURIComponent(
        await fs.readFile(path.join(dir, "social/portrait.svg"), "utf8"),
      );
    const authored = (await fs.readFile(entry, "utf8"))
      .replace(
        'import portrait from "../social/portrait.svg";',
        `const portrait = ${JSON.stringify(blue)};`,
      )
      .replaceAll(
        '"../../skills/studio-design/',
        `"${path.join(root, "skills/studio-design")}/`,
      );
    entry = path.join(dir, "solid.jsx");
    await fs.writeFile(entry, authored);
  }
  await bundle(entry, path.join(dir, "campaign.bundle.js"));
  await bundle(
    path.join(root, "skills/studio-design/assets/starters/plain-canvas.js"),
    path.join(dir, "starters/plain-canvas.js"),
  );
  if (portable) {
    await fs.writeFile(
      path.join(dir, "portable.html"),
      await inlineHtml(path.join(dir, "campaign.html")),
    );
    await fs.rm(path.join(dir, "campaign.bundle.js"));
    await fs.rm(path.join(dir, "starters"), { recursive: true });
    await fs.rm(path.join(dir, "social"), { recursive: true });
  }
  const { server, url } = await serve(
    dir,
    0,
    source ? { tweaksFile: "campaign.html", imageFile: "campaign.html" } : {},
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url: url + (portable ? "portable.html" : "campaign.html") };
}
const ready = (page) =>
  page.waitForFunction(
    () =>
      window.CodexCampaign &&
      document.querySelector("social-frames")?.records.size === 14,
  );
async function controls(page) {
  await page
    .getByRole("button", { name: "Campaign formats", exact: true })
    .click();
}
async function archive(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(() => document.querySelector("social-frames").exportAll()),
  ]);
  return unzipSync(await fs.readFile(await download.path()));
}
const selected = (defaults) => keys.filter((key) => defaults[key]);
test("default campaign includes every mobile and desktop format; named platforms include desktop unless explicitly mobile-only", () => {
  assert.deepEqual(
    campaignFormats.map((format) => format.key),
    keys,
  );
  assert.deepEqual(selected(campaignDefaults()), keys);
  assert.equal(campaignDefaults().imagesOnly, false);
  assert.deepEqual(selected(campaignDefaults({ platforms: ["x", "reddit"] })), [
    "xPost",
    "reddit",
    "xDesktop",
    "redditDesktop",
  ]);
  assert.deepEqual(
    selected(
      campaignDefaults({
        platforms: ["linkedin", "facebook"],
        mobileOnly: true,
      }),
    ),
    ["facebook", "linkedin"],
  );
  assert.deepEqual(selected(campaignDefaults({ platforms: ["instagram"] })), [
    "instagramPost",
    "instagramPortrait",
    "story",
  ]);
  assert.deepEqual(
    selected(campaignDefaults({ formats: ["redditDesktop", "story"] })),
    ["story", "redditDesktop"],
  );
  assert.deepEqual(selected(campaignDefaults({ formats: [] })), []);
  for (const options of [
    { platforms: ["missing"] },
    { formats: ["facebookPost"] },
    { platforms: ["x"], formats: ["xPost"] },
    { platforms: null },
    { mobileOnly: "true" },
  ])
    assert.throws(() => campaignDefaults(options), /Choose|boolean/);
  const valid = { id: "unique", format: "carousel", render: () => null };
  assert.equal(validateCampaignUnits([valid])[0], valid);
  assert.throws(() => validateCampaignUnits([valid, valid]), /unique stable/);
  assert.throws(
    () => validateCampaignUnits([{ ...valid, format: "imagesOnly" }]),
    /toggle/,
  );
  assert.throws(
    () => validateCampaignUnits([{ ...valid, render: null }]),
    /render/,
  );
});
test("full authored campaign shows ten complete phone contexts and four browser/feed contexts with unique images and typed format controls", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    assert.deepEqual(
      await page
        .locator("[data-campaign-unit]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.dataset.campaignFormat),
        ),
      keys,
    );
    assert.equal(await page.locator("chrome-shell").count(), 4);
    assert.equal(await page.locator("post-card").count(), 4);
    assert.equal(await page.locator("instagram-shell").count(), 2);
    assert.equal(await page.locator("social-frames image-slot").count(), 14);
    const ids = await page
      .locator("social-frames image-slot")
      .evaluateAll((nodes) => nodes.map((node) => node.id));
    assert.equal(new Set(ids).size, 14);
    assert.equal(ids.every(Boolean), true);
    await controls(page);
    assert.deepEqual(
      await page
        .getByRole("switch")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("aria-label")),
        ),
      [...keys, "carousel", "imagesOnly"],
    );
    assert.equal(
      await page
        .getByRole("switch", { name: "carousel", exact: true })
        .getAttribute("aria-checked"),
      "false",
    );
    for (const key of [
      "xDesktop",
      "linkedinDesktop",
      "facebookDesktop",
      "redditDesktop",
    ]) {
      const unit = page.locator(`[data-campaign-format=${key}]`);
      assert.equal(
        await unit.locator("chrome-shell").getAttribute("image-only"),
        "false",
      );
      assert.equal(
        await unit.locator("post-card").getAttribute("image-only"),
        "false",
      );
    }
  });
});
test("format toggles remove whole units and re-number downloads while retained phone editors and React overlays keep identity", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    await page.evaluate(() => {
      window.savedPhone = document.querySelector("x-shell");
      window.savedImage = window.savedPhone.image;
      window.savedArt = window.savedPhone.firstElementChild;
    });
    await controls(page);
    await page.getByRole("switch", { name: "facebook", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("social-frames").records.size === 13,
    );
    assert.equal(
      await page.locator("[data-campaign-format=facebook]").count(),
      0,
    );
    assert.equal(
      await page.locator("[data-campaign-format=facebookDesktop]").count(),
      1,
    );
    await page.getByRole("switch", { name: "facebook", exact: true }).click();
    await ready(page);
    assert.equal(
      await page.evaluate(
        () =>
          savedPhone === document.querySelector("x-shell") &&
          savedImage === savedPhone.image &&
          savedArt === savedPhone.firstElementChild,
      ),
      true,
    );
    await page.getByRole("switch", { name: "imagesOnly", exact: true }).click();
    assert.equal(
      await page.locator("chrome-shell[image-only=true]").count(),
      4,
    );
    assert.equal(await page.locator("post-card[image-only=true]").count(), 4);
    assert.equal(
      await page
        .locator("social-frames")
        .evaluate((board) =>
          [
            ...board.querySelectorAll(
              "instagram-shell,instagram-story,x-shell,facebook-shell,linkedin-shell,pinterest-shell,reddit-shell,youtube-shell,tiktok-shell",
            ),
          ].every((node) => node.getAttribute("image-only") === "true"),
        ),
      true,
    );
    await page.evaluate(() =>
      window.CodexPlainCanvas.viewport.set({ x: 20, y: 20, scale: 0.2 }),
    );
    assert.ok(
      (
        await page
          .getByRole("dialog", { name: "Campaign formats", exact: true })
          .boundingBox()
      ).width > 270,
    );
    assert.equal(
      await page.locator("html>[data-codex-tweaks-chrome]").count(),
      1,
    );
    await page.evaluate(
      () =>
        (document.querySelector("meta[name=design_doc_mode]").content = "page"),
    );
    await page.waitForFunction(() => !window.CodexPlainCanvas);
    assert.equal(
      await page.locator("body>[data-codex-tweaks-chrome]").count(),
      1,
    );
    await page.getByRole("switch", { name: "imagesOnly", exact: true }).click();
    assert.equal(
      await page
        .getByRole("switch", { name: "imagesOnly", exact: true })
        .getAttribute("aria-checked"),
      "false",
    );
    await page.evaluate(
      () =>
        (document.querySelector("meta[name=design_doc_mode]").content =
          "canvas"),
    );
    await page.waitForFunction(() => !!window.CodexPlainCanvas);
    assert.equal(
      await page.locator("html>[data-codex-tweaks-chrome]").count(),
      1,
    );
    assert.equal(
      await page.locator("chrome-shell[image-only=false]").count(),
      4,
    );
  });
});
test("one carousel switch removes/restores five narrative frames together and keeps their image identities distinct", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    await controls(page);
    await page.getByRole("switch", { name: "carousel", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("social-frames").records.size === 19,
    );
    assert.equal(
      await page.locator("[data-campaign-format=carousel]").count(),
      5,
    );
    assert.deepEqual(
      await page
        .locator("[data-campaign-format=carousel] image-slot")
        .evaluateAll((nodes) => nodes.map((node) => node.id)),
      Array.from(
        { length: 5 },
        (_, index) => `reading-carousel-${index + 1}-photo`,
      ),
    );
    for (const format of keys)
      await page.getByRole("switch", { name: format, exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("social-frames").records.size === 5,
    );
    const files = await archive(page);
    assert.equal(Object.keys(files).length, 5);
    for (const bytes of Object.values(files)) {
      assert.equal(Buffer.from(bytes).readUInt32BE(16), 1080);
      assert.equal(Buffer.from(bytes).readUInt32BE(20), 1350);
    }
    await page.getByRole("switch", { name: "carousel", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("social-frames").records.size === 0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "↓ Download all (zip)", exact: true })
        .isVisible(),
      false,
    );
    await page.getByRole("switch", { name: "carousel", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("social-frames").records.size === 5,
    );
  });
});
test("all fourteen contextual and bare assets download real nominal PNGs without browser/phone/feed chrome, retaining proportional author artwork", async (t) => {
  const { url } = await fixture(t, { solid: true });
  await withPage(url, async (page) => {
    await ready(page);
    const frames = await page
      .locator("social-frames")
      .evaluate((board) =>
        board
          .frames()
          .map((node) => node.getAttribute("data-codex-frame-label")),
      );
    assert.equal(frames.length, 14);
    const first = await archive(page);
    assert.equal(Object.keys(first).length, 14);
    await controls(page);
    await page.getByRole("switch", { name: "imagesOnly", exact: true }).click();
    await page.evaluate(() =>
      window.CodexPlainCanvas.viewport.set({ x: -200, y: -300, scale: 0.3 }),
    );
    const bare = await archive(page);
    assert.deepEqual(Object.keys(bare), Object.keys(first));
    for (const [index, name] of Object.keys(first).entries()) {
      const format = campaignFormats[index];
      for (const files of [first, bare]) {
        const bytes = Buffer.from(files[name]);
        assert.equal(bytes.readUInt32BE(16), format.width, name);
        assert.equal(bytes.readUInt32BE(20), format.height, name);
        const pixels = await page.evaluate(async (encoded) => {
          const image = new Image();
          image.src = "data:image/png;base64," + encoded;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          const artwork = ctx.getImageData(
            0,
            0,
            image.width,
            image.height,
          ).data;
          let lettering = 0;
          for (let i = 0; i < artwork.length; i += 4)
            if (
              artwork[i] > 235 &&
              artwork[i + 1] > 235 &&
              artwork[i + 2] > 220 &&
              artwork[i + 3] > 200
            )
              lettering++;
          return {
            lettering,
            corners: [
              [30, 30],
              [image.width - 30, image.height - 30],
            ].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]),
          };
        }, bytes.toString("base64"));
        assert.deepEqual(
          pixels.corners,
          [
            [54, 91, 207, 255],
            [54, 91, 207, 255],
          ],
          name + " keeps only artwork",
        );
        assert.ok(pixels.lettering > 100, name + " retains authored lettering");
      }
    }
    assert.equal(await page.locator("chrome-shell").count(), 4);
  });
});
test("real campaign format source writes and fourteen independent uploaded images survive conditional removal and reload", async (t) => {
  const { dir, url } = await fixture(t, { source: true });
  await withPage(url, async (page) => {
    await ready(page);
    await page.evaluate(() => window.CodexCampaign.store.ready);
    const data = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 60;
      c.height = 90;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#269d80";
      ctx.fillRect(0, 0, 60, 90);
      return c.toDataURL().split(",")[1];
    });
    const ids = await page
      .locator("social-frames image-slot")
      .evaluateAll((nodes) => nodes.map((node) => node.id));
    for (const id of ids) {
      const slot = page.locator(`image-slot[id="${id}"]`);
      await slot.locator("input[type=file]").setInputFiles({
        name: "campaign.png",
        mimeType: "image/png",
        buffer: Buffer.from(data, "base64"),
      });
      await slot.evaluate(async (node) => {
        await node.settled();
        await node.store.settled();
      });
    }
    const state = JSON.parse(
      await fs.readFile(path.join(dir, "image-slots.state.json"), "utf8"),
    );
    assert.deepEqual(Object.keys(state).sort(), [...ids].sort());
    for (const record of Object.values(state))
      assert.ok(record.u.startsWith("data:image/"));
    await controls(page);
    await page.getByRole("switch", { name: "xPost", exact: true }).click();
    await page.evaluate(() => window.CodexCampaign.store.flush());
    const saved = await fs.readFile(path.join(dir, "campaign.html"), "utf8");
    assert.match(saved, /"xPost": false/);
    await page.reload();
    await page.waitForFunction(
      () =>
        window.CodexCampaign &&
        document.querySelector("social-frames")?.records.size === 13,
    );
    await controls(page);
    await page.getByRole("switch", { name: "xPost", exact: true }).click();
    await ready(page);
    for (const id of ids)
      assert.ok(
        await page
          .locator(`image-slot[id="${id}"]`)
          .evaluate((node) => node.record().u.startsWith("data:image/")),
      );
  });
});
test("portable complete campaign retains filters, canvas, carousel and ZIP exports after source modules and images are removed", async (t) => {
  const { url } = await fixture(t, { portable: true });
  await withPage(url, async (page) => {
    await ready(page);
    assert.ok(await page.evaluate(() => window.CodexPlainCanvas?.viewport));
    await controls(page);
    await page
      .getByRole("switch", { name: "redditDesktop", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("social-frames").records.size === 13,
    );
    const files = await archive(page);
    assert.equal(Object.keys(files).length, 13);
    await page.getByRole("switch", { name: "carousel", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("social-frames").records.size === 18,
    );
  });
});
