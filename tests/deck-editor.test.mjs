import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyDeckSource } from "../skills/codex-design/scripts/lib/deck-source.mjs";
import { serve } from "../skills/codex-design/scripts/preview.mjs";
import { withPage } from "../skills/codex-design/scripts/lib/browser.mjs";
const starters = path.resolve("skills/codex-design/assets/starters");
const notes =
  '<script id="speaker-notes" type="application/json">["One note","Two note","Three note","Four note"]</script>';
const content =
  '<section id="one" data-label="One"><h2>One</h2><p data-anim="fade-in" data-anim-trigger="click">Build one</p><input value="Original"></section><style>.extra{color:red}</style><section id="two" data-label="Two"><h2>Two</h2></section><!-- keep this comment --><section id="three" data-label="Three"><h2>Three</h2></section><template><p>Metadata</p></template><section id="four" data-label="Four"><h2>Four</h2></section>';
const source = (body = content, head = "", tail = notes) =>
  `<!doctype html><html lang="en" data-theme="warm"><head><meta charset="utf-8"><style>:root{--accent:rgb(195,72,38)}body{margin:0}deck-stage>section{background:var(--accent);color:white;padding:30px;font:24px system-ui}h2{margin:0}body[data-voice="cool"]{--accent:rgb(17,130,155)}deck-stage>section p{font-size:25px}</style>${head}</head><body><deck-stage width="800" height="500">${body}</deck-stage>${tail}<script src="starters/deck.js"></script></body></html>`;
async function fixture(t, html = source(), connected = false) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-deck-editor-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.cp(starters, path.join(dir, "starters"), { recursive: true });
  await fs.writeFile(path.join(dir, "deck.html"), html);
  const { server, url } = await serve(
    dir,
    0,
    connected ? { deckFile: "deck.html" } : {},
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url: url + "deck.html", origin: url.slice(0, -1) };
}
const ready = (page) =>
  page.waitForFunction(() => document.querySelector("deck-stage")?.ready);
const labels = (page) =>
  page.evaluate(() =>
    document
      .querySelector("deck-stage")
      .slides.map((slide) => slide.dataset.label),
  );
const idle = (page) =>
  page.waitForFunction(() => !document.querySelector("deck-stage").editor.busy);
test("source operations edit only literal slides, retain metadata and synchronize legacy notes", () => {
  const html = source();
  const moved = applyDeckSource(html, { type: "move", from: 3, to: 1 });
  assert.ok(moved.indexOf('id="four"') < moved.indexOf('id="two"'));
  assert.ok(moved.includes("<!-- keep this comment -->"));
  assert.ok(moved.includes("<style>.extra{color:red}</style>"));
  assert.ok(moved.includes('["One note","Four note","Two note","Three note"]'));
  const duplicated = applyDeckSource(moved, { type: "duplicate", index: 0 });
  assert.equal((duplicated.match(/id="one"/g) ?? []).length, 1);
  assert.ok(
    duplicated.includes(
      '["One note","One note","Four note","Two note","Three note"]',
    ),
  );
  const skipped = applyDeckSource(duplicated, {
    type: "skip",
    index: 1,
    value: true,
  });
  assert.equal((skipped.match(/data-deck-skip/g) ?? []).length, 1);
  const unskipped = applyDeckSource(skipped, {
    type: "skip",
    index: 1,
    value: false,
  });
  assert.ok(!unskipped.includes("data-deck-skip"));
  const removed = applyDeckSource(unskipped, {
    type: "remove",
    indices: [1, 3],
  });
  assert.ok(removed.includes('["One note","Four note","Three note"]'));
  assert.throws(
    () => applyDeckSource(html, { type: "remove", indices: [0, 1, 2, 3] }),
    /At least one/,
  );
  assert.throws(
    () =>
      applyDeckSource(html, {
        type: "duplicate",
        index: 0,
        ids: { one: "two" },
      }),
    /already in use/,
  );
  assert.throws(
    () =>
      applyDeckSource(html, {
        type: "duplicate",
        index: 0,
        storageKeys: { foreign: "image-copy" },
      }),
    /does not belong/,
  );
  assert.throws(
    () => applyDeckSource(html, { type: "skip", index: 0, value: "false" }),
    /boolean/,
  );
  const unusual = source(
    '<section id="constructor"><image-slot storage-key="__proto__"></image-slot></section><section>Other</section>',
  );
  const copy = applyDeckSource(unusual, { type: "duplicate", index: 0 });
  assert.equal((copy.match(/id="constructor"/g) ?? []).length, 1);
  assert.equal((copy.match(/storage-key="__proto__"/g) ?? []).length, 2);
});
test("styled lazy thumbnails remain inert, show base content, reuse identity and follow live theme/content changes", async (t) => {
  const custom =
    '<script>window.mounts=0;customElements.define("counter-card",class extends HTMLElement{connectedCallback(){window.mounts++;if(!this.shadowRoot){this.attachShadow({mode:"open"}).innerHTML="<style>:host{display:block;background:gold}</style><b>Shadow content</b><button>Shadow action</button>"}}});</script>';
  const slides =
    '<section data-label="One"><h2>One</h2><p data-anim="fade-in" data-anim-trigger="click">Finished preview</p><counter-card></counter-card><canvas width="50" height="30"></canvas><iframe src="about:blank"></iframe></section>' +
    Array.from(
      { length: 40 },
      (_, index) =>
        `<section data-label="Slide ${index + 2}"><h2>Slide ${index + 2}</h2></section>`,
    ).join("");
  const { url } = await fixture(
    t,
    source(
      slides,
      custom,
      '<script>document.querySelector("canvas").getContext("2d").fillRect(0,0,50,30)</script>',
    ),
  );
  await withPage(url, async (page) => {
    await ready(page);
    await page.waitForFunction(
      () =>
        document
          .querySelector("deck-stage")
          .editor.thumbnails.entries.values()
          .next().value.host,
    );
    const initial = await page.evaluate(() => {
      const deck = document.querySelector("deck-stage"),
        entries = [...deck.editor.thumbnails.entries.values()],
        entry = entries[0];
      window.thumbIdentity = entry.thumb;
      return {
        mounts: window.mounts,
        materialized: entries.filter((item) => item.host).length,
        count: entries.length,
        background: getComputedStyle(entry.clone).backgroundColor,
        opacity: getComputedStyle(entry.clone.querySelector("p")).opacity,
        hidden: deck.slides[0]
          .querySelector("p")
          .hasAttribute("data-deck-anim-hidden"),
        shadow: entry.clone.querySelector(
          '[data-deck-static-tag="counter-card"]',
        ).shadowRoot.textContent,
        iframe: entry.clone.querySelector("iframe").hasAttribute("src"),
        canvas: entry.clone
          .querySelector("img")
          .src.startsWith("data:image/png"),
        handlers: entry.clone.querySelectorAll("[onclick]").length,
      };
    });
    assert.equal(initial.mounts, 1);
    assert.ok(initial.materialized > 0 && initial.materialized < initial.count);
    assert.equal(initial.background, "rgb(195, 72, 38)");
    assert.equal(initial.opacity, "1");
    assert.equal(initial.hidden, true);
    assert.match(initial.shadow, /Shadow content/);
    assert.equal(initial.iframe, false);
    assert.equal(initial.canvas, true);
    assert.equal(initial.handlers, 0);
    await page.evaluate(() => {
      document.body.dataset.voice = "cool";
      document.querySelector("deck-stage>section h2").textContent =
        "Updated title";
      document
        .querySelector("counter-card")
        .shadowRoot.querySelector("b").textContent = "Updated shadow";
    });
    await page.waitForFunction(() => {
      const deck = document.querySelector("deck-stage"),
        entry = deck.editor.thumbnails.entries.get(deck.slides[0]);
      return (
        getComputedStyle(entry.clone).backgroundColor === "rgb(17, 130, 155)" &&
        entry.clone.querySelector("h2").textContent === "Updated title" &&
        entry.clone
          .querySelector('[data-deck-static-tag="counter-card"]')
          .shadowRoot.querySelector("b").textContent === "Updated shadow"
      );
    });
    await page.evaluate(() =>
      document
        .querySelector("deck-stage")
        .editor.run({ type: "move", from: 0, to: 3 }),
    );
    assert.equal(
      await page.evaluate(
        () =>
          document
            .querySelector("deck-stage")
            .editor.thumbnails.entries.get(
              document.querySelector("deck-stage").slides[3],
            ).thumb === window.thumbIdentity,
      ),
      true,
    );
    assert.equal(await page.evaluate(() => window.mounts), 2); // Moving the live component reconnects it once; previews never mount it.
    await page
      .locator("deck-stage")
      .locator(".rail")
      .evaluate((rail) => {
        rail.scrollTop = rail.scrollHeight;
      });
    await page.waitForFunction(() => {
      const deck = document.querySelector("deck-stage");
      return deck.editor.thumbnails.entries.get(deck.slides.at(-1)).host;
    });
  });
});
test("rail selection, context actions, confirmation, undo, resize and keyboard focus preserve live slides", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    const rail = page.locator("deck-stage").locator(".rail"),
      options = rail.getByRole("option");
    await options.nth(0).click();
    await options.nth(2).click({ modifiers: ["Shift"] });
    assert.equal(await rail.locator("[data-selected]").count(), 3);
    assert.equal(
      await page.evaluate(() => document.querySelector("deck-stage").index),
      0,
    );
    await options.nth(1).click({ modifiers: ["Control"] });
    assert.equal(await rail.locator("[data-selected]").count(), 2);
    await options.nth(2).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete 2 slides" }).click();
    assert.equal(await page.getByRole("dialog").isVisible(), true);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel" })
      .click();
    assert.equal((await labels(page)).length, 4);
    await options.nth(2).press("Delete");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await idle(page);
    assert.deepEqual(await labels(page), ["Two", "Four"]);
    assert.equal(
      await options
        .nth(0)
        .evaluate((node) => node.getRootNode().activeElement === node),
      true,
    );
    await options.nth(0).press("Control+z");
    await idle(page);
    assert.deepEqual(await labels(page), ["One", "Two", "Three", "Four"]);
    await options.nth(1).click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "Skip slide", exact: true })
      .click();
    await idle(page);
    assert.equal(await options.nth(1).locator(".num").textContent(), "");
    assert.equal(await options.nth(2).locator(".num").textContent(), "2");
    await options.nth(2).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move up" }).click();
    await idle(page);
    assert.deepEqual(await labels(page), ["One", "Three", "Two", "Four"]);
    await options.nth(1).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Duplicate slide" }).click();
    await idle(page);
    assert.deepEqual(await labels(page), [
      "One",
      "Three",
      "Three",
      "Two",
      "Four",
    ]);
    assert.equal(
      await page.evaluate(
        () => document.querySelector("deck-stage").slides[2].id,
      ),
      "",
    );
    assert.equal(
      await page.evaluate(() => document.querySelector("deck-stage").index),
      2,
    );
    await options.nth(2).press("ArrowDown");
    assert.equal(
      await options
        .nth(3)
        .evaluate((node) => node.getRootNode().activeElement === node),
      true,
    );
    await options.nth(3).press("ArrowUp");
    await options.nth(0).click();
    await options.nth(4).click({ modifiers: ["Shift"] });
    await options.nth(4).press("Delete");
    assert.equal(await page.getByRole("dialog").isVisible(), false);
    assert.match(
      await page
        .getByRole("status", { name: "Deck editor status" })
        .textContent(),
      /At least one/,
    );
    await page.keyboard.press("Escape");
    assert.equal(await rail.locator("[data-selected]").count(), 0);
    const handle = page.getByRole("separator", { name: "Resize slide rail" }),
      bounds = await handle.boundingBox();
    await page.mouse.move(bounds.x + 3, bounds.y + 50);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 95, bounds.y + 50);
    await page.mouse.up();
    const width = await page.evaluate(
      () => document.querySelector("deck-stage").editor.railWidth,
    );
    assert.ok(width > 250);
    await page.reload();
    await ready(page);
    assert.equal(
      await page.evaluate(
        () => document.querySelector("deck-stage").editor.railWidth,
      ),
      width,
    );
    await page.getByRole("button", { name: "Toggle slide rail" }).click();
    assert.equal(await rail.isVisible(), false);
    await page.reload();
    await ready(page);
    assert.equal(await rail.isVisible(), false);
  });
});
test("real HTML writes persist structural edits and reject stale, foreign and concurrent requests", async (t) => {
  const { dir, url, origin } = await fixture(t, source(), true),
    file = path.join(dir, "deck.html");
  await withPage(url, async (page, errors) => {
    await ready(page);
    await page.waitForFunction(
      () => document.querySelector("deck-stage").editor.source,
    );
    await page.locator("deck-stage > section input").fill("Live typed value");
    await page.evaluate(() =>
      document
        .querySelector("deck-stage")
        .editor.run({ type: "move", from: 0, to: 3 }),
    );
    assert.deepEqual(await labels(page), ["Two", "Three", "Four", "One"]);
    assert.equal(
      await page.locator("deck-stage > section input").inputValue(),
      "Live typed value",
    );
    const saved = await fs.readFile(file, "utf8");
    assert.ok(saved.indexOf('id="four"') < saved.indexOf('id="one"'));
    assert.ok(!saved.includes("data-deck-active"));
    assert.ok(
      saved.includes('["Two note","Three note","Four note","One note"]'),
    );
    await page.reload();
    await ready(page);
    assert.deepEqual(await labels(page), ["Two", "Three", "Four", "One"]);
    await page.evaluate(() =>
      document.querySelector("deck-stage").editor.undo(),
    );
    await page.waitForFunction(
      () =>
        document.querySelector("deck-stage")?.ready &&
        document.querySelector("deck-stage").slides[0].dataset.label === "One",
    );
    assert.equal(await fs.readFile(file, "utf8"), source());
    await page.evaluate(() =>
      document.querySelector("deck-stage").editor.duplicate(0),
    );
    assert.deepEqual(await labels(page), [
      "One",
      "One",
      "Two",
      "Three",
      "Four",
    ]);
    await page.evaluate(() =>
      document
        .querySelector("deck-stage")
        .editor.run({ type: "skip", index: 1, value: true }),
    );
    await page.reload();
    await ready(page);
    // Establish the saved version before introducing an external edit.
    await page.evaluate(
      () => document.querySelector("deck-stage").editor.sourceReady,
    );
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector("deck-stage")
          .slides[1].hasAttribute("data-deck-skip"),
      ),
      true,
    );
    await fs.appendFile(file, "\n<!-- external edit -->");
    const before = await labels(page);
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector("deck-stage")
          .editor.run({ type: "remove", indices: [1] }),
      ),
      false,
    );
    assert.deepEqual(await labels(page), before);
    assert.match(
      await page
        .getByRole("status", { name: "Deck editor status" })
        .textContent(),
      /source changed/,
    );
    await page.waitForTimeout(50);
    assert.ok(
      errors.some((error) => error === `HTTP 409: ${origin}/__codex_deck`),
    );
    for (let index = errors.length - 1; index >= 0; index--)
      if (
        errors[index] === `HTTP 409: ${origin}/__codex_deck` ||
        errors[index] ===
          "Failed to load resource: the server responded with a status of 409 (Conflict)"
      )
        errors.splice(index, 1);
  });
  const metadata = await (await fetch(origin + "/__codex_deck")).json();
  const post = (value, requestOrigin = origin, token = metadata.token) =>
    fetch(origin + "/__codex_deck", {
      method: "POST",
      headers: {
        Origin: requestOrigin,
        "Content-Type": "application/json",
        "X-Codex-Deck-Token": token,
      },
      body: JSON.stringify(value),
    });
  const value = {
    version: metadata.version,
    count: metadata.count,
    operation: { type: "skip", index: 0, value: true },
  };
  assert.equal((await post(value, "https://foreign.example")).status, 403);
  assert.equal((await post(value, origin, "bad-token")).status, 403);
  assert.equal(
    (await post({ ...value, count: metadata.count + 1 })).status,
    409,
  );
  assert.equal(
    (
      await post({
        ...value,
        operation: { type: "remove", indices: [0, 1, 2, 3, 4] },
      })
    ).status,
    400,
  );
  const outcomes = await Promise.all([post(value), post(value)]);
  assert.deepEqual(
    outcomes.map((response) => response.status).sort(),
    [200, 409],
  );
});
test("native thumbnail drag moves one slide, collapses selection and retains the active live node", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    const options = page
      .locator("deck-stage")
      .locator(".rail")
      .getByRole("option");
    await options.nth(0).click();
    await options.nth(2).click({ modifiers: ["Shift"] });
    await page.evaluate(() => {
      window.activeBeforeDrag = document.querySelector("deck-stage").slides[0];
    });
    const target = await options.nth(3).boundingBox();
    await options.nth(0).dragTo(options.nth(3), {
      targetPosition: { x: 45, y: target.height - 6 },
    });
    await idle(page);
    assert.deepEqual(await labels(page), ["Two", "Three", "Four", "One"]);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector("deck-stage").activeSlide ===
          window.activeBeforeDrag,
      ),
      true,
    );
    assert.equal(
      await page.locator("deck-stage").locator(".rail [data-selected]").count(),
      0,
    );
    assert.equal(
      await page
        .locator("deck-stage")
        .locator("[data-dragging],[data-drop]")
        .count(),
      0,
    );
  });
});
test("duplicate image slots preserve saved content under independent keys and updates refuse streamed edits", async (t) => {
  const body =
    '<section data-label="Image"><h2>Image</h2><image-slot id="hero" storage-key="hero" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%222%22 height=%222%22/%3E"></image-slot></section><section data-label="Other"><h2>Other</h2></section>';
  const { dir, url } = await fixture(
    t,
    source(body, '<script src="starters/image-slot.js"></script>'),
    true,
  );
  await withPage(url, async (page) => {
    await ready(page);
    await page
      .locator("deck-stage > section image-slot")
      .getByRole("textbox", { name: "Alt text" })
      .fill("Saved image description");
    const original = await fs.readFile(path.join(dir, "deck.html"), "utf8");
    await page.evaluate(() =>
      document.querySelector("deck-stage").dispatchEvent(
        new CustomEvent("codex-deck-updating", {
          detail: { updating: true },
        }),
      ),
    );
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector("deck-stage")
          .editor.run({ type: "remove", indices: [0] }),
      ),
      false,
    );
    assert.equal(
      await fs.readFile(path.join(dir, "deck.html"), "utf8"),
      original,
    );
    await page.evaluate(() =>
      document.querySelector("deck-stage").dispatchEvent(
        new CustomEvent("codex-deck-updating", {
          detail: { updating: false },
        }),
      ),
    );
    await page.evaluate(() =>
      document.querySelector("deck-stage").editor.duplicate(0),
    );
    const slots = page.locator("deck-stage > section image-slot");
    const key = await slots.nth(1).getAttribute("storage-key");
    assert.notEqual(key, "hero");
    assert.equal(
      await slots
        .nth(1)
        .getByRole("textbox", { name: "Alt text" })
        .inputValue(),
      "Saved image description",
    );
    await slots
      .nth(1)
      .getByRole("textbox", { name: "Alt text" })
      .fill("Independent copy");
    await page.reload();
    await ready(page);
    assert.equal(
      await slots.nth(0).locator("input[data-alt]").inputValue(),
      "Saved image description",
    );
    assert.equal(
      await slots.nth(1).locator("input[data-alt]").inputValue(),
      "Independent copy",
    );
    assert.equal(await slots.nth(1).getAttribute("storage-key"), key);
  });
});
