import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { inlineHtml } from "../packages/exports/src/lib/inline.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";
const components = path.join(
  root,
  "packages/runtime/src/browser/platform-components.jsx",
);
async function fixture(t, html, entry) {
  const dir = await temporary(t);
  if (entry) {
    await fs.writeFile(path.join(dir, "app.jsx"), entry);
    await bundle(path.join(dir, "app.jsx"), path.join(dir, "app.js"));
  } else
    await bundle(
      path.join(root, "packages/runtime/src/browser/frames.js"),
      path.join(dir, "app.js"),
    );
  const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Platform contracts</title><style>body{margin:30px;font:15px system-ui}.narrow{display:flex;align-items:stretch;width:180px;height:1000px}.asset{height:160px;background:#cf362f}.long{height:2500px;background:linear-gradient(#cf362f,#365bcf)}</style></head><body>${html}<script src="app.js"></script></body></html>`;
  const file = path.join(dir, "index.html");
  await fs.writeFile(file, source);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url, dir, file };
}
const reactEntry = (name, initial = {}) =>
  `import React from 'react'; import {createRoot} from 'react-dom/client'; import * as P from ${JSON.stringify(components)}; const root=createRoot(document.getElementById('app')); const Component=P[${JSON.stringify(name)}]; window.renderPlatform=(props)=>root.render(<Component {...props}><div className="long"><input id="input" aria-label="Live input"/><button id="action" onClick={()=>window.clicked=(window.clicked||0)+1}>Live action</button><p>Authored content</p></div></Component>); window.renderPlatform(${JSON.stringify(initial)});`;
const box = (page, selector) =>
  page.locator(selector).evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    height: node.getBoundingClientRect().height,
  }));
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1, `${actual} != ${expected}`);

test("iOS and Android expose every composition primitive and preserve distinct fixed geometry, status, title, list and keyboard contracts", async (t) => {
  const { url } = await fixture(
    t,
    "<div id='app'></div>",
    `import React from 'react'; import {createRoot} from 'react-dom/client'; import * as P from ${JSON.stringify(components)}; window.api=P; createRoot(document.getElementById('app')).render(<><P.IOSDevice title="Settings"><P.IOSList header="Account"><P.IOSListRow title="Profile" detail="Private" icon="#007aff"/><P.IOSListRow title="About" chevron={false} isLast/></P.IOSList></P.IOSDevice><P.AndroidDevice title="Inbox" large><P.AndroidListItem headline="An essay" supporting="Saved today" leading="A"/></P.AndroidDevice></>);`,
  );
  await withPage(url, async (page) => {
    const names = [
      "IOSDevice",
      "IOSStatusBar",
      "IOSNavBar",
      "IOSGlassPill",
      "IOSList",
      "IOSListRow",
      "IOSKeyboard",
      "AndroidDevice",
      "AndroidStatusBar",
      "AndroidAppBar",
      "AndroidListItem",
      "AndroidNavBar",
      "AndroidKeyboard",
      "ChromeWindow",
      "ChromeTabBar",
      "ChromeToolbar",
      "ChromeTab",
      "ChromeTrafficLights",
      "MacWindow",
      "MacSidebar",
      "MacSidebarItem",
      "MacSidebarHeader",
      "MacToolbar",
      "MacGlass",
      "MacTrafficLights",
    ];
    assert.equal(
      await page.evaluate(
        (names) =>
          names.every(
            (name) =>
              typeof api[name] === "function" && window[name] === api[name],
          ),
        names,
      ),
      true,
    );
    assert.deepEqual(await box(page, '[data-codex-starter="ios-frame"]'), {
      width: 402,
      height: 874,
    });
    assert.deepEqual(await box(page, '[data-codex-starter="android-frame"]'), {
      width: 412,
      height: 892,
    });
    assert.equal(
      await page.locator('[data-part="ios-status"]').innerText(),
      "9:41",
    );
    assert.equal(
      await page.locator('[data-part="android-status"]').innerText(),
      "9:30",
    );
    assert.equal(
      await page.locator('[data-part="ios-navigation"]').innerText(),
      "•••\nSettings",
    );
    assert.equal(
      await page
        .locator('[data-part="ios-row"] [data-part="separator"]')
        .count(),
      1,
    );
    near(
      await page
        .locator('[data-part="ios-row"]')
        .first()
        .evaluate((node) => node.getBoundingClientRect().height),
      52,
    );
    assert.equal(
      await page.locator('[data-part="android-row"]').innerText(),
      "A\nAn essay\nSaved today",
    );
    near((await box(page, '[data-part="camera"]')).width, 24);
    near((await box(page, '[data-part="island"]')).width, 126);
  });
});
for (const [name, selector, width, height] of [
  ["IOSDevice", "ios-frame", 402, 874],
  ["AndroidDevice", "android-frame", 412, 892],
  ["ChromeWindow", "browser-window", 900, 600],
  ["MacWindow", "macos-window", 900, 600],
])
  test(`${name} supports real contained scroll, live inputs and prop changes without remounting authored content`, async (t) => {
    const { url } = await fixture(
      t,
      "<div id='app'></div>",
      reactEntry(name, { title: "Library" }),
    );
    await withPage(url, async (page) => {
      assert.deepEqual(await box(page, `[data-codex-starter="${selector}"]`), {
        width,
        height,
      });
      await page.locator("#input").fill("Retained draft");
      await page.locator("#action").click();
      assert.equal(await page.evaluate(() => window.clicked), 1);
      await page.evaluate(
        () => (window.original = document.getElementById("input")),
      );
      const content = page
        .locator(`[data-codex-starter="${selector}"] [data-part$="content"]`)
        .first();
      await content.evaluate((node) => (node.scrollTop = 700));
      assert.ok((await content.evaluate((node) => node.scrollTop)) > 500);
      await page.evaluate(() =>
        window.renderPlatform({
          title: "Updated",
          dark: true,
          keyboard: true,
          large: true,
          width: 760,
          height: 480,
          tabs: [{ title: "One" }, { title: "Two" }],
          activeIndex: 1,
          url: "local.example/two",
        }),
      );
      await page.waitForFunction(
        () =>
          document.querySelector("[data-codex-starter]").getBoundingClientRect()
            .width === 760,
      );
      assert.equal(
        await page.evaluate(
          () => original === document.getElementById("input"),
        ),
        true,
      );
      assert.equal(await page.locator("#input").inputValue(), "Retained draft");
      assert.deepEqual(await box(page, `[data-codex-starter="${selector}"]`), {
        width: 760,
        height: 480,
      });
      if (name.endsWith("Device")) {
        assert.equal(
          await page.getByLabel("Visual QWERTY keyboard").count(),
          1,
        );
        assert.ok(
          (await box(page, '[data-part="device-content"]')).height < 300,
        );
      }
      if (name === "ChromeWindow") {
        assert.equal(
          await page
            .locator('[data-part="chrome-tab"][data-active="true"]')
            .innerText(),
          "Two",
        );
        assert.equal(
          await page.locator('[data-part="chrome-toolbar"]').innerText(),
          "local.example/two",
        );
      }
      await page.evaluate(() =>
        window.renderPlatform({ width: 480, height: 760 }),
      );
      await page.waitForFunction(
        () =>
          document.querySelector("[data-codex-starter]").getBoundingClientRect()
            .height === 760,
      );
      assert.equal(await page.getByLabel("Visual QWERTY keyboard").count(), 0);
      if (name.endsWith("Device"))
        assert.equal(
          await page
            .locator('[data-part$="navigation"],[data-part="android-appbar"]')
            .count(),
          0,
        );
      assert.deepEqual(await box(page, `[data-codex-starter="${selector}"]`), {
        width: 480,
        height: 760,
      });
    });
  });

test("independent Mac sidebar/glass and Chrome tab primitives preserve authored labels, selection, radius, style and active state", async (t) => {
  const { url } = await fixture(
    t,
    "<div id='app'></div>",
    `import React from 'react'; import {createRoot} from 'react-dom/client'; import * as P from ${JSON.stringify(components)}; createRoot(document.getElementById('app')).render(<><P.MacWindow title="Notes" sidebar={<><P.MacSidebarHeader title="Saved"/><P.MacSidebarItem label="Library" selected/><P.MacSidebarItem label="Notes"/></>}><p>Workspace</p></P.MacWindow><P.MacGlass dark radius={18} style={{width:180,height:80}}><input aria-label="Glass input"/></P.MacGlass><P.IOSNavBar title="Only back" trailingIcon={false}/><P.IOSStatusBar dark time="12:08"/><P.ChromeTab title="Inactive"/><P.ChromeTab title="Active" active/></>);`,
  );
  await withPage(url, async (page) => {
    assert.equal(
      await page
        .locator('[data-part="mac-sidebar-item"][data-selected="true"]')
        .innerText(),
      "Library",
    );
    assert.ok(
      await page
        .locator('[data-part="mac-sidebar"]')
        .evaluate((node) =>
          getComputedStyle(node.firstElementChild).backdropFilter.includes(
            "50px",
          ),
        ),
    );
    await page.getByLabel("Glass input").fill("Real input");
    assert.equal(
      await page
        .getByLabel("Glass input")
        .evaluate(
          (node) =>
            getComputedStyle(node.parentElement.parentElement).borderRadius,
        ),
      "18px",
    );
    assert.equal(
      await page.locator('[data-part="ios-navigation"]').innerText(),
      "Only back",
    );
    assert.equal(
      await page.locator('[data-part="ios-status"]').innerText(),
      "12:08",
    );
    assert.equal(
      await page
        .locator('[data-part="ios-status"]')
        .evaluate((node) => getComputedStyle(node).color),
      "rgb(255, 255, 255)",
    );
    assert.equal(
      await page
        .locator('[data-part="chrome-tab"][data-active="true"] svg')
        .count(),
      2,
    );
    assert.equal(
      await page
        .locator('[data-part="chrome-tab"][data-active="false"] svg')
        .count(),
      0,
    );
  });
});

test("HTML shells remain physical in narrow stretching layouts and update text, color and dimensions inertly", async (t) => {
  const { url } = await fixture(
    t,
    `<div class="narrow"><ios-shell id="phone"><input id="phone-input" aria-label="Phone input"/></ios-shell><chrome-shell id="browser"><input id="browser-input" aria-label="Browser input"/></chrome-shell></div>`,
  );
  await withPage(url, async (page) => {
    assert.deepEqual(await box(page, "#phone"), { width: 428, height: 900 });
    near((await box(page, "#browser")).width, 780);
    assert.ok((await box(page, "#browser")).height < 150);
    await page.getByLabel("Phone input").fill("Content state");
    await page.getByLabel("Browser input").fill("Page state");
    await page.evaluate(() => {
      window.originalPhone = document.getElementById("phone-input");
      const phone = document.getElementById("phone"),
        browser = document.getElementById("browser");
      phone.setAttribute("width", "500");
      phone.setAttribute("screen-height", "700");
      phone.setAttribute("dark", "");
      browser.setAttribute("width", "640");
      browser.setAttribute("tab", "<img src=x onerror=alert(1)>");
      browser.setAttribute("url", "javascript:alert(1)");
      browser.setAttribute("fav", "#007aff");
    });
    assert.deepEqual(await box(page, "#phone"), { width: 500, height: 726 });
    near((await box(page, "#browser")).width, 640);
    assert.equal(
      await page.locator("#browser .cr-tab-title").innerText(),
      "<img src=x onerror=alert(1)>",
    );
    assert.equal(await page.locator("#browser .cr-tab-title img").count(), 0);
    assert.equal(
      await page
        .locator("#browser .cr-fav")
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      "rgb(0, 122, 255)",
    );
    assert.equal(
      await page
        .locator("#phone .ios-statusbar")
        .evaluate((node) => getComputedStyle(node).color),
      "rgb(255, 255, 255)",
    );
    assert.equal(
      await page.evaluate(
        () => originalPhone === document.getElementById("phone-input"),
      ),
      true,
    );
  });
});

test("asset-only distinguishes false, true and presence, preserves exact inner widths and hugs flowing iOS content with absolute-content fallback", async (t) => {
  const { url } = await fixture(
    t,
    `<ios-shell id="phone" image-only="false"><div class="asset"></div></ios-shell><ios-shell id="absolute" screen-height="600" image-only><div class="asset" style="position:absolute;inset:0;height:auto"></div></ios-shell><chrome-shell id="browser" image-only="false"><div class="asset"></div></chrome-shell>`,
  );
  await withPage(url, async (page) => {
    assert.deepEqual(await box(page, "#phone"), { width: 428, height: 900 });
    assert.deepEqual(await box(page, "#absolute"), { width: 402, height: 600 });
    await page
      .locator("#phone")
      .evaluate((node) => node.setAttribute("image-only", "true"));
    assert.deepEqual(await box(page, "#phone"), { width: 402, height: 160 });
    assert.equal(await page.locator("#phone .ios-island").isVisible(), false);
    await page
      .locator("#phone .asset")
      .evaluate((node) => (node.style.height = "280px"));
    await page.waitForFunction(
      () => document.getElementById("phone").offsetHeight === 280,
    );
    await page
      .locator("#browser")
      .evaluate((node) => node.setAttribute("image-only", ""));
    assert.deepEqual(await box(page, "#browser"), { width: 780, height: 160 });
    assert.equal(await page.locator("#browser .cr-top").isVisible(), false);
    await page
      .locator("#phone")
      .evaluate((node) => node.setAttribute("image-only", "false"));
    assert.deepEqual(await box(page, "#phone"), { width: 428, height: 900 });
    await page
      .locator("#browser")
      .evaluate((node) => node.setAttribute("image-only", "false"));
    assert.equal(await page.locator("#browser .cr-top").isVisible(), true);
  });
});

test("shell child events, React reconciliation, reconnect and independent cloned shell updates retain owned content", async (t) => {
  const { url } = await fixture(
    t,
    "<div id='app'></div>",
    `import React from 'react'; import {createRoot} from 'react-dom/client'; import ${JSON.stringify(path.join(root, "packages/runtime/src/browser/platform-shells.js"))}; const root=createRoot(document.getElementById('app')); window.renderShell=flag=>root.render(<ios-shell id="phone" image-only={String(flag)}><input id="live" aria-label="Live input"/><button onClick={()=>window.clicked=(window.clicked||0)+1}>Live action</button>{flag && <p id="dynamic">New content</p>}</ios-shell>); renderShell(false);`,
  );
  await withPage(url, async (page) => {
    await page.getByLabel("Live input").fill("Retained");
    await page.evaluate(() => {
      window.original = document.getElementById("live");
      renderShell(true);
    });
    await page.locator("#dynamic").waitFor();
    assert.equal(
      await page.evaluate(() => original === document.getElementById("live")),
      true,
    );
    await page.getByRole("button", { name: "Live action" }).click();
    assert.equal(await page.evaluate(() => window.clicked), 1);
    await page.evaluate(() => renderShell(false));
    await page.waitForFunction(() => !document.getElementById("dynamic"));
    await page.locator("#phone").evaluate((node) => {
      node.remove();
      document.body.append(node);
      const clone = node.cloneNode(true);
      clone.id = "clone";
      clone.querySelector("input").id = "cloned-input";
      clone.setAttribute("width", "600");
      document.body.append(clone);
      clone.setAttribute("image-only", "true");
    });
    near((await box(page, "#phone")).width, 428);
    near((await box(page, "#clone")).width, 574);
    assert.equal(await page.locator("#phone .ios-island").count(), 1);
    assert.equal(await page.locator("#clone .ios-island").count(), 1);
    assert.equal(await page.locator("#live").inputValue(), "Retained");
  });
});

test("composed phones remove physical clamps when a parent requests asset-only and restore them when the parent changes", async (t) => {
  const { url } = await fixture(
    t,
    `<div id="parent" style="width:260px" image-only="false"><ios-shell id="phone" data-composed-phone><div class="asset"></div></ios-shell></div>`,
  );
  await withPage(url, async (page) => {
    near((await box(page, "#phone")).width, 428);
    await page
      .locator("#parent")
      .evaluate((node) => node.setAttribute("image-only", "true"));
    await page.waitForFunction(
      () => document.getElementById("phone").offsetWidth === 260,
    );
    assert.deepEqual(await box(page, "#phone"), { width: 260, height: 160 });
    await page
      .locator("#parent")
      .evaluate((node) => node.removeAttribute("image-only"));
    await page.waitForFunction(
      () => document.getElementById("phone").offsetWidth === 428,
    );
    assert.deepEqual(await box(page, "#phone"), { width: 428, height: 900 });
  });
});

test("standalone shells survive source removal and actual PNG contains full unrounded asset pixels after chrome removal", async (t) => {
  const { url, dir, file } = await fixture(
    t,
    `<ios-shell id="phone" image-only><div class="asset"></div></ios-shell>`,
  );
  const portable = await inlineHtml(file);
  await fs.mkdir(path.join(dir, "portable"));
  await fs.writeFile(path.join(dir, "portable", "index.html"), portable);
  await fs.rm(path.join(dir, "app.js"));
  await withPage(url + "portable/", async (page) => {
    assert.deepEqual(await box(page, "#phone"), { width: 402, height: 160 });
    assert.equal(
      await page.locator("#phone [data-codex-chrome]").first().isVisible(),
      false,
    );
  });
  const output = path.join(dir, "asset.png");
  await exportArtifact("png", url + "portable/", output);
  const png = await fs.readFile(output);
  await withPage(url + "portable/", async (page) => {
    const colors = await page.evaluate(async (encoded) => {
      const image = new Image();
      image.src = "data:image/png;base64," + encoded;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return [
        [31, 31],
        [430, 188],
        [230, 70],
      ].map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
    }, png.toString("base64"));
    for (const color of colors) assert.deepEqual(color, [207, 54, 47, 255]);
  });
});

test("real native shell PNG and HTML downloads contain only the chosen asset at its nominal pixels with live field values", async (t) => {
  const { url, dir } = await fixture(
    t,
    `<ios-shell id="phone" label="Phone asset"><div class="asset" data-codex-frame-export data-codex-frame-label="Exact phone"><input id="field" aria-label="Asset field" value="Initial"></div></ios-shell><chrome-shell id="browser" label="Browser asset"><div class="asset" data-codex-frame-export></div></chrome-shell>`,
  );
  await withPage(url, async (page) => {
    await page.getByLabel("Asset field").fill("Current value");
    const htmlDownload = page.waitForEvent("download");
    await page.locator("#phone").evaluate((node) => node.exportAsset("html"));
    const html = await htmlDownload,
      htmlPath = path.join(dir, "asset.html");
    assert.equal(html.suggestedFilename(), "Exact-phone.html");
    await html.saveAs(htmlPath);
    const snapshot = await fs.readFile(htmlPath, "utf8");
    assert.ok(snapshot.includes("Current value"));
    assert.ok(!snapshot.includes("ios-island"));
    assert.ok(!snapshot.includes("9:41"));
    for (const [id, width] of [
      ["phone", 402],
      ["browser", 780],
    ]) {
      const download = page.waitForEvent("download");
      await page.locator("#" + id).evaluate((node) => node.exportAsset("png"));
      const output = path.join(dir, id + ".png");
      await (await download).saveAs(output);
      const pixels = await page.evaluate(
        async (encoded) => {
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
            corner: [
              ...context.getImageData(image.width - 1, image.height - 1, 1, 1)
                .data,
            ],
          };
        },
        (await fs.readFile(output)).toString("base64"),
      );
      assert.deepEqual(pixels, {
        width,
        height: 160,
        corner: [207, 54, 47, 255],
      });
    }
    assert.deepEqual(await box(page, "#phone"), { width: 428, height: 900 });
    assert.equal(await page.locator("#phone .ios-statusbar").isVisible(), true);
    await assert.rejects(
      page
        .locator("#phone")
        .evaluate((node) => node.exportAsset("png", document.body)),
      /authored content inside/,
    );
  });
});

test("shell capture settles a root image slot and excludes its editor and credit without changing the visible source", async (t) => {
  const source =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#365bcf"/></svg>',
    );
  const { url, dir, file } = await fixture(
    t,
    `<ios-shell id="phone"><image-slot id="image" data-codex-frame-export style="width:100px;height:100px" src="${source}" credit="Original studio study"></image-slot></ios-shell>`,
  );
  await bundle(
    path.join(root, "packages/runtime/src/browser/image-slot.js"),
    path.join(dir, "image.js"),
  );
  await fs.writeFile(
    file,
    (await fs.readFile(file, "utf8")).replace(
      "</body>",
      '<script src="image.js"></script></body>',
    ),
  );
  await withPage(url, async (page) => {
    assert.equal(await page.locator("#image .credit").isVisible(), true);
    const download = page.waitForEvent("download");
    await page.locator("#phone").evaluate((node) => node.exportAsset("html"));
    const html = path.join(dir, "image-snapshot.html");
    await (await download).saveAs(html);
    const snapshot = await fs.readFile(html, "utf8");
    const text = await page.evaluate(
      (source) =>
        new DOMParser().parseFromString(source, "text/html").body.textContent,
      snapshot,
    );
    assert.ok(!text.includes("Original studio study"));
    assert.ok(!text.includes("Reset image"));
    assert.ok(snapshot.includes("data:image/svg+xml"));
    assert.equal(await page.locator("#image .credit").isVisible(), true);
    const pngDownload = page.waitForEvent("download");
    await page.locator("#phone").evaluate((node) => node.exportAsset("png"));
    const png = path.join(dir, "image.png");
    await (await pngDownload).saveAs(png);
    const pixels = await page.evaluate(
      async (encoded) => {
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
          center: [...context.getImageData(50, 50, 1, 1).data],
        };
      },
      (await fs.readFile(png)).toString("base64"),
    );
    assert.deepEqual(pixels, {
      width: 100,
      height: 100,
      center: [54, 91, 207, 255],
    });
  });
});
