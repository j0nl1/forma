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
  postPlatforms,
  nominalFrame,
  assetName,
} from "../skills/studio-design/assets/starters/social-model.js";
const photo =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="160"><rect width="90" height="160" fill="#365bcf"/></svg>',
  );
async function fixture(t, html, options = {}) {
  const dir = await temporary(t);
  await bundle(
    path.join(root, "skills/studio-design/assets/starters/social.js"),
    path.join(dir, "app.js"),
  );
  const file = path.join(dir, "index.html");
  await fs.writeFile(
    file,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Social contracts</title><style>body{margin:0;background:#eee;font:15px system-ui}post-card{width:420px}.asset{width:240px;height:160px;background:#cf362f;border-radius:30px}.blue{background:#365bcf}.overlay{position:absolute;top:150px;left:30px;color:white}.unit{width:420px}</style></head><body>${html}<script src="app.js"></script></body></html>`,
  );
  const { server, url } = await serve(
    dir,
    0,
    options.source ? { imageFile: "index.html" } : {},
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url, file };
}
const box = (page, selector) =>
  page.locator(selector).evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    height: node.getBoundingClientRect().height,
  }));
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1, `${actual} != ${expected}`);
async function pngPixels(page, bytes, inset = 0) {
  return page.evaluate(
    async ({ encoded, inset }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + encoded;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        corners: [
          [inset, inset],
          [image.width - 1 - inset, image.height - 1 - inset],
        ].map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]),
      };
    },
    { encoded: Buffer.from(bytes).toString("base64"), inset },
  );
}

test("post defaults, frame labels and nominal dimensions preserve all platforms and archive-safe unique names", () => {
  assert.deepEqual(Object.keys(postPlatforms), [
    "x",
    "linkedin",
    "facebook",
    "reddit",
  ]);
  const frame = (values, width = 240, height = 160) => ({
    getAttribute: (key) => values[key] ?? null,
    offsetWidth: width,
    offsetHeight: height,
  });
  assert.deepEqual(
    nominalFrame(frame({ "data-codex-frame-label": "Story · 1080×1920" })),
    { label: "Story · 1080×1920", title: "Story", width: 1080, height: 1920 },
  );
  assert.deepEqual(
    nominalFrame(frame({ "data-om-frame-label": "Ad · 1200x900" })),
    { label: "Ad · 1200x900", title: "Ad", width: 1200, height: 900 },
  );
  assert.equal(nominalFrame(frame({})).width, 240);
  assert.throws(
    () => nominalFrame(frame({ "data-codex-frame-width": "-1" })),
    /dimensions/,
  );
  const used = new Set();
  assert.equal(assetName("../My ad", used), "My-ad.png");
  assert.equal(assetName("My ad", used), "My-ad-2.png");
  assert.equal(assetName("my ad", used), "my-ad-3.png");
});
for (const platform of ["x", "linkedin", "facebook", "reddit"])
  test(`${platform} feed has distinct author/sub/copy/reactions, media, optional link and votes while keeping live children`, async (t) => {
    const { url } = await fixture(
      t,
      `<post-card platform="${platform}" name="Studio" text="An original study" link-domain="example.com" link-title="Read this note"><div class="asset" data-codex-frame-export><input id="live" aria-label="Draft"><button id="action" onclick="window.clicked=(window.clicked||0)+1">Live action</button></div></post-card>`,
    );
    await withPage(url, async (page) => {
      assert.equal(await page.locator("post-card .name").innerText(), "Studio");
      assert.equal(
        await page.locator("post-card .sub").innerText(),
        postPlatforms[platform].sub,
      );
      assert.deepEqual(
        await page.locator("post-card .reactions span").allTextContents(),
        postPlatforms[platform].reactions,
      );
      assert.equal(
        await page.locator("post-card .link").isVisible(),
        platform === "facebook",
      );
      assert.equal(
        await page.locator("post-card .votes").isVisible(),
        platform === "reddit",
      );
      await page.getByLabel("Draft").fill("Retained");
      await page
        .getByRole("button", { name: "Live action", exact: true })
        .click();
      assert.equal(await page.evaluate(() => clicked), 1);
      await page.evaluate(
        () => (window.original = document.getElementById("live")),
      );
      await page.locator("post-card").evaluate((node) => {
        node.setAttribute("name", "Updated studio");
        node.setAttribute("text", "<img src=x onerror=alert(1)>");
        node.setAttribute("platform", "facebook");
        node.setAttribute("link-title", "Updated note");
        node.setAttribute("image-only", "false");
      });
      assert.equal(
        await page.locator("post-card .copy").innerText(),
        "<img src=x onerror=alert(1)>",
      );
      assert.equal(await page.locator("post-card .copy img").count(), 0);
      assert.equal(
        await page.locator("post-card .link-title").innerText(),
        "Updated note",
      );
      assert.equal(await page.getByLabel("Draft").inputValue(), "Retained");
      assert.equal(
        await page.evaluate(() => original === document.getElementById("live")),
        true,
      );
      await page
        .locator("post-card")
        .evaluate((node) => node.setAttribute("image-only", "true"));
      assert.equal(await page.locator("post-card .head").isVisible(), false);
      assert.equal(await page.locator("post-card .link").isVisible(), false);
      assert.equal(
        await page
          .locator("post-card .media")
          .evaluate((node) => getComputedStyle(node).borderRadius),
        "0px",
      );
      await page.locator("post-card").evaluate((node) => {
        node.setAttribute("image-only", "");
        node.remove();
        document.body.append(node);
      });
      assert.equal(await page.getByLabel("Draft").inputValue(), "Retained");
      await page
        .locator("post-card")
        .evaluate((node) => node.removeAttribute("image-only"));
      assert.equal(await page.locator("post-card .head").isVisible(), true);
    });
  });

test("story composes a fixed letterboxed phone, 9:16 export frame, attributed image, author overlays and exact image-only geometry without replacing content", async (t) => {
  const { url } = await fixture(
    t,
    `<instagram-story id="story" image-src="${photo}" image-credit="Original study" image-credit-href="https://example.com/studio" username="studio" time="3h" image-only="false"><div class="overlay"><input id="live" aria-label="Sticker text" value="Original"></div></instagram-story>`,
  );
  await withPage(url, async (page) => {
    assert.deepEqual(await box(page, "instagram-story ios-shell"), {
      width: 428,
      height: 900,
    });
    const frame = await box(page, "instagram-story .stage");
    near(frame.width, 402);
    near(frame.height, (402 * 16) / 9);
    assert.equal(await page.locator("instagram-story .progress i").count(), 3);
    assert.equal(
      await page.locator("instagram-story .username").innerText(),
      "studio",
    );
    assert.equal(await page.locator("instagram-story .time").innerText(), "3h");
    assert.equal(
      await page.locator("instagram-story image-slot").getAttribute("id"),
      "story-photo",
    );
    assert.equal(
      await page.locator("instagram-story image-slot").getAttribute("credit"),
      "Original study",
    );
    const geometry = await page.locator("instagram-story").evaluate((node) => ({
      stage: node.frame.getBoundingClientRect().top,
      screen: node.phone.shadowRoot
        .querySelector(".ios-screen")
        .getBoundingClientRect().top,
      reply: node.shadowRoot.querySelector(".reply").getBoundingClientRect()
        .top,
      end: node.frame.getBoundingClientRect().bottom,
    }));
    near(geometry.stage - geometry.screen, (874 - (402 * 16) / 9) / 2);
    assert.ok(geometry.reply > geometry.end);
    await page.getByLabel("Sticker text").fill("Retained");
    await page.evaluate(
      () => (window.original = document.getElementById("live")),
    );
    await page.locator("instagram-story").evaluate((node) => {
      node.setAttribute("image-only", "true");
      node.setAttribute("username", "<img src=x>");
      node.setAttribute("time", "4h");
    });
    assert.equal(
      await page.locator("instagram-story .head").isVisible(),
      false,
    );
    const asset = await box(page, "instagram-story");
    near(asset.width, 402);
    near(asset.height, (402 * 16) / 9);
    assert.equal(
      await page.evaluate(() => original === document.getElementById("live")),
      true,
    );
    await page.locator("instagram-story").evaluate((node) => {
      node.setAttribute("image-only", "false");
      node.setAttribute("width", "338");
    });
    assert.deepEqual(await box(page, "instagram-story ios-shell"), {
      width: 338,
      height: Math.round((312 * 874) / 402) + 26,
    });
    assert.equal(
      await page.locator("instagram-story .username img").count(),
      0,
    );
    assert.equal(
      await page.getByLabel("Sticker text").inputValue(),
      "Retained",
    );
  });
});

test("native board rescans actual conditional/hidden/fixed units, updates literal labels, tracks scaled positions and retains labels through reconnect and clone", async (t) => {
  const { url } = await fixture(
    t,
    '<div style="transform:scale(.65);transform-origin:top left"><social-frames id="board"><div id="one"><div class="asset" data-codex-frame-export data-codex-frame-label="One · 600×400"></div></div><div id="two"><div class="asset blue" data-om-frame-export data-om-frame-label="Two · 600×400"></div></div></social-frames></div>',
  );
  await withPage(url, async (page) => {
    await page.waitForFunction(
      () => document.getElementById("board").records.size === 2,
    );
    assert.equal(await page.locator("#board .all").isVisible(), true);
    assert.equal(await page.locator("#board .label").count(), 2);
    const positions = await page.locator("#board").evaluate((node) => {
      const unit = document.getElementById("one"),
        bar = node.records.get(unit).bar;
      return {
        left: unit.getBoundingClientRect().left,
        label: bar.getBoundingClientRect().left,
        top: unit.getBoundingClientRect().top,
        labelTop: bar.getBoundingClientRect().top,
      };
    });
    near(positions.left, positions.label);
    near(positions.top - positions.labelTop, 38 * 0.65);
    await page
      .locator("#two")
      .evaluate((node) => (node.style.display = "none"));
    await page.waitForFunction(
      () => document.getElementById("board").records.size === 1,
    );
    assert.equal(await page.locator("#board .all").isVisible(), false);
    assert.equal(await page.locator("#board .download").isVisible(), true);
    await page
      .locator("#one .asset")
      .evaluate((node) =>
        node.setAttribute("data-codex-frame-label", "<img src=x> · 800×500"),
      );
    await page.waitForFunction(() =>
      document.getElementById("board").labels.textContent.includes("800×500"),
    );
    assert.equal(await page.locator("#board .label img").count(), 0);
    await page.locator("#two").evaluate((node) => (node.style.display = ""));
    await page
      .locator("#one .asset")
      .evaluate((node) => (node.style.position = "fixed"));
    await page.waitForFunction(
      () => document.getElementById("board").frames().length === 1,
    );
    await page
      .locator("#one .asset")
      .evaluate((node) => (node.style.position = ""));
    await page.locator("#board").evaluate((node) => {
      node.remove();
      document.body.append(node);
      const clone = node.cloneNode(true);
      clone.id = "clone";
      clone.querySelector("#one").id = "cloned-one";
      clone.querySelector("#two").remove();
      document.body.append(clone);
    });
    await page.waitForFunction(
      () => document.getElementById("clone").records.size === 1,
    );
    assert.equal(await page.locator("#board .label").count(), 2);
    assert.equal(await page.locator("#clone .label").count(), 1);
  });
});

test("actual per-frame PNG and ZIP contain exact nominal pixels, unique names and no shell/overlap dressing even through native story shadow roots", async (t) => {
  const { url, dir } = await fixture(
    t,
    `<social-frames id="board" label="Campaign"><div><post-card name="Studio"><div class="asset" data-codex-frame-export data-codex-frame-label="Study · 600×400"><span data-codex-chrome style="position:absolute;inset:0;background:yellow">Chrome</span></div></post-card></div><div><instagram-story id="story" image-src="${photo}"></instagram-story></div><div><div class="asset blue" data-codex-frame-export data-codex-frame-label="Study · 600×400"></div></div></social-frames>`,
  );
  await withPage(url, async (page) => {
    await page.waitForFunction(
      () => document.getElementById("board").records.size === 3,
    );
    let downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Download Study · 600×400 as PNG",
        exact: true,
      })
      .first()
      .click();
    const png = await downloaded;
    assert.equal(png.suggestedFilename(), "Study.png");
    const pngPath = path.join(dir, "single.png");
    await png.saveAs(pngPath);
    assert.deepEqual(await pngPixels(page, await fs.readFile(pngPath)), {
      width: 600,
      height: 400,
      corners: Array(2).fill([207, 54, 47, 255]),
    });
    downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "↓ Download all (zip)", exact: true })
      .click();
    const zip = await downloaded;
    assert.equal(zip.suggestedFilename(), "Campaign.zip");
    const zipPath = path.join(dir, "all.zip");
    await zip.saveAs(zipPath);
    const entries = unzipSync(await fs.readFile(zipPath));
    assert.deepEqual(Object.keys(entries), [
      "Study.png",
      "Instagram-story.png",
      "Study-2.png",
    ]);
    assert.deepEqual(await pngPixels(page, entries["Instagram-story.png"], 1), {
      width: 1080,
      height: 1920,
      corners: Array(2).fill([54, 91, 207, 255]),
    });
    const edge = (await pngPixels(page, entries["Instagram-story.png"]))
      .corners[1];
    assert.equal(edge[3], 255);
    assert.ok(edge[2] > edge[1] && edge[2] > edge[0]);
    assert.deepEqual(await pngPixels(page, entries["Study-2.png"]), {
      width: 600,
      height: 400,
      corners: Array(2).fill([54, 91, 207, 255]),
    });
    assert.equal(await page.locator("instagram-story .head").isVisible(), true);
    assert.equal(await page.locator("#board .all").isDisabled(), false);
  });
});

test("hidden and foreign frames are rejected, bad nominal dimensions produce a visible error and a corrected frame can retry", async (t) => {
  const { url, dir } = await fixture(
    t,
    '<social-frames id="board"><div><div class="asset" data-codex-frame-export data-codex-frame-label="Bad · 0×20"></div></div></social-frames><div id="foreign" class="asset" data-codex-frame-export></div>',
  );
  await withPage(url, async (page) => {
    await assert.rejects(
      page
        .locator("#board")
        .evaluate((node) =>
          node.exportFrame(document.getElementById("foreign")),
        ),
      /owned by this board/,
    );
    await page
      .getByRole("button", {
        name: "Download Bad · 0×20 as PNG",
        exact: true,
      })
      .click();
    await page.waitForFunction(() =>
      document.getElementById("board").hasAttribute("data-export-error"),
    );
    assert.match(
      await page.locator("#board .status").innerText(),
      /nominal frame dimensions/,
    );
    await page
      .locator("#board .asset")
      .evaluate((node) =>
        node.setAttribute("data-codex-frame-label", "Corrected · 300×200"),
      );
    const downloaded = page.waitForEvent("download");
    await page.locator("#board").evaluate((node) => node.exportFrame());
    const output = path.join(dir, "corrected.png");
    await (await downloaded).saveAs(output);
    assert.equal((await pngPixels(page, await fs.readFile(output))).width, 300);
    await page
      .locator("#board .asset")
      .evaluate((node) => (node.style.visibility = "hidden"));
    await assert.rejects(
      page.locator("#board").evaluate((node) => node.exportAll()),
      /visible frame/,
    );
  });
});

test("story image editing retains real uploaded bytes through late-created shadow slots and actual source-sidecar reloads", async (t) => {
  for (const source of [false, true]) {
    const { url, dir } = await fixture(
      t,
      `<instagram-story id="story" ${source ? "" : 'editable="session"'} image-src="${photo}"></instagram-story>`,
      { source },
    );
    await withPage(url, async (page) => {
      const png = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 50;
        canvas.height = 80;
        const context = canvas.getContext("2d");
        context.fillStyle = "#269d80";
        context.fillRect(0, 0, 50, 80);
        return canvas.toDataURL().split(",")[1];
      });
      await page
        .locator("instagram-story image-slot input[type=file]")
        .setInputFiles({
          name: "real.png",
          mimeType: "image/png",
          buffer: Buffer.from(png, "base64"),
        });
      await page.waitForFunction(() =>
        document
          .getElementById("story")
          .image.record()
          .u?.startsWith("data:image/"),
      );
      await page
        .locator("instagram-story")
        .evaluate((node) => node.image.store.settled());
      if (source) {
        const state = JSON.parse(
          await fs.readFile(path.join(dir, "image-slots.state.json"), "utf8"),
        );
        assert.ok(state["story-photo"].u.startsWith("data:image/"));
      }
      await page.reload();
      await page.evaluate(() => CodexSocialReady);
      assert.ok(
        await page
          .locator("instagram-story")
          .evaluate((node) => node.image.record().u?.startsWith("data:image/")),
      );
      assert.equal(
        await page.locator("instagram-story image-slot").getAttribute("id"),
        "story-photo",
      );
    });
  }
});

test("portable social runtime survives source removal and React conditional boards/posts keep authored node identity and events", async (t) => {
  const { url, dir, file } = await fixture(
    t,
    '<social-frame platform="instagram"><post-card author="Legacy author"><div class="asset">Original content</div></post-card></social-frame>',
  );
  await fs.writeFile(path.join(dir, "portable.html"), await inlineHtml(file));
  await fs.rm(path.join(dir, "app.js"));
  await withPage(url + "portable.html", async (page) => {
    assert.equal(
      await page.locator("post-card .name").innerText(),
      "Legacy author",
    );
    assert.equal(
      await page.locator("social-frame header").innerText(),
      "Instagram · local mockup",
    );
  });
  const entry = path.join(dir, "react.jsx");
  await fs.writeFile(
    entry,
    `import React from 'react';import{createRoot}from'react-dom/client';import ${JSON.stringify(path.join(root, "skills/studio-design/assets/starters/social.js"))};const root=createRoot(document.getElementById('app'));window.renderBoard=flag=>root.render(<social-frames id="board"><div><post-card name="Studio"><div className="asset" data-codex-frame-export="" data-codex-frame-label="One · 600×400"><input id="live" aria-label="React draft"/><button onClick={()=>window.clicked=(window.clicked||0)+1}>React action</button></div></post-card></div>{flag&&<div><div className="asset" data-codex-frame-export="" data-codex-frame-label="Two · 600×400"/></div>}</social-frames>);renderBoard(true);`,
  );
  await bundle(entry, path.join(dir, "react.js"));
  await fs.writeFile(
    path.join(dir, "react.html"),
    '<!doctype html><html lang="en"><head><title>React board</title><style>.asset{width:240px;height:160px}</style></head><body><div id="app"></div><script src="react.js"></script></body></html>',
  );
  await withPage(url + "react.html", async (page) => {
    await page.waitForFunction(
      () => document.getElementById("board")?.records.size === 2,
    );
    await page.getByLabel("React draft").fill("Retained");
    await page.evaluate(() => {
      window.original = document.getElementById("live");
      renderBoard(false);
    });
    await page.waitForFunction(
      () => document.getElementById("board").records.size === 1,
    );
    assert.equal(
      await page.evaluate(() => original === document.getElementById("live")),
      true,
    );
    await page
      .getByRole("button", { name: "React action", exact: true })
      .click();
    assert.equal(await page.evaluate(() => clicked), 1);
    await page.evaluate(() => renderBoard(true));
    await page.waitForFunction(
      () => document.getElementById("board").records.size === 2,
    );
    assert.equal(await page.getByLabel("React draft").inputValue(), "Retained");
  });
});

test("actual nominal snapshots retain authored before/after artwork and letterboxing does not add empty pixels to the interior", async (t) => {
  const { url, dir } = await fixture(
    t,
    '<style>.asset::before{content:"";position:absolute;inset:0 50% 0 0;background:#269d80}.asset::after{content:"";position:absolute;inset:0 0 0 50%;background:#365bcf}</style><social-frames id="board"><div><div class="asset" style="position:relative" data-codex-frame-export data-codex-frame-label="Generated shapes · 600×400"></div></div></social-frames>',
  );
  await withPage(url, async (page) => {
    const downloaded = page.waitForEvent("download");
    await page.locator("#board").evaluate((node) => node.exportFrame());
    const output = path.join(dir, "pseudo.png");
    await (await downloaded).saveAs(output);
    assert.deepEqual(await pngPixels(page, await fs.readFile(output)), {
      width: 600,
      height: 400,
      corners: [
        [38, 157, 128, 255],
        [54, 91, 207, 255],
      ],
    });
  });
});

test("story keeps persistence failures visible while its routine session notice stays outside the artwork", async (t) => {
  const { url } = await fixture(
    t,
    `<instagram-story id="story" editable="session" image-src="${photo}"></instagram-story>`,
  );
  await withPage(url, async (page) => {
    assert.equal(
      await page.locator("instagram-story image-slot .status").isVisible(),
      false,
    );
    await page
      .locator("instagram-story image-slot input[type=file]")
      .setInputFiles({
        name: "unsupported.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Not an image"),
      });
    await page.waitForFunction(
      () => !!document.getElementById("story").image.error,
    );
    assert.equal(
      await page.locator("instagram-story image-slot .status").isVisible(),
      true,
    );
    assert.match(
      await page.locator("instagram-story image-slot .message").innerText(),
      /image|PNG/i,
    );
  });
});

test("actual shadow-local font declarations survive portable snapshot export with their original font bytes", async (t) => {
  const { url, dir } = await fixture(t);
  const font = await fs.readFile(
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  );
  await fs.writeFile(path.join(dir, "face.ttf"), font);
  await fs.copyFile(
    path.join(root, "skills/studio-design/assets/starters/canvas-export.js"),
    path.join(dir, "capture.js"),
  );
  await withPage(url, async (page) => {
    const html = await page.evaluate(async () => {
      const face = new FontFace(
        "CaptureShadow",
        await (await fetch("face.ttf")).arrayBuffer(),
      );
      await face.load();
      document.fonts.add(face);
      class FontSample extends HTMLElement {
        constructor() {
          super();
          this.attachShadow({ mode: "open" }).innerHTML =
            '<style>@font-face{font-family:CaptureShadow;src:url("face.ttf")}div{font:40px CaptureShadow;color:#263c34;background:white;height:100%}</style><div>Wide words</div>';
        }
      }
      customElements.define("font-sample", FontSample);
      const node = document.createElement("font-sample");
      node.style.cssText = "display:block;width:300px;height:120px";
      document.body.append(node);
      await document.fonts.ready;
      const { exportRegion } = await import("./capture.js");
      return (await exportRegion(node, "html", { download: false })).text();
    });
    assert.ok(html.includes(font.toString("base64")));
    await fs.writeFile(path.join(dir, "font-snapshot.html"), html);
    await page.goto(url + "font-snapshot.html");
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      await page.evaluate(() => document.fonts.check("40px CaptureShadow")),
      true,
    );
    assert.equal(await page.locator("body").innerText(), "Wide words");
  });
});
