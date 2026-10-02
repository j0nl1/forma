import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary } from "./helpers.mjs";
import { serve } from "../skills/codex-design/scripts/preview.mjs";
import { withPage } from "../skills/codex-design/scripts/lib/browser.mjs";

const html =
  '<!doctype html><html lang="en"><meta charset="utf-8"><style>body{margin:0}deck-stage{height:700px}section{background:white;color:#16392d;padding:40px;font:32px Arial}footer{height:120px}input{font:20px Arial}</style><deck-stage width="800" height="500"><section data-label="Opening"><h1>Opening</h1><input id="typing" value="Author input"><p data-anim="appear" data-anim-trigger="click">Click build</p></section><section data-label="Details"><h1>Details</h1></section></deck-stage><footer><button id="outside">Outside deck</button></footer><script src="starters/deck.js"></script></html>';
async function fixture(t) {
  const dir = await temporary(t);
  await fs.cp(
    path.resolve("skills/codex-design/assets/starters"),
    path.join(dir, "starters"),
    { recursive: true },
  );
  await fs.writeFile(path.join(dir, "deck.html"), html);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url: url + "deck.html" };
}
const state = (page) =>
  page.locator("deck-stage").evaluate((deck) => {
    const style = getComputedStyle(deck.shadowRoot.querySelector(".toolbar"));
    return {
      visible: deck.hasAttribute("data-chrome-visible"),
      opacity: Number(style.opacity),
      hit: style.pointerEvents,
      index: deck.index,
    };
  });
const visible = (page) =>
  page.waitForFunction(() => {
    const deck = document.querySelector("deck-stage");
    return (
      deck.hasAttribute("data-chrome-visible") &&
      Number(
        getComputedStyle(deck.shadowRoot.querySelector(".toolbar")).opacity,
      ) === 1
    );
  });
const idle = (page) =>
  page.waitForFunction(() => {
    const deck = document.querySelector("deck-stage");
    return (
      !deck.hasAttribute("data-chrome-visible") &&
      Number(
        getComputedStyle(deck.shadowRoot.querySelector(".toolbar")).opacity,
      ) === 0
    );
  });
const ready = (page) =>
  page.waitForFunction(() => document.querySelector("deck-stage")?.ready);

test("normal editor chrome hides after idle, appears on global pointer movement and stays available during hover or keyboard focus", async (t) => {
  const { dir, url } = await fixture(t);
  await withPage(url, async (page, errors) => {
    await ready(page);
    // Browser initialization can deliver a mouse move; wait for its normal idle fade.
    await idle(page);
    assert.deepEqual(await state(page), {
      visible: false,
      opacity: 0,
      hit: "none",
      index: 0,
    });
    await page.mouse.move(900, 760);
    await visible(page);
    await idle(page);
    assert.equal((await state(page)).hit, "none");
    await page.mouse.move(901, 760);
    await visible(page);
    const toolbar = page.locator("deck-stage").locator(".toolbar");
    await toolbar.hover();
    await page.waitForTimeout(2000);
    assert.equal(
      (await state(page)).visible,
      true,
      "hover keeps normal editor controls active beyond idle timeout",
    );
    await page.mouse.move(900, 760);
    await idle(page);
    await page.locator("#outside").focus();
    await page.keyboard.press("Shift+Tab");
    await visible(page);
    await page.waitForFunction(() =>
      document
        .querySelector("deck-stage")
        .shadowRoot.activeElement?.matches(".toolbar button"),
    );
    await page.waitForTimeout(2000);
    assert.equal(
      (await state(page)).visible,
      true,
      "keyboard focus pins normal controls",
    );
    await page.locator("#outside").focus();
    await idle(page);
    if (process.env.CODEX_CAPTURE_DECK_IDLE) {
      await fs.mkdir(process.env.CODEX_CAPTURE_DECK_IDLE, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.CODEX_CAPTURE_DECK_IDLE, "normal-idle.png"),
      });
    }
    assert.deepEqual(errors, []);
  });
  assert.equal(await fs.readFile(path.join(dir, "deck.html"), "utf8"), html);
});

test("normal navigation, same-slide jumps and boundaries reveal controls, keyboard builds flash outside presentation and audience automatic navigation remains quiet", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page, errors) => {
    await ready(page);
    await page.keyboard.press("ArrowRight");
    assert.equal(
      (await state(page)).index,
      0,
      "the first keyboard advance consumes a build",
    );
    assert.equal(
      (await state(page)).visible,
      true,
      "normal keyboard build refreshes controls",
    );
    await idle(page);
    await page.keyboard.press("ArrowRight");
    assert.equal((await state(page)).index, 1);
    await visible(page);
    await idle(page);
    await page.locator("deck-stage").evaluate((deck) => deck.next());
    assert.equal((await state(page)).index, 1);
    await visible(page);
    await idle(page);
    await page.locator("deck-stage").evaluate((deck) => deck.goTo(1));
    await visible(page);
    await idle(page);
    await page.locator("deck-stage").evaluate((deck) => deck.prev());
    assert.equal((await state(page)).index, 0);
    await visible(page);
    await idle(page);
    await page.locator("#typing").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      (await state(page)).visible,
      false,
      "claimed typing keys do not summon normal controls",
    );
    await page.locator("#outside").focus();
    await page
      .locator("deck-stage")
      .evaluate((deck) => deck.setPresenting(true));
    await page.keyboard.press("ArrowRight");
    assert.deepEqual(await state(page), {
      visible: false,
      opacity: 0,
      hit: "none",
      index: 1,
    });
    await page.locator("deck-stage").evaluate((deck) => {
      deck.next();
      deck.goTo(1);
      deck.goTo(0);
    });
    assert.deepEqual(await state(page), {
      visible: false,
      opacity: 0,
      hit: "none",
      index: 0,
    });
    assert.deepEqual(errors, []);
  });
});
