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
const starters = path.join(root, "skills/studio-design/assets/starters");
const photo =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="160"><rect width="90" height="160" fill="#365bcf"/></svg>',
  );
const tags = [
  "facebook-shell",
  "linkedin-shell",
  "pinterest-shell",
  "reddit-shell",
  "youtube-shell",
];
async function fixture(
  t,
  html,
  { source = false, entry = "social.js", portable = false, raw = false } = {},
) {
  const dir = await temporary(t),
    file = path.join(dir, "index.html");
  if (raw)
    await fs.cp(starters, path.join(dir, "starters"), { recursive: true });
  else await bundle(path.join(starters, entry), path.join(dir, "app.js"));
  await fs.writeFile(
    file,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Feed phone contracts</title><style>body{margin:0;background:#eee}.author-overlay{position:absolute;top:32px;left:24px;z-index:45}.author-overlay input{width:100px}.art{position:absolute;left:45%;top:45%;width:10%;height:10%;background:#269d80;pointer-events:none}</style></head><body>${html}<script src="${raw ? "starters/" + entry : "app.js"}"></script></body></html>`,
  );
  if (portable) {
    await fs.writeFile(path.join(dir, "portable.html"), await inlineHtml(file));
    await fs.rm(path.join(dir, "app.js"));
  }
  const { server, url } = await serve(
    dir,
    0,
    source ? { imageFile: "index.html" } : {},
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url: url + (portable ? "portable.html" : "index.html") };
}
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 0.1, `${actual} != ${expected}`);
const box = (page, selector) =>
  page.locator(selector).evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    height: node.getBoundingClientRect().height,
  }));
test("Facebook feed retains author/time/public icon, every count, reaction discs, three actions and both aspects", async (t) => {
  const { url } = await fixture(
    t,
    `<facebook-shell image-src="${photo}"></facebook-shell>`,
  );
  await withPage(url, async (page) => {
    for (const [selector, value] of [
      [".name", "Your brand"],
      [".time", "2h"],
      [".likes", "1.2K"],
      [".comments", "84 comments"],
      [".shares", "23 shares"],
    ])
      assert.equal(
        await page.locator("facebook-shell " + selector).innerText(),
        value,
      );
    assert.equal(
      await page.locator("facebook-shell .feed-title").innerText(),
      "Feed",
    );
    assert.equal(await page.locator("facebook-shell .copy").isVisible(), false);
    assert.equal(await page.locator("facebook-shell .sub svg").count(), 1);
    assert.equal(
      await page.locator("facebook-shell .reaction-disc").count(),
      2,
    );
    assert.deepEqual(
      await page.locator("facebook-shell .action").allTextContents(),
      ["Like", "Comment", "Share"],
    );
    assert.equal(await page.locator("facebook-shell .nav svg").count(), 5);
    const wide = await box(page, "facebook-shell [data-codex-frame-export]");
    near(wide.width, 402);
    near(wide.height, 211.046875);
    assert.equal(
      await page
        .locator("facebook-shell .screen")
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      "rgb(240, 242, 245)",
    );
    await page.locator("facebook-shell").evaluate((node) => {
      for (const [name, value] of Object.entries({
        name: "Studio",
        time: "Yesterday",
        text: "<strong>Literal post</strong>",
        likes: "0",
        comments: "2 comments",
        shares: "3 shares",
        aspect: "square",
      }))
        node.setAttribute(name, value);
    });
    for (const [selector, value] of [
      [".name", "Studio"],
      [".time", "Yesterday"],
      [".likes", "0"],
      [".comments", "2 comments"],
      [".shares", "3 shares"],
      [".copy", "<strong>Literal post</strong>"],
    ])
      assert.equal(
        await page.locator("facebook-shell " + selector).innerText(),
        value,
      );
    assert.equal(await page.locator("facebook-shell .copy strong").count(), 0);
    assert.deepEqual(
      await box(page, "facebook-shell [data-codex-frame-export]"),
      { width: 402, height: 402 },
    );
    assert.equal(
      await page
        .locator("facebook-shell [data-codex-frame-export]")
        .getAttribute("data-codex-frame-label"),
      "Facebook post · 1080×1080",
    );
    await page.locator("facebook-shell").evaluate((node) => {
      node.removeAttribute("text");
      node.setAttribute("aspect", "unknown");
    });
    assert.equal(await page.locator("facebook-shell .copy").isVisible(), false);
    assert.equal(
      await page
        .locator("facebook-shell [data-codex-frame-export]")
        .getAttribute("data-codex-frame-label"),
      "Facebook post · 1200×630",
    );
  });
});
test("LinkedIn preserves its own search/profile, headline, follow, four-action column layout and 1200×627 media", async (t) => {
  const { url } = await fixture(
    t,
    `<linkedin-shell image-src="${photo}"></linkedin-shell>`,
  );
  await withPage(url, async (page) => {
    for (const [selector, value] of [
      [".name", "Your brand"],
      [".time", "2h"],
      [".reactions", "847"],
      [".comments", "63 comments"],
      [".reposts", "12 reposts"],
    ])
      assert.equal(
        await page.locator("linkedin-shell " + selector).innerText(),
        value,
      );
    assert.equal(
      await page.locator("linkedin-shell .search").innerText(),
      "Search",
    );
    assert.equal(
      await page.locator("linkedin-shell .headline").textContent(),
      "",
    );
    assert.equal(
      await page.getByRole("button", { name: "Follow", exact: true }).count(),
      1,
    );
    assert.deepEqual(
      await page.locator("linkedin-shell .action").allTextContents(),
      ["Like", "Comment", "Repost", "Send"],
    );
    assert.equal(
      await page
        .locator("linkedin-shell .action")
        .first()
        .evaluate((node) => getComputedStyle(node).flexDirection),
      "column",
    );
    assert.equal(await page.locator("linkedin-shell .nav svg").count(), 5);
    near(
      (await box(page, "linkedin-shell [data-codex-frame-export]")).height,
      210.046875,
    );
    assert.equal(
      await page
        .locator("linkedin-shell [data-codex-frame-export]")
        .getAttribute("data-codex-frame-label"),
      "LinkedIn post · 1200×627",
    );
    await page.locator("linkedin-shell").evaluate((node) => {
      for (const [name, value] of Object.entries({
        name: "Studio",
        headline: "Independent design",
        time: "1h",
        text: "<a>Literal copy</a>",
        reactions: "0",
        comments: "1 comment",
        reposts: "2 reposts",
        aspect: "square",
      }))
        node.setAttribute(name, value);
    });
    for (const [selector, value] of [
      [".name", "Studio"],
      [".headline", "Independent design"],
      [".time", "1h"],
      [".copy", "<a>Literal copy</a>"],
      [".reactions", "0"],
      [".comments", "1 comment"],
      [".reposts", "2 reposts"],
    ])
      assert.equal(
        await page.locator("linkedin-shell " + selector).innerText(),
        value,
      );
    assert.equal(await page.locator("linkedin-shell .copy a").count(), 0);
    assert.deepEqual(
      await box(page, "linkedin-shell [data-codex-frame-export]"),
      { width: 402, height: 402 },
    );
    assert.equal(
      await page
        .locator("linkedin-shell [data-codex-frame-export]")
        .getAttribute("data-codex-frame-label"),
      "LinkedIn post · 1080×1080",
    );
    await page
      .locator("linkedin-shell")
      .evaluate((node) => node.setAttribute("aspect", "other"));
    assert.equal(
      await page
        .locator("linkedin-shell [data-codex-frame-export]")
        .getAttribute("data-codex-frame-label"),
      "LinkedIn post · 1200×627",
    );
  });
});
test("Pinterest preserves the 2:3 rounded pin, exact Save/Visit/share placement, optional title and follower row", async (t) => {
  const { url } = await fixture(
    t,
    `<pinterest-shell image-src="${photo}"></pinterest-shell>`,
  );
  await withPage(url, async (page) => {
    assert.equal(
      await page.locator("pinterest-shell .username").innerText(),
      "yourbrand",
    );
    assert.equal(
      await page.locator("pinterest-shell .followers").innerText(),
      "12k followers",
    );
    assert.equal(
      await page.locator("pinterest-shell .meta").isVisible(),
      false,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Visit site", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page.getByRole("button", { name: "Save", exact: true }).count(),
      1,
    );
    assert.equal(
      await page.getByRole("button", { name: "Follow", exact: true }).count(),
      1,
    );
    assert.equal(await page.locator("pinterest-shell .nav svg").count(), 4);
    assert.deepEqual(
      await box(page, "pinterest-shell [data-codex-frame-export]"),
      { width: 378, height: 567 },
    );
    assert.equal(
      await page
        .locator("pinterest-shell .pin-wrap")
        .evaluate((node) => getComputedStyle(node).borderRadius),
      "24px",
    );
    const placement = await page
      .locator("pinterest-shell")
      .evaluate((shell) => {
        const wrap = shell.shadowRoot
            .querySelector(".pin-wrap")
            .getBoundingClientRect(),
          save = shell.shadowRoot
            .querySelector(".save")
            .getBoundingClientRect(),
          visit = shell.shadowRoot
            .querySelector(".visit")
            .getBoundingClientRect(),
          share = shell.shadowRoot
            .querySelector(".share")
            .getBoundingClientRect();
        return {
          saveTop: save.top - wrap.top,
          saveRight: wrap.right - save.right,
          visitLeft: visit.left - wrap.left,
          visitBottom: wrap.bottom - visit.bottom,
          shareRight: wrap.right - share.right,
          shareBottom: wrap.bottom - share.bottom,
        };
      });
    for (const value of Object.values(placement)) near(value, 14);
    await page.locator("pinterest-shell").evaluate((node) => {
      node.setAttribute("title", "<b>Literal title</b>");
      node.setAttribute("username", "studio");
      node.setAttribute("followers", "0 followers");
      node.setAttribute("site", "Reading room");
    });
    assert.equal(
      await page.locator("pinterest-shell .pin-title").innerText(),
      "<b>Literal title</b>",
    );
    assert.equal(await page.locator("pinterest-shell .pin-title b").count(), 0);
    assert.equal(
      await page.locator("pinterest-shell .username").innerText(),
      "studio",
    );
    assert.equal(
      await page.locator("pinterest-shell .followers").innerText(),
      "0 followers",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Reading room", exact: true })
        .count(),
      1,
    );
    await page
      .locator("pinterest-shell")
      .evaluate((node) => node.removeAttribute("title"));
    assert.equal(
      await page.locator("pinterest-shell .meta").isVisible(),
      false,
    );
  });
});
test("Reddit post keeps both community labels, username/time, optional title, orange Join, votes and wide/square media", async (t) => {
  const { url } = await fixture(
    t,
    `<reddit-shell image-src="${photo}"></reddit-shell>`,
  );
  await withPage(url, async (page) => {
    for (const [selector, value] of [
      [".community-top", "r/yourcommunity"],
      [".community", "r/yourcommunity"],
      [".sub", "u/yourbrand · 5h"],
      [".upvotes", "1.2k"],
      [".comments", "84"],
    ])
      assert.equal(
        await page.locator("reddit-shell " + selector).innerText(),
        value,
      );
    assert.equal(
      await page.locator("reddit-shell .post-title").isVisible(),
      false,
    );
    assert.equal(
      await page.getByRole("button", { name: "Join", exact: true }).count(),
      1,
    );
    assert.equal(await page.locator("reddit-shell .chip svg").count(), 4);
    assert.equal(await page.locator("reddit-shell .nav svg").count(), 5);
    assert.equal(
      await page
        .locator("reddit-shell .join")
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      "rgb(255, 69, 0)",
    );
    near(
      (await box(page, "reddit-shell [data-codex-frame-export]")).height,
      226.125,
    );
    await page.locator("reddit-shell").evaluate((node) => {
      for (const [name, value] of Object.entries({
        community: "r/design",
        username: "u/studio",
        time: "1d",
        title: "<i>Literal title</i>",
        upvotes: "0",
        comments: "2",
        aspect: "square",
      }))
        node.setAttribute(name, value);
    });
    for (const [selector, value] of [
      [".community-top", "r/design"],
      [".community", "r/design"],
      [".sub", "u/studio · 1d"],
      [".post-title", "<i>Literal title</i>"],
      [".upvotes", "0"],
      [".comments", "2"],
    ])
      assert.equal(
        await page.locator("reddit-shell " + selector).innerText(),
        value,
      );
    assert.equal(await page.locator("reddit-shell .post-title i").count(), 0);
    assert.deepEqual(
      await box(page, "reddit-shell [data-codex-frame-export]"),
      { width: 402, height: 402 },
    );
    assert.equal(
      await page
        .locator("reddit-shell [data-codex-frame-export]")
        .getAttribute("data-codex-frame-label"),
      "Reddit post · 1080×1080",
    );
    await page.locator("reddit-shell").evaluate((node) => {
      node.setAttribute("aspect", "unknown");
      node.removeAttribute("title");
    });
    assert.equal(
      await page.locator("reddit-shell .post-title").isVisible(),
      false,
    );
    assert.equal(
      await page
        .locator("reddit-shell [data-codex-frame-export]")
        .getAttribute("data-codex-frame-label"),
      "Reddit post · 1200×675",
    );
  });
});
test("YouTube retains home/filter chips, complete thumbnail/title/channel metadata and export-hidden duration without inventing playback", async (t) => {
  const { url } = await fixture(
    t,
    `<youtube-shell image-src="${photo}"></youtube-shell>`,
  );
  await withPage(url, async (page) => {
    for (const [selector, value] of [
      [".video-title", "Your video title"],
      [".channel", "Your brand"],
      [".views", "12K views"],
      [".time", "2 days ago"],
      [".duration", "3:12"],
    ])
      assert.equal(
        await page.locator("youtube-shell " + selector).innerText(),
        value,
      );
    assert.deepEqual(
      await page.locator("youtube-shell .chip").allTextContents(),
      ["All", "Music", "Live", "Gaming"],
    );
    assert.equal(
      await page.locator("youtube-shell .chip.active").innerText(),
      "All",
    );
    assert.equal(await page.locator("youtube-shell .top svg").count(), 3);
    assert.equal(await page.locator("youtube-shell .nav svg").count(), 5);
    assert.equal(await page.locator("youtube-shell video").count(), 0);
    assert.equal(
      await page
        .locator("youtube-shell .duration")
        .getAttribute("data-codex-chrome"),
      "",
    );
    near(
      (await box(page, "youtube-shell [data-codex-frame-export]")).height,
      226.125,
    );
    assert.equal(
      await page
        .locator("youtube-shell [data-codex-frame-export]")
        .getAttribute("data-codex-frame-label"),
      "YouTube thumbnail · 1280×720",
    );
    await page.locator("youtube-shell").evaluate((node) => {
      for (const [name, value] of Object.entries({
        title: "<img src=x>",
        channel: "Studio",
        views: "0 views",
        time: "Today",
        duration: "12:34",
      }))
        node.setAttribute(name, value);
    });
    for (const [selector, value] of [
      [".video-title", "<img src=x>"],
      [".channel", "Studio"],
      [".views", "0 views"],
      [".time", "Today"],
      [".duration", "12:34"],
    ])
      assert.equal(
        await page.locator("youtube-shell " + selector).innerText(),
        value,
      );
    assert.equal(
      await page.locator("youtube-shell .video-title img").count(),
      0,
    );
  });
});
for (const tag of tags)
  test(`${tag} retains editable author children, stable frame/image identity, credits, explicit image-only states and reconnect/clones`, async (t) => {
    const { url } = await fixture(
      t,
      `<${tag} id="post" image-src="${photo}" image-credit="Original test artwork" image-credit-href="https://example.com/creator" editable="session"><div class="author-overlay"><input aria-label="Overlay draft"><button onclick="window.clicked=(window.clicked||0)+1">Overlay action</button></div></${tag}>`,
    );
    await withPage(url, async (page) => {
      await page.getByLabel("Overlay draft").fill("Retained");
      await page.locator(tag).evaluate((node) => {
        window.original = node.querySelector("input");
        window.originalImage = node.image;
        window.originalFrame = node.frame;
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
      for (const value of ["false", "", "true", "false"]) {
        await page
          .locator(tag)
          .evaluate(
            (node, value) => node.setAttribute("image-only", value),
            value,
          );
        const only = value !== "false",
          phone = await box(page, tag + " ios-shell"),
          frame = await box(page, tag + " [data-codex-frame-export]");
        near(phone.width, only ? 402 : 428);
        if (only) near(phone.height, frame.height);
        else near(phone.height, 900);
        assert.equal(await page.locator(tag + " .nav").isVisible(), !only);
        assert.equal(
          await page
            .locator(tag)
            .evaluate(
              (node) =>
                node.frame === originalFrame &&
                node.image === originalImage &&
                node.querySelector("input") === original,
            ),
          true,
        );
        assert.equal(
          await page.getByLabel("Overlay draft").inputValue(),
          "Retained",
        );
        if (tag === "pinterest-shell") {
          assert.equal(await page.locator(tag + " .save").isVisible(), !only);
          assert.equal(await page.locator(tag + " .visit").isVisible(), !only);
        }
        if (tag === "youtube-shell")
          assert.equal(
            await page.locator(tag + " .duration").isVisible(),
            !only,
          );
      }
      await page.locator(tag).evaluate((node) => {
        node.setAttribute("width", "360");
        node.setAttribute("image-only", "true");
      });
      near((await box(page, tag + " ios-shell")).width, 334);
      near((await box(page, tag + " [data-codex-frame-export]")).width, 334);
      await page.locator(tag).evaluate((node) => {
        node.setAttribute("image-only", "false");
        node.remove();
        document.body.prepend(node);
      });
      near(
        (await box(page, tag + " ios-shell")).height,
        Math.round((334 * 874) / 402) + 26,
      );
      await page
        .getByRole("button", { name: "Overlay action", exact: true })
        .click();
      assert.equal(await page.evaluate(() => clicked), 1);
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
      await page.locator(tag + "#post").evaluate((node) => {
        node.setAttribute("width", "invalid");
        node.removeAttribute("image-credit");
        node.removeAttribute("image-credit-href");
      });
      assert.deepEqual(await box(page, tag + "#post ios-shell"), {
        width: 428,
        height: 900,
      });
      assert.equal(
        await page
          .locator(tag + "#post")
          .evaluate((node) => node.image.hasAttribute("credit")),
        false,
      );
    });
  });
test("Facebook/LinkedIn/YouTube avatars use safe live URLs while LinkedIn's search profile stays neutral", async (t) => {
  const selected = ["facebook-shell", "linkedin-shell", "youtube-shell"];
  const { url } = await fixture(
    t,
    selected.map((tag) => `<${tag} image-src="${photo}"></${tag}>`).join(""),
  );
  await withPage(url, async (page) => {
    await page.route(
      (url) => url.pathname.startsWith("/x"),
      (route) =>
        route.fulfill({
          contentType: "image/svg+xml",
          body: decodeURIComponent(photo.split(",")[1]),
        }),
    );
    for (const tag of selected) {
      await page
        .locator(tag)
        .evaluate((node) =>
          node.setAttribute("avatar-src", 'x");background:red;/*'),
        );
      assert.equal(
        await page
          .locator(tag + " .avatar")
          .evaluate((node) => node.style.backgroundColor),
        "",
      );
      await page
        .locator(tag)
        .evaluate(
          (node, photo) => node.setAttribute("avatar-src", photo),
          photo,
        );
      assert.ok(
        (
          await page
            .locator(tag + " .avatar")
            .evaluate((node) => getComputedStyle(node).backgroundImage)
        ).startsWith("url("),
      );
      await page
        .locator(tag)
        .evaluate((node) => node.removeAttribute("avatar-src"));
      assert.ok(
        (
          await page
            .locator(tag + " .avatar")
            .evaluate((node) => getComputedStyle(node).backgroundImage)
        ).startsWith("linear-gradient"),
      );
    }
    assert.ok(
      (
        await page
          .locator("linkedin-shell .profile-disc")
          .evaluate((node) => getComputedStyle(node).backgroundImage)
      ).startsWith("linear-gradient"),
    );
  });
});
test("every feed aspect downloads real nominal PNGs and a ZIP with viewer buttons/duration omitted and author artwork retained", async (t) => {
  const formats = [
    ["facebook-shell", "", "Facebook-post.png", 1200, 630],
    ["facebook-shell", "square", "Facebook-post-2.png", 1080, 1080],
    ["linkedin-shell", "", "LinkedIn-post.png", 1200, 627],
    ["linkedin-shell", "square", "LinkedIn-post-2.png", 1080, 1080],
    ["pinterest-shell", "", "Pinterest-pin.png", 1000, 1500],
    ["reddit-shell", "", "Reddit-post.png", 1200, 675],
    ["reddit-shell", "square", "Reddit-post-2.png", 1080, 1080],
    ["youtube-shell", "", "YouTube-thumbnail.png", 1280, 720],
  ];
  const { url } = await fixture(
    t,
    '<social-frames label="Feed campaign">' +
      formats
        .map(
          ([tag, aspect], index) =>
            `<${tag} id="format-${index}" aspect="${aspect}" image-src="${photo}" duration="THIS MUST NOT EXPORT"><span class="art"></span></${tag}>`,
        )
        .join("") +
      "</social-frames>",
  );
  await withPage(url, async (page) => {
    await page.waitForFunction(
      () => document.querySelector("social-frames").records.size === 8,
    );
    const pending = page.waitForEvent("download");
    await page.evaluate(() =>
      document.querySelector("social-frames").exportAll(),
    );
    const download = await pending;
    assert.equal(download.suggestedFilename(), "Feed-campaign.zip");
    const files = unzipSync(await fs.readFile(await download.path()));
    assert.deepEqual(
      Object.keys(files),
      formats.map((row) => row[2]),
    );
    for (const [tag, aspect, name, width, height] of formats) {
      const bytes = Buffer.from(files[name]);
      assert.equal(bytes.readUInt32BE(16), width);
      assert.equal(bytes.readUInt32BE(20), height);
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
          [30, 30],
          [image.width - 30, image.height - 30],
          [(image.width / 2) | 0, (image.height / 2) | 0],
        ].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
      }, bytes.toString("base64"));
      assert.deepEqual(
        pixels,
        [
          [54, 91, 207, 255],
          [54, 91, 207, 255],
          [38, 157, 128, 255],
        ],
        name + " keeps authored artwork without viewer decoration",
      );
    }
    await page.evaluate(() =>
      document
        .querySelectorAll(
          "facebook-shell,linkedin-shell,pinterest-shell,reddit-shell,youtube-shell",
        )
        .forEach((node) => node.setAttribute("image-only", "true")),
    );
    const single = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Download YouTube thumbnail · 1280×720 as PNG",
        exact: true,
      })
      .click();
    const result = await single;
    assert.equal(result.suggestedFilename(), "YouTube-thumbnail.png");
    assert.deepEqual(
      new Uint8Array(await fs.readFile(await result.path())),
      files["YouTube-thumbnail.png"],
    );
  });
});
test("all five independent classic loaders and portable bundles work without a host or surviving runtime source", async (t) => {
  for (const tag of tags) {
    for (const raw of [true, false]) {
      const { url } = await fixture(
        t,
        `<${tag} image-src="${photo}"><span class="author-overlay">Original overlay</span></${tag}>`,
        { entry: tag + ".js", raw, portable: !raw },
      );
      await withPage(url, async (page) => {
        assert.deepEqual(await box(page, tag + " ios-shell"), {
          width: 428,
          height: 900,
        });
        assert.equal(
          await page.locator(tag).evaluate((node) => node.image.value.src),
          photo,
        );
        assert.equal(
          await page.getByText("Original overlay").isVisible(),
          true,
        );
      });
    }
  }
});
test("five separate uploaded feed images are saved in the actual source sidecar and restored on reload", async (t) => {
  const { url, dir } = await fixture(
    t,
    tags
      .map(
        (tag, index) =>
          `<${tag} id="feed-${index}" image-src="${photo}"></${tag}>`,
      )
      .join(""),
    { source: true },
  );
  await withPage(url, async (page) => {
    await page.waitForFunction(
      () => document.querySelector("facebook-shell").image.store.source,
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
        name: "real.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      });
      await page.locator(tag).evaluate(async (shell) => {
        await shell.image.settled();
        await shell.image.store.settled();
      });
      await page.waitForFunction(
        (tag) =>
          document
            .querySelector(tag)
            .image.record()
            .u?.startsWith("data:image/"),
        tag,
      );
    }
    const saved = JSON.parse(
      await fs.readFile(path.join(dir, "image-slots.state.json"), "utf8"),
    );
    assert.deepEqual(
      Object.keys(saved).sort(),
      tags.map((_, index) => `feed-${index}-photo`),
    );
    for (const state of Object.values(saved))
      assert.ok(state.u.startsWith("data:image/"));
    await page.reload();
    await page.evaluate(() => CodexSocialReady);
    for (const tag of tags)
      assert.ok(
        await page
          .locator(tag)
          .evaluate((node) => node.image.record().u?.startsWith("data:image/")),
      );
  });
});
test("React conditionals and native title/copy bindings keep five authored phone editors and their event/input identities", async (t) => {
  const { url, dir } = await fixture(t, '<div id="app"></div>');
  const entry = path.join(dir, "react.jsx");
  await fs.writeFile(
    entry,
    `import React from 'react';import{createRoot}from'react-dom/client';import ${JSON.stringify(path.join(starters, "social.js"))};const root=createRoot(document.getElementById('app'));const tags=${JSON.stringify(tags)};window.renderFeeds=visible=>root.render(<social-frames id="board">{tags.filter(tag=>visible||tag!=='pinterest-shell').map(tag=>React.createElement(tag,{key:tag,id:tag,text:visible?'Original copy':'Updated copy',title:visible?'Original title':'Updated title',aspect:visible?'wide':'square'},React.createElement('div',{className:'author-overlay'},React.createElement('input',{id:tag+'-input','aria-label':tag+' draft'}),React.createElement('button',{onClick:()=>window.clicked=(window.clicked||0)+1},tag+' action'))))}</social-frames>);renderFeeds(true);`,
  );
  await bundle(entry, path.join(dir, "react.js"));
  await fs.writeFile(
    path.join(dir, "react.html"),
    '<html lang="en"><head><title>React feeds</title><style>.author-overlay{position:absolute;top:30px;left:20px;z-index:45}</style></head><body><div id="app"></div><script src="react.js"></script></body></html>',
  );
  await withPage(url.replace("index.html", "react.html"), async (page) => {
    await page.waitForFunction(
      () => document.getElementById("board")?.records.size === 5,
    );
    for (const tag of tags)
      await page.getByLabel(tag + " draft").fill("Retained " + tag);
    await page.evaluate(() => {
      window.originalInput = document.getElementById("facebook-shell-input");
      window.originalImage = document.getElementById("facebook-shell").image;
      renderFeeds(false);
    });
    await page.waitForFunction(
      () => document.getElementById("board").records.size === 4,
    );
    assert.equal(
      await page.locator("facebook-shell .copy").innerText(),
      "Updated copy",
    );
    assert.equal(
      await page.locator("linkedin-shell .copy").innerText(),
      "Updated copy",
    );
    assert.equal(
      await page.locator("reddit-shell .post-title").innerText(),
      "Updated title",
    );
    assert.equal(
      await page.locator("youtube-shell .video-title").innerText(),
      "Updated title",
    );
    for (const tag of ["facebook-shell", "linkedin-shell", "reddit-shell"])
      assert.ok(
        (
          await page
            .locator(tag + " [data-codex-frame-export]")
            .getAttribute("data-codex-frame-label")
        ).endsWith("1080×1080"),
      );
    await page
      .getByRole("button", { name: "facebook-shell action", exact: true })
      .click();
    assert.equal(await page.evaluate(() => clicked), 1);
    await page.evaluate(() => renderFeeds(true));
    await page.waitForFunction(
      () => document.getElementById("board").records.size === 5,
    );
    for (const tag of tags.filter((tag) => tag !== "pinterest-shell"))
      assert.equal(
        await page.getByLabel(tag + " draft").inputValue(),
        "Retained " + tag,
      );
    assert.equal(
      await page.evaluate(
        () =>
          originalInput === document.getElementById("facebook-shell-input") &&
          originalImage === document.getElementById("facebook-shell").image,
      ),
      true,
    );
  });
});
