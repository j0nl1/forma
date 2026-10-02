import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary } from "./helpers.mjs";
import { serve } from "../skills/studio-design/scripts/preview.mjs";
import { withPage } from "../skills/studio-design/scripts/lib/browser.mjs";
import { slideLabel } from "../skills/studio-design/assets/starters/deck-labels.js";

const longTitle = "A deliberately long heading describing quarterly growth";
const names = [
  "Revenue",
  "Audience",
  "Conversion",
  "Budget",
  "Slide",
  longTitle.slice(0, 40),
  "09",
];
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><style>body{margin:0}section{background:white;color:#152f37;padding:40px;font:32px Arial}</style><deck-stage width="800" height="500"><section id="chart" data-screen-label="09 Revenue"><div>Quarterly chart</div></section><section id="audience" data-label=""><h2>Audience</h2></section><section id="conversion"><div data-title>Conversion</div></section><section id="explicit" data-label="Budget" data-screen-label="11 Ignored"><h2>Costs</h2></section><section id="empty"><h2> </h2></section><section id="long"><h2> ${longTitle} </h2></section><section id="number" data-screen-label="09"><div>Number-only title</div></section></deck-stage><script src="starters/deck.js"></script></html>`;
async function fixture(t, connected = false) {
  const dir = await temporary(t);
  await fs.cp(
    path.resolve("skills/studio-design/assets/starters"),
    path.join(dir, "starters"),
    { recursive: true },
  );
  const file = path.join(dir, "deck.html");
  await fs.writeFile(file, html);
  const { server, url } = await serve(
    dir,
    0,
    connected ? { deckFile: "deck.html" } : {},
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { file, url: url + "deck.html" };
}
const ready = (page, connected = false) =>
  page.waitForFunction((connected) => {
    const deck = document.querySelector("deck-stage");
    return deck?.ready && (!connected || deck.editor.source);
  }, connected);
const snapshot = (page) =>
  page.locator("deck-stage").evaluate((deck) => ({
    screens: deck.slides.map((slide) => slide.dataset.screenLabel),
    rail: [...deck.shadowRoot.querySelectorAll(".thumb")].map((thumb) =>
      thumb.getAttribute("aria-label"),
    ),
  }));
const expected = (titles, skipped = -1) => {
  let visible = 0;
  return {
    screens: titles.map(
      (title, i) => `${String(i + 1).padStart(2, "0")} ${title}`,
    ),
    rail: titles.map(
      (title, i) =>
        `${i === skipped ? "Skipped slide" : "Slide " + ++visible}: ${title}`,
    ),
  };
};
const edit = (page, operation) =>
  page
    .locator("deck-stage")
    .evaluate((deck, operation) => deck.editor.run(operation), operation);

test("slide names retain exact authored precedence and empty/number-only fallback without mutating input", () => {
  const cases = [
    [
      { "data-label": "  Author name  ", "data-screen-label": "07 Old" },
      "Heading",
      "  Author name  ",
    ],
    [
      { "data-label": "", "data-screen-label": "  009   Graph name  " },
      "Heading",
      "Graph name",
    ],
    [{ "data-label": "" }, "  Audience  ", "Audience"],
    [{ "data-screen-label": "09" }, "Heading", "09"],
    [{}, "   ", "Slide"],
    [{}, undefined, "Slide"],
    [{}, longTitle, longTitle.slice(0, 40)],
  ];
  for (const [attributes, textContent, result] of cases) {
    const before = structuredClone(attributes);
    const slide = {
      getAttribute: (name) => attributes[name] ?? null,
      querySelector: () => (textContent === undefined ? null : { textContent }),
    };
    assert.equal(slideLabel(slide), result);
    assert.deepEqual(attributes, before);
  }
});

test("static deck keeps one screen/accessible name through moves, skip, duplicate and undo; recollection retains prior headings", async (t) => {
  const { file, url } = await fixture(t);
  await withPage(url, async (page, errors) => {
    await ready(page);
    assert.deepEqual(await snapshot(page), expected(names));
    await page.locator("#audience h2").evaluate((heading) => {
      heading.textContent = "Changed heading";
    });
    await page.locator("deck-stage").evaluate((deck) => deck.collect());
    assert.deepEqual(
      await snapshot(page),
      expected(names),
      "prior screen name takes precedence over changed heading",
    );
    await edit(page, { type: "move", from: 0, to: 2 });
    const moved = ["Audience", "Conversion", "Revenue", ...names.slice(3)];
    assert.deepEqual(await snapshot(page), expected(moved));
    await edit(page, { type: "skip", index: 2, value: true });
    assert.deepEqual(await snapshot(page), expected(moved, 2));
    await page
      .locator("deck-stage")
      .evaluate((deck) => deck.editor.duplicate(2));
    const duplicated = [...moved.slice(0, 3), "Revenue", ...moved.slice(3)];
    const doubleSkip = expected(duplicated, 2);
    doubleSkip.rail[3] = "Skipped slide: Revenue";
    for (let i = 4; i < duplicated.length; i++)
      doubleSkip.rail[i] = `Slide ${i - 1}: ${duplicated[i]}`;
    assert.deepEqual(await snapshot(page), doubleSkip);
    await page.locator("deck-stage").evaluate((deck) => deck.editor.undo());
    assert.deepEqual(await snapshot(page), expected(moved, 2));
    await page.locator("deck-stage").evaluate((deck) => deck.editor.undo());
    assert.deepEqual(await snapshot(page), expected(moved));
    await page.locator("deck-stage").evaluate((deck) => deck.editor.undo());
    assert.deepEqual(await snapshot(page), expected(names));
    assert.deepEqual(errors, []);
  });
  assert.equal(await fs.readFile(file, "utf8"), html);
});

test("source editing preserves authored graphical names across duplicate, move, skip, reload and persisted undo", async (t) => {
  const { file, url } = await fixture(t, true);
  await withPage(url, async (page, errors) => {
    await ready(page, true);
    assert.deepEqual(await snapshot(page), expected(names));
    await page
      .locator("deck-stage")
      .evaluate((deck) => deck.editor.duplicate(0));
    let titles = ["Revenue", ...names];
    assert.deepEqual(await snapshot(page), expected(titles));
    let saved = await fs.readFile(file, "utf8");
    assert.equal(
      (saved.match(/data-screen-label="09 Revenue"/g) ?? []).length,
      2,
    );
    assert.ok(
      !saved.includes('data-screen-label="01 Revenue"'),
      "runtime numbering does not overwrite authored source labels",
    );
    await edit(page, { type: "move", from: 0, to: 3 });
    titles = [
      "Revenue",
      "Audience",
      "Conversion",
      "Revenue",
      ...names.slice(3),
    ];
    await edit(page, { type: "skip", index: 3, value: true });
    assert.deepEqual(await snapshot(page), expected(titles, 3));
    await page.reload();
    await ready(page, true);
    assert.deepEqual(await snapshot(page), expected(titles, 3));
    await page.locator("deck-stage").evaluate((deck) => deck.editor.undo());
    await ready(page, true);
    assert.deepEqual(await snapshot(page), expected(titles));
    saved = await fs.readFile(file, "utf8");
    assert.ok(saved.includes('data-screen-label="09 Revenue"'));
    assert.ok(!saved.includes("data-deck-skip"));
    const artifact = path.join(path.dirname(file), "screenshots");
    await fs.mkdir(artifact, { recursive: true });
    await page.screenshot({
      path: path.join(artifact, "persisted-labels.png"),
    });
    await fs.writeFile(
      path.join(artifact, "persisted-labels.json"),
      JSON.stringify(await snapshot(page), null, 2),
    );
    assert.deepEqual(errors, []);
  });
});
