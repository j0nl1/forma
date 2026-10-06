import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { temporary, root } from "./helpers.mjs";
import {
  inspect,
  compile,
  preview,
  importSystem,
} from "../packages/cli/src/commands/design-system.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import {
  cssVariables,
  resolveTokens,
  splitCSS,
} from "../packages/exports/src/lib/system-css-values.mjs";
import { fontFamilies } from "../packages/exports/src/lib/system-font-metadata.mjs";

async function fingerprint(directory) {
  const result = {};
  async function visit(folder) {
    for (const item of await fs.readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, item.name);
      if (item.isDirectory()) await visit(file);
      else
        result[path.relative(directory, file)] = await fs.readFile(
          file,
          "utf8",
        );
    }
  }
  await visit(directory);
  return result;
}
async function fixture(t) {
  const directory = await temporary(t),
    source = path.join(directory, "atlas");
  await fs.mkdir(path.join(source, "tokens"), { recursive: true });
  await fs.mkdir(path.join(source, "assets"));
  await fs.copyFile(
    path.join(root, "packages/runtime/src/browser/fonts/inter-medium.woff2"),
    path.join(source, "assets/Atlas font.woff2"),
  );
  await fs.writeFile(
    path.join(source, "README.md"),
    "# Atlas\n\nUse the local brand face and clear token roles.",
  );
  await fs.writeFile(
    path.join(source, "tokens/base.css"),
    `:root{--base:#315d9a;--gap:12px;--radius:8px; /* @kind radius */
--shadow:0 4px 12px rgba(0,0,0,.2);--family:'Atlas Sans',sans-serif; /* @kind font */
--fontFamilyBrand:'Missing Brand',serif; /* @kind font */
--font-size:18px;--ease:cubic-bezier(.2,0,.2,1); /* @kind other */
--z:7;--quoted:"var(--unrelated)"; /* @kind other */}`,
  );
  await fs.writeFile(
    path.join(source, "tokens/faces.css"),
    `@font-face{font-family:'Atlas Sans';src:url('../assets/Atlas font.woff2') format('woff2');font-weight:500;font-style:normal;font-display:swap;unicode-range:U+0000-00FF}`,
  );
  await fs.writeFile(
    path.join(source, "styles.css"),
    `@import "tokens/base.css";\n@import url("tokens/faces.css") screen;\n:root{--accent:var(--base);--fallback:var(--absent,var(--base));--measure:calc(var(--gap) * 2);--mix:color-mix(in srgb,var(--base) 70%,white);--override:4px}\n@media(min-width:900px){.wide{--override:16px}}\n.action--primary:hover{background:var(--accent)}`,
  );
  await fs.writeFile(
    path.join(source, "Widget.jsx"),
    `import React from 'react';if(typeof window==='undefined')throw new Error('Never execute component source during checks');export function Widget(){const [count,setCount]=React.useState(0);return <button onClick={()=>setCount(count+1)}>Atlas count {count}</button>}`,
  );
  return { directory, source };
}

test("CSS value parsing resolves nested fallbacks and expression aliases without reading strings as code", () => {
  assert.deepEqual(
    splitCSS(`'One, Two',var(--family, 'Fallback, Family'),system-ui`),
    ["'One, Two'", "var(--family, 'Fallback, Family')", "system-ui"],
  );
  assert.deepEqual(fontFamilies(`'One, Two',"Escaped\\20 Family",serif`), [
    "One, Two",
    "Escaped Family",
    "serif",
  ]);
  assert.equal(
    cssVariables(`"var(--ignored)" /* var(--comment) */ calc(var(--gap)*2)`)
      .length,
    1,
  );
  const resolved = resolveTokens({
    "--gap": "8px",
    "--size": "calc(var(--gap) * 2)",
    "--color": "var(--absent,var(--also-absent,rgb(10, 20, 30)))",
  });
  assert.deepEqual(resolved.issues, []);
  assert.equal(resolved.resolve("var(--size)"), "calc(8px * 2)");
  assert.equal(resolved.resolve("var(/* ( ) */ --gap)"), "8px");
  assert.equal(resolved.resolve(String.raw`var(--g\61 p)`), "8px");

  assert.equal(resolved.resolve("var(--color)"), "rgb(10, 20, 30)");
  assert.ok(
    resolveTokens({ "--a": "var(--b)", "--b": "var(--a)" }).issues.some(
      (issue) => issue.includes("cycle"),
    ),
  );
  assert.ok(
    resolveTokens({ "--a": "calc(var(--missing) * 2)" }).issues.some((issue) =>
      issue.includes("missing token"),
    ),
  );
});

test("read-only CSS inventory preserves imported token roles, annotations, duplicates, provenance and brand font advisories", async (t) => {
  const { source } = await fixture(t),
    before = await fingerprint(source),
    model = await inspect(source);
  assert.deepEqual(await fingerprint(source), before);
  assert.deepEqual(model.issues, []);
  assert.deepEqual(model.files, [
    "tokens/base.css",
    "tokens/faces.css",
    "styles.css",
  ]);
  const details = (name) =>
      model.tokenDetails.filter((entry) => entry.name === name),
    token = (name) => details(name)[0];
  assert.equal(token("--accent").kind, "color");
  assert.equal(token("--accent").resolvedValue, "#315d9a");
  assert.equal(token("--fallback").resolvedValue, "#315d9a");
  assert.equal(token("--measure").resolvedValue, "calc(12px * 2)");
  assert.equal(token("--mix").kind, "color");
  assert.equal(token("--shadow").kind, "shadow");
  assert.equal(token("--radius").kind, "radius");
  assert.equal(token("--family").kind, "font");
  assert.equal(token("--ease").annotation, "other");
  assert.equal(token("--base").definedIn, "tokens/base.css");
  assert.equal(token("--base").line, 1);
  assert.equal(token("--base").selector, ":root");
  assert.deepEqual(
    details("--override").map((entry) => entry.value),
    ["4px", "16px"],
  );
  assert.deepEqual(details("--override")[1].conditions, [
    "@media (min-width:900px)",
  ]);
  assert.equal(model.tokens["--override"], "16px");
  assert.ok(!model.tokenDetails.some((entry) => entry.name === "--primary"));
  assert.deepEqual(model.unclassified, ["--z"]);
  assert.equal(model.fonts[0].family, "Atlas Sans");
  assert.equal(model.fonts[0].weight, "500");
  assert.deepEqual(model.fonts[0].conditions, ["@media screen"]);
  assert.equal(model.fonts[0].display, "swap");
  assert.equal(model.fonts[0].unicodeRange, "U+0000-00FF");
  assert.deepEqual(
    model.brandFonts.map((entry) => entry.family),
    ["Missing Brand"],
  );
  assert.deepEqual(model.brandFonts[0].tokens, ["--fontFamilyBrand"]);
  assert.equal(model.warnings.length, 2);
  const checked = JSON.parse(
    execFileSync(
      process.execPath,
      [
        path.join(root, "packages/cli/src/commands/design-system.mjs"),
        "check",
        source,
        "--verbose",
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.tokenDetails, model.tokenDetails);
  assert.deepEqual(checked.fonts, model.fonts);
  assert.equal(checked.tokenKinds.radius, 1);
  assert.equal(checked.warnings.length, 2);
  assert.deepEqual(await fingerprint(source), before);
});

test("CSS entry discovery supports nested preferred names and a safe legacy manifest entry hint", async (t) => {
  const directory = await temporary(t);
  await fs.mkdir(path.join(directory, "theme"));
  await fs.writeFile(
    path.join(directory, "theme/styles.css"),
    ":root{--accent:#315d9a}",
  );
  assert.equal((await inspect(directory)).spec.css, "theme/styles.css");
  await fs.rename(
    path.join(directory, "theme/styles.css"),
    path.join(directory, "theme/brand.css"),
  );
  await fs.writeFile(
    path.join(directory, "_ds_manifest.json"),
    JSON.stringify({
      namespace: "AtlasDesignSystem_ab12cd",
      globalCssPaths: ["absent.css", "theme/brand.css"],
    }),
  );
  assert.equal((await inspect(directory)).spec.css, "theme/brand.css");
  assert.deepEqual((await inspect(directory)).issues, []);
  await fs.writeFile(
    path.join(directory, "_ds_manifest.json"),
    JSON.stringify({
      namespace: "AtlasDesignSystem_ab12cd",
      globalCssPaths: ["../foreign.css"],
    }),
  );
  assert.ok((await inspect(directory)).issues.length);
  const failed = spawnSync(
    process.execPath,
    [
      path.join(root, "packages/cli/src/commands/design-system.mjs"),
      "check",
      directory,
    ],
    { encoding: "utf8" },
  );
  assert.equal(failed.status, 2);
  assert.match(failed.stdout, /No global CSS entry/);
  await fs.writeFile(
    path.join(directory, "_ds_manifest.json"),
    JSON.stringify({ globalCssPaths: { unexpected: "data" } }),
  );
  assert.ok((await inspect(directory)).issues.length);
});

test("missing local font sources, malformed CSS, imports and alias errors fail before compiled artifacts are replaced", async (t) => {
  const { source } = await fixture(t);
  await compile(source);
  const before = await fs.readFile(
    path.join(source, "_ds_manifest.json"),
    "utf8",
  );
  await fs.writeFile(
    path.join(source, "tokens/faces.css"),
    "@font-face{font-family:Ghost;src:url('../assets/missing.woff2')}",
  );
  assert.ok(
    (await inspect(source)).issues.some((issue) =>
      issue.includes("font src not found"),
    ),
  );
  await assert.rejects(compile(source), /font src not found/);
  assert.equal(
    await fs.readFile(path.join(source, "_ds_manifest.json"), "utf8"),
    before,
  );
  await fs.writeFile(
    path.join(source, "tokens/faces.css"),
    ":root{--shadowed:var(--absent)}@media(min-width:900px){.wide{--shadowed:red}}",
  );
  assert.ok(
    (await inspect(source)).issues.some((issue) =>
      issue.includes("missing token"),
    ),
  );
  await fs.writeFile(
    path.join(source, "tokens/faces.css"),
    ":root{--broken:var(--missing)}",
  );
  assert.ok(
    (await inspect(source)).issues.some((issue) =>
      issue.includes("missing token"),
    ),
  );
  await fs.writeFile(
    path.join(source, "tokens/faces.css"),
    "@import '../styles.css';",
  );
  assert.ok(
    (await inspect(source)).issues.some((issue) =>
      issue.includes("CSS import cycle"),
    ),
  );
  await fs.writeFile(
    path.join(source, "tokens/faces.css"),
    "@import 'https://example.invalid/fonts.css';",
  );
  assert.ok(
    (await inspect(source)).issues.some((issue) =>
      issue.includes("Remote CSS import"),
    ),
  );
  await fs.writeFile(
    path.join(source, "tokens/faces.css"),
    ":root { --broken: red;",
  );
  assert.ok(
    (await inspect(source)).issues.some((issue) => issue.includes("Unclosed")),
  );
});

test("portable token and font reviews keep actual loaded typography and component state after source and copy deletion", async (t) => {
  const { directory, source } = await fixture(t),
    manifest = await compile(source);
  await preview(source);
  const project = path.join(directory, "project");
  await fs.mkdir(project);
  await importSystem(source, project);
  const copied = path.join(project, "_ds/atlas");
  const copiedManifest = JSON.parse(
    await fs.readFile(path.join(copied, "_ds_manifest.json"), "utf8"),
  );
  assert.deepEqual(copiedManifest.tokenDetails, manifest.tokenDetails);
  assert.deepEqual(copiedManifest.fonts, manifest.fonts);
  assert.deepEqual(copiedManifest.brandFonts, manifest.brandFonts);
  const guide = await fs.readFile(path.join(copied, "_ds_guide.md"), "utf8");
  assert.match(guide, /Atlas Sans/);
  assert.match(guide, /Missing Brand/);
  await preview(copied);
  const portable = path.join(directory, "portable");
  await fs.mkdir(portable);
  await fs.copyFile(
    path.join(copied, "preview.html"),
    path.join(portable, "preview.html"),
  );
  await fs.writeFile(
    path.join(portable, "expected.html"),
    `<!doctype html><html lang="en"><head><title>Expected font sample</title><style>@font-face{font-family:'Atlas Sans';src:url(data:font/woff2;base64,${(await fs.readFile(path.join(source, "assets/Atlas font.woff2"))).toString("base64")});font-weight:500}body{margin:0}span{display:inline-block;font:18px 'Atlas Sans',sans-serif}</style></head><body><span>Aa Bb 0123</span></body></html>`,
  );
  await fs.rm(source, { recursive: true });
  await fs.rm(copied, { recursive: true });
  const { server, url } = await serve(portable, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  async function verify(page) {
    await page.getByRole("button", { name: "Atlas count 0" }).click();
    await page.getByRole("button", { name: "Atlas count 1" }).waitFor();
    assert.equal(
      await page.locator('tr[data-token-name="--override"]').count(),
      2,
    );
    assert.equal(
      await page.locator('tr[data-font-family="Atlas Sans"]').count(),
      1,
    );
    await page.getByRole("link", { name: "Fonts", exact: true }).click();
    await page.getByText("Missing Brand", { exact: true }).waitFor();
    await page
      .locator('tr[data-token-name="--family"] .token-preview')
      .scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      await page.evaluate(() => document.fonts.check('18px "Atlas Sans"')),
      true,
    );
    const result = await page.evaluate(() => {
      const find = (name) =>
        document.querySelector(`tr[data-token-name="${name}"] .token-preview`);
      return {
        font: getComputedStyle(find("--family")).fontFamily,
        width: find("--family").getBoundingClientRect().width,
        color: getComputedStyle(find("--accent")).backgroundColor,
        radius: getComputedStyle(find("--radius")).borderRadius,
        gap: find("--gap").getBoundingClientRect().width,
        shadow: getComputedStyle(find("--shadow")).boxShadow,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(result.color, "rgb(49, 93, 154)");
    assert.equal(result.radius, "8px");
    assert.equal(result.gap, 12);
    assert.match(result.shadow, /12px/);
    assert.match(result.font, /Atlas Sans/);
    assert.equal(result.overflow, false);
    if (page.viewportSize().width < 500) {
      const inventory = page.getByRole("region", { name: "Token inventory" });
      assert.equal(
        await inventory.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
        true,
      );
      await inventory.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="Token inventory"]').scrollLeft >
          0,
      );
    }

    if (process.env.CODEX_TOKEN_CAPTURE_DIR) {
      await fs.mkdir(process.env.CODEX_TOKEN_CAPTURE_DIR, { recursive: true });
      await page
        .locator('[aria-label="Token inventory"]')
        .evaluate((element) => (element.scrollLeft = 0));
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.screenshot({
        path: path.join(
          process.env.CODEX_TOKEN_CAPTURE_DIR,
          `token-review-${page.viewportSize().width}.png`,
        ),
        fullPage: true,
      });
    }
    return result;
  }
  for (const width of [1100, 390])
    await withPage(
      url + "preview.html",
      async (page) => {
        const result = await verify(page);
        await page.goto(url + "expected.html");
        await page.evaluate(() => document.fonts.ready);
        const expected = await page.locator("span").boundingBox();
        assert.ok(
          Math.abs(result.width - expected.width) < 0.01,
          "Loaded brand font matches the independent rendition",
        );
      },
      { width, height: 850 },
    );
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) =>
      route.request().url().startsWith("http")
        ? route.abort()
        : route.continue(),
    );
    await page.goto(pathToFileURL(path.join(portable, "preview.html")).href);
    await verify(page);
  } finally {
    await browser.close();
  }
});

test("token-only systems load their embedded conditional font faces without a component bundle or cards", async (t) => {
  const { directory, source } = await fixture(t);
  await fs.rm(path.join(source, "Widget.jsx"));
  const manifest = await compile(source);
  assert.equal(manifest.bundle, null);
  assert.equal(manifest.cards.length, 0);
  await preview(source);
  const portable = path.join(directory, "tokens-only.html");
  await fs.copyFile(path.join(source, "preview.html"), portable);
  await fs.rm(source, { recursive: true });
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url + "tokens-only.html", async (page) => {
    await page
      .locator('tr[data-token-name="--family"] .token-preview')
      .scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    const faces = await page.evaluate(() =>
      [...document.fonts].map((face) => ({
        family: face.family,
        status: face.status,
        weight: face.weight,
      })),
    );
    assert.ok(
      faces.some(
        (face) =>
          face.family.replace(/["']/g, "") === "Atlas Sans" &&
          face.status === "loaded" &&
          face.weight === "500",
      ),
    );
    assert.equal(await page.locator("[data-review-host]").count(), 0);
    assert.equal(
      await page.evaluate(() => window.CodexDesignSystems),
      undefined,
    );
    assert.equal(
      await page
        .locator('tr[data-token-name="--accent"] .token-preview')
        .evaluate((element) => getComputedStyle(element).backgroundColor),
      "rgb(49, 93, 154)",
    );
  });
});
