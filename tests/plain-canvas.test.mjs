import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary } from "./helpers.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { inlineHtml } from "../packages/exports/src/lib/inline.mjs";
import { injectPlainCanvas } from "../packages/runtime/src/node/plain-canvas.mjs";
const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="design_doc_mode" content="canvas"><title>Plain design options</title><style>body>article{position:absolute;width:240px;height:180px;background:#269d80;box-sizing:border-box;padding:20px;color:white}#first{left:100px;top:130px}#second{left:1700px;top:430px;background:#365bcf}#third{left:500px;top:850px}a{color:inherit}</style></head><body><article id="first" aria-label="First direction"><button id="action">Open</button><input value="Original"><a href="#second">Compare second</a></article><article id="second"><p>Second direction</p></article><article id="third">Third direction</article><template><article id="inert">Inert template</article></template><script>window.originalNode=document.querySelector('#first');window.originalInput=document.querySelector('input');window.clicks=0;document.querySelector('#action').addEventListener('click',()=>{window.clicks++;document.querySelector('#action').textContent='Opened';});</script></body></html>`;
async function fixture(t, html = source, options = {}) {
  const dir = await temporary(t);
  await fs.writeFile(path.join(dir, "canvas.html"), html);
  const { server, url } = await serve(dir, 0, options);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url: url + "canvas.html" };
}
const ready = (page) =>
  page.waitForFunction(() => window.CodexPlainCanvas?.viewport);
test("metadata preview preserves direct body nodes, selectors, listeners and author inputs while pan/zoom stays outside them", async (t) => {
  const { dir, url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    assert.equal(await page.locator("codex-plain-canvas-controls").count(), 1);
    assert.equal(await page.locator("body>article").count(), 3);
    assert.equal(
      await page
        .locator("#first")
        .evaluate((node) => getComputedStyle(node).position),
      "absolute",
    );
    await page.locator("input").fill("Retained input");
    await page.locator("#action").click();
    await page.evaluate(() =>
      window.CodexPlainCanvas.viewport.set({ x: 20, y: 30, scale: 0.8 }),
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        node: originalNode === document.querySelector("#first"),
        input: originalInput === document.querySelector("input"),
        value: originalInput.value,
        clicks,
        children: [...document.body.children].map((node) => node.localName),
      })),
      {
        node: true,
        input: true,
        value: "Retained input",
        clicks: 1,
        children: ["article", "article", "article", "template", "script"],
      },
    );
    await page.mouse.move(1250, 740);
    await page.mouse.down();
    await page.mouse.move(1300, 790);
    await page.mouse.up();
    const view = await page.evaluate(
      () => window.CodexPlainCanvas.viewport.value,
    );
    assert.deepEqual(view, { x: 70, y: 80, scale: 0.8 });
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    assert.ok(
      (await page.evaluate(
        () => window.CodexPlainCanvas.viewport.value.scale,
      )) < 0.75,
    );
    await page.getByRole("button", { name: "Reset view" }).click();
    assert.deepEqual(
      await page.evaluate(() => window.CodexPlainCanvas.viewport.value),
      { x: 0, y: 0, scale: 1 },
    );
  });
  assert.equal(
    await fs.readFile(path.join(dir, "canvas.html"), "utf8"),
    source,
  );
});
test("metadata parser ignores comments, templates and text, and runtime injection is idempotent", async () => {
  for (const html of [
    '<!-- <meta name="design_doc_mode" content="canvas"> -->',
    '<template><meta name="design_doc_mode" content="canvas"></template>',
    '<script>const value=\'<meta name="design_doc_mode" content="canvas">\';</script>',
    '<meta name="design_doc_mode" content="deck">',
  ])
    assert.equal(await injectPlainCanvas(html), html);
  const injected = await injectPlainCanvas(source);
  assert.notEqual(injected, source);
  assert.equal(await injectPlainCanvas(injected), injected);
});
test("plain viewport restores its own document scope, recovers offscreen state and works without browser storage", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    await page.evaluate(() =>
      window.CodexPlainCanvas.viewport.set({ x: 45, y: 65, scale: 0.7 }),
    );
    await page.waitForTimeout(230);
    await page.reload();
    await ready(page);
    assert.deepEqual(
      await page.evaluate(() => window.CodexPlainCanvas.viewport.value),
      { x: 45, y: 65, scale: 0.7 },
    );
    await page.addInitScript(() => {
      if (sessionStorage.getItem("offscreen-tested")) return;
      sessionStorage.setItem("offscreen-tested", "true");
      localStorage.setItem(
        "dc-viewport:/canvas.html:plain-body",
        JSON.stringify({ x: -50000, y: -50000, scale: 0.7 }),
      );
    });
    await page.reload();
    await ready(page);
    await page.waitForFunction(
      () => window.CodexPlainCanvas.viewport.value.x === 0,
    );
    assert.equal(
      await page.evaluate(() => window.CodexPlainCanvas.viewport.value.scale),
      1,
    );
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("Storage unavailable");
        },
      });
    });
    await page.reload();
    await ready(page);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.CodexPlainCanvas.viewport.value.scale),
      1.1,
    );
  });
});
test("plain canvas hash links reveal offscreen designs at the retained scale without losing IDs or browser history", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    await page.locator("a").click();
    assert.match(page.url(), /#second$/);
    assert.equal(await page.evaluate(() => scrollX + scrollY), 0);
    const box = await page.locator("#second").boundingBox();
    assert.ok(Math.abs(box.x + box.width / 2 - 720) < 1);
    assert.ok(Math.abs(box.y + box.height / 2 - 500) < 1);
    await page.goto(url + "#third");
    await ready(page);
    assert.equal(await page.locator("body>#third").count(), 1);
    const third = await page.locator("#third").boundingBox();
    assert.ok(Math.abs(third.x + third.width / 2 - 720) < 1);
  });
});
test("metadata activation, dynamic frames and native-canvas handoff restore authored styles and avoid duplicate gesture handlers", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    await page.evaluate(() => {
      const extra = document.createElement("article");
      extra.id = "fourth";
      document.body.append(extra);
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector("codex-plain-canvas-controls")
          .shadowRoot.querySelector("select").options.length === 4,
    );
    await page.evaluate(
      () =>
        (document.querySelector("meta[name=design_doc_mode]").content = "page"),
    );
    await page.waitForFunction(() => !window.CodexPlainCanvas);
    assert.equal(
      await page.locator("body").evaluate((node) => node.style.transform),
      "",
    );
    assert.equal(
      await page.locator("[data-codex-plain-canvas-style]").count(),
      0,
    );
    await page.evaluate(
      () =>
        (document.querySelector("meta[name=design_doc_mode]").content =
          "canvas"),
    );
    await ready(page);
    await page.getByRole("button", { name: "Reset view" }).click();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.CodexPlainCanvas.viewport.value.scale),
      1.1,
    );
    await page.evaluate(() =>
      document.body.append(document.createElement("design-canvas")),
    );
    await page.waitForFunction(() => !window.CodexPlainCanvas);
    assert.equal(await page.locator("codex-plain-canvas-controls").count(), 0);
    assert.equal(await page.locator("body>#first").count(), 1);
  });
});
test("plain positioned frames download actual 3× PNG and styled HTML independently of pan/zoom and retain current form values", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    await page.locator("input").fill("Current value");
    await page.evaluate(() =>
      window.CodexPlainCanvas.viewport.set({ x: -700, y: -900, scale: 0.25 }),
    );
    await page
      .getByRole("combobox", { name: "Canvas frame" })
      .selectOption({ label: "second" });
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download PNG", exact: true })
      .click();
    const png = await pending;
    const bytes = await fs.readFile(await png.path());
    assert.equal(bytes.readUInt32BE(16), 720);
    assert.equal(bytes.readUInt32BE(20), 540);
    const pixel = await page.evaluate(async (encoded) => {
      const img = new Image();
      img.src = "data:image/png;base64," + encoded;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return [...ctx.getImageData(300, 300, 1, 1).data];
    }, bytes.toString("base64"));
    assert.deepEqual(pixel, [54, 91, 207, 255]);
    await page
      .getByRole("combobox", { name: "Canvas frame" })
      .selectOption({ label: "First direction" });
    const htmlPending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download HTML", exact: true })
      .click();
    const html = await fs.readFile(await (await htmlPending).path(), "utf8");
    assert.match(html, /Current value/);
    assert.doesNotMatch(html, /codex-plain-canvas-controls|Preparing export/);
    assert.deepEqual(
      await page.evaluate((html) => {
        const style = new DOMParser()
          .parseFromString(html, "text/html")
          .querySelector("article").style;
        return { position: style.position, left: style.left, top: style.top };
      }, html),
      { position: "relative", left: "auto", top: "auto" },
    );
  });
});
test("portable metadata canvas remains interactive after its source file and runtime dependencies are absent", async (t) => {
  const { dir, url } = await fixture(t);
  await fs.writeFile(
    path.join(dir, "portable.html"),
    await inlineHtml(path.join(dir, "canvas.html")),
  );
  await fs.rm(path.join(dir, "canvas.html"));
  await withPage(url.replace("canvas.html", "portable.html"), async (page) => {
    await ready(page);
    assert.equal(await page.locator("codex-plain-canvas-controls").count(), 1);
    await page.locator("#action").click();
    assert.equal(await page.evaluate(() => clicks), 1);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.CodexPlainCanvas.viewport.value.scale),
      1.1,
    );
  });
});
test("plain wheel passthrough, modifier zoom, toolbar isolation and pointer cancellation preserve authored control behavior", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    const emit = async (attributes, fields) =>
      page.locator("#first").evaluate(
        (node, { attributes, fields }) => {
          for (const name of [
            "data-dc-wheel-passthru",
            "data-codex-wheel-passthru",
          ])
            node.removeAttribute(name);
          for (const name of attributes) node.setAttribute(name, "");
          const event = new WheelEvent("wheel", {
            deltaY: 100,
            deltaMode: 1,
            bubbles: true,
            cancelable: true,
            ...fields,
          });
          node.dispatchEvent(event);
          return event.defaultPrevented;
        },
        { attributes, fields },
      );
    assert.equal(await emit(["data-dc-wheel-passthru"], {}), false);
    assert.equal(
      await page.evaluate(() => window.CodexPlainCanvas.viewport.value.scale),
      1,
    );
    assert.equal(await emit(["data-codex-wheel-passthru"], {}), false);
    assert.equal(
      await emit(["data-codex-wheel-passthru"], { ctrlKey: true }),
      true,
    );
    assert.ok(
      (await page.evaluate(
        () => window.CodexPlainCanvas.viewport.value.scale,
      )) < 1,
    );
    const before = await page.evaluate(
      () => window.CodexPlainCanvas.viewport.value,
    );
    await page
      .getByRole("button", { name: "Fit", exact: true })
      .evaluate((node) =>
        node.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: 100,
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        ),
      );
    assert.deepEqual(
      await page.evaluate(() => window.CodexPlainCanvas.viewport.value),
      before,
    );
    await page.mouse.move(1300, 780);
    await page.mouse.down();
    await page.mouse.move(1350, 820);
    await page
      .locator("html")
      .evaluate((node) =>
        node.dispatchEvent(
          new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }),
        ),
      );
    await page.mouse.up();
    const released = await page.evaluate(
      () => window.CodexPlainCanvas.viewport.value,
    );
    await page.mouse.move(1250, 720);
    assert.deepEqual(
      await page.evaluate(() => window.CodexPlainCanvas.viewport.value),
      released,
    );
  });
});
test("unmarked documents and native canvas metadata do not acquire a second viewport", async (t) => {
  const { url } = await fixture(
    t,
    source.replace('<meta name="design_doc_mode" content="canvas">', ""),
  );
  await withPage(url, async (page) => {
    assert.equal(await page.locator("codex-plain-canvas-controls").count(), 0);
    assert.equal(
      await page.locator("body").evaluate((node) => node.style.transform),
      "",
    );
  });
  const native = await fixture(
    t,
    source.replace("<body>", "<body><design-canvas></design-canvas>"),
  );
  await withPage(native.url, async (page) => {
    assert.equal(await page.locator("codex-plain-canvas-controls").count(), 0);
    assert.equal(
      await page.locator("body").evaluate((node) => node.style.transform),
      "",
    );
  });
});
test("metadata viewport and source text editing compose without injected source versions, scaled editor chrome or lost author nodes", async (t) => {
  const { dir, url } = await fixture(t, source, { textFile: "canvas.html" });
  await withPage(url, async (page) => {
    await ready(page);
    assert.equal(
      await page.locator("html>text-editor[data-codex-injected]").count(),
      1,
    );
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    const editor = page.locator("text-editor");
    const width = (await editor.boundingBox()).width;
    assert.ok(width > 300);
    await editor
      .getByRole("button", { name: "Edit text", exact: true })
      .click();
    await page.locator("#second p").click();
    await editor
      .getByRole("textbox", { name: "Selected text", exact: true })
      .fill("Edited direction");
    await page.evaluate(() => document.querySelector("text-editor").flush());
    assert.equal(
      await fs.readFile(path.join(dir, "canvas.html"), "utf8"),
      source.replace("Second direction", "Edited direction"),
    );
    assert.equal(
      await page
        .locator("#first")
        .evaluate((node) => node === window.originalNode),
      true,
    );
    await page.reload();
    await ready(page);
    assert.equal(
      await page.locator("#second p").innerText(),
      "Edited direction",
    );
    await page.evaluate(
      () =>
        (document.querySelector("meta[name=design_doc_mode]").content = "page"),
    );
    await page.waitForFunction(() => !window.CodexPlainCanvas);
    assert.equal(
      await page.locator("body>text-editor[data-codex-injected]").count(),
      1,
    );
  });
});
