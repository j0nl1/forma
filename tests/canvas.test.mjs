import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  reconcileCanvas,
  navigateFocus,
  validateCanvasState,
} from "../skills/codex-design/assets/starters/canvas-model.js";
import { serve } from "../skills/codex-design/scripts/preview.mjs";
import { withPage } from "../skills/codex-design/scripts/lib/browser.mjs";
import { bundle } from "../skills/codex-design/scripts/build.mjs";
const starters = path.resolve("skills/codex-design/assets/starters");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{margin:0}design-canvas{height:100vh}article{padding:20px;background:#e6eed9;font:20px Georgia;height:180px;box-sizing:border-box}</style></head><body><design-canvas id="study"><design-section id="reading" title="Reading" subtitle="Compare reading density"><design-board id="a" label="Calm" width="240" height="180"><article>One clear collection<button onclick="this.textContent='Opened'">Open</button></article></design-board><design-board id="b" label="Dense" width="240" height="180"><article>Everything within reach</article></design-board><design-note top="-10" left="540" rotate="4" width="160">Keep the collection easy to scan.</design-note></design-section><design-section id="empty" title="Empty"></design-section><design-section id="writing" title="Writing"><design-board id="a" label="Draft" width="240" height="180"><article>A space to write.</article></design-board></design-section></design-canvas><script src="starters/canvas.js"></script></body></html>`;
async function fixture(t, source = html, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-canvas-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.cp(starters, path.join(dir, "starters"), { recursive: true });
  await fs.writeFile(path.join(dir, "canvas.html"), source);
  const { server, url } = await serve(dir, 0, options);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url: url + "canvas.html", origin: url.slice(0, -1) };
}
const ready = (page) =>
  page.waitForFunction(() => document.querySelector("design-canvas")?.ready);
test("canvas source identities scope labels, order and hides while focus wraps visible sections", () => {
  const source = [
    {
      id: "one",
      title: "One",
      boards: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    },
    { id: "empty", title: "Empty", boards: [] },
    { id: "two", title: "Two", boards: [{ id: "a", label: "Other A" }] },
  ];
  const legacy = validateCanvasState({
    sections: {
      one: { title: "Imported title", labels: { a: "Imported label" } },
    },
  });
  assert.equal(
    reconcileCanvas(source, legacy).sections.one.labels.a,
    "Imported label",
  );
  assert.throws(
    () => validateCanvasState({ sections: { one: { hidden: "invalid" } } }),
    /fields/,
  );
  let state = reconcileCanvas(source);
  Object.assign(state.sections.one, {
    title: "Custom",
    labels: { a: "Renamed" },
    order: ["b", "a"],
    hidden: ["b"],
  });
  assert.deepEqual(
    navigateFocus(source, state, { section: "one", board: "a" }, "section", 1),
    { section: "two", board: "a" },
  );
  assert.deepEqual(
    navigateFocus(source, state, { section: "one", board: "a" }, "board", 1),
    { section: "one", board: "a" },
  );
  state = reconcileCanvas(source, state);
  assert.deepEqual(state.sections.one.hidden, ["b"]);
  const changed = structuredClone(source);
  changed[0].boards.push({ id: "c", label: "C" });
  changed[2].title = "Updated source title";
  const updated = reconcileCanvas(changed, state);
  assert.deepEqual(updated.sections.one.hidden, []);
  assert.deepEqual(updated.sections.one.order, ["b", "a", "c"]);
  assert.equal(updated.sections.one.labels.a, "Renamed");
  assert.equal(updated.sections.two.labels.a, undefined);
  assert.equal(updated.sections.two.title, undefined);
  assert.throws(
    () =>
      reconcileCanvas([
        { id: "one", title: "One", boards: [{ id: "a" }, { id: "a" }] },
      ]),
    /unique/,
  );
});
test("canvas sections, notes, live focus navigation and browser persistence survive reload and source changes", async (t) => {
  const { dir, url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    assert.equal(
      await page
        .locator("design-canvas")
        .getByRole("status", { name: "Canvas status" })
        .textContent(),
      "Browser persistence enabled",
    );
    assert.equal(
      await page
        .locator("design-note")
        .evaluate((note) => getComputedStyle(note).width),
      "160px",
    );
    await page
      .locator("#reading")
      .getByRole("textbox", { name: "Section title" })
      .fill("Reading directions");
    await page
      .locator("#reading")
      .getByRole("textbox", { name: "Section title" })
      .press("Enter");
    await page
      .locator("#reading > #a")
      .getByRole("textbox", { name: "Artboard name" })
      .fill("Quiet collection");
    await page
      .locator("#reading > #a")
      .getByRole("button", { name: "Move right" })
      .click();
    await page
      .locator("#reading > #b")
      .getByRole("button", { name: "Remove artboard" })
      .click();
    await page.reload();
    await ready(page);
    assert.equal(await page.locator("#reading > design-board").count(), 1);
    assert.equal(
      await page
        .locator("#reading")
        .getByRole("textbox", { name: "Section title" })
        .inputValue(),
      "Reading directions",
    );
    assert.equal(
      await page.locator("#reading > #a").getAttribute("label"),
      "Quiet collection",
    );
    const buttonBackground = await page
      .locator("#reading > #a")
      .getByRole("button", { name: "Open", exact: true })
      .evaluate((button) => getComputedStyle(button).backgroundColor);
    const identity = await page.locator("#reading > #a").evaluate((board) => {
      board.testIdentity = 91;
      return board.testIdentity;
    });
    await page
      .locator("#reading > #a")
      .getByRole("button", { name: "Focus", exact: true })
      .click();
    assert.equal(await page.getByRole("dialog").count(), 1);
    assert.equal(
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Open", exact: true })
        .evaluate((button) => getComputedStyle(button).backgroundColor),
      buttonBackground,
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Open", exact: true })
      .click();
    await page.keyboard.press("ArrowDown");
    assert.match(await page.locator(".focus-label").textContent(), /Draft/);
    assert.equal(
      await page
        .getByRole("combobox", { name: "Focus section" })
        .locator("option")
        .count(),
      2,
    );
    await page.keyboard.press("ArrowDown");
    assert.match(
      await page.locator(".focus-label").textContent(),
      /Quiet collection/,
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .locator("#reading > #a")
        .evaluate((board) => board.testIdentity),
      identity,
    );
    assert.equal(
      await page
        .locator("#reading > #a")
        .getByRole("button", { name: "Opened", exact: true })
        .count(),
      1,
    );
    await fs.writeFile(
      path.join(dir, "canvas.html"),
      html.replace(
        "<design-note",
        '<design-board id="c" label="New direction" width="240" height="180"><article>New source content</article></design-board><design-note',
      ),
    );
    await page.reload();
    await ready(page);
    assert.equal(await page.locator("#reading > design-board").count(), 3);
    assert.deepEqual(
      await page
        .locator("#reading > design-board")
        .evaluateAll((boards) => boards.map((b) => b.id)),
      ["b", "a", "c"],
    );
    assert.equal(await page.getByRole("dialog").count(), 0);
  });
});
test("wheel burst latching, modifier pinch and scaled grip reorder preserve expected coordinates", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    const wheel = async (values) =>
      page.locator("design-canvas").evaluate((canvas, values) => {
        const view = canvas.shadowRoot.querySelector(".viewport");
        for (const data of values)
          view.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              clientX: 300,
              clientY: 280,
              ...data,
            }),
          );
        return canvas.viewport.value;
      }, values);
    let tf = await wheel(Array.from({ length: 10 }, () => ({ deltaY: -100 })));
    assert.ok(Math.abs(tf.scale - 1.1 ** 10) < 0.000001);
    await page.waitForTimeout(210);
    await page
      .locator("design-canvas")
      .evaluate((canvas) => canvas.viewport.set({ x: 0, y: 0, scale: 1 }));
    tf = await wheel([{ deltaY: 2.2, deltaX: 1.1 }, { deltaY: 100 }]);
    assert.equal(tf.scale, 1);
    assert.ok(tf.y < -100);
    tf = await wheel([{ deltaY: -20.5, ctrlKey: true }]);
    assert.ok(tf.scale > 1.2 && tf.scale < 1.3);
    await page
      .locator("design-canvas")
      .evaluate((canvas) => canvas.viewport.set({ x: 0, y: 0, scale: 0.6 }));
    const a = await page
      .locator("#reading > #a")
      .getByRole("button", { name: "Drag artboard" })
      .boundingBox();
    const b = await page
      .locator("#reading > #b")
      .getByRole("button", { name: "Drag artboard" })
      .boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(220);
    assert.deepEqual(
      await page
        .locator("#reading > design-board")
        .evaluateAll((boards) => boards.map((b) => b.id)),
      ["b", "a"],
    );
  });
});
test("opted-in canvas saves a versioned sidecar and rejects stale, foreign and redirected writes", async (t) => {
  const { dir, url, origin } = await fixture(t, html, {
    canvasFile: "canvas.html",
  });
  const endpoint = origin + "/__codex_canvas";
  const initial = await (await fetch(endpoint)).json();
  assert.equal(
    await fs
      .stat(path.join(dir, "canvas.design-canvas.state.json"))
      .catch(() => null),
    null,
  );
  await withPage(url, async (page) => {
    await ready(page);
    await page
      .locator("#reading > #a")
      .getByRole("textbox", { name: "Artboard name" })
      .fill("Saved to source");
    await page.waitForFunction(
      () =>
        document.querySelector("design-canvas").version !== undefined &&
        document
          .querySelector("design-canvas")
          .shadowRoot.querySelector('[role="status"]').textContent ===
          "Canvas state saved to the project",
    );
    await page.waitForTimeout(350);
    const saved = JSON.parse(
      await fs.readFile(
        path.join(dir, "canvas.design-canvas.state.json"),
        "utf8",
      ),
    );
    assert.equal(saved.sections.reading.labels.a, "Saved to source");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ready(page);
    assert.equal(
      await page.locator("#reading > #a").getAttribute("label"),
      "Saved to source",
    );
  });
  const write = (data, source = origin) =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        Origin: source,
        "Content-Type": "application/json",
        "X-Codex-Canvas-Token": initial.token,
      },
      body: JSON.stringify(data),
    });
  assert.equal(
    (await write({ version: initial.version, state: initial.state })).status,
    409,
  );
  const current = await (await fetch(endpoint)).json();
  assert.equal(
    (
      await write(
        { version: current.version, state: current.state },
        "https://foreign.example",
      )
    ).status,
    403,
  );
  await fs.appendFile(
    path.join(dir, "canvas.html"),
    "\n<!-- Source revision -->",
  );
  assert.equal(
    (await write({ version: current.version, state: current.state })).status,
    409,
  );
  const outside = path.join(os.tmpdir(), `canvas-outside-${Date.now()}.json`);
  t.after(() => fs.rm(outside, { force: true }));
  await fs.writeFile(outside, "unchanged");
  await fs.rm(path.join(dir, "canvas.design-canvas.state.json"));
  await fs.symlink(outside, path.join(dir, "canvas.design-canvas.state.json"));
  assert.equal(
    (await write({ version: current.version, state: current.state })).status,
    400,
  );
  assert.equal(await fs.readFile(outside, "utf8"), "unchanged");
});
test("artboard PNG and portable HTML exports use natural size independently of viewport zoom", async (t) => {
  const { dir, url } = await fixture(
    t,
    html.replace(
      "One clear collection",
      '<img src="tile.svg" width="30" height="30" alt="A local tile">One clear collection',
    ),
  );
  await fs.writeFile(
    path.join(dir, "tile.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="#ff8040"/></svg>',
  );
  await withPage(url, async (page) => {
    await ready(page);
    await page
      .locator("design-canvas")
      .evaluate((canvas) => canvas.viewport.set({ x: 0, y: 0, scale: 0.8 }));
    const board = page.locator("#reading > #a");
    await board.getByLabel("Artboard actions").click();
    const downloadPNG = page.waitForEvent("download");
    await board.getByRole("button", { name: "Download PNG" }).click();
    const png = await downloadPNG;
    const pngPath = await png.path();
    const bytes = await fs.readFile(pngPath);
    assert.equal(bytes.readUInt32BE(16), 720);
    assert.equal(bytes.readUInt32BE(20), 540);
    const pixels = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = "data:image/png;base64," + source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return {
        background: [...ctx.getImageData(10, 10, 1, 1).data],
        tile: [...ctx.getImageData(75, 75, 1, 1).data],
      };
    }, bytes.toString("base64"));
    assert.deepEqual(pixels.background, [230, 238, 217, 255]);
    assert.deepEqual(pixels.tile, [255, 128, 64, 255]);
    await board.getByLabel("Artboard actions").click();
    const downloadHTML = page.waitForEvent("download");
    await board.getByRole("button", { name: "Download HTML" }).click();
    const exported = await downloadHTML;
    await exported.saveAs(path.join(dir, "exported.html"));
    const standalone = await fs.readFile(
      path.join(dir, "exported.html"),
      "utf8",
    );
    assert.ok(standalone.includes("One clear collection"));
    assert.ok(standalone.includes("onclick="));
    assert.ok(standalone.includes("data:image/svg+xml"));
    assert.ok(!standalone.includes("<script"));
    await page.goto(url.replace("canvas.html", "exported.html"));
    await page.getByRole("button", { name: "Open", exact: true }).click();
    assert.equal(
      await page.getByRole("button", { name: "Opened", exact: true }).count(),
      1,
    );
    assert.equal(
      await page.locator("body > div").evaluate((card) => card.offsetWidth),
      240,
    );
    assert.equal(
      await page.locator("body > div").evaluate((card) => card.offsetHeight),
      180,
    );
  });
});
test("React canvas preserves authoring APIs, focus portals and dynamic source reconciliation without DOM ownership errors", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-canvas-react-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const entry = path.join(dir, "main.jsx");
  await fs.writeFile(
    entry,
    `import React,{useState} from '${path.resolve("node_modules/react/index.js")}';import{createRoot}from'${path.resolve("node_modules/react-dom/client.js")}';import{DesignCanvas,DCSection,DCArtboard,DCPostIt}from'${starters}/canvas-components.jsx';function Counter(){const[n,set]=useState(0);return <button onClick={()=>set(n+1)}>Count {n}</button>}function App(){const[extra,set]=useState(false);return <><button id="add" onClick={()=>set(true)}>Add source board</button><DesignCanvas id="react"><><DCSection id="section" title="React options"><DCArtboard id="a" label="Counter" width={240} height={180}><Counter/></DCArtboard><DCArtboard id="b" label="Text" width={240} height={180}><p>Text direction</p></DCArtboard>{extra&&<DCArtboard id="c" label="New" width={240} height={180}><p>New source direction</p></DCArtboard>}<DCPostIt top={-10} left={530}>A source note</DCPostIt></DCSection></></DesignCanvas></>}createRoot(document.getElementById('root')).render(<App/>);`,
  );
  await bundle(entry, path.join(dir, "bundle.js"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div><script src="bundle.js"></script></body></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url, async (page) => {
    await ready(page);
    const boards = page.locator("design-board");
    await boards.first().getByRole("button", { name: "Count 0" }).click();
    await boards.first().getByRole("button", { name: "Move right" }).click();
    await boards.last().getByRole("button", { name: "Count 1" }).waitFor();
    assert.equal(
      await boards.last().getByRole("button", { name: "Count 1" }).count(),
      1,
    );
    await boards
      .last()
      .getByRole("button", { name: "Focus", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Count 0" })
      .click();
    await page.keyboard.press("ArrowRight");
    assert.match(await page.locator(".focus-label").textContent(), /Text/);
    await page.keyboard.press("Escape");
    await boards
      .first()
      .getByRole("button", { name: "Remove artboard" })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll("design-board").length === 1,
    );
    assert.equal(await boards.count(), 1);
    await page.locator("#add").click();
    await page.waitForFunction(
      () => document.querySelectorAll("design-board").length === 3,
    );
    assert.equal(await boards.count(), 3);
    assert.equal(await page.locator("design-note").count(), 1);
    await page.reload();
    await ready(page);
    assert.equal(await page.getByRole("dialog").count(), 0);
  });
});

test("canvas recovery, storage failure, wheel passthrough and cancelled drag leave usable controls", async (t) => {
  const { url } = await fixture(
    t,
    html.replace(
      "Everything within reach",
      "<deck-stage><section>Deck content</section></deck-stage>",
    ),
  );
  await withPage(url, async (page) => {
    await ready(page);
    const passes = await page.locator("deck-stage").evaluate((deck) => {
      const plain = new WheelEvent("wheel", {
        bubbles: true,
        composed: true,
        cancelable: true,
        deltaY: 100,
      });
      deck.dispatchEvent(plain);
      const modified = new WheelEvent("wheel", {
        bubbles: true,
        composed: true,
        cancelable: true,
        deltaY: -100,
        ctrlKey: true,
        clientX: 300,
        clientY: 200,
      });
      deck.dispatchEvent(modified);
      return {
        plain: plain.defaultPrevented,
        modified: modified.defaultPrevented,
      };
    });
    assert.deepEqual(passes, { plain: false, modified: true });
    await page
      .locator("design-canvas")
      .evaluate((canvas) =>
        canvas.viewport.set({ x: -20000, y: -20000, scale: 1 }),
      );
    await page.reload();
    await ready(page);
    await page.waitForFunction(
      () => document.querySelector("design-canvas").viewport.value.x === 0,
    );
    assert.equal(
      await page.locator("design-canvas").evaluate((canvas) => canvas.zoom),
      1,
    );
    const grip = page
      .locator("#reading > #a")
      .getByRole("button", { name: "Drag artboard" });
    const box = await grip.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y);
    await grip.evaluate((node) =>
      node.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 })),
    );
    await page.mouse.up();
    assert.deepEqual(
      await page
        .locator("#reading > design-board")
        .evaluateAll((boards) => boards.map((board) => board.id)),
      ["a", "b"],
    );
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error("Storage disabled");
      };
    });
    await page
      .locator("#reading > #a")
      .getByRole("textbox", { name: "Artboard name" })
      .fill("Still editable");
    assert.match(
      await page
        .locator("design-canvas")
        .getByRole("status", { name: "Canvas status" })
        .textContent(),
      /storage unavailable/,
    );
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save canvas state" }).click();
    assert.equal(
      (await download).suggestedFilename(),
      "design-canvas.state.json",
    );
  });
});
