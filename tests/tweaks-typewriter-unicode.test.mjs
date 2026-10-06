import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary } from "./helpers.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";

async function fixture(t, bar) {
  const dir = await temporary(t);
  const react = path.resolve("node_modules/react/index.js");
  const dom = path.resolve("node_modules/react-dom/client.js");
  const hooks = path.resolve(
    "packages/runtime/src/browser/tweaks-suggestions.jsx",
  );
  const authored = bar ? ["Add 🚀 spacing"] : ["A🚀B", "Tune 🚀"];
  const timing = {
    startMs: 0,
    typeMs: 1,
    pauseMs: bar ? 10000 : 250,
    eraseMs: 100,
    tailMs: 1,
  };
  await fs.writeFile(
    path.join(dir, "main.jsx"),
    `
    import React from ${JSON.stringify(react)};
    import {createRoot} from ${JSON.stringify(dom)};
    import {TweakSuggestionBar,useTwkTypewriter} from ${JSON.stringify(hooks)};
    const initial=${JSON.stringify(authored)},timing=${JSON.stringify(timing)};
    window.samples=[];
    function App(){
      const [items,setItems]=React.useState(initial),born=React.useRef(performance.now());
      const writer=useTwkTypewriter(items,{...timing,placeholder:"Describe a tweak"});
      const sample={text:writer.text,idx:writer.idx,done:writer.done,tail:writer.tail,elapsed:performance.now()-born.current,items};
      window.writer=sample;window.replaceSuggestions=setItems;
      React.useEffect(()=>{window.samples.push(sample);},[writer.text,writer.idx,writer.done,JSON.stringify(items)]);
      return ${bar ? "<TweakSuggestionBar suggestions={items} animationOptions={timing}/>" : '<output id="phrase">{writer.text}</output>'};
    }
    createRoot(document.getElementById("root")).render(<App/>);
  `,
  );
  await bundle(path.join(dir, "main.jsx"), path.join(dir, "bundle.js"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    '<!doctype html><html lang="en"><head><meta name="codex-fixed-sheet" content="off"><title>Suggestion character integrity</title></head><body><div id="root"></div><script src="bundle.js"></script></body></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url, authored };
}

test("mixed astral suggestion text reaches the complete typing pause in the hook and actual suggestion bar", async (t) => {
  const { url, authored } = await fixture(t, true);
  await withPage(url, async (page, errors) => {
    await page.waitForFunction(
      () => window.writer?.elapsed >= 400 && !window.writer.done,
    );
    assert.equal(await page.evaluate(() => window.writer.text), authored[0]);
    assert.equal(await page.locator(".ghost").textContent(), authored[0]);
    assert.deepEqual(errors, []);
  });
});

test("UTF-16 typing and erasing retain authored pauses, subsequent suggestions and per-set session replay state", async (t) => {
  const { url, authored } = await fixture(t, false);
  await withPage(url, async (page, errors) => {
    await page.waitForFunction(
      () => window.writer?.done && window.writer.tail === "Describe a tweak",
    );
    const samples = await page.evaluate(() => window.samples);
    for (const [idx, text] of authored.entries()) {
      const full = samples.find(
        (sample) => sample.idx === idx && sample.text === text,
      );
      assert.ok(full, `The complete authored suggestion ${idx} appears`);
      const erase = samples.find(
        (sample) =>
          sample.idx === idx &&
          sample.elapsed > full.elapsed &&
          sample.text.length < text.length,
      );
      assert.ok(erase, `Suggestion ${idx} erases after its pause`);
      assert.ok(
        erase.elapsed - full.elapsed >= 200,
        "Full text holds for the authored pause before erasing",
      );
    }
    const fullIndex = samples.findIndex(
      (sample) => sample.idx === 0 && sample.text === authored[0],
    );
    const eraseSamples = samples
      .slice(fullIndex + 1)
      .filter((sample) => sample.idx === 0)
      .map((sample) => sample.text);
    for (const length of [3, 2, 1])
      assert.ok(
        eraseSamples.includes(authored[0].slice(0, length)),
        `Erasing follows UTF-16 slice length ${length}`,
      );
    assert.equal(await page.locator("#phrase").textContent(), "");
    await page.reload();
    await page.waitForFunction(() => window.writer?.done);
    assert.equal(await page.evaluate(() => window.writer.text), "");
    assert.equal(
      await page.evaluate(() => window.writer.tail),
      "Describe a tweak",
    );
    const fresh = "Fresh 🌗 choice";
    await page.evaluate((text) => window.replaceSuggestions([text]), fresh);
    await page.waitForFunction(
      (text) => window.writer?.text === text && !window.writer.done,
      fresh,
    );
    assert.equal(await page.locator("#phrase").textContent(), fresh);
    await page.waitForFunction(
      () => window.writer.done && window.writer.tail === "Describe a tweak",
    );
    await page.evaluate((items) => window.replaceSuggestions(items), authored);
    await page.waitForFunction(
      () => window.writer.done && window.writer.text === "",
    );
    assert.equal(
      await page.evaluate(() => window.writer.tail),
      "Describe a tweak",
    );
    assert.deepEqual(errors, []);
  });
});
