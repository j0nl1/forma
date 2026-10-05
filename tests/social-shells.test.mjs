import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../skills/forma/scripts/build.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";
import { inlineHtml } from "../skills/forma/scripts/lib/inline.mjs";
const starters = path.join(root, "skills/forma/assets/starters");
const photo =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="160"><rect width="90" height="160" fill="#365bcf"/></svg>',
  );
async function fixture(
  t,
  html,
  { source = false, standalone = false, entry = "social.js" } = {},
) {
  const dir = await temporary(t);
  await bundle(path.join(starters, entry), path.join(dir, "app.js"));
  const file = path.join(dir, "index.html");
  await fs.writeFile(
    file,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Social phone contracts</title><style>body{margin:0;background:#eee}input{width:130px}button{cursor:pointer}.author-overlay{position:absolute;top:60px;left:30px;z-index:45;color:white}</style></head><body>${html}<script src="app.js"></script></body></html>`,
  );
  if (standalone) {
    await fs.writeFile(path.join(dir, "portable.html"), await inlineHtml(file));
    await fs.rm(path.join(dir, "app.js"));
  }
  const { server, url } = await serve(
    dir,
    0,
    source ? { imageFile: "index.html" } : {},
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    dir,
    file,
    url: url + (standalone ? "portable.html" : "index.html"),
  };
}
const measure = (page, selector) =>
  page.locator(selector).evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    height: node.getBoundingClientRect().height,
  }));
const near = (value, expected) =>
  assert.ok(Math.abs(value - expected) < 0.1, `${value} != ${expected}`);
const attributes =
  'image-credit="Original test artwork" image-credit-href="https://example.com/creator"';
test("X post detail preserves all defaults, counts, literal attributes, media aspect and fixed phone size", async (t) => {
  const { url } = await fixture(
    t,
    `<x-shell id="post" image-src="${photo}" ${attributes}></x-shell>`,
  );
  await withPage(url, async (page) => {
    for (const [selector, value] of [
      [".name", "Your brand"],
      [".head .handle", "@yourbrand"],
      [".time", "9:41 AM · Today"],
      [".views", "12.4K"],
      [".replies", "88"],
      [".reposts", "340"],
      [".likes", "1.2K"],
    ])
      assert.equal(
        await page.locator("x-shell " + selector).innerText(),
        value,
      );
    assert.equal(await page.locator("x-shell .copy").isVisible(), false);
    assert.equal(await page.locator("x-shell .actions .action").count(), 5);
    assert.equal(await page.locator("x-shell .nav svg").count(), 4);
    assert.equal(
      await page.getByRole("button", { name: "Follow", exact: true }).count(),
      1,
    );
    assert.deepEqual(await measure(page, "x-shell ios-shell"), {
      width: 428,
      height: 900,
    });
    const wide = await measure(page, "x-shell [data-codex-frame-export]");
    near(wide.width, 368);
    near(wide.height, 207);
    assert.equal(
      await page
        .locator("x-shell [data-codex-frame-export]")
        .getAttribute("data-codex-frame-label"),
      "X post · 1200×675",
    );
    await page.locator("x-shell").evaluate((node) => {
      for (const [name, value] of Object.entries({
        name: "Studio",
        handle: "@studio",
        text: "<img src=x onerror=alert(1)>",
        time: "10:00 AM · Today",
        views: "0",
        replies: "3",
        reposts: "4",
        likes: "5",
        aspect: "square",
      }))
        node.setAttribute(name, value);
    });
    assert.equal(
      await page.locator("x-shell .copy").innerText(),
      "<img src=x onerror=alert(1)>",
    );
    assert.equal(await page.locator("x-shell .copy img").count(), 0);
    for (const [selector, value] of [
      [".name", "Studio"],
      [".head .handle", "@studio"],
      [".time", "10:00 AM · Today"],
      [".views", "0"],
      [".replies", "3"],
      [".reposts", "4"],
      [".likes", "5"],
    ])
      assert.equal(
        await page.locator("x-shell " + selector).innerText(),
        value,
      );
    assert.deepEqual(await measure(page, "x-shell [data-codex-frame-export]"), {
      width: 368,
      height: 368,
    });
    assert.deepEqual(await measure(page, "x-shell ios-shell"), {
      width: 428,
      height: 900,
    });
    await page
      .locator("x-shell")
      .evaluate((node) => node.setAttribute("aspect", "unknown"));
    near(
      (await measure(page, "x-shell [data-codex-frame-export]")).height,
      207,
    );
  });
});
test("Instagram feed preserves optional location/comments, leading username, trimmed literal caption and portrait geometry", async (t) => {
  const { url } = await fixture(
    t,
    `<instagram-shell id="post" image-src="${photo}" ${attributes}></instagram-shell>`,
  );
  await withPage(url, async (page) => {
    assert.equal(
      await page.locator("instagram-shell .username").innerText(),
      "yourbrand",
    );
    assert.equal(
      await page.locator("instagram-shell .caption b").innerText(),
      "yourbrand",
    );
    assert.equal(
      await page.locator("instagram-shell .likes").innerText(),
      "1,024 likes",
    );
    assert.equal(
      await page.locator("instagram-shell .time").textContent(),
      "2 hours ago",
    );
    assert.equal(
      await page.locator("instagram-shell .location").isVisible(),
      false,
    );
    assert.equal(
      await page.locator("instagram-shell .comments").isVisible(),
      false,
    );
    assert.equal(await page.locator("instagram-shell .actions svg").count(), 4);
    assert.equal(await page.locator("instagram-shell .nav svg").count(), 4);
    assert.deepEqual(
      await measure(page, "instagram-shell [data-codex-frame-export]"),
      {
        width: 402,
        height: 402,
      },
    );
    await page.locator("instagram-shell").evaluate((node) => {
      for (const [name, value] of Object.entries({
        username: "studio",
        location: "Reading room",
        caption: "   <b>Literal caption</b>",
        likes: "0 likes",
        comments: "View all 2 comments",
        time: "Yesterday",
        aspect: "portrait",
      }))
        node.setAttribute(name, value);
    });
    assert.equal(
      await page.locator("instagram-shell .caption b").innerText(),
      "studio",
    );
    assert.equal(
      await page.locator("instagram-shell .caption span").innerText(),
      "<b>Literal caption</b>",
    );
    assert.equal(
      await page.locator("instagram-shell .caption span b").count(),
      0,
    );
    for (const [selector, value] of [
      [".location", "Reading room"],
      [".likes", "0 likes"],
      [".comments", "View all 2 comments"],
      [".time", "Yesterday"],
    ])
      assert.equal(
        await page.locator("instagram-shell " + selector).textContent(),
        value,
      );
    assert.deepEqual(
      await measure(page, "instagram-shell [data-codex-frame-export]"),
      {
        width: 402,
        height: 502.5,
      },
    );
    assert.deepEqual(await measure(page, "instagram-shell ios-shell"), {
      width: 428,
      height: 900,
    });
    assert.equal(
      await page
        .locator("instagram-shell [data-codex-frame-export]")
        .getAttribute("data-codex-frame-label"),
      "Instagram portrait · 1080×1350",
    );
    assert.equal(
      await page
        .locator("instagram-shell .meta")
        .evaluate(
          (node) =>
            node.getBoundingClientRect().bottom <=
            node.parentElement.getBoundingClientRect().bottom,
        ),
      true,
    );
    await page.locator("instagram-shell").evaluate((node) => {
      node.setAttribute("aspect", "unknown");
      node.removeAttribute("location");
      node.removeAttribute("comments");
    });
    assert.equal(
      await page.locator("instagram-shell .comments").isVisible(),
      false,
    );
    near(
      (await measure(page, "instagram-shell [data-codex-frame-export]")).height,
      402,
    );
  });
});
test("TikTok viewer letterboxes the complete 9:16 canvas, all four counts and sound row while keeping navigation below it", async (t) => {
  const { url } = await fixture(
    t,
    `<tiktok-shell id="post" image-src="${photo}" ${attributes}></tiktok-shell>`,
  );
  await withPage(url, async (page) => {
    for (const [selector, value] of [
      [".username", "@yourbrand"],
      [".sound span", "Original sound · yourbrand"],
      [".likes", "24.5K"],
      [".comments", "482"],
      [".saves", "1,208"],
      [".shares", "3,407"],
    ])
      assert.equal(
        await page.locator("tiktok-shell " + selector).innerText(),
        value,
      );
    assert.equal(
      await page.locator("tiktok-shell .meta > .caption").isVisible(),
      false,
    );
    assert.deepEqual(
      await page.locator("tiktok-shell .tabs span").allTextContents(),
      ["Following", "For You"],
    );
    assert.deepEqual(
      await page.locator("tiktok-shell .nav-item").allTextContents(),
      ["Home", "Friends", "Inbox", "Profile"],
    );
    const geometry = await page.locator("tiktok-shell").evaluate((node) => {
      const screen = node.shadowRoot
          .querySelector(".screen")
          .getBoundingClientRect(),
        frame = node.frame.getBoundingClientRect(),
        nav = node.shadowRoot.querySelector(".nav").getBoundingClientRect();
      return {
        width: frame.width,
        height: frame.height,
        top: frame.top - screen.top,
        bottom: screen.bottom - frame.bottom,
        navGap: nav.top - frame.bottom,
        background: getComputedStyle(node.shadowRoot.querySelector(".screen"))
          .backgroundColor,
        dark: node.phone.hasAttribute("dark"),
      };
    });
    near(geometry.width, 402);
    near(geometry.height, 714.65625);
    near(geometry.top, geometry.bottom);
    assert.ok(geometry.navGap > 0);
    assert.equal(geometry.background, "rgb(0, 0, 0)");
    assert.equal(geometry.dark, true);
    await page.locator("tiktok-shell").evaluate((node) => {
      for (const [name, value] of Object.entries({
        username: "@studio",
        caption: "<a>Literal caption</a>",
        likes: "0",
        comments: "1",
        saves: "2",
        shares: "3",
      }))
        node.setAttribute(name, value);
    });
    assert.equal(
      await page.locator("tiktok-shell .username").innerText(),
      "@studio",
    );
    assert.equal(
      await page.locator("tiktok-shell .sound span").innerText(),
      "Original sound · studio",
    );
    assert.equal(
      await page.locator("tiktok-shell .meta > .caption").innerText(),
      "<a>Literal caption</a>",
    );
    assert.equal(
      await page.locator("tiktok-shell .meta > .caption a").count(),
      0,
    );
    for (const [name, value] of [
      ["likes", "0"],
      ["comments", "1"],
      ["saves", "2"],
      ["shares", "3"],
    ])
      assert.equal(
        await page.locator("tiktok-shell ." + name).innerText(),
        value,
      );
    await page
      .locator("tiktok-shell")
      .evaluate((node) => node.setAttribute("sound", "An original track"));
    assert.equal(
      await page.locator("tiktok-shell .sound span").innerText(),
      "An original track",
    );
  });
});
for (const tag of ["x-shell", "instagram-shell", "tiktok-shell"])
  test(`${tag} keeps author children, image state, explicit image-only semantics, width, credits, avatars and clone/reconnect lifecycle`, async (t) => {
    const { url } = await fixture(
      t,
      `<${tag} id="post" image-src="${photo}" ${attributes} editable="session"><div class="author-overlay"><input aria-label="Live overlay"><button id="action" onclick="window.clicked=(window.clicked||0)+1">Overlay action</button></div></${tag}>`,
    );
    await withPage(url, async (page) => {
      await page.getByLabel("Live overlay").fill("Retained input");
      await page
        .getByRole("button", { name: "Overlay action", exact: true })
        .click();
      await page.locator(tag).evaluate((node) => {
        window.original = node.querySelector("input");
        window.originalImage = node.image;
        node.setAttribute(
          "avatar-src",
          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
        );
      });
      assert.equal(
        await page.locator(tag).evaluate((node) => node.image.id),
        "post-photo",
      );
      assert.equal(
        await page
          .locator(tag)
          .evaluate((node) => node.image.getAttribute("credit")),
        "Original test artwork",
      );
      assert.equal(
        await page
          .locator(tag)
          .evaluate((node) => node.image.getAttribute("credit-href")),
        "https://example.com/creator",
      );
      assert.equal(
        await page
          .locator(tag + " .avatar")
          .first()
          .evaluate((node) =>
            getComputedStyle(node).backgroundImage.startsWith("url("),
          ),
        true,
      );
      for (const value of ["false", "", "true", "false"]) {
        await page
          .locator(tag)
          .evaluate(
            (node, value) => node.setAttribute("image-only", value),
            value,
          );
        const only = value !== "false";
        assert.equal(await page.locator(tag + " .nav").isVisible(), !only);
        const phone = await measure(page, tag + " ios-shell");
        near(phone.width, only ? 402 : 428);
        const frame = await measure(page, tag + " [data-codex-frame-export]");
        if (only) near(phone.height, frame.height);
        else near(phone.height, 900);
        assert.equal(
          await page
            .locator(tag)
            .evaluate(
              (node) =>
                node.image === originalImage &&
                node.querySelector("input") === original,
            ),
          true,
        );
        assert.equal(
          await page.getByLabel("Live overlay").inputValue(),
          "Retained input",
        );
      }
      await page.locator(tag).evaluate((node) => {
        node.setAttribute("width", "360");
        node.setAttribute("image-only", "true");
      });
      near((await measure(page, tag + " ios-shell")).width, 334);
      near(
        (await measure(page, tag + " [data-codex-frame-export]")).width,
        334,
      );
      await page.locator(tag).evaluate((node) => {
        node.setAttribute("image-only", "false");
        node.remove();
        document.body.prepend(node);
        node.removeAttribute("avatar-src");
      });
      near(
        (await measure(page, tag + " ios-shell")).height,
        Math.round((334 * 874) / 402) + 26,
      );
      assert.equal(
        await page.getByLabel("Live overlay").inputValue(),
        "Retained input",
      );
      assert.equal(
        await page
          .locator(tag + " .avatar")
          .first()
          .evaluate((node) =>
            getComputedStyle(node).backgroundImage.startsWith(
              "linear-gradient",
            ),
          ),
        true,
      );
      await page.locator(tag).evaluate((node) => {
        const clone = node.cloneNode(true);
        clone.id = "clone";
        document.body.append(clone);
      });
      assert.equal(
        await page.locator(tag + "#clone").evaluate((node) => node.image.id),
        "clone-photo",
      );
      assert.equal(await page.locator(tag + "#clone ios-shell").count(), 1);
      await page
        .locator(tag + "#post")
        .getByRole("button", { name: "Overlay action", exact: true })
        .click();
      assert.equal(await page.evaluate(() => clicked), 2);
      await page.locator(tag + "#post").evaluate((node) => {
        node.removeAttribute("image-credit");
        node.removeAttribute("image-credit-href");
        node.setAttribute("width", "invalid");
      });
      assert.equal(
        await page
          .locator(tag + "#post")
          .evaluate((node) => node.image.hasAttribute("credit")),
        false,
      );
      assert.deepEqual(await measure(page, tag + "#post ios-shell"), {
        width: 428,
        height: 900,
      });
    });
  });
test("a social board downloads real clean PNG/ZIP bytes for all shell aspects with stable artwork and bounded fractional-edge rendering", async (t) => {
  const { url } = await fixture(
    t,
    `<social-frames label="Phone campaign"><x-shell id="wide" image-src="${photo}"></x-shell><x-shell id="square-x" aspect="square" image-src="${photo}"></x-shell><instagram-shell id="square" image-src="${photo}"></instagram-shell><instagram-shell id="portrait" aspect="portrait" image-src="${photo}"></instagram-shell><tiktok-shell id="short" image-src="${photo}" caption="Viewer caption must not export"></tiktok-shell></social-frames>`,
  );
  await withPage(url, async (page) => {
    await page.waitForFunction(
      () => document.querySelector("social-frames").records.size === 5,
    );
    async function capture() {
      const pending = page.waitForEvent("download");
      await page.evaluate(() =>
        document.querySelector("social-frames").exportAll(),
      );
      const download = await pending;
      assert.equal(download.suggestedFilename(), "Phone-campaign.zip");
      return unzipSync(await fs.readFile(await download.path()));
    }
    const contextual = await capture();
    const expected = {
      "X-post.png": [1200, 675],
      "X-post-2.png": [1080, 1080],
      "Instagram-post.png": [1080, 1080],
      "Instagram-portrait.png": [1080, 1350],
      "TikTok.png": [1080, 1920],
    };
    assert.deepEqual(Object.keys(contextual), Object.keys(expected));
    for (const [name, bytes] of Object.entries(contextual)) {
      assert.deepEqual(
        [
          Buffer.from(bytes).readUInt32BE(16),
          Buffer.from(bytes).readUInt32BE(20),
        ],
        expected[name],
      );
      const pixels = await page.evaluate(async (encoded) => {
        const image = new Image();
        image.src = "data:image/png;base64," + encoded;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return [
          [20, 20],
          [image.width - 20, image.height - 20],
          [(image.width / 2) | 0, (image.height / 2) | 0],
        ].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
      }, Buffer.from(bytes).toString("base64"));
      assert.deepEqual(
        pixels,
        [
          [54, 91, 207, 255],
          [54, 91, 207, 255],
          [54, 91, 207, 255],
        ],
        name + " contains only image pixels",
      );
    }
    await page.evaluate(() =>
      document
        .querySelectorAll("x-shell,instagram-shell,tiktok-shell")
        .forEach((node) => node.setAttribute("image-only", "true")),
    );
    const bare = await capture();
    for (const name of Object.keys(contextual)) {
      const difference = await page.evaluate(
        async ([before, after]) => {
          async function pixels(encoded) {
            const image = new Image();
            image.src = "data:image/png;base64," + encoded;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0);
            return {
              width: image.width,
              height: image.height,
              data: ctx.getImageData(0, 0, image.width, image.height).data,
            };
          }
          const a = await pixels(before),
            b = await pixels(after);
          let count = 0,
            interior = 0;
          for (let offset = 0; offset < a.data.length; offset += 4)
            if (
              a.data
                .slice(offset, offset + 4)
                .some((value, i) => value !== b.data[offset + i])
            ) {
              count++;
              const y = Math.floor(offset / 4 / a.width);
              if (y < a.height - 1) interior++;
            }
          return { count, interior };
        },
        [
          Buffer.from(contextual[name]).toString("base64"),
          Buffer.from(bare[name]).toString("base64"),
        ],
      );
      assert.equal(
        difference.interior,
        0,
        name + " keeps interior artwork pixels",
      );
      // The fractional-height X snapshot has a known outer-row antialiasing gap.
      // Keep it bounded and explicit; this is not exact renderer parity.
      assert.ok(
        difference.count <= (name === "X-post.png" ? 1200 : 0),
        name + " only permits the documented outer-row difference",
      );
    }
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Download TikTok · 1080×1920 as PNG",
        exact: true,
      })
      .click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), "TikTok.png");
    assert.deepEqual(
      new Uint8Array(await fs.readFile(await download.path())),
      bare["TikTok.png"],
    );
  });
});
test("each individual classic loader works independently and portable social shells survive removal of runtime source", async (t) => {
  for (const tag of ["x-shell", "instagram-shell", "tiktok-shell"]) {
    const { url } = await fixture(
      t,
      `<${tag} image-src="${photo}"><span class="author-overlay">Original overlay</span></${tag}>`,
      { entry: tag + ".js", standalone: true },
    );
    await withPage(url, async (page) => {
      assert.deepEqual(await measure(page, tag + " ios-shell"), {
        width: 428,
        height: 900,
      });
      assert.equal(
        await page.locator(tag).evaluate((node) => node.image.value.src),
        photo,
      );
      assert.equal(await page.getByText("Original overlay").isVisible(), true);
    });
  }
});
test("all three phone editors save actual independent uploaded images in the source sidecar and restore them after reload", async (t) => {
  const tags = ["x-shell", "instagram-shell", "tiktok-shell"];
  const { url, dir } = await fixture(
    t,
    tags
      .map(
        (tag, index) =>
          `<${tag} id="phone-${index}" image-src="${photo}"></${tag}>`,
      )
      .join(""),
    { source: true },
  );
  await withPage(url, async (page) => {
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll("x-shell,instagram-shell,tiktok-shell"),
      ].every((shell) => shell.image.store.source),
    );
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 50;
      canvas.height = 80;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#269d80";
      ctx.fillRect(0, 0, 50, 80);
      return canvas.toDataURL().split(",")[1];
    });
    for (const tag of tags) {
      await page.locator(tag + " image-slot input[type=file]").setInputFiles({
        name: "upload.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      });
      await page.waitForFunction(
        (tag) =>
          document
            .querySelector(tag)
            .image.record()
            .u?.startsWith("data:image/"),
        tag,
      );
      // File ingestion is asynchronous: wait for the uploaded record before
      // awaiting its queued source write, rather than the previous idle state.
      await page.locator(tag).evaluate(async (shell) => {
        await shell.image.settled();
        await shell.image.store.settled();
      });
    }
    const saved = JSON.parse(
      await fs.readFile(path.join(dir, "image-slots.state.json"), "utf8"),
    );
    assert.deepEqual(Object.keys(saved).sort(), [
      "phone-0-photo",
      "phone-1-photo",
      "phone-2-photo",
    ]);
    for (const state of Object.values(saved))
      assert.ok(state.u.startsWith("data:image/"));
    await page.reload();
    await page.evaluate(() => CodexSocialReady);
    for (const tag of tags)
      assert.ok(
        await page
          .locator(tag)
          .evaluate((shell) =>
            shell.image.record().u?.startsWith("data:image/"),
          ),
      );
    assert.equal(
      await page
        .locator("x-shell")
        .evaluate((shell) => shell.image.store.source),
      true,
    );
  });
});
test("React conditional phone units and live aspect/copy changes retain author inputs, event handlers, editors and exact board ownership", async (t) => {
  const { url, dir } = await fixture(t, "<div id=app></div>");
  const entry = path.join(dir, "react.jsx");
  await fs.writeFile(
    entry,
    `import React from 'react';import{createRoot}from'react-dom/client';import ${JSON.stringify(path.join(starters, "social.js"))};const root=createRoot(document.getElementById('app'));window.renderPhones=(visible,aspect)=>root.render(<social-frames id="board"><x-shell id="react-x" name="Studio" aspect={aspect} text={visible?'First copy':'Updated copy'}><div className="author-overlay"><input id="retained" aria-label="React overlay"/><button onClick={()=>window.clicked=(window.clicked||0)+1}>React overlay action</button></div></x-shell>{visible&&<instagram-shell id="react-instagram"/>}<tiktok-shell id="react-short"/></social-frames>);renderPhones(true,'wide');`,
  );
  await bundle(entry, path.join(dir, "react.js"));
  await fs.writeFile(
    path.join(dir, "react.html"),
    '<html lang="en"><head><title>React phone board</title><style>.author-overlay{position:absolute;top:30px;left:20px;z-index:45}</style></head><body><div id="app"></div><script src="react.js"></script></body></html>',
  );
  await withPage(url.replace("index.html", "react.html"), async (page) => {
    await page.waitForFunction(
      () => document.getElementById("board")?.records.size === 3,
    );
    await page.getByLabel("React overlay").fill("Retained");
    await page.evaluate(() => {
      window.originalInput = document.getElementById("retained");
      window.originalImage = document.getElementById("react-x").image;
      renderPhones(false, "square");
    });
    await page.waitForFunction(
      () => document.getElementById("board").records.size === 2,
    );
    assert.equal(
      await page.locator("x-shell .copy").innerText(),
      "Updated copy",
    );
    assert.equal(
      await page
        .locator("x-shell [data-codex-frame-export]")
        .getAttribute("data-codex-frame-label"),
      "X post · 1080×1080",
    );
    await page
      .getByRole("button", { name: "React overlay action", exact: true })
      .click();
    assert.equal(await page.evaluate(() => clicked), 1);
    await page.evaluate(() => renderPhones(true, "wide"));
    await page.waitForFunction(
      () => document.getElementById("board").records.size === 3,
    );
    assert.equal(
      await page.getByLabel("React overlay").inputValue(),
      "Retained",
    );
    assert.equal(
      await page.evaluate(
        () =>
          originalInput === document.getElementById("retained") &&
          originalImage === document.getElementById("react-x").image,
      ),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => document.getElementById("board").frames().length,
      ),
      3,
    );
  });
});
