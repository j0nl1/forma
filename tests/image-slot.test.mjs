import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../skills/codex-design/scripts/build.mjs";
import { serve } from "../skills/codex-design/scripts/preview.mjs";
import { withPage } from "../skills/codex-design/scripts/lib/browser.mjs";
import { inlineHtml } from "../skills/codex-design/scripts/lib/inline.mjs";
import { exportArtifact } from "../skills/codex-design/scripts/export.mjs";
import {
  imageSlots,
  framing,
  zoomAt,
  resizeCorner,
} from "../skills/codex-design/assets/starters/image-model.js";
import {
  unsplash,
  creditUrl,
} from "../skills/codex-design/assets/starters/image-credit.js";
const svg = (color) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="${color}"/></svg>`)}`;
const author = svg("#365bcf");
async function fixture(
  t,
  {
    source = false,
    state = {},
    slots = `<div class="box"><image-slot id="hero" src="${author}" alt="Authored blue illustration" credit="Original studio illustration"></image-slot></div>`,
    before = "",
    legacy = false,
    deck = false,
  } = {},
) {
  const dir = await temporary(t);
  await bundle(
    path.join(root, "skills/codex-design/assets/starters/image-slot.js"),
    path.join(dir, "image-slot.js"),
  );
  if (deck)
    await bundle(
      path.join(root, "skills/codex-design/assets/starters/deck.js"),
      path.join(dir, "deck.js"),
    );
  await fs.writeFile(
    path.join(
      dir,
      legacy ? ".image-slots.state.json" : "image-slots.state.json",
    ),
    JSON.stringify(state),
  );
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Image contract</title><style>body{margin:30px;color:#234;background:#f9f8ee;font:15px system-ui}.box{width:200px;height:200px}image-slot{color:#234}</style>${before}</head><body>${slots}<button id="outside">Outside image</button><script src="image-slot.js"></script>${deck ? '<script src="deck.js"></script>' : ""}</body></html>`;
  await fs.writeFile(path.join(dir, "index.html"), html);
  const { server, url } = await serve(
    dir,
    0,
    deck
      ? { deckFile: "index.html" }
      : source
        ? { imageFile: "index.html" }
        : {},
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    dir,
    url,
    html,
    file: path.join(dir, "index.html"),
    stateFile: path.join(dir, "image-slots.state.json"),
  };
}
async function pattern(page, width = 1600, height = 800) {
  const value = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const c = canvas.getContext("2d");
      for (const [i, color] of ["#cf362f", "#72a580", "#365bcf"].entries()) {
        c.fillStyle = color;
        c.fillRect((i * width) / 3, 0, width / 3, height);
      }
      return canvas.toDataURL("image/png").split(",")[1];
    },
    { width, height },
  );
  return Buffer.from(value, "base64");
}
async function upload(page, id, buffer, mimeType = "image/png") {
  await page
    .locator(`#${id}`)
    .getByLabel("Choose local image")
    .setInputFiles({ name: "picked.png", mimeType, buffer });
  await page.waitForFunction((id) => {
    const s = document.getElementById(id);
    return (
      !s.encoding && !s.loading && s.value.src.startsWith("data:image/webp")
    );
  }, id);
  await page.evaluate((id) => document.getElementById(id).store.settled(), id);
}
const view = (page, id = "hero") =>
  page.locator(`#${id}`).evaluate((slot) => ({ ...slot.view }));
const close = (a, b, epsilon = 0.8) =>
  assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);

test("image models accept both stored generations, reject unsafe data and preserve independent safe ids and framing", () => {
  const state = imageSlots(
    JSON.parse(`{"__proto__":"${author}","crop":{"s":9,"x":0,"y":-5}}`),
  );
  assert.equal(Object.getPrototypeOf(state), null);
  assert.equal(state.__proto__.u, author);
  assert.equal(state.crop.s, 5);
  assert.throws(
    () => imageSlots({ a: { u: "https://example.org/picture.png" } }),
    /data URLs/,
  );
  assert.throws(() => imageSlots({ a: { s: NaN } }), /finite/);
  const cover = framing(400, 100, 200, 200, "cover", { s: 1, x: 500, y: 100 });
  assert.deepEqual(
    [cover.width, cover.height, cover.x, cover.y],
    [800, 200, 150, 0],
  );
  const contain = framing(400, 100, 200, 200, "contain", {
    s: 1,
    x: 500,
    y: 100,
  });
  assert.deepEqual(
    [contain.width, contain.height, contain.x, contain.y],
    [200, 50, 0, 0],
  );
  assert.equal(framing(400, 100, 0, 200, "cover", { s: 1, x: 0, y: 0 }), null);
  assert.deepEqual(zoomAt({ s: 1, x: 0, y: 0 }, 2, { x: 20, y: 0 }), {
    s: 2,
    x: -20,
    y: 0,
  });
  const resized = resizeCorner(
    {
      corner: "se",
      s: 1,
      width: 400,
      height: 200,
      fw: 200,
      fh: 200,
      cx: 100,
      cy: 100,
    },
    { x: 700, y: 400 },
  );
  close(resized.s, 2, 0.000001);
  close(resized.x, 100);
  close(resized.y, 50);
  assert.equal(
    unsplash("https://plus.unsplash.com./photo", "http://localhost/"),
    true,
  );
  assert.equal(
    unsplash("https://unsplash.com.evil.example/photo", "http://localhost/"),
    false,
  );
  const url = new URL(
    creditUrl(
      "https://unsplash.com/@artist?utm_source=custom&test=1",
      "http://localhost/",
    ),
  );
  assert.equal(url.searchParams.get("utm_source"), "custom");
  assert.equal(url.searchParams.get("utm_medium"), "referral");
  assert.equal(url.searchParams.get("test"), "1");
  assert.equal(creditUrl("javascript:alert(1)", "http://localhost/"), "");
});

test("sizing fills explicit containers, flows at 3:2 and updates every shape, mask and fit without replacing images", async (t) => {
  const { url } = await fixture(t, {
    slots: `<div class="box"><image-slot id="hero" src="${author}"></image-slot></div><image-slot id="flow" style="width:300px" src="${author}" fit="contain"></image-slot>`,
  });
  await withPage(url, async (page) => {
    const slot = page.locator("#hero");
    const first = await slot.evaluate((s) => {
      window.firstPhoto = s.ui.photo;
      return {
        width: s.clientWidth,
        height: s.clientHeight,
        g: s.geometry(),
        editable: s.editable,
      };
    });
    assert.deepEqual([first.width, first.height], [200, 200]);
    assert.equal(first.editable, false);
    close(first.g.width, 800);
    assert.deepEqual(
      await page
        .locator("#flow")
        .evaluate((s) => [s.clientWidth, s.clientHeight]),
      [300, 200],
    );
    for (const [shape, radius] of [
      ["rect", "0px"],
      ["rounded", "20px"],
      ["circle", "50%"],
      ["pill", "9999px"],
    ]) {
      await slot.evaluate(
        (s, { shape }) => {
          s.setAttribute("shape", shape);
          s.setAttribute("radius", "20");
        },
        { shape },
      );
      assert.equal(
        await slot.locator(".frame").evaluate((e) => e.style.borderRadius),
        radius,
      );
    }
    await slot.evaluate((s) =>
      s.setAttribute("mask", "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)"),
    );
    assert.match(
      await slot.locator(".frame").evaluate((e) => e.style.clipPath),
      /polygon/,
    );
    assert.equal(await slot.locator(".ring").isVisible(), false);
    await slot.evaluate((s) => {
      s.removeAttribute("mask");
      s.setAttribute("fit", "contain");
    });
    assert.equal(await slot.evaluate((s) => s.ui.photo === firstPhoto), true);
    close((await slot.evaluate((s) => s.geometry())).width, 200);
    await slot.evaluate((s) => {
      s.parentElement.style.width = "320px";
      s.parentElement.style.height = "160px";
    });
    await page.waitForFunction(
      () => document.getElementById("hero").clientWidth === 320,
    );
    close((await slot.evaluate((s) => s.geometry())).width, 320);
  });
});

test("actual native upload shrinks and encodes pixels, saves a real directory sidecar and reveals authored fallback when reset", async (t) => {
  const { url, file, html, stateFile } = await fixture(t, {
    source: true,
    state: { other: { u: author, s: 2, x: 3, y: 0 } },
  });
  await withPage(url, async (page) => {
    await upload(page, "hero", await pattern(page));
    const state = JSON.parse(await fs.readFile(stateFile, "utf8"));
    assert.ok(state.hero.u.startsWith("data:image/webp"));
    assert.equal(state.other.s, 2);
    assert.deepEqual(
      await page
        .locator("#hero")
        .evaluate((s) => [s.ui.photo.naturalWidth, s.ui.photo.naturalHeight]),
      [400, 200],
    );
    assert.equal(await page.locator("#hero .credit").isVisible(), false);
    assert.equal(await fs.readFile(file, "utf8"), html);
    await page.reload();
    await page.waitForFunction(() =>
      document.getElementById("hero")?.value.src.startsWith("data:image/webp"),
    );
    assert.equal(
      await page.locator("#hero").evaluate((s) => s.ui.photo.alt),
      "Authored blue illustration",
    );
    await page.locator("#hero").hover();
    await page
      .locator("#hero")
      .getByRole("button", { name: "Reset image", exact: true })
      .click();
    await page.evaluate(() => document.getElementById("hero").store.settled());
    assert.equal(
      JSON.parse(await fs.readFile(stateFile, "utf8")).hero,
      undefined,
    );
    assert.equal(
      await page.locator("#hero").evaluate((s) => s.value.src),
      author,
    );
    assert.equal(await page.locator("#hero .credit").isVisible(), true);
  });
});

test("real reframe drag, wheel and corner resize survive scaled/clipped ancestors and persist the crop on Escape", async (t) => {
  const { url, stateFile } = await fixture(t, {
    source: true,
    slots: `<div style="width:180px;height:150px;overflow:hidden"><div style="width:200px;height:200px;transform:scale(.6);transform-origin:0 0"><image-slot id="hero" src="${author}"></image-slot></div></div>`,
  });
  await withPage(url, async (page) => {
    await page.locator("#hero").dblclick();
    await page.waitForFunction(
      () => document.getElementById("hero").crop.controller,
    );
    assert.equal(
      await page
        .locator("#hero .spill")
        .evaluate((e) => e.matches(":popover-open")),
      true,
    );
    const frame = await page.locator("#hero .frame").boundingBox(),
      ghost = await page.locator("#hero .spill").boundingBox();
    close(ghost.width, 480);
    close(ghost.height, 120);
    await page.mouse.move(
      frame.x + frame.width / 2,
      frame.y + frame.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      frame.x + frame.width / 2 + 30,
      frame.y + frame.height / 2,
    );
    await page.mouse.up();
    close((await view(page)).x, 25);
    await page.mouse.wheel(0, -300);
    await page.waitForFunction(
      () => document.getElementById("hero").view.s > 1.4,
    );
    const before = await view(page),
      handle = await page.locator("#hero .handle[data-c=se]").boundingBox();
    await page.mouse.move(handle.x + 6, handle.y + 6);
    await page.mouse.down();
    await page.mouse.move(handle.x + 76, handle.y + 40);
    await page.mouse.up();
    assert.ok((await view(page)).s > before.s);
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.getElementById("hero").store.settled());
    assert.equal(
      await page.locator("#hero").getAttribute("data-reframe"),
      null,
    );
    const saved = JSON.parse(await fs.readFile(stateFile, "utf8")).hero;
    assert.ok(saved.s > 1.4);
    assert.equal(saved.u, undefined);
    await page.reload();
    await page.waitForFunction(
      () => document.getElementById("hero")?.ui.photo.naturalWidth > 0,
    );
    close((await view(page)).s, saved.s);
    await page.locator("#hero").evaluate((s) => {
      s.parentElement.style.transform = "scale(1)";
      s.crop.enter();
    });
    await page.mouse.click(1400, 950);
    assert.equal(
      await page.locator("#hero").getAttribute("data-reframe"),
      null,
    );
  });
});

test("late hydration preserves clear and upload intents, keeps unrelated images and inherits disk pixels for early framing edits", async (t) => {
  const { url, stateFile } = await fixture(t, {
    source: true,
    state: { hero: author, other: author },
  });
  await withPage(url, async (page) => {
    await page.route("**/__codex_images", async (route) => {
      if (route.request().method() === "GET") {
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 350));
        await route.fulfill({ response });
      } else await route.continue();
    });
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(
      () => document.getElementById("hero")?.store.endpoint,
    );
    await page.evaluate(() =>
      document.getElementById("hero").store.set("hero", { s: 2, x: 10, y: 0 }),
    );
    await page.evaluate(() => document.getElementById("hero").store.settled());
    const first = JSON.parse(await fs.readFile(stateFile, "utf8"));
    assert.equal(first.hero.u, author);
    assert.equal(first.hero.s, 2);
    assert.equal(first.other, author);
    await page.reload();
    await page.waitForFunction(
      () => document.getElementById("hero")?.store.endpoint,
    );
    await page.evaluate(() => document.getElementById("hero").clear());
    await page.evaluate(() => document.getElementById("hero").store.settled());
    const cleared = JSON.parse(await fs.readFile(stateFile, "utf8"));
    assert.equal(cleared.hero, undefined);
    assert.equal(cleared.other, author);
  });
});

test("new upload, clear and authored src changes defeat stale encodes; failed replacements keep the previous image and crop", async (t) => {
  const { url } = await fixture(t, { source: true });
  await withPage(url, async (page) => {
    const buffer = await pattern(page, 600, 300),
      base64 = buffer.toString("base64");
    await page.evaluate(() => {
      const original = window.createImageBitmap;
      window.createImageBitmap = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return original(...args);
      };
    });
    await page
      .locator("#hero")
      .getByLabel("Choose local image")
      .setInputFiles({ name: "first.png", mimeType: "image/png", buffer });
    assert.equal(await page.locator("#hero").getAttribute("data-swapping"), "");
    await page
      .locator("#hero")
      .evaluate((s, src) => s.setAttribute("src", src), svg("#cf362f"));
    await page.waitForTimeout(350);
    assert.equal(
      await page.locator("#hero").evaluate((s) => s.value.src),
      svg("#cf362f"),
    );
    await page
      .locator("#hero")
      .getByLabel("Choose local image")
      .setInputFiles({ name: "second.png", mimeType: "image/png", buffer });
    await page.locator("#hero").evaluate((s) => s.clear());
    await page.waitForTimeout(350);
    assert.equal(
      await page.locator("#hero").evaluate((s) => s.value.src),
      svg("#cf362f"),
    );
    await upload(page, "hero", buffer);
    const kept = await page.locator("#hero").evaluate((s) => s.value.src);
    await page
      .locator("#hero")
      .getByLabel("Choose local image")
      .setInputFiles({
        name: "broken.png",
        mimeType: "image/png",
        buffer: Buffer.from("broken bytes"),
      });
    await page.waitForFunction(() => !document.getElementById("hero").encoding);
    assert.equal(
      await page.locator("#hero").evaluate((s) => s.value.src),
      kept,
    );
    assert.match(
      await page.locator("#hero").getByRole("status").textContent(),
      /previous image is retained/,
    );
    await page.locator("#hero").evaluate(
      async (s, { base64 }) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        await s.ingest(new File([bytes], "gif.gif", { type: "image/gif" }));
      },
      { base64 },
    );
    assert.match(
      await page.locator("#hero").getByRole("status").textContent(),
      /PNG, JPEG, WebP, or AVIF/,
    );
  });
});

test("unsupported native inputs retain a pending valid replacement and its loading mask", async (t) => {
  const { url, stateFile } = await fixture(t, { source: true });
  await withPage(url, async (page) => {
    const buffer = await pattern(page, 300, 200);
    await page.evaluate(() => {
      const original = window.createImageBitmap;
      window.createImageBitmap = async (...args) => {
        window.pendingImageDecode = true;
        await new Promise((resolve) => {
          window.releaseImageDecode = resolve;
        });
        return original(...args);
      };
    });
    for (const mimeType of ["text/plain", "image/gif"]) {
      await page.evaluate(() => {
        window.pendingImageDecode = false;
      });
      await page
        .locator("#hero")
        .getByLabel("Choose local image")
        .setInputFiles({
          name: "replacement.png",
          mimeType: "image/png",
          buffer,
        });
      await page.waitForFunction(() => window.pendingImageDecode);
      const generation = await page
        .locator("#hero")
        .evaluate((s) => s.generation);
      await page
        .locator("#hero")
        .getByLabel("Choose local image")
        .setInputFiles({
          name: mimeType === "image/gif" ? "unsupported.gif" : "notes.txt",
          mimeType,
          buffer: Buffer.from("Unsupported content"),
        });
      assert.deepEqual(
        await page.locator("#hero").evaluate((s) => ({
          generation: s.generation,
          encoding: s.encoding,
          masked: s.hasAttribute("data-swapping"),
        })),
        { generation, encoding: true, masked: true },
      );
      assert.match(
        await page.locator("#hero").getByRole("status").textContent(),
        /PNG, JPEG, WebP, or AVIF/,
      );
      await page.evaluate(() => window.releaseImageDecode());
      await page.waitForFunction(() => {
        const s = document.getElementById("hero");
        return (
          !s.encoding && !s.loading && s.value.src.startsWith("data:image/webp")
        );
      });
      assert.equal(
        await page.locator("#hero").getAttribute("data-swapping"),
        null,
      );
      await page.evaluate(() =>
        document.getElementById("hero").store.settled(),
      );
      const saved = JSON.parse(await fs.readFile(stateFile, "utf8")).hero;
      assert.equal(
        saved.u,
        await page.locator("#hero").evaluate((s) => s.value.src),
      );
      assert.deepEqual(
        await page
          .locator("#hero")
          .evaluate((s) => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            canvas.getContext("2d").drawImage(s.ui.photo, 0, 0);
            return [...canvas.getContext("2d").getImageData(0, 0, 1, 1).data];
          })
          .then(([r, g, b, a]) => [r > 180, g < 80, b < 80, a]),
        [true, true, true, 255],
      );
    }
  });
});

test("canonical attribution errors replace uncredited stock, split safe photographer links and disappear for a user upload", async (t) => {
  const { url } = await fixture(t, { source: true });
  await withPage(url, async (page) => {
    const buffer = await pattern(page, 100, 100);
    await page.route("https://plus.unsplash.com./**", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: buffer }),
    );
    await page.locator("#hero").evaluate((s) => {
      s.removeAttribute("credit");
      s.setAttribute("src", "https://plus.unsplash.com./photo");
    });
    assert.equal(await page.locator("#hero .attribution").isVisible(), true);
    assert.equal(await page.locator("#hero .photo").isVisible(), false);
    await page.locator("#hero").evaluate((s) => {
      s.setAttribute("credit", "Photo by Sample Artist on Unsplash");
      s.setAttribute(
        "credit-href",
        "https://unsplash.com/@sample?utm_source=existing&value=1",
      );
    });
    await page.waitForFunction(() => !document.getElementById("hero").loading);
    const links = await page
      .locator("#hero .credit a")
      .evaluateAll((nodes) =>
        nodes.map((n) => ({ text: n.textContent, href: n.href, rel: n.rel })),
      );
    assert.deepEqual(
      links.map((link) => link.text),
      ["Sample Artist", "Unsplash"],
    );
    assert.equal(
      new URL(links[0].href).searchParams.get("utm_source"),
      "existing",
    );
    assert.equal(
      new URL(links[1].href).searchParams.get("utm_source"),
      "codex_design",
    );
    assert.equal(links[0].rel, "noopener noreferrer");
    await upload(page, "hero", buffer);
    assert.equal(await page.locator("#hero .credit").isVisible(), false);
    await page.locator("#hero").evaluate((s) => {
      s.clear();
      s.setAttribute("credit", "<img onerror=alert(1)>");
      s.setAttribute("credit-href", "javascript:alert(1)");
    });
    await page.locator("#hero .credit").waitFor();
    assert.equal(await page.locator("#hero .credit img").count(), 0);
    assert.equal(await page.locator("#hero .credit a").count(), 0);
  });
});

test("sidecar writes reject stale/foreign/redirected requests and offer an actual downloadable recovery state", async (t) => {
  const { url, stateFile, dir } = await fixture(t, { source: true });
  const initial = await (await fetch(url + "__codex_images")).json();
  const post = (payload, headers = {}) =>
    fetch(url + "__codex_images", {
      method: "POST",
      headers: {
        Origin: url.slice(0, -1),
        "Content-Type": "application/json",
        "X-Codex-Images-Token": initial.token,
        ...headers,
      },
      body: JSON.stringify({ version: initial.version, ...payload }),
    });
  assert.equal(
    (
      await post(
        { edits: [{ id: "hero", value: author }] },
        { Origin: "https://other.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post(
        { edits: [{ id: "hero", value: author }] },
        { "X-Codex-Images-Token": "wrong" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post({
        edits: [{ id: "hero", value: { u: "https://other.example/x" } }],
      })
    ).status,
    400,
  );
  await withPage(url, async (page, errors) => {
    await fs.writeFile(
      stateFile,
      JSON.stringify({ external: { u: author, s: 1, x: 0, y: 0 } }),
    );
    await upload(page, "hero", await pattern(page, 300, 200));
    assert.match(
      await page.locator("#hero").getByRole("status").textContent(),
      /Image state changed/,
    );
    assert.equal(
      JSON.parse(await fs.readFile(stateFile, "utf8")).hero,
      undefined,
    );
    const download = page.waitForEvent("download");
    await page
      .locator("#hero")
      .getByRole("button", { name: "Download image state", exact: true })
      .click();
    const result = await download;
    await result.saveAs(path.join(dir, "draft.json"));
    assert.ok(
      JSON.parse(
        await fs.readFile(path.join(dir, "draft.json"), "utf8"),
      ).hero.u.startsWith("data:image/webp"),
    );
    assert.ok(errors.some((error) => error.includes("409")));
    errors.splice(
      0,
      errors.length,
      ...errors.filter((error) => !error.includes("409")),
    );
  });
  await fs.writeFile(path.join(dir, "outside.json"), "{}");
  await fs.rm(stateFile);
  await fs.symlink(path.join(dir, "outside.json"), stateFile);
  assert.equal(
    (await post({ edits: [{ id: "hero", value: author }] })).status,
    400,
  );
  assert.equal(await fs.readFile(path.join(dir, "outside.json"), "utf8"), "{}");
});

test("static state is read-only, legacy state migrates without erasing other ids and reconnect does not commit an interrupted crop", async (t) => {
  const staticPage = await fixture(t, {
    legacy: true,
    state: { hero: author },
  });
  await withPage(staticPage.url, async (page) => {
    assert.equal(
      await page.locator("#hero").evaluate((s) => s.editable),
      false,
    );
    await page.locator("#hero").dblclick();
    assert.equal(
      await page.locator("#hero").getAttribute("data-reframe"),
      null,
    );
  });
  const writable = await fixture(t, {
    source: true,
    legacy: true,
    state: { hero: { u: author, s: 2, x: 10, y: 0 }, other: author },
  });
  await withPage(writable.url, async (page) => {
    await page.locator("#hero").evaluate((s) => {
      window.slot = s;
      window.photo = s.ui.photo;
      s.crop.enter();
      s.view.x = 70;
      s.applyView();
      s.remove();
      document.body.prepend(s);
    });
    assert.equal(
      await page.locator("#hero").evaluate((s) => s.ui.photo === photo),
      true,
    );
    assert.equal(
      await page.locator("#hero").getAttribute("data-reframe"),
      null,
    );
    close((await view(page)).x, 10);
    await page.locator("#hero").evaluate((s) => {
      s.crop.enter();
      s.view.s = 3;
      s.applyView();
      s.crop.exit(true);
    });
    await page.evaluate(() => document.getElementById("hero").store.settled());
    assert.equal(
      JSON.parse(await fs.readFile(writable.stateFile, "utf8")).other,
      author,
    );
    assert.equal(
      JSON.parse(
        await fs.readFile(
          path.join(writable.dir, ".image-slots.state.json"),
          "utf8",
        ),
      ).hero.s,
      2,
    );
  });
});

test("standalone export embeds actual shared image state, hides chrome in real output and survives source removal", async (t) => {
  const { url, dir, file } = await fixture(t, { source: true });
  await withPage(url, async (page) => {
    await upload(page, "hero", await pattern(page));
    await page.locator("#hero").evaluate((s) => {
      s.crop.enter();
      s.view = { s: 2, x: 75, y: 0 };
      s.applyView();
      s.crop.exit(true);
    });
    await page.evaluate(() => document.getElementById("hero").store.settled());
  });
  const portable = await inlineHtml(file);
  assert.ok(portable.includes('id="codex-image-state"'));
  assert.ok(portable.includes("data:image/webp"));
  await fs.mkdir(path.join(dir, "portable"));
  await fs.writeFile(path.join(dir, "portable", "index.html"), portable);
  await fs.rm(path.join(dir, "image-slot.js"));
  await fs.rm(path.join(dir, "image-slots.state.json"));
  await withPage(url + "portable/", async (page) => {
    assert.equal(
      await page.locator("#hero").evaluate((s) => s.editable),
      false,
    );
    close((await view(page)).s, 2);
    close((await view(page)).x, 75);
    assert.equal(
      await page.locator("#hero").evaluate((s) => s.ui.photo.naturalWidth),
      400,
    );
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator("#hero .credit").isVisible(), false);
  });
  await exportArtifact("png", url + "portable/", path.join(dir, "final.png"));
  const png = await fs.readFile(path.join(dir, "final.png"));
  assert.ok(png.length > 1000);
  await withPage(url + "portable/", async (page) => {
    const pixel = await page.evaluate(async (encoded) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return [...context.getImageData(130, 130, 1, 1).data];
    }, png.toString("base64"));
    assert.ok(pixel[0] > 150 && pixel[0] > pixel[1] * 1.4, pixel.join(","));
  });
});

test("native deck duplicates keep uploaded bytes and crop under independent sidecar ids across real source reload", async (t) => {
  const { url, stateFile } = await fixture(t, {
    deck: true,
    slots: `<deck-stage width="600" height="400"><section><image-slot id="hero" style="width:300px;height:180px" src="${author}"></image-slot></section><section><h1>Second slide</h1></section></deck-stage>`,
  });
  await withPage(url, async (page) => {
    await upload(page, "hero", await pattern(page));
    await page.locator("#hero").evaluate((s) => {
      s.crop.enter();
      s.view = { s: 2, x: 20, y: 0 };
      s.applyView();
      s.crop.exit(true);
    });
    await page.evaluate(() => document.getElementById("hero").store.settled());
    await page.evaluate(() =>
      document.querySelector("deck-stage").editor.duplicate(0),
    );
    await page.evaluate(() => document.getElementById("hero").store.settled());
    let state = JSON.parse(await fs.readFile(stateFile, "utf8"));
    assert.equal(state["hero-2"].u, state.hero.u);
    assert.equal(state["hero-2"].s, 2);
    await page.locator("#hero-2").evaluate((s) => {
      s.crop.enter();
      s.view.s = 3;
      s.applyView();
      s.crop.exit(true);
    });
    await page.evaluate(() => document.getElementById("hero").store.settled());
    await page.reload();
    await page.waitForFunction(
      () => document.getElementById("hero-2")?.store.loaded,
    );
    state = JSON.parse(await fs.readFile(stateFile, "utf8"));
    assert.equal(state.hero.s, 2);
    assert.equal(state["hero-2"].s, 3);
    assert.equal(
      await page.locator("deck-stage > section image-slot").count(),
      2,
    );
  });
});

test("first fills stay unmasked while replacements keep the mask through same-task credit changes and release on actual decoding", async (t) => {
  const { url } = await fixture(t, { source: true });
  await withPage(url, async (page) => {
    const bytes = await pattern(page, 100, 100);
    await page.route("**/delayed.png", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: bytes,
      });
    });
    await page.locator("#hero").evaluate((s) => {
      s.setAttribute("src", "delayed.png");
      s.setAttribute("credit", "New source illustration");
      s.setAttribute("credit-href", "#artist");
      s.render();
    });
    assert.equal(await page.locator("#hero").getAttribute("data-swapping"), "");
    assert.equal(
      await page
        .locator("#hero .photo")
        .evaluate((e) => getComputedStyle(e).visibility),
      "hidden",
    );
    await page.waitForFunction(() => !document.getElementById("hero").loading);
    assert.equal(
      await page.locator("#hero").getAttribute("data-swapping"),
      null,
    );
    assert.equal(
      await page
        .locator("#hero .photo")
        .evaluate((e) => getComputedStyle(e).visibility),
      "visible",
    );
    await page.locator("#hero").evaluate((s) => s.removeAttribute("src"));
    await page.route("**/delayed.png?first=1", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: bytes }),
    );
    await page
      .locator("#hero")
      .evaluate((s) => s.setAttribute("src", "delayed.png?first=1"));
    assert.equal(
      await page.locator("#hero").getAttribute("data-swapping"),
      null,
    );
  });
});

test("invalid sibling records do not erase valid images and partial saves retain unknown entries", async (t) => {
  const { url, stateFile } = await fixture(t, {
    source: true,
    state: {
      hero: author,
      invalid: { u: "https://untrusted.example/image" },
      other: "not an image",
    },
  });
  await withPage(url, async (page) => {
    assert.equal(
      await page.locator("#hero").evaluate((s) => s.value.src),
      author,
    );
    assert.match(
      await page.locator("#hero").getByRole("status").textContent(),
      /valid images remain available/,
    );
    await page.locator("#hero").evaluate((s) => {
      s.view.s = 2;
      s.saveView();
    });
    await page.evaluate(() => document.getElementById("hero").store.settled());
    const state = JSON.parse(await fs.readFile(stateFile, "utf8"));
    assert.equal(state.hero.s, 2);
    assert.equal(state.invalid.u, "https://untrusted.example/image");
    assert.equal(state.other, "not an image");
  });
});

test("large groups of image changes save in bounded batches without losing entries or newer revisions", async (t) => {
  const { url, stateFile } = await fixture(t, { source: true });
  await withPage(url, async (page) => {
    await page.locator("#hero").evaluate(async (slot) => {
      for (let i = 0; i < 250; i++)
        slot.store.set(`image-${i}`, { s: 2, x: i, y: -i });
      slot.store.set("image-0", { s: 3, x: 20, y: 0 });
      await slot.store.settled();
      if (slot.store.error) throw Error(slot.store.error);
    });
    const saved = JSON.parse(await fs.readFile(stateFile, "utf8"));
    assert.equal(Object.keys(saved).length, 250);
    assert.deepEqual(saved["image-0"], { s: 3, x: 20, y: 0 });
    assert.deepEqual(saved["image-249"], { s: 2, x: 249, y: -249 });
    await page.reload();
    assert.equal(
      await page
        .locator("#hero")
        .evaluate((slot) => Object.keys(slot.store.slots).length),
      250,
    );
  });
});

test("real JPEG, WebP and AVIF uploads decode and compatibility GIF retains its animated original bytes", async (t) => {
  const { url, dir } = await fixture(t, {
    source: true,
    slots: `<div class="box"><image-slot id="hero"></image-slot></div><image-slot id="legacy" storage-key="legacy-format" style="width:200px"></image-slot>`,
  });
  await withPage(url, async (page) => {
    const png = await pattern(page, 64, 32);
    await fs.writeFile(path.join(dir, "source.png"), png);
    for (const [extension, type, codec] of [
      ["jpg", "image/jpeg", "mjpeg"],
      ["webp", "image/webp", "libwebp"],
      ["avif", "image/avif", "libaom-av1"],
    ]) {
      const file = path.join(dir, `image.${extension}`);
      execFileSync("ffmpeg", [
        "-loglevel",
        "error",
        "-i",
        path.join(dir, "source.png"),
        "-frames:v",
        "1",
        "-c:v",
        codec,
        "-threads",
        "1",
        file,
      ]);
      await upload(page, "hero", await fs.readFile(file), type);
      assert.deepEqual(
        await page
          .locator("#hero")
          .evaluate((s) => [s.ui.photo.naturalWidth, s.ui.photo.naturalHeight]),
        [64, 32],
      );
    }
    const gif = path.join(dir, "animated.gif");
    execFileSync("ffmpeg", [
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=32x32:r=2:d=0.5",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=32x32:r=2:d=0.5",
      "-filter_complex",
      "[0:v][1:v]concat=n=2:v=1:a=0",
      "-loop",
      "0",
      gif,
    ]);
    const bytes = await fs.readFile(gif);
    await page
      .locator("#legacy")
      .getByLabel("Choose local image")
      .setInputFiles({
        name: "animated.gif",
        mimeType: "image/gif",
        buffer: bytes,
      });
    await page.waitForFunction(
      () =>
        !document.getElementById("legacy").encoding &&
        document
          .getElementById("legacy")
          .value.src.startsWith("data:image/gif"),
    );
    assert.equal(
      await page.locator("#legacy").evaluate((s) => s.value.src),
      `data:image/gif;base64,${bytes.toString("base64")}`,
    );
  });
});

test("a retained conflict draft can be downloaded after reload without overwriting the newer image state", async (t) => {
  const { url, stateFile, dir } = await fixture(t, { source: true });
  await withPage(url, async (page, errors) => {
    await fs.writeFile(stateFile, JSON.stringify({ external: author }));
    await upload(page, "hero", await pattern(page, 300, 200));
    await page.reload();
    await page.waitForFunction(
      () => document.getElementById("hero")?.store.retained,
    );
    assert.equal(
      await page.locator("#hero").evaluate((s) => s.value.src),
      author,
    );
    const wait = page.waitForEvent("download");
    await page
      .locator("#hero")
      .getByRole("button", { name: "Download retained draft", exact: true })
      .click();
    const download = await wait;
    await download.saveAs(path.join(dir, "retained.json"));
    assert.ok(
      JSON.parse(
        await fs.readFile(path.join(dir, "retained.json"), "utf8"),
      ).hero.u.startsWith("data:image/webp"),
    );
    assert.equal(
      JSON.parse(await fs.readFile(stateFile, "utf8")).hero,
      undefined,
    );
    assert.ok(errors.some((error) => error.includes("409")));
    errors.splice(
      0,
      errors.length,
      ...errors.filter((error) => !error.includes("409")),
    );
  });
});

test("popover fallback escapes ancestor clipping, preserves control ownership and removes its portal on disconnect", async (t) => {
  const { url } = await fixture(t, { source: true });
  await withPage(url, async (page) => {
    await page.evaluate(() => {
      HTMLElement.prototype.showPopover = () => {
        throw Error("Unavailable");
      };
    });
    await page.locator("#hero").dblclick();
    await page.locator("[data-codex-image-editor]").waitFor();
    assert.equal(
      await page.locator("[data-codex-image-editor] .spill").isVisible(),
      true,
    );
    await page
      .locator("[data-codex-image-editor]")
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    assert.equal(await page.locator("[data-codex-image-editor]").count(), 0);
    assert.equal(await page.locator("#hero .toolbar").count(), 1);
    await page.locator("#hero").evaluate((s) => s.crop.enter());
    await page.locator("#hero").evaluate((s) => {
      s.remove();
      document.body.prepend(s);
    });
    assert.equal(await page.locator("[data-codex-image-editor]").count(), 0);
    assert.equal(await page.locator("#hero .toolbar").count(), 1);
  });
});
