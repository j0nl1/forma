import test from "node:test";
import assert from "node:assert/strict";
import { temporary } from "./helpers.mjs";
import { catalogList } from "../packages/catalog/src/index.mjs";
import { buildCatalogSite } from "../packages/catalog/src/site.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";

test("local catalog previews use their actual source, support parameter changes and keep the page usable on mobile", async (t) => {
  const directory = await temporary(t);
  await buildCatalogSite(directory);
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url, async (page, errors) => {
    const items = await catalogList();
    assert.equal(await page.locator("article").count(), items.length);
    await page.locator("#target").selectOption("audio");
    assert.equal(await page.locator("article:visible").count(), 5);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    for (const item of items) {
      await page.goto(url + `previews/${item.id}/${item.preview}`);
      await page.waitForLoadState("networkidle");
      assert.ok(
        await page.evaluate(() => {
          const visibleText = (root) =>
            root.textContent.trim().length > 0 ||
            [...root.querySelectorAll("*")].some(
              (element) =>
                element.shadowRoot && visibleText(element.shadowRoot),
            );
          return visibleText(document.body);
        }),
        item.id,
      );
      if (item.id === "data-chart") {
        assert.equal(await page.locator("data-chart svg rect").count(), 3);
      }
    }
    await page.goto(url + "previews/video-title/preview.html");
    await page.getByLabel("text", { exact: true }).fill("A changed title");
    await page.waitForFunction(
      () =>
        document.querySelector(".forma-title h1")?.textContent ===
        "A changed title",
    );
    await page.goto(url + "previews/video-lower-third/preview.html");
    await page.getByLabel("name", { exact: true }).fill("Jordan Taylor");
    assert.equal(
      await page.locator(".forma-lower-third strong").textContent(),
      "Jordan Taylor",
    );
    assert.deepEqual(errors, []);
  });
});
