import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary, root } from "./helpers.mjs";
import {
  inspectText,
  applyTextEdits,
} from "../skills/studio-design/scripts/lib/text-bindings.mjs";
import {
  sourceTransaction,
  replaceSource,
} from "../skills/studio-design/scripts/lib/source-transaction.mjs";
import { serve } from "../skills/studio-design/scripts/preview.mjs";
import { bundle } from "../skills/studio-design/scripts/build.mjs";
import { withPage } from "../skills/studio-design/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/studio-design/scripts/export.mjs";
const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Text contract</title><style>body{font:18px/1.5 Georgia;margin:30px;max-width:640px}h1{font-size:32px}p{margin:15px 0}</style></head><body><main><h1 id="title" contenteditable="false" tabindex="3">Original title</h1><p id="mixed">Before <strong data-kind="emphasis">important</strong> after <a href="#title">a link</a><br>last line<!--Keep comment--></p><ul><li>Repeated bullet</li><li>Repeated bullet</li></ul><p id="empty"></p><div id="generated"></div></main><script>window.originalTitle=document.getElementById('title');window.originalNode=originalTitle.firstChild;window.originalStrong=document.querySelector('strong');window.count=0;originalStrong.addEventListener('probe',()=>window.count++);document.getElementById('generated').textContent='Generated content';</script></body></html>`;
async function fixture(
  t,
  { session = false, document = false, extras = {}, content = body } = {},
) {
  const dir = await temporary(t);
  let html = content;
  if (document) {
    await bundle(
      path.join(root, "skills/studio-design/assets/starters/document.js"),
      path.join(dir, "document.js"),
    );
    html = html
      .replace("<main>", "<doc-page>")
      .replace("</main>", "</doc-page>")
      .replace("</body>", '<script src="document.js"></script></body>');
  }
  if (session) {
    await bundle(
      path.join(root, "skills/studio-design/assets/starters/text-editor.js"),
      path.join(dir, "editor.js"),
    );
    html = html.replace(
      "</body>",
      '<text-editor></text-editor><script src="editor.js"></script></body>',
    );
  }
  await fs.writeFile(path.join(dir, "index.html"), html);
  const { server, url } = await serve(
    dir,
    0,
    session ? {} : { textFile: "index.html", ...extras },
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url, file: path.join(dir, "index.html"), html };
}
const editor = (page) => page.locator("text-editor");
async function edit(page, selector, value) {
  if (
    (await editor(page)
      .getByRole("button", { name: "Edit text", exact: true })
      .getAttribute("aria-pressed")) !== "true"
  )
    await editor(page)
      .getByRole("button", { name: "Edit text", exact: true })
      .click();
  await page.locator(selector).click();
  await editor(page)
    .getByRole("textbox", { name: "Selected text", exact: true })
    .fill(value);
  await page.evaluate(() => document.querySelector("text-editor").flush());
}
async function request(url, binding, payload, headers = {}) {
  return fetch(url + "__codex_text", {
    method: "POST",
    headers: {
      Origin: url.slice(0, -1),
      "Content-Type": "application/json",
      "X-Codex-Text-Token": binding.token,
      ...headers,
    },
    body: JSON.stringify({ version: binding.version, ...payload }),
  });
}

test("literal text mapping preserves exact surrounding bytes and independent mixed runs, repeated bullets and empty slots", () => {
  const before = inspectText(body);
  const run = (text) => before.entries.find((entry) => entry.text === text);
  assert.equal(
    before.entries.some((entry) => entry.text.includes("window.count")),
    false,
  );
  assert.equal(
    before.entries.filter((entry) => entry.text === "Repeated bullet").length,
    2,
  );
  let changed = applyTextEdits(body, [
    { key: run("Before ").key, text: "" },
    { key: run(" after ").key, text: " & <new> " },
    { key: run("a link").key, text: "Updated link" },
  ]);
  assert.equal(
    changed,
    body
      .replace("Before <strong", "<strong")
      .replace(" after <a", " &amp; &lt;new&gt; <a")
      .replace(">a link</a>", ">Updated link</a>"),
  );
  const blank = inspectText(changed).entries.find(
    (entry) => entry.key === run("Before ").key,
  );
  assert.equal(blank.text, "");
  changed = applyTextEdits(changed, [
    { key: blank.key, text: "Restored prefix " },
    {
      key: before.entries.filter((entry) => entry.text === "Repeated bullet")[1]
        .key,
      text: "Second bullet",
    },
  ]);
  assert.match(
    changed,
    /Restored prefix <strong data-kind="emphasis">important<\/strong> &amp; &lt;new&gt; <a href="#title">Updated link<\/a><br>last line<!--Keep comment-->/,
  );
  assert.match(changed, /<li>Repeated bullet<\/li><li>Second bullet<\/li>/);
  assert.throws(
    () => applyTextEdits(body, [{ key: "script@0", text: "run()" }]),
    /literal source/,
  );
  assert.throws(
    () =>
      applyTextEdits(body, [
        { key: run("Original title").key, text: "x" },
        { key: run("Original title").key, text: "y" },
      ]),
    /duplicate/,
  );
  assert.throws(
    () =>
      applyTextEdits(body, [{ key: run("Original title").key, text: "x\0" }]),
    /Invalid/,
  );
});

test("fitted true-size sheets preserve source-backed click edits, undo and exact physical PDF size", async (t) => {
  const { url, file, html } = await fixture(t, {
    document: true,
    content: body
      .replace("<main>", '<doc-page width="18in" height="24in">')
      .replace("</main>", "</doc-page>"),
  });
  await withPage(url, async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => document.querySelector("doc-page").previewScale < 0.3,
    );
    await edit(page, "#title", "A saved fitted headline");
    assert.equal(
      await fs.readFile(file, "utf8"),
      html.replace("Original title", "A saved fitted headline"),
    );
    assert.equal(
      await page.evaluate(
        () => originalTitle === document.getElementById("title"),
      ),
      true,
    );
    await editor(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    const output = path.join(path.dirname(file), "fitted-edited.pdf");
    await exportArtifact("pdf", url, output, { paper: "a4" });
    const box = execFileSync("pdftotext", ["-bbox", output, "-"], {
      encoding: "utf8",
    });
    assert.match(box, /<page width="1296\.000000" height="1728\.000000">/);
    assert.match(
      execFileSync("pdftotext", [output, "-"], { encoding: "utf8" }),
      /A saved fitted headline/,
    );
    await editor(page)
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await page.waitForFunction(
      () => document.getElementById("title").textContent === "Original title",
    );
    assert.equal(await fs.readFile(file, "utf8"), html);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector("doc-page")?.previewScale < 0.3,
    );
    assert.equal(await page.locator("#title").textContent(), "Original title");
  });
});

test("source-backed click editing persists to real HTML, survives document reparenting and preserves nodes, links and attributes", async (t) => {
  const { url, file, html } = await fixture(t, { document: true });
  await withPage(url, async (page) => {
    assert.match(
      await editor(page).getByRole("status").textContent(),
      /Saved to index.html/,
    );
    await editor(page)
      .getByRole("button", { name: "Edit text", exact: true })
      .click();
    await page.locator("#title").click();
    await page.locator("#title").fill("Saved <title> & headline");
    await page.locator("#title").press("Enter");
    await page.evaluate(() => document.querySelector("text-editor").flush());
    assert.equal(
      await page.locator("#title").getAttribute("contenteditable"),
      "false",
    );
    assert.equal(await page.locator("#title").getAttribute("tabindex"), "3");
    assert.equal(
      await page.evaluate(
        () =>
          originalTitle === document.getElementById("title") &&
          originalNode === originalTitle.firstChild,
      ),
      true,
    );
    await edit(page, "strong", "Changed emphasis");
    await edit(page, "a", "Changed link");
    await edit(page, "li:nth-child(2)", "Different bullet");
    const source = await fs.readFile(file, "utf8");
    assert.equal(
      source,
      html
        .replace("Original title", "Saved &lt;title&gt; &amp; headline")
        .replace(">important</strong>", ">Changed emphasis</strong>")
        .replace(">a link</a>", ">Changed link</a>")
        .replace(
          "<li>Repeated bullet</li></ul>",
          "<li>Different bullet</li></ul>",
        ),
    );
    assert.equal(source.includes("data-codex-text-"), false);
    assert.equal(
      await page.evaluate(() => {
        originalStrong.dispatchEvent(new Event("probe"));
        return count;
      }),
      1,
    );
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector("text-editor")?.store,
    );
    assert.equal(
      await page.locator("#title").textContent(),
      "Saved <title> & headline",
    );
    assert.equal(await page.locator("a").getAttribute("href"), "#title");
    const output = path.join(path.dirname(file), "edited.pdf");
    await exportArtifact("pdf", url, output);
    const pdfText = execFileSync("pdftotext", [output, "-"], {
      encoding: "utf8",
    });
    assert.match(pdfText, /Saved <title> & headline/);
    assert.equal(pdfText.includes("Edit text"), false);
  });
});

test("clear/retype, real source undo/redo and Escape cancel work after autosave", async (t) => {
  const { url, file } = await fixture(t);
  await withPage(url, async (page) => {
    await edit(page, "#title", "");
    await editor(page)
      .getByRole("textbox", { name: "Selected text", exact: true })
      .fill("Retyped title");
    await page.evaluate(() => document.querySelector("text-editor").flush());
    await editor(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await editor(page)
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await page.waitForFunction(
      () => document.getElementById("title").textContent === "",
    );
    await editor(page)
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await page.waitForFunction(
      () => document.getElementById("title").textContent === "Original title",
    );
    await editor(page)
      .getByRole("button", { name: "Redo", exact: true })
      .click();
    await page.waitForFunction(
      () => document.getElementById("title").textContent === "",
    );
    await editor(page)
      .getByRole("button", { name: "Redo", exact: true })
      .click();
    await page.waitForFunction(
      () => document.getElementById("title").textContent === "Retyped title",
    );
    await edit(page, "#title", "Temporary autosave");
    await editor(page)
      .getByRole("textbox", { name: "Selected text", exact: true })
      .press("Escape");
    await page.evaluate(() => document.querySelector("text-editor").flush());
    assert.match(await fs.readFile(file, "utf8"), />Retyped title<\/h1>/);
  });
});

test("composition waits for complete text and typing during a delayed save retains the latest revision", async (t) => {
  const { url, file } = await fixture(t);
  await withPage(url, async (page) => {
    await editor(page)
      .getByRole("button", { name: "Edit text", exact: true })
      .click();
    await page.locator("#title").click();
    await page.locator("#title").dispatchEvent("compositionstart");
    await page.locator("#title").fill("Composing title");
    await page.waitForTimeout(350);
    assert.match(await fs.readFile(file, "utf8"), />Original title<\/h1>/);
    await page.locator("#title").dispatchEvent("compositionend");
    await page.evaluate(() => document.querySelector("text-editor").flush());
    assert.match(await fs.readFile(file, "utf8"), />Composing title<\/h1>/);
    await page.route("**/__codex_text", async (route) => {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({ response });
    });
    const field = editor(page).getByRole("textbox", {
      name: "Selected text",
      exact: true,
    });
    await field.fill("First revision");
    await page.waitForFunction(
      () => document.querySelector("text-editor").store.busy,
    );
    await field.fill("Latest revision");
    await page.evaluate(() => document.querySelector("text-editor").flush());
    assert.match(await fs.readFile(file, "utf8"), />Latest revision<\/h1>/);
    assert.equal(
      await page.evaluate(
        () => document.querySelector("text-editor").store.dirty.size,
      ),
      0,
    );
  });
});

test("stale source stops writes, keeps a copyable draft and recovers it for review after reload", async (t) => {
  const { url, file, html } = await fixture(t);
  await withPage(url, async (page, errors) => {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await fs.writeFile(file, html.replace("Original title", "External edit"));
    await edit(page, "#title", "My retained draft");
    assert.match(
      await editor(page).getByRole("status").textContent(),
      /Source changed/,
    );
    assert.match(await fs.readFile(file, "utf8"), />External edit<\/h1>/);
    await editor(page)
      .getByRole("button", { name: "Copy draft", exact: true })
      .click();
    assert.match(
      await page.evaluate(() => navigator.clipboard.readText()),
      /My retained draft/,
    );
    await editor(page)
      .getByRole("button", { name: "Reload source", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("text-editor")?.store?.retained,
    );
    assert.equal(await page.locator("#title").textContent(), "External edit");
    assert.match(
      await editor(page)
        .getByRole("textbox", {
          name: "Retained draft — review before applying",
        })
        .inputValue(),
      /My retained draft/,
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector("text-editor").store.dirty.size,
      ),
      0,
    );
    const index = errors.findIndex((error) => error.startsWith("HTTP 409:"));
    assert.ok(index >= 0);
    errors.splice(index, 1);
    const consoleIndex = errors.findIndex((error) => error.includes("409"));
    if (consoleIndex >= 0) errors.splice(consoleIndex, 1);
  });
});

test("session editing remains explicit, rejects generated replacements and offers draft fallback without clipboard or storage", async (t) => {
  const { url, file, html } = await fixture(t, { session: true });
  await withPage(url, async (page) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw Error("Unavailable");
      };
      navigator.clipboard.writeText = async () => {
        throw Error("Unavailable");
      };
    });
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector("text-editor")?.store,
    );
    await edit(page, "#title", "Session title");
    assert.match(
      await editor(page).getByRole("status").textContent(),
      /Session preview/,
    );
    assert.equal(await fs.readFile(file, "utf8"), html);
    await editor(page)
      .getByRole("button", { name: "Copy draft", exact: true })
      .click();
    assert.match(
      await editor(page).getByRole("status").textContent(),
      /Select and copy/,
    );
    assert.match(
      await editor(page)
        .getByRole("textbox", {
          name: "Retained draft — review before applying",
        })
        .inputValue(),
      /Session title/,
    );
    await editor(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await page.evaluate(
      () =>
        (document.getElementById("title").textContent = "Changed by renderer"),
    );
    await page.locator("#title").click();
    assert.match(
      await editor(page).getByRole("status").textContent(),
      /changed outside the editor/,
    );
  });
});

test("origin, token, request shape, size, stale versions and redirected paths cannot modify another source", async (t) => {
  const { url, file, dir, html } = await fixture(t);
  const binding = await (await fetch(url + "__codex_text")).json();
  const run = binding.entries.find((entry) => entry.text === "Original title");
  const payload = { edits: [{ key: run.key, text: "Changed" }] };
  assert.equal(
    (await request(url, binding, payload, { Origin: "https://other.example" }))
      .status,
    403,
  );
  assert.equal(
    (await request(url, binding, payload, { "X-Codex-Text-Token": "wrong" }))
      .status,
    403,
  );
  assert.equal(
    (await request(url, binding, { ...payload, file: "other.html" })).status,
    400,
  );
  assert.equal(
    (await request(url, binding, { edits: [{ key: "unknown", text: "X" }] }))
      .status,
    400,
  );
  assert.equal(
    (
      await request(url, binding, {
        edits: [{ key: run.key, text: "X".repeat(1048576) }],
      })
    ).status,
    400,
  );
  assert.equal(await fs.readFile(file, "utf8"), html);
  const saved = await request(url, binding, payload);
  assert.equal(saved.status, 200);
  assert.equal((await request(url, binding, payload)).status, 409);
  await fs.writeFile(path.join(dir, "other.html"), html);
  await fs.rm(file);
  await fs.symlink(path.join(dir, "other.html"), file);
  const now = await saved.json();
  assert.equal((await request(url, now, payload)).status, 400);
  assert.equal(await fs.readFile(path.join(dir, "other.html"), "utf8"), html);
});

test("shared source transactions serialize writers, reject intervening edits and recover after failure", async (t) => {
  const dir = await temporary(t),
    file = path.join(dir, "source.html");
  await fs.writeFile(file, "Original");
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const order = [];
  const one = sourceTransaction(file, async () => {
    order.push("first");
    await gate;
    await replaceSource(file, "Original", "First");
  });
  const two = sourceTransaction(file, async () => {
    order.push("second");
    await replaceSource(file, "Original", "Second");
  });
  const rejected = assert.rejects(two, /Source changed/);
  release();
  await one;
  await rejected;
  assert.deepEqual(order, ["first", "second"]);
  assert.equal(await fs.readFile(file, "utf8"), "First");
  await sourceTransaction(file, () =>
    replaceSource(file, "First", "Recovered"),
  );
  assert.equal(await fs.readFile(file, "utf8"), "Recovered");
  assert.deepEqual(await fs.readdir(dir), ["source.html"]);
});

test("text, deck, tweaks and motion share one file transaction and reject conflicting concurrent saves", async (t) => {
  const content = body
    .replace(
      "</head>",
      '<script type="application/json" id="codex-tweak-defaults">{"size":16}</script></head>',
    )
    .replace("<main>", "<deck-stage><section><main>")
    .replace(
      "</main>",
      "</main></section><section><h1>Second slide</h1></section></deck-stage>",
    )
    .replace(
      "</body>",
      `<script>window.OM_SCENES='[{"name":"Opening","dur":2}]';window.OM_PLAYBACK='{"mode":"loop"}';</script></body>`,
    );
  const { url, file } = await fixture(t, {
    content,
    extras: {
      deckFile: "index.html",
      tweaksFile: "index.html",
      motionFile: "index.html",
    },
  });
  const roles = ["text", "deck", "tweaks", "motion"];
  const bindings = await Promise.all(
    roles.map(async (role) => (await fetch(url + "__codex_" + role)).json()),
  );
  assert.equal(new Set(bindings.map((binding) => binding.version)).size, 1);
  await withPage(url, async (page) => {
    // Injected metadata from other editors must never change the source version.
    assert.equal(
      await page.evaluate(
        () => document.querySelector("text-editor").store.metadata.version,
      ),
      bindings[0].version,
    );
  });
  const run = bindings[0].entries.find(
    (entry) => entry.text === "Original title",
  );
  const payloads = [
    { edits: [{ key: run.key, text: "Text writer" }] },
    { count: 2, operation: { type: "skip", index: 1, value: true } },
    { edits: { size: 22 } },
    {
      scenes: [{ name: "Opening", dur: 4, nat: 2 }],
      playback: { mode: "times", count: 2 },
    },
  ];
  const responses = await Promise.all(
    roles.map((role, i) =>
      fetch(url + "__codex_" + role, {
        method: "POST",
        headers: {
          Origin: url.slice(0, -1),
          "Content-Type": "application/json",
          ["X-Codex-" + role + "-Token"]: bindings[i].token,
        },
        body: JSON.stringify({ version: bindings[i].version, ...payloads[i] }),
      }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409, 409, 409],
  );
  const winner = responses.findIndex((response) => response.status === 200);
  let source = await fs.readFile(file, "utf8");
  assert.equal(source.includes(">Text writer</h1>"), winner === 0);
  assert.equal(source.includes('data-skip="true"'), winner === 1);
  assert.equal(/"size":\s*22/.test(source), winner === 2);
  assert.equal(source.includes('"dur":4'), winner === 3);
  const fresh = await (await fetch(url + "__codex_text")).json();
  const response = await request(url, fresh, {
    edits: [{ key: run.key, text: "Final independent text" }],
  });
  assert.equal(response.status, 200);
  source = await fs.readFile(file, "utf8");
  assert.match(source, />Final independent text<\/h1>/);
  const undone = await request(url, await response.json(), { action: "undo" });
  assert.equal(undone.status, 200);
  assert.equal((await undone.json()).undoDepth, winner === 0 ? 1 : 0);
});

test("leaving before the debounce either saves the text or retains the exact draft for review", async (t) => {
  const { url, file } = await fixture(t);
  await withPage(url, async (page) => {
    await editor(page)
      .getByRole("button", { name: "Edit text", exact: true })
      .click();
    await page.locator("#title").click();
    await page.locator("#title").fill("Leaving with an unfinished save");
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector("text-editor")?.store,
    );
    const source = await fs.readFile(file, "utf8");
    const draft = await page.evaluate(() =>
      document.querySelector("text-editor").store.draftText(),
    );
    assert.ok(
      source.includes("Leaving with an unfinished save") ||
        draft.includes("Leaving with an unfinished save"),
    );
  });
});

test("source mode rejects renderer content, retains a failed draft with unavailable storage and never leaks its controls into captures", async (t) => {
  const { url, file, html } = await fixture(t);
  await withPage(url, async (page, errors) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw Error("Unavailable");
      };
      navigator.clipboard.writeText = async () => {
        throw Error("Unavailable");
      };
    });
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector("text-editor")?.store,
    );
    await editor(page)
      .getByRole("button", { name: "Edit text", exact: true })
      .click();
    await page.locator("#generated").click();
    assert.match(
      await editor(page).getByRole("status").textContent(),
      /no matching literal/,
    );
    await fs.writeFile(file, html.replace("Original title", "External title"));
    await edit(page, "#title", "Retained without storage");
    await editor(page)
      .getByRole("button", { name: "Reload source", exact: true })
      .click();
    assert.match(
      await editor(page).getByRole("status").textContent(),
      /Source changed/,
    );
    assert.match(
      await editor(page)
        .getByRole("textbox", {
          name: "Retained draft — review before applying",
        })
        .inputValue(),
      /Retained without storage/,
    );
    await editor(page)
      .getByRole("button", { name: "Copy draft", exact: true })
      .click();
    assert.match(
      await editor(page).getByRole("status").textContent(),
      /Source changed/,
    );
    const filtered = errors.filter((error) => !error.includes("409"));
    assert.ok(errors.some((error) => error.includes("409")));
    errors.splice(0, errors.length, ...filtered);
    await page.goto(url + "?capture");
    await page.waitForFunction(
      () => document.querySelector("text-editor")?.store,
    );
    assert.equal(await editor(page).isVisible(), false);
    assert.equal(await page.locator("#title").textContent(), "External title");
  });
});

test("implicit head injection keeps standards mode, Unicode survives split UTF-8 transport and comments stay untouched", async (t) => {
  const content =
    '<!doctype html><!-- A literal <head> in a comment --><p id="unicode">Original Unicode</p><svg width="200" height="50"><text x="5" y="25">Vector label</text></svg>';
  const { url, file } = await fixture(t, { content });
  await withPage(url, async (page) => {
    assert.equal(await page.evaluate(() => document.compatMode), "CSS1Compat");
    await edit(page, "#unicode", "Unicode café 🚀");
    await edit(page, "svg text", "Vector café 🚀");
    assert.match(
      await fs.readFile(file, "utf8"),
      /<!-- A literal <head> in a comment -->/,
    );
    assert.equal(
      await page.locator("svg text").textContent(),
      "Vector café 🚀",
    );
  });
  const binding = await (await fetch(url + "__codex_text")).json();
  const run = binding.entries.find((entry) => entry.text === "Unicode café 🚀");
  const bytes = Buffer.from(
    JSON.stringify({
      version: binding.version,
      edits: [{ key: run.key, text: "Split Unicode café 🚀" }],
    }),
  );
  const split = bytes.indexOf(Buffer.from("🚀")) + 1;
  const http = await import("node:http");
  const result = await new Promise((resolve, reject) => {
    const req = http.request(
      url + "__codex_text",
      {
        method: "POST",
        headers: {
          Origin: url.slice(0, -1),
          "Content-Type": "application/json",
          "X-Codex-Text-Token": binding.token,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.write(bytes.subarray(0, split));
    setTimeout(() => req.end(bytes.subarray(split)), 15);
  });
  assert.equal(result.status, 200, result.body);
  assert.match(await fs.readFile(file, "utf8"), /Split Unicode café 🚀/);
});

test("renderer mutations during inline editing retain authored DOM and pause the pending source save", async (t) => {
  const { url, file, html } = await fixture(t);
  await withPage(url, async (page) => {
    await editor(page)
      .getByRole("button", { name: "Edit text", exact: true })
      .click();
    await page.locator("#title").click();
    await page.locator("#title").fill("Draft before renderer mutation");
    await page.evaluate(() => {
      const title = document.getElementById("title");
      const span = document.createElement("span");
      span.textContent = "Renderer span";
      title.append(span);
      window.rendererSpan = span;
    });
    await page.waitForTimeout(350);
    assert.match(
      await editor(page).getByRole("status").textContent(),
      /changed outside the editor/,
    );
    await editor(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    assert.match(
      await editor(page).getByRole("status").textContent(),
      /changed outside the editor/,
    );
    assert.equal(
      await page.evaluate(
        () =>
          rendererSpan.isConnected &&
          rendererSpan.parentElement === originalTitle,
      ),
      true,
    );
    assert.equal(await fs.readFile(file, "utf8"), html);
    await editor(page)
      .getByRole("button", { name: "Copy draft", exact: true })
      .click();
    assert.match(
      await editor(page)
        .getByRole("textbox", {
          name: "Retained draft — review before applying",
        })
        .inputValue(),
      /Draft before renderer mutation/,
    );
  });
});
