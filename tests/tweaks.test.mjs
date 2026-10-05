import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  tweakValues,
  mergeTweaks,
  scrubNumber,
  segmentedOptions,
} from "../skills/forma/assets/starters/tweaks-model.js";
import { tweakBinding } from "../skills/forma/scripts/lib/tweaks-source.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { bundle } from "../skills/forma/scripts/build.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";
const starter = path.resolve(
  "skills/forma/assets/starters/tweaks-components.jsx",
);
const defaults = {
  size: 16,
  enabled: false,
  density: "regular",
  columns: 2,
  numeric: 1,
  boolean: false,
  weight: 0.5,
  color: "#FFFFFF",
  palette: ["#fff", "#123", "#fa8"],
  title: "A focused workspace",
};
const json = JSON.stringify(defaults);
const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><script id="codex-tweak-defaults" type="application/json">${json}</script><style>body{margin:0;color:#234;font:16px system-ui}main{padding:40px}h1{font:32px Georgia}button{font:inherit}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>`;
async function fixture(t, { source = false, html = body } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-tweaks-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, "index.html"), html);
  const script = `import React,{useState}from'${path.resolve("node_modules/react/index.js")}';import{createRoot}from'${path.resolve("node_modules/react-dom/client.js")}';import{useTweaks,readTweakDefaults,TweaksPanel,TweakSuggestionBar,TweakSection,TweakSlider,TweakToggle,TweakRadio,TweakSelect,TweakText,TweakNumber,TweakColor,TweakButton}from'${starter}';window.changes=[];window.addEventListener('tweakchange',e=>window.changes.push(e.detail));window.messages=[];window.postMessage=(...args)=>window.messages.push(args);function App(){const[t,set]=useTweaks(readTweakDefaults()),[count,inc]=useState(0);return <><main><h1 style={{fontSize:t.size}}>{t.title}</h1><button onClick={()=>inc(count+1)}>Count {count}</button><pre id="values">{JSON.stringify(t)}</pre></main><TweaksPanel store={set.store}><TweakSuggestionBar suggestions={['Add a quiet-hours dial','Add a reading rhythm slider','Add a print-like mode']} animationOptions={{typeMs:1,eraseMs:1,pauseMs:5,startMs:5,tailMs:1}}/><TweakSection label="Typography"/><TweakSlider label="Size" value={t.size} min={10} max={30} unit="px" onChange={v=>set('size',v)}/><TweakNumber label="Weight" value={t.weight} min={0} max={1} step={.05} onChange={v=>set('weight',v)}/><TweakText label="Headline" value={t.title} onChange={v=>set('title',v)}/><TweakToggle label="Enabled" value={t.enabled} onChange={v=>set('enabled',v)}/><TweakRadio label="Density" value={t.density} options={['compact','regular','comfy']} onChange={v=>set('density',v)}/><TweakRadio label="Columns" value={t.columns} options={[1,2,3]} onChange={v=>set('columns',v)}/><TweakRadio label="Numeric fallback" value={t.numeric} options={[{label:'One longer numeric option',value:1},{label:'Another longer numeric option',value:2}]} onChange={v=>set('numeric',v)}/><TweakRadio label="Boolean fallback" value={t.boolean} options={[{label:'Keep the current visual direction',value:false},{label:'Use the alternate visual direction',value:true}]} onChange={v=>set('boolean',v)}/><TweakSelect label="Select density" value={t.density} options={['compact','regular','comfy']} onChange={v=>set('density',v)}/><TweakColor label="Color" value={t.color} options={['#ffffff','#112233','#d98840']} onChange={v=>set('color',v)}/><TweakColor label="Palette" value={t.palette} options={[['#fff','#123','#fa8'],['#123','#fdc','#567','#aee','#f76']]} onChange={v=>set('palette',v)}/><TweakColor label="Free color" value={t.color} onChange={v=>set('color',v)}/><TweakButton label="Set multiple" onClick={()=>set({size:22,enabled:true})}/><TweakButton label="Reset" onClick={()=>set.store.reset()}/><TweakButton label="Download settings" onClick={()=>set.store.download()}/></TweaksPanel></>;}createRoot(document.getElementById('root')).render(<App/>);`;
  await fs.writeFile(path.join(dir, "entry.jsx"), script);
  await bundle(path.join(dir, "entry.jsx"), path.join(dir, "app.js"));
  const { server, url } = await serve(
    dir,
    0,
    source ? { tweaksFile: "index.html" } : {},
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url, origin: url.slice(0, -1) };
}
const values = (page) => page.evaluate(() => window.codexTweaks.values);
const open = async (page) => {
  await page.getByRole("button", { name: "Tweaks", exact: true }).click();
  await page.getByRole("dialog", { name: "Tweaks" }).waitFor();
};
test("typed defaults preserve false, zero, palettes and safe keys while numeric scrubbing snaps and clamps", () => {
  assert.deepEqual(
    mergeTweaks(defaults, {
      size: 0,
      enabled: false,
      palette: ["#123", "#fa8"],
    }),
    { ...defaults, size: 0, palette: ["#123", "#fa8"] },
  );
  assert.equal(mergeTweaks(defaults, { columns: "3" }).columns, "3");
  assert.throws(() => tweakValues({ number: NaN }), /finite JSON/);
  assert.throws(() => tweakValues({ action: () => {} }), /finite JSON/);
  const safe = mergeTweaks({}, JSON.parse('{"__proto__":{"safe":true}}'));
  assert.equal(Object.hasOwn(safe, "__proto__"), true);
  assert.equal({}.safe, undefined);
  assert.equal(scrubNumber(0.5, 3, 0.05, 0, 1), 0.65);
  assert.equal(scrubNumber(0.5, 100, 0.05, 0, 1), 1);
  assert.equal(scrubNumber(0.005, -3, 0.001), 0.002);
  assert.equal(segmentedOptions([false, true]), true);
  assert.equal(segmentedOptions([1, 2, 3, 4]), false);
  assert.equal(
    segmentedOptions(["Longer than sixteen characters", "Short"]),
    false,
  );
});
test("source bindings parse one JSON or legacy block without evaluating page scripts", () => {
  assert.deepEqual(tweakBinding(body).values, defaults);
  const legacy =
    '<html><head><script>const TWEAK_DEFAULTS=/*EDITMODE-BEGIN*/{"size":0,"enabled":false,"palette":["#123"]}/*EDITMODE-END*/;throw new Error("Never run this inventory");</script></head></html>';
  assert.deepEqual(tweakBinding(legacy).values, {
    size: 0,
    enabled: false,
    palette: ["#123"],
  });
  assert.throws(
    () =>
      tweakBinding(
        body.replace(
          "</head>",
          '<script id="codex-tweak-defaults" type="application/json">{}</script></head>',
        ),
      ),
    /exactly one/,
  );
  assert.throws(
    () =>
      tweakBinding(
        '<script>const text="/*EDITMODE-BEGIN*/{}/*EDITMODE-END*/";</script>',
      ),
    /literal variable/,
  );
  assert.throws(
    () =>
      tweakBinding(
        "<script>const x=/*EDITMODE-BEGIN*/{size:2}/*EDITMODE-END*/;</script>",
      ),
    /JSON/,
  );
});
test("React controls preserve live content, typed options and curated palettes across edits and reload", async (t) => {
  const { dir, url } = await fixture(t);
  await withPage(url, async (page) => {
    await page.getByRole("button", { name: "Count 0" }).click();
    await open(page);
    const panel = page.getByRole("dialog", { name: "Tweaks" });
    await panel.getByRole("slider", { name: "Size", exact: true }).fill("24");
    assert.equal((await values(page)).size, 24);
    await panel.getByRole("switch", { name: "Enabled" }).click();
    assert.equal((await values(page)).enabled, true);
    await panel
      .getByRole("radiogroup", { name: "Columns" })
      .getByRole("radio", { name: "3", exact: true })
      .click();
    assert.equal((await values(page)).columns, 3);
    await panel
      .getByRole("combobox", { name: "Numeric fallback" })
      .selectOption("2");
    assert.equal((await values(page)).numeric, 2);
    await panel
      .getByRole("combobox", { name: "Boolean fallback" })
      .selectOption("true");
    assert.equal((await values(page)).boolean, true);
    await panel
      .getByRole("combobox", { name: "Select density" })
      .selectOption("compact");
    assert.equal((await values(page)).density, "compact");
    await panel
      .getByRole("radiogroup", { name: "Color", exact: true })
      .getByRole("radio", { name: "#112233", exact: true })
      .click();
    await panel
      .getByRole("radiogroup", { name: "Palette", exact: true })
      .getByRole("radio")
      .nth(1)
      .click();
    assert.deepEqual((await values(page)).palette, [
      "#123",
      "#fdc",
      "#567",
      "#aee",
      "#f76",
    ]);
    await panel
      .getByRole("textbox", { name: "Headline", exact: true })
      .fill("A tuned workspace");
    assert.equal(
      await page
        .getByRole("heading", { name: "A tuned workspace" })
        .isVisible(),
      true,
    );
    await panel.getByRole("button", { name: "Set multiple" }).click();
    assert.equal((await values(page)).size, 22);
    assert.equal(
      await page.getByRole("button", { name: "Count 1" }).isVisible(),
      true,
    );
    const downloadPromise = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Download settings" }).click();
    const download = await downloadPromise;
    const file = path.join(dir, "settings.json");
    await download.saveAs(file);
    assert.deepEqual(
      JSON.parse(await fs.readFile(file, "utf8")),
      await values(page),
    );
    await panel.getByRole("button", { name: "Close tweaks" }).click();
    assert.equal(await panel.isVisible(), false);
    assert.equal(
      await page
        .getByRole("button", { name: "Tweaks", exact: true })
        .evaluate((button) => button.getRootNode().activeElement === button),
      true,
    );
    await page.reload();
    await open(page);
    assert.equal((await values(page)).title, "A tuned workspace");
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    assert.deepEqual(await values(page), defaults);
    assert.deepEqual(await page.evaluate(() => window.messages), []);
  });
});
test("panel, numeric label and segmented options support actual pointer dragging and viewport clamping", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await open(page);
    const panel = page.getByRole("dialog", { name: "Tweaks" }),
      handle = panel.getByLabel("Move tweaks panel");
    const first = await panel.boundingBox(),
      bounds = await handle.boundingBox();
    await page.mouse.move(bounds.x + 50, bounds.y + 10);
    await page.mouse.down();
    await page.mouse.move(bounds.x - 250, bounds.y - 140);
    await page.mouse.up();
    const moved = await panel.boundingBox();
    assert.ok(moved.x < first.x - 200);
    assert.ok(moved.y >= 15 && moved.y <= first.y);
    const number = panel.getByLabel("Scrub Weight"),
      box = await number.boundingBox();
    await page.mouse.move(box.x + 25, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + 5);
    await page.mouse.up();
    assert.equal((await values(page)).weight, 0.75);
    await number.press("ArrowRight");
    assert.equal((await values(page)).weight, 0.8);
    const radios = panel.getByRole("radiogroup", { name: "Columns" }),
      track = await radios.boundingBox();
    await page.mouse.move(track.x + 10, track.y + 10);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width - 10, track.y + 10);
    await page.mouse.up();
    assert.equal((await values(page)).columns, 3);
    await radios
      .getByRole("radio", { name: "3", exact: true })
      .press("ArrowLeft");
    assert.equal((await values(page)).columns, 2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(50);
    const small = await panel.boundingBox();
    assert.ok(
      small.x >= 15 &&
        small.y >= 15 &&
        small.x + small.width <= 375 &&
        small.y + small.height <= 829,
    );
    await page.emulateMedia({ media: "print" });
    assert.equal(await panel.isVisible(), false);
  });
});
test("tweak batches write real HTML and reload retains typed values while stale and foreign edits fail", async (t) => {
  const { dir, url, origin } = await fixture(t, { source: true });
  const file = path.join(dir, "index.html");
  await withPage(url, async (page, errors) => {
    await open(page);
    await page.waitForFunction(() => window.codexTweaks.source);
    await page.evaluate(() => {
      window.codexTweaks.set({
        size: 0,
        enabled: false,
        palette: ["#abc", "#123"],
        title: "</script><p>Plain data</p>",
      });
      window.codexTweaks.set("columns", 3);
    });
    await page.evaluate(() => window.codexTweaks.flush());
    const text = await fs.readFile(file, "utf8");
    assert.ok(text.includes("\\u003c/script>"));
    assert.equal(tweakBinding(text).values.size, 0);
    assert.equal(tweakBinding(text).values.enabled, false);
    assert.equal(tweakBinding(text).values.columns, 3);
    assert.ok(text.endsWith('<script src="app.js"></script></body></html>'));
    await page.reload();
    await page.waitForFunction(() => window.codexTweaks?.source);
    assert.deepEqual((await values(page)).palette, ["#abc", "#123"]);
    await fs.appendFile(file, "\n<!-- source changed externally -->");
    await page.evaluate(async () => {
      window.codexTweaks.set("size", 20);
      await window.codexTweaks.flush();
    });
    assert.match(
      await page.evaluate(() => window.codexTweaks.status),
      /Not saved:.*source changed/,
    );
    assert.equal(tweakBinding(await fs.readFile(file, "utf8")).values.size, 0);
    await page.waitForTimeout(50);
    assert.ok(
      errors.some((error) => error === `HTTP 409: ${origin}/__codex_tweaks`),
    );
    for (let index = errors.length - 1; index >= 0; index--)
      if (
        errors[index] === `HTTP 409: ${origin}/__codex_tweaks` ||
        errors[index] ===
          "Failed to load resource: the server responded with a status of 409 (Conflict)"
      )
        errors.splice(index, 1);
  });
  const initial = await (await fetch(origin + "/__codex_tweaks")).json();
  const post = (data, requestOrigin = origin, token = initial.token) =>
    fetch(origin + "/__codex_tweaks", {
      method: "POST",
      headers: {
        Origin: requestOrigin,
        "Content-Type": "application/json",
        "X-Codex-Tweaks-Token": token,
      },
      body: JSON.stringify(data),
    });
  assert.equal(
    (await post({ version: initial.version, edits: [] })).status,
    400,
  );
  assert.equal(
    (
      await post(
        { version: initial.version, edits: {} },
        "https://foreign.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (await post({ version: initial.version, edits: {} }, origin, "bad-token"))
      .status,
    403,
  );
  const outcomes = await Promise.all([
    post({ version: initial.version, edits: { size: 5 } }),
    post({ version: initial.version, edits: { size: 7 } }),
  ]);
  assert.deepEqual(
    outcomes.map((response) => response.status).sort(),
    [200, 409],
  );
});
test("legacy defaults write back as JSON and blocked storage leaves working session controls", async (t) => {
  const legacy = body.replace(
    /<script id="codex-tweak-defaults" type="application\/json">.*?<\/script>/,
    `<script>const TWEAK_DEFAULTS=/*EDITMODE-BEGIN*/${json}/*EDITMODE-END*/;</script>`,
  );
  const { dir, url } = await fixture(t, { source: true, html: legacy });
  await withPage(url, async (page) => {
    await page.evaluate(() =>
      window.codexTweaks.set({ title: "Legacy saved", enabled: true }),
    );
    await page.evaluate(() => window.codexTweaks.flush());
    assert.equal(
      tweakBinding(await fs.readFile(path.join(dir, "index.html"), "utf8"))
        .values.title,
      "Legacy saved",
    );
    await page.reload();
    await page.waitForFunction(() => window.codexTweaks?.source);
    assert.equal((await values(page)).title, "Legacy saved");
  });
  const other = await fixture(t);
  await withPage(other.url, async (page) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = Storage.prototype.setItem = () => {
        throw new Error("Unavailable");
      };
    });
    await page.reload();
    await open(page);
    await page.getByRole("switch", { name: "Enabled" }).click();
    assert.equal((await values(page)).enabled, true);
    assert.match(
      await page
        .getByRole("status", { name: "Tweak save status" })
        .textContent(),
      /Storage unavailable/,
    );
  });
});
test("leaving immediately flushes an unbatched tweak and a complete suggestion cycle is cached per set", async (t) => {
  const connected = await fixture(t, { source: true });
  await withPage(connected.url, async (page) => {
    await page.waitForFunction(() => window.codexTweaks?.source);
    await page.evaluate(() =>
      window.codexTweaks.set("title", "Saved while leaving"),
    );
    await page.reload();
    await page.waitForFunction(
      () =>
        window.codexTweaks?.source &&
        window.codexTweaks.values.title === "Saved while leaving",
    );
    assert.equal(
      tweakBinding(
        await fs.readFile(path.join(connected.dir, "index.html"), "utf8"),
      ).values.title,
      "Saved while leaving",
    );
  });
  const staticPage = await fixture(t);
  await withPage(staticPage.url, async (page) => {
    await open(page);
    await page.waitForFunction(() =>
      [...document.querySelectorAll("[data-codex-tweaks-chrome]")].some(
        (host) =>
          /^Add a/.test(
            host.shadowRoot.querySelector(".ghost")?.textContent ?? "",
          ),
      ),
    );
    await page.getByRole("button", { name: "Ideas", exact: true }).waitFor();
    await page.reload();
    await open(page);
    assert.equal(
      await page
        .getByRole("button", { name: "Ideas", exact: true })
        .isVisible(),
      true,
    );
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("codex-tweaks-close")),
    );
    await page
      .getByRole("dialog", { name: "Tweaks" })
      .waitFor({ state: "hidden" });
    assert.equal(
      await page.getByRole("dialog", { name: "Tweaks" }).isVisible(),
      false,
    );
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("codex-tweaks-open")),
    );
    await page.getByRole("dialog", { name: "Tweaks" }).waitFor();
    assert.equal(
      await page.getByRole("dialog", { name: "Tweaks" }).isVisible(),
      true,
    );
  });
});
test("suggestion typewriter plays once, freezes a complete ghost, copies real drafts and handles unavailable clipboard", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page);
    const input = page.getByRole("textbox", {
      name: "Describe a tweak",
      exact: true,
    });
    await input.click();
    await input.press("Tab");
    assert.equal(await input.inputValue(), "Add a quiet-hours dial");
    await input.press("Enter");
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "Add a quiet-hours dial",
    );
    assert.equal(
      await page.getByRole("textbox", { name: "Assistant draft" }).inputValue(),
      "Add a quiet-hours dial",
    );
    await input.fill("Adjust the headline hierarchy");
    await input.press("Enter");
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "Adjust the headline hierarchy",
    );
    await page.reload();
    await open(page);
    assert.equal(
      await page
        .getByRole("button", { name: "Ideas", exact: true })
        .isVisible(),
      true,
    );
    await page.getByRole("button", { name: "Ideas", exact: true }).click();
    assert.match(
      await page.evaluate(() => navigator.clipboard.readText()),
      /three concise controls/,
    );
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => {
        throw new Error("Unavailable");
      };
    });
    await page
      .getByRole("textbox", { name: "Describe a tweak", exact: true })
      .fill("Use a quieter palette");
    await page.getByRole("button", { name: "Copy draft" }).click();
    await page
      .getByRole("status", { name: "Draft handoff status" })
      .filter({ hasText: "Copy the draft below" })
      .waitFor();
    assert.match(
      await page
        .getByRole("status", { name: "Draft handoff status" })
        .textContent(),
      /Copy the draft below/,
    );
    assert.equal(
      await page.getByRole("textbox", { name: "Assistant draft" }).inputValue(),
      "Use a quieter palette",
    );
    assert.deepEqual(await page.evaluate(() => window.messages), []);
  });
});
