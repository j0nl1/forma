import { copyCatalogResource } from "./helpers.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary } from "./helpers.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";

const html =
  '<!doctype html><html lang="en"><meta charset="utf-8"><style>body{margin:0}section{background:white;color:#152f37;padding:40px;font:32px Arial}</style><deck-stage width="800" height="500"><section data-label="Opening"><h1>Opening</h1></section><section data-label="Details"><h1>Details</h1></section></deck-stage><script src="starters/deck.js"></script></html>';
async function fixture(t) {
  const dir = await temporary(t);
  await copyCatalogResource("slide-deck", path.join(dir, "starters"));
  await fs.writeFile(path.join(dir, "deck.html"), html);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url: url + "deck.html" };
}
const ready = (page) =>
  page.waitForFunction(() => document.querySelector("deck-stage")?.ready);
const present = (page, value) =>
  page.locator("deck-stage").evaluate(
    (deck, value) =>
      deck.dispatchEvent(
        new CustomEvent("codex-deck-presenting", {
          detail: { presenting: value },
        }),
      ),
    value,
  );
const chrome = (page) =>
  page.locator("deck-stage").evaluate((deck) => ({
    visible: deck.hasAttribute("data-chrome-visible"),
    opacity: Number(
      getComputedStyle(deck.shadowRoot.querySelector(".toolbar")).opacity,
    ),
  }));
const waitHidden = (page) =>
  page.waitForFunction(() => {
    const deck = document.querySelector("deck-stage");
    return (
      !deck.hasAttribute("data-chrome-visible") &&
      Number(
        getComputedStyle(deck.shadowRoot.querySelector(".toolbar")).opacity,
      ) === 0
    );
  });

test("local presentation entry clears carried controls; identical state delivery preserves pointer/keyboard pins and navigation stays unobtrusive", async (t) => {
  const { dir, url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    await page.mouse.move(700, 400);
    assert.equal((await chrome(page)).visible, true);
    await present(page, true);
    assert.equal(
      (await chrome(page)).visible,
      false,
      "entry clears editor chrome immediately",
    );
    await waitHidden(page);
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.locator("deck-stage").evaluate((deck) => deck.index),
      1,
    );
    assert.deepEqual(await chrome(page), { visible: false, opacity: 0 });
    await page.mouse.move(701, 400);
    await page.waitForFunction(() =>
      document.querySelector("deck-stage").hasAttribute("data-chrome-visible"),
    );
    await present(page, true);
    assert.equal(
      (await chrome(page)).visible,
      true,
      "repeat delivery keeps pointer-summoned controls",
    );
    const toolbar = page.locator("deck-stage").locator(".toolbar");
    await toolbar.hover();
    await page.waitForTimeout(2000);
    assert.equal(
      (await chrome(page)).visible,
      true,
      "hover pins controls beyond idle timeout",
    );
    await present(page, true);
    assert.equal((await chrome(page)).visible, true);
    await page.mouse.move(600, 350);
    await waitHidden(page);
    await page.keyboard.press("Tab");
    await page.waitForFunction(() =>
      document
        .querySelector("deck-stage")
        .shadowRoot.activeElement?.matches(".toolbar button"),
    );
    await page.waitForTimeout(2000);
    assert.equal(
      (await chrome(page)).visible,
      true,
      "keyboard-origin focus pins controls",
    );
    await present(page, true);
    assert.equal((await chrome(page)).visible, true);
    await present(page, false);
    assert.equal(
      (await chrome(page)).visible,
      false,
      "exit clears carried pins",
    );
    await present(page, true);
    await waitHidden(page);
    await page.keyboard.press("ArrowLeft");
    assert.deepEqual(await chrome(page), { visible: false, opacity: 0 });
    if (process.env.CODEX_CAPTURE_DECK_PRESENTATION) {
      await fs.mkdir(process.env.CODEX_CAPTURE_DECK_PRESENTATION, {
        recursive: true,
      });
      await page.screenshot({
        path: path.join(
          process.env.CODEX_CAPTURE_DECK_PRESENTATION,
          "local-entry.png",
        ),
        fullPage: true,
      });
    }
  });
  assert.equal(await fs.readFile(path.join(dir, "deck.html"), "utf8"), html);
});

test("native fullscreen entry resets visible controls once; repeat synchronization retains interaction and exit does not carry pins back", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    await page.mouse.move(700, 400);
    await page
      .getByRole("button", { name: "Enter fullscreen", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.fullscreenElement &&
        document.querySelector("deck-stage").hasAttribute("data-fullscreen"),
    );
    assert.equal(
      (await chrome(page)).visible,
      false,
      "native entry resets chrome after click",
    );
    await waitHidden(page);
    await page.mouse.move(800, 300);
    await page.waitForFunction(() =>
      document.querySelector("deck-stage").hasAttribute("data-chrome-visible"),
    );
    await page.locator("deck-stage").evaluate((deck) => deck.syncFullscreen());
    assert.equal(
      (await chrome(page)).visible,
      true,
      "repeat fullscreen synchronization is a no-op for chrome",
    );
    await page.locator("deck-stage").locator(".toolbar").hover();
    await page.waitForTimeout(2000);
    assert.equal((await chrome(page)).visible, true);
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(
      () =>
        !document.fullscreenElement &&
        !document.querySelector("deck-stage").hasAttribute("data-fullscreen"),
    );
    assert.equal((await chrome(page)).visible, false);
    if (process.env.CODEX_CAPTURE_DECK_PRESENTATION) {
      await fs.mkdir(process.env.CODEX_CAPTURE_DECK_PRESENTATION, {
        recursive: true,
      });
      await page.screenshot({
        path: path.join(
          process.env.CODEX_CAPTURE_DECK_PRESENTATION,
          "fullscreen-exit.png",
        ),
        fullPage: true,
      });
    }
  });
});
