import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { temporary, root } from "./helpers.mjs";
import {
  compile,
  preview,
  importSystem,
} from "../packages/cli/src/commands/design-system.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { shadowCss } from "../packages/design-systems/src/review/review-data.mjs";
import { scriptBindings } from "../packages/design-systems/src/compiler/card-scripts.mjs";

async function fixture(t) {
  const directory = await temporary(t),
    source = path.join(directory, "aurora");
  await fs.mkdir(path.join(source, "cards"), { recursive: true });
  await fs.mkdir(path.join(source, "assets"));
  await fs.copyFile(
    path.join(
      root,
      "packages/runtime/src/browser/shared/fonts/inter-medium.woff2",
    ),
    path.join(source, "assets/font.woff2"),
  );
  await fs.writeFile(
    path.join(source, "README.md"),
    `# Aurora\n\nUse focused actions.\n\n## States\n\n| State | Purpose |\n| --- | --- |\n| Ready | Begin |\n\n${"A paragraph about deliberate visual choices.\n\n".repeat(18)}\n![Mark](assets/mark.svg)\n\n<script>throw new Error('Readme is prose')</script>`,
  );
  await fs.writeFile(
    path.join(source, "styles.css"),
    `@font-face{font-family:ReviewFont;src:url(assets/font.woff2)}:root{--accent:#255d9b}body{margin:0;font:20px ReviewFont;color:#122536;background:#eaf0f7}button{font:inherit;padding:8px 12px}*{box-sizing:border-box}`,
  );
  await fs.writeFile(
    path.join(source, "Widget.jsx"),
    `import React from 'react';if(typeof window==='undefined')throw new Error('Do not execute source');export function Widget(){return <span>A sample</span>}`,
  );
  await fs.writeFile(
    path.join(source, "cards/data.json"),
    '{"label":"Local data loaded"}',
  );
  await fs.writeFile(
    path.join(source, "assets/mark.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#255d9b"/></svg>',
  );
  for (const [index, name] of ["First", "Second"].entries()) {
    await fs.writeFile(
      path.join(source, `cards/${index}.html`),
      `<!-- @dsCard group="Actions" name="${name}" viewport="700x160" -->\n<!doctype html><html lang="en" class="theme"><head><title>${name}</title><meta name="codex-fixed-sheet" content="off"><link rel="stylesheet" href="../styles.css"><style>html.theme{--card-color:${index ? "#256c42" : "#a4334c"}}body{padding:20px}#value{color:var(--card-color)}[data-literal="html body :root"]:after{content:"body :root html"}.grow{height:480px;background:#bed4ee}@keyframes pulse{0%{opacity:0}100%{opacity:1}}</style></head><body><p id="value">${name} 0</p><button onclick="advance();return false">Advance ${name}</button><button onclick="grow()">Grow ${name}</button><p id="loaded"></p><img id="mark" alt="Fetched mark"><script>let count=0;var visits=0;window.cardName=${JSON.stringify(name)};document.body.dataset.owner=cardName;function advance(){count++;visits++;document.body.dataset.visits=String(visits);document.getElementById('value').textContent=cardName+' '+count}function grow(){const block=document.createElement('div');block.className='grow';block.textContent='Additional content';document.body.append(block)}document.addEventListener('DOMContentLoaded',()=>document.body.dataset.ready='yes');fetch('./data.json').then(r=>r.json()).then(data=>document.getElementById('loaded').textContent=data.label);fetch('../assets/mark.svg').then(r=>r.blob()).then(blob=>document.getElementById('mark').src=URL.createObjectURL(blob));</script><script>var visits;advance();window.check=()=>count;</script></body></html>`,
    );
  }
  await fs.writeFile(
    path.join(source, "cards/react.html"),
    `<!-- @dsCard group="Actions" name="React state" viewport="700x100" -->\n<!doctype html><html><head><meta name="codex-fixed-sheet" content="off"><link rel="stylesheet" href="../styles.css"><script src="../_ds_bundle.js"></script></head><body><div id="root"></div><script type="text/babel">function Sample(){const [count,setCount]=React.useState(0);return <button onClick={()=>setCount(count+1)}>React count {count}</button>}ReactDOM.createRoot(document.getElementById('root')).render(<Sample/>);</script></body></html>`,
  );
  const manifest = await compile(source);
  await preview(source);
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { directory, source, manifest, url };
}
const card = (page, name) => page.locator(`article[data-card-name="${name}"]`);
async function loaded(page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-review-host]")]
      .slice(0, 2)
      .every(
        (host) =>
          host.shadowRoot.querySelector("#loaded")?.textContent ===
          "Local data loaded",
      ),
  );
}

test("shadow CSS transformation preserves selector literals, host classes, conditions and keyframes", () => {
  const result = shadowCss(
    '@media(min-width:1px){@font-face{font-family:Face;src:url(data:font/woff2;base64,AA==)}html.theme body,:root{--x:red}}[title="html :root"]:after{content:"html :root"}@keyframes pulse{0%{opacity:0}}',
  );
  assert.match(result.css, /:host\(\.theme\) body,:host/);
  assert.match(
    shadowCss('html.theme[data-mode="dark"]:hover{color:red}').css,
    /:host\(\.theme\[data-mode="dark"\]:hover\)/,
  );
  assert.match(result.css, /\[title="html :root"\]/);
  assert.match(result.css, /content:"html :root"/);
  assert.match(result.css, /0%\{opacity:0\}/);
  assert.doesNotMatch(result.css, /font-face/);
  assert.match(result.fonts[0], /^@media\(min-width:1px\)\{@font-face/);
  assert.deepEqual(
    scriptBindings(
      "let {a,b:c}=value;const [d]=items;function advance(){let internal}if(true){var shared=2;let privateValue=3}",
    ).map((item) => item.name),
    ["a", "c", "d", "advance", "shared"],
  );
});

test("review isolates IDs, body styles, lexical script state and inline events while loading React once", async (t) => {
  const { url } = await fixture(t);
  await withPage(url + "aurora/preview.html", async (page) => {
    await loaded(page);
    assert.equal(await page.locator("iframe").count(), 0);
    for (const name of ["First", "Second"])
      assert.equal(
        await card(page, name).locator("#value").textContent(),
        name + " 1",
      );
    await card(page, "First")
      .getByRole("button", { name: "Advance First" })
      .click();
    assert.equal(
      await card(page, "First").locator("#value").textContent(),
      "First 2",
    );
    assert.equal(
      await card(page, "Second").locator("#value").textContent(),
      "Second 1",
    );
    assert.equal(
      await card(page, "First").locator("body").getAttribute("data-visits"),
      "2",
    );
    assert.equal(
      await card(page, "Second").locator("body").getAttribute("data-visits"),
      "1",
    );
    const states = await page
      .locator("[data-review-host]")
      .evaluateAll((hosts) =>
        hosts
          .slice(0, 2)
          .map((host) => ({
            owner: host.shadowRoot.querySelector("body").dataset.owner,
            ready: host.shadowRoot.querySelector("body").dataset.ready,
            color: getComputedStyle(host.shadowRoot.querySelector("#value"))
              .color,
            sheet: host.shadowRoot.adoptedStyleSheets[0],
          }))
          .map(({ sheet, ...item }) => item),
      );
    assert.deepEqual(states, [
      { owner: "First", ready: "yes", color: "rgb(164, 51, 76)" },
      { owner: "Second", ready: "yes", color: "rgb(37, 108, 66)" },
    ]);
    assert.equal(await page.evaluate(() => window.cardName), undefined);
    assert.equal(
      await page.evaluate(() => document.body.dataset.owner),
      undefined,
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelectorAll("[data-review-host]")[0].shadowRoot
            .adoptedStyleSheets[0] ===
          document.querySelectorAll("[data-review-host]")[1].shadowRoot
            .adoptedStyleSheets[0],
      ),
      true,
    );
    await card(page, "React state")
      .getByRole("button", { name: "React count 0" })
      .click();
    await card(page, "React state")
      .getByRole("button", { name: "React count 1" })
      .waitFor();
    assert.equal(
      await page.evaluate(() => document.fonts.check("20px ReviewFont")),
      true,
    );
    assert.equal(
      await page.evaluate(
        () =>
          [...document.scripts].filter((script) =>
            /^\/\* @codex-ds namespace=/.test(script.textContent),
          ).length,
      ),
      1,
    );
  });
});

test("review uses width-only scaling, grows after authored mutations and retains viewport media semantics", async (t) => {
  const { url } = await fixture(t);
  await withPage(
    url + "aurora/preview.html",
    async (page) => {
      await loaded(page);
      const metrics = () =>
        card(page, "First").evaluate((section) => {
          const host = section.querySelector("[data-review-host]"),
            view = section.querySelector(".review-viewport");
          return {
            scale: Number(host.dataset.scale),
            height: parseFloat(host.style.height),
            frame: section.querySelector(".review-frame").clientWidth,
            width: view.getBoundingClientRect().width,
            shown: view.getBoundingClientRect().height,
            body: getComputedStyle(host.shadowRoot.querySelector("body"))
              .fontFamily,
          };
        });
      const before = await metrics();
      assert.equal(before.scale, 1);
      await card(page, "First")
        .getByRole("button", { name: "Grow First" })
        .click();
      await page.waitForFunction(
        () =>
          parseFloat(
            document.querySelector(
              'article[data-card-name="First"] [data-review-host]',
            ).style.height,
          ) > 600,
      );
      const grown = await metrics();
      assert.ok(grown.height > before.height + 400);
      assert.equal(grown.scale, 1);
      await page.setViewportSize({ width: 390, height: 700 });
      await page.waitForFunction(
        () =>
          Number(
            document.querySelector(
              'article[data-card-name="First"] [data-review-host]',
            ).dataset.scale,
          ) < 0.5,
      );
      const narrow = await metrics();
      assert.ok(Math.abs(narrow.scale - narrow.frame / 700) < 0.002);
      assert.ok(
        Math.abs(narrow.shown - Math.ceil(narrow.height * narrow.scale)) < 1,
      );
      assert.ok(narrow.width <= narrow.frame + 1);
      assert.equal(narrow.height, grown.height);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.waitForFunction(
        () =>
          Number(
            document.querySelector(
              'article[data-card-name="First"] [data-review-host]',
            ).dataset.scale,
          ) === 1,
      );
      assert.equal((await metrics()).height, grown.height);
    },
    { width: 1600, height: 1000 },
  );
});

test("portable review and JSX cards retain local data, images and fonts after deleting both source and bound copies", async (t) => {
  const { directory, source, manifest, url } = await fixture(t),
    project = path.join(directory, "project");
  await importSystem(source, project);
  const copied = path.join(project, "_ds/aurora");
  await preview(copied);
  await fs.copyFile(
    path.join(copied, "preview.html"),
    path.join(directory, "portable.html"),
  );
  await fs.copyFile(
    path.join(
      copied,
      manifest.cards.find((item) => item.name === "React state").path,
    ),
    path.join(directory, "react.html"),
  );
  await fs.copyFile(
    path.join(
      copied,
      manifest.cards.find((item) => item.name === "First").path,
    ),
    path.join(directory, "classic.html"),
  );
  await fs.rm(source, { recursive: true });
  await fs.rm(project, { recursive: true });
  await withPage(url + "portable.html", async (page) => {
    await loaded(page);
    await card(page, "First")
      .getByRole("button", { name: "Advance First" })
      .click();
    assert.equal(
      await card(page, "First").locator("#value").textContent(),
      "First 2",
    );
    assert.equal(
      await page.evaluate(() => document.fonts.check("20px ReviewFont")),
      true,
    );
  });
  await withPage(url + "classic.html", async (page) => {
    await page.waitForFunction(
      () =>
        document.getElementById("loaded").textContent === "Local data loaded" &&
        document.getElementById("mark").naturalWidth > 0,
    );
    await page.getByRole("button", { name: "Advance First" }).click();
    assert.equal(await page.locator("#value").textContent(), "First 2");
    assert.equal(await page.locator("body").getAttribute("data-visits"), "2");
  });
  await withPage(url + "react.html", async (page) => {
    await page.getByRole("button", { name: "React count 0" }).click();
    await page.getByRole("button", { name: "React count 1" }).waitFor();
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(directory, "portable.html")).href);
    await page.evaluate(() => window.CodexSystemReviewReady);
    await loaded(page);
    await card(page, "Second")
      .getByRole("button", { name: "Advance Second" })
      .click();
    assert.equal(
      await card(page, "Second").locator("#value").textContent(),
      "Second 2",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("outline collapses and navigates cards, tracks the visible section and expands Markdown notes", async (t) => {
  const { url } = await fixture(t);
  await withPage(url + "aurora/preview.html", async (page) => {
    await page.getByRole("button", { name: "Show more" }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Show less" })
        .getAttribute("aria-expanded"),
      "true",
    );
    assert.ok(
      await page.locator(".review-readme").getByRole("table").isVisible(),
    );
    const toggle = page.getByRole("button", { name: "Actions", exact: true });
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(
      await page.getByRole("link", { name: "Second", exact: true }).isVisible(),
      false,
    );
    await toggle.click();
    await page.getByRole("link", { name: "Second", exact: true }).click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('nav a[href="#review-card-1"]')
          .getAttribute("aria-current") === "location",
    );
    assert.equal(await page.evaluate(() => location.hash), "#review-card-1");
  });
});

test("design-size review pixels match the same authored card rendered as a standalone page", async (t) => {
  const { directory, manifest, url } = await fixture(t);
  const buffers = [];
  await withPage(
    url + "aurora/" + manifest.cards.find((item) => item.name === "First").path,
    async (page) => {
      await page.waitForFunction(
        () => document.querySelector("#value").textContent === "First 1",
      );
      await page.waitForFunction(
        () =>
          document.getElementById("mark").complete &&
          document.getElementById("mark").naturalWidth > 0,
      );
      buffers.push(
        await page.screenshot({
          clip: { x: 0, y: 0, width: 700, height: 160 },
        }),
      );
    },
    { width: 700, height: 160 },
  );
  await withPage(
    url + "aurora/preview.html",
    async (page) => {
      await loaded(page);
      await page.waitForFunction(
        () =>
          document
            .querySelector("[data-review-host]")
            .shadowRoot.querySelector("#mark").naturalWidth > 0,
      );
      await card(page, "First")
        .locator("[data-review-host]")
        .scrollIntoViewIfNeeded();
      const bounds = await card(page, "First")
        .locator("[data-review-host]")
        .boundingBox();
      buffers.push(
        await page.screenshot({
          clip: { x: bounds.x, y: bounds.y, width: 700, height: 160 },
        }),
      );
    },
    { width: 1600, height: 1000 },
  );
  const pixels = [];
  for (const [index, buffer] of buffers.entries()) {
    const filename = path.join(directory, `pixels-${index}.png`);
    await fs.writeFile(filename, buffer);
    pixels.push(
      execFileSync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          filename,
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "pipe:1",
        ],
        { maxBuffer: 2 * 1024 * 1024 },
      ),
    );
  }
  let difference = 0;
  for (let index = 0; index < pixels[0].length; index++)
    difference += Math.abs(pixels[0][index] - pixels[1][index]);
  assert.ok(
    difference / pixels[0].length < 0.5,
    `Mean channel difference: ${difference / pixels[0].length}`,
  );
});

test("HTML-only systems transpile multiple JSX blocks without a manual component entry", async (t) => {
  const directory = await temporary(t),
    source = path.join(directory, "minimal");
  await fs.mkdir(source);
  await fs.writeFile(
    path.join(source, "styles.css"),
    "body{margin:0;font:16px system-ui}",
  );
  await fs.writeFile(
    path.join(source, "sample.html"),
    `<!-- @dsCard group="Examples" name="Independent JSX" viewport="700x120" -->\n<html><head><meta name="codex-fixed-sheet" content="off"></head><body><div id="first"></div><div id="second"></div><script type="text/babel">const label="A useful export label";ReactDOM.createRoot(document.getElementById('first')).render(<button>{label}</button>);</script><script type="text/tsx">const total:number=3;ReactDOM.createRoot(document.getElementById('second')).render(<span>Total {total}</span>);</script></body></html>`,
  );
  const manifest = await compile(source);
  assert.ok(manifest.bundle);
  assert.equal(manifest.components.length, 0);
  await preview(source);
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url + "minimal/preview.html", async (page) => {
    await page.getByRole("button", { name: "A useful export label" }).waitFor();
    assert.ok(await page.getByText("Total 3", { exact: true }).isVisible());
  });
  await withPage(url + "minimal/" + manifest.cards[0].path, async (page) => {
    await page.getByRole("button", { name: "A useful export label" }).waitFor();
    assert.ok(await page.getByText("Total 3", { exact: true }).isVisible());
  });
});

test("authored body load and readiness callbacks stay scoped; return-false events retain their browser behavior", async (t) => {
  const directory = await temporary(t),
    source = path.join(directory, "scope");
  await fs.mkdir(source);
  await fs.writeFile(
    path.join(source, "styles.css"),
    "body{margin:0}:root{--accent:red}@media(min-width:1000px){body{--wide:1}}@media(prefers-color-scheme:dark){p{font-weight:700}}",
  );
  await fs.writeFile(
    path.join(source, "sample.html"),
    `<!-- @dsCard group="Examples" name="Scoped callbacks" viewport="700x150" -->\n<html><head><title>Authored title</title><link rel="stylesheet" href="styles.css"></head><body onload="document.body.dataset.bodyLoad='yes'"><p id="state">Ready</p><a href="#escape" onclick="document.body.dataset.clicked='yes';return false">Stay here</a><script>document.title='Scoped title';document.addEventListener('readystatechange',function(event){document.body.dataset.readiness=event.type});window.onload=function(event){document.body.dataset.windowLoad=event.type};window.readyFacts=()=>({width:innerWidth,wide:matchMedia('(min-width:1000px)').matches,current:document.currentScript,body:document.querySelector('body')===document.body});document.addEventListener('DOMContentLoaded',()=>{document.body.dataset.facts=JSON.stringify(readyFacts());});</script></body></html>`,
  );
  await compile(source);
  await preview(source);
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(
    url + "scope/preview.html",
    async (page) => {
      const body = card(page, "Scoped callbacks").locator("body");
      assert.equal(await body.getAttribute("data-body-load"), "yes");
      assert.equal(await body.getAttribute("data-window-load"), "load");
      assert.equal(
        await body.getAttribute("data-readiness"),
        "readystatechange",
      );
      assert.deepEqual(JSON.parse(await body.getAttribute("data-facts")), {
        width: 700,
        wide: true,
        current: null,
        body: true,
      });
      await page.getByRole("link", { name: "Stay here" }).click();
      assert.equal(await body.getAttribute("data-clicked"), "yes");
      assert.equal(await page.evaluate(() => location.hash), "");
      assert.equal(await page.title(), "scope");
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(
        () =>
          getComputedStyle(
            document
              .querySelector("[data-review-host]")
              .shadowRoot.querySelector("#state"),
          ).fontWeight === "700",
      );
      assert.equal(
        await body.evaluate((node) => getComputedStyle(node).colorScheme),
        "light",
      );
      assert.equal(
        await card(page, "Scoped callbacks")
          .locator("#state")
          .evaluate((node) => getComputedStyle(node).fontWeight),
        "700",
      );
      await body.evaluate((node) => (node.style.colorScheme = "dark"));
      assert.equal(
        await body.evaluate((node) => getComputedStyle(node).colorScheme),
        "dark",
      );
    },
    { width: 1600, height: 1000 },
  );
});

test("runtime asset budget warnings remain visible and copied review data stays hash-verified", async (t) => {
  const { source, manifest, directory } = await fixture(t);
  await fs.writeFile(
    path.join(source, "cards/oversized.txt"),
    "a".repeat(3 * 1024 * 1024),
  );
  const next = await compile(source);
  await preview(source);
  const data = JSON.parse(
    await fs.readFile(path.join(source, next.review), "utf8"),
  );
  assert.ok(data.warnings.some((warning) => warning.includes("oversized.txt")));
  assert.equal(data.assets["cards/oversized.txt"], undefined);
  assert.ok(data.assets["cards/data.json"]);
  assert.ok(data.readme.includes("data:image/svg+xml;base64,"));
  assert.ok(next.artifacts[next.review]);
  assert.notEqual(
    next.artifacts[next.review],
    manifest.artifacts[manifest.review],
  );
  await fs.appendFile(path.join(source, next.review), " ");
  await assert.rejects(preview(source), /Stale compiled artifact/);
  await assert.rejects(
    importSystem(source, path.join(directory, "copy")),
    /Stale compiled artifact/,
  );
});

test("component starting points without HTML retain their section, dimensions, contract and live sample", async (t) => {
  const { source, url } = await fixture(t);
  await fs.writeFile(
    path.join(source, "Widget.d.ts"),
    '/** @startingPoint section="Layout" viewport="640x220" subtitle="A reusable layout" */\nexport interface WidgetProps { label?:string }',
  );
  const manifest = await compile(source);
  await preview(source);
  assert.equal(manifest.startingPoints[0].kind, "component");
  assert.equal(manifest.startingPoints[0].previewPath, null);
  const data = JSON.parse(
    await fs.readFile(path.join(source, manifest.review), "utf8"),
  );
  assert.equal(data.cards[0].group, "Layout");
  assert.equal(data.cards[0].width, 640);
  assert.equal(data.cards[0].height, 220);
  assert.equal(data.cards[0].component.contract.props[0].name, "label");
  await withPage(url + "aurora/preview.html", async (page) => {
    assert.ok(
      await page
        .getByRole("button", { name: "Layout", exact: true })
        .isVisible(),
    );
    const seed = page.locator("#review-card-0");
    assert.ok(await seed.getByText("A sample", { exact: true }).isVisible());
    await seed.getByText("Properties · 1", { exact: true }).click();
    assert.ok(await seed.getByText("label?", { exact: true }).isVisible());
  });
});
