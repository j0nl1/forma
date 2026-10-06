import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { readCompositionSource } from "../packages/runtime/src/node/composition-source.mjs";

const scenes = [
  { name: "Opening", dur: 2, nat: 4 },
  { name: "Close", dur: 4, nat: 2 },
];
const clips = {
  schemaVersion: 1,
  clips: [
    {
      id: "title",
      kind: "caption",
      timeBasis: "authored",
      start: 1,
      duration: 1,
      track: 2,
      text: "Native title",
    },
    {
      id: "card",
      kind: "visual",
      timeBasis: "playback",
      start: 2,
      duration: 1,
      track: 0,
    },
  ],
};
const html = (includeClips = true) =>
  '<!doctype html><html lang="en"><body style="margin:0"><div id="root"></div>' +
  `<script>window.CODEX_SCENES = ${JSON.stringify(JSON.stringify(scenes))}; window.CODEX_PLAYBACK = '${JSON.stringify({ mode: "loop" })}';</script>` +
  (includeClips
    ? `<script id="studio-motion-clips" type="application/json">${JSON.stringify(clips)}</script>`
    : "") +
  '<p hidden>Preserved source markup</p><script src="bundle.js"></script></body></html>';
async function fixture(t, { browser = false, includeClips = true } = {}) {
  const dir = await temporary(t),
    file = path.join(dir, "motion.html");
  await fs.writeFile(file, html(includeClips));
  if (browser) {
    const runtime = path.join(
      root,
      "packages/runtime/src/browser/animations.jsx",
    );
    const composition = path.join(
      root,
      "packages/runtime/src/browser/composition-components.jsx",
    );
    await fs.writeFile(
      path.join(dir, "entry.jsx"),
      `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { CompositionStage } from ${JSON.stringify(runtime)};
      import { CompositionProvider, useClip } from ${JSON.stringify(composition)};
      function Probe() { const frame=useClip("title"); return <output id="clip-probe" data-frame={JSON.stringify({localTime:frame.localTime,visible:frame.visible,start:frame.start})}>Native artwork</output>; }
      createRoot(document.getElementById("root")).render(<CompositionStage width={400} height={220} autoplay={false} source={true} scenes={JSON.parse(window.CODEX_SCENES)} playback={JSON.parse(window.CODEX_PLAYBACK)} persistKey="composition-source-test"><CompositionProvider source={true}><Probe/></CompositionProvider></CompositionStage>);
    `,
    );
    await bundle(path.join(dir, "entry.jsx"), path.join(dir, "bundle.js"));
  }
  const { server, url } = await serve(dir, 0, { motionFile: "motion.html" });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, file, server, url };
}
const headers = (url, token) => ({
  Origin: url.slice(0, -1),
  "Content-Type": "application/json",
  "X-Codex-Motion-Token": token,
});
const post = (url, token, value, overrides = {}) =>
  fetch(url + "__codex_composition", {
    method: "POST",
    headers: { ...headers(url, token), ...overrides },
    body: JSON.stringify(value),
  });

test("clip endpoint is explicitly selected, token protected and versioned with session undo/redo", async (t) => {
  const { file, url } = await fixture(t),
    original = await fs.readFile(file, "utf8");
  const initial = await (await fetch(url + "__codex_composition")).json();
  const timing = await (await fetch(url + "__codex_motion")).json();
  assert.equal(initial.token, timing.token);
  assert.equal(initial.version, timing.version);
  const operation = {
    baseVersion: initial.version,
    clipId: "title",
    start: 2,
    operationId: "endpoint-move",
  };
  assert.equal(
    (
      await post(url, initial.token, operation, {
        Origin: "https://example.com",
      })
    ).status,
    403,
  );
  assert.equal((await post(url, "wrong-token", operation)).status, 403);
  assert.equal(
    (
      await fetch(url + "__codex_composition", {
        headers: { Origin: "https://example.com" },
      })
    ).status,
    403,
  );
  assert.equal(await fs.readFile(file, "utf8"), original);
  const response = await post(url, initial.token, operation);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.plan.clips[0].start, 2);
  assert.equal(saved.undoDepth, 1);
  assert.equal(
    (await post(url, initial.token, { ...operation, operationId: "stale" }))
      .status,
    409,
  );
  const reloaded = await (await fetch(url + "__codex_composition")).json();
  assert.equal(reloaded.version, saved.version);
  assert.equal(reloaded.document.clips[0].start, 2);
  const undo = await (
    await post(url, initial.token, {
      baseVersion: saved.version,
      action: "undo",
      operationId: "endpoint-undo",
    })
  ).json();
  assert.equal(await fs.readFile(file, "utf8"), original);
  assert.equal(undo.document.clips[0].start, 1);
  const redo = await post(url, initial.token, {
    baseVersion: undo.version,
    action: "redo",
    operationId: "endpoint-redo",
  });
  assert.equal(redo.status, 200);
  assert.equal((await redo.json()).document.clips[0].start, 2);
  const unexpected = await post(url, initial.token, {
    ...operation,
    baseVersion: (await readCompositionSource(file)).version,
    operationId: "foreign-path",
    file: "/tmp/other.html",
  });
  assert.equal(unexpected.status, 400);
});
test("legacy motion sources gain no clip binding, endpoint or source mutation", async (t) => {
  const { file, url } = await fixture(t, { includeClips: false });
  const before = await fs.readFile(file, "utf8");
  assert.equal((await fetch(url + "__codex_composition")).status, 404);
  assert.equal(await fs.readFile(file, "utf8"), before);
});
test("source inspector uses native retimed clock, actual source moves and browser reload/undo", async (t) => {
  const { file, url } = await fixture(t, { browser: true });
  await withPage(url + "motion.html", async (page, errors) => {
    await page
      .getByRole("status")
      .filter({ hasText: "Clip source connected" })
      .waitFor();
    assert.equal(
      await page.getByRole("region", { name: "Clip inspector" }).count(),
      1,
    );
    const inspection = await page.evaluate(() => ({
      hasPlan: !!codexTimeline.compositionPlan,
      shared: codexTimeline.audioPlan === codexTimeline.compositionPlan,
      basis: codexTimeline.compositionPlan.clips[0].timeBasis,
    }));
    assert.deepEqual(inspection, {
      hasPlan: true,
      shared: true,
      basis: "authored",
    });
    assert.equal(
      await page.evaluate(
        () =>
          Object.getOwnPropertyDescriptor(codexTimeline, "compositionPlan")
            .set === undefined &&
          Object.isFrozen(codexTimeline.compositionPlan),
      ),
      true,
    );
    await page.evaluate(() => codexTimeline.seek(0.75));
    assert.equal(
      await page
        .locator("#clip-probe")
        .evaluate((node) => JSON.parse(node.dataset.frame).localTime),
      0.5,
    );
    await page
      .getByRole("button", { name: "Select clip title", exact: true })
      .click();
    await page.getByLabel("Clip start seconds", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "Save clip start", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Clip saved to source" })
      .waitFor();
    assert.equal(
      (await readCompositionSource(file)).document.clips[0].start,
      2,
    );
    await page
      .getByRole("button", { name: "Undo clip move", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Clip move undone" })
      .waitFor();
    assert.equal(
      (await readCompositionSource(file)).document.clips[0].start,
      1,
    );
    await page
      .getByRole("button", { name: "Redo clip move", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Clip move redone" })
      .waitFor();
    await page.getByLabel("Clip start seconds", { exact: true }).fill("3");
    await page
      .getByRole("button", { name: "Select Opening", exact: true })
      .click();
    await page.getByLabel("Playback seconds", { exact: true }).fill("1");
    await page
      .getByRole("status")
      .filter({ hasText: "Timing saved to source" })
      .waitFor();
    await page
      .getByRole("status")
      .filter({ hasText: "Clip source connected" })
      .waitFor();
    await page.waitForFunction(
      () => codexTimeline.compositionPlan.sections[0].dur === 1,
    );
    assert.equal(
      await page.getByLabel("Clip start seconds", { exact: true }).inputValue(),
      "3",
    );
    assert.equal(
      (await readCompositionSource(file)).document.clips[0].start,
      2,
    );
    await page.evaluate(() => codexTimeline.seek(0.75));
    assert.equal(
      await page
        .locator("#clip-probe")
        .evaluate((node) => JSON.parse(node.dataset.frame).localTime),
      1,
    );
    await page.reload();
    await page
      .getByRole("status")
      .filter({ hasText: "Clip source connected" })
      .waitFor();
    assert.equal(
      await page.getByLabel("Clip start seconds", { exact: true }).inputValue(),
      "2",
    );
    await page.getByLabel("Clip start seconds", { exact: true }).fill("3");
    await fs.appendFile(file, "<!-- External edit -->");
    await page
      .getByRole("button", { name: "Save clip start", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({
        hasText: "Clip drafts are retained; reload source before retrying",
      })
      .waitFor();
    assert.equal(
      await page.getByLabel("Clip start seconds", { exact: true }).inputValue(),
      "3",
    );
    assert.equal(
      (await readCompositionSource(file)).document.clips[0].start,
      2,
    );
    await page
      .getByRole("button", { name: "Reload clip source", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Clip source connected" })
      .waitFor();
    assert.equal(
      await page.getByLabel("Clip start seconds", { exact: true }).inputValue(),
      "3",
    );
    assert.ok(errors.some((value) => value.includes("409")));
    const unexpected = errors.filter((value) => !value.includes("409"));
    assert.deepEqual(unexpected, []);
    errors.length = 0;
  });
  await withPage(url + "motion.html?capture=1", async (page) => {
    await page.waitForFunction(() => codexTimeline.compositionPlan);
    assert.equal(
      await page.getByRole("region", { name: "Clip inspector" }).count(),
      0,
    );
  });
});
