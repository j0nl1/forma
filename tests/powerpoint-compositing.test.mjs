import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unzipSync, strFromU8 } from "fflate";
import { temporary, root } from "./helpers.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { exportArtifact } from "../skills/forma/scripts/export.mjs";
import { parseEffect } from "../skills/forma/assets/starters/deck-effects.js";
import { tracksFor } from "../skills/forma/scripts/lib/pptx-motion-effects.mjs";
import {
  compositingIssue,
  cohortOpacity,
  cohortInitialState,
} from "../skills/forma/scripts/lib/pptx-motion-compositing.mjs";

const slide = { width: 640, height: 360 };
const run = promisify(execFile);
function entry(id, effect, geometry, attributes = {}) {
  return {
    id,
    geometry,
    ...parseEffect({
      "data-anim": effect,
      "data-anim-duration": "1000",
      ...attributes,
    }),
  };
}
function opacityComponent(secondY = 180, childPath = "M0 0 L60 0") {
  const parent = entry("parent", "fade-in", { x: 100, y: 70, w: 350, h: 200 });
  const child = entry(
    "child",
    "path",
    { x: 180, y: secondY, w: 100, h: 50 },
    { "data-anim-path": childPath },
  );
  return {
    entries: [parent, child],
    cohorts: [
      { chain: ["parent"], geometry: { x: 100, y: 70, w: 140, h: 50 } },
      { chain: ["child", "parent"], geometry: child.geometry },
    ],
  };
}

test("nested opacity rejects overlap anywhere in the motion envelope", () => {
  assert.equal(compositingIssue(opacityComponent(), slide), null);
  assert.match(
    compositingIssue(opacityComponent(90), slide),
    /paint envelopes overlap/,
  );
  assert.match(
    compositingIssue(opacityComponent(180, "M0 0 L0 -110"), slide),
    /paint envelopes overlap/,
  );
  const single = opacityComponent(90);
  single.cohorts = [single.cohorts[1]];
  assert.equal(
    compositingIssue(single, slide),
    null,
    "One native cohort composites its internal overlap once",
  );
});

test("native masks require leaf ownership and matching clipping coordinates", () => {
  const parent = entry(
    "parent",
    "path",
    { x: 100, y: 70, w: 300, h: 200 },
    { "data-anim-path": "M0 0 L60 0" },
  );
  const mask = entry("mask", "wipe-in", { x: 180, y: 100, w: 100, h: 60 });
  const component = {
    entries: [parent, mask],
    cohorts: [{ chain: ["mask", "parent"], geometry: mask.geometry }],
  };
  assert.equal(compositingIssue(component, slide), null);
  assert.equal(component.cohorts[0].maskEntryId, "mask");
  component.cohorts[0].geometry = { ...mask.geometry, w: 80 };
  assert.match(compositingIssue(component, slide), /clipping bounds/);
  component.cohorts[0] = {
    chain: ["parent", "mask"],
    geometry: parent.geometry,
  };
  assert.match(compositingIssue(component, slide), /ancestor mask/);
});

test("opacity products preserve pending child clicks and repeated source phases", () => {
  const parent = entry("parent", "fade-in", { x: 0, y: 0, w: 100, h: 100 });
  const child = entry("child", "fade-out", parent.geometry);
  for (const item of [parent, child])
    item.tracks = tracksFor(item, slide).tracks;
  const entries = new Map([
    [parent.id, parent],
    [child.id, child],
  ]);
  const cohort = { chain: ["child", "parent"] };
  assert.equal(
    cohortOpacity(cohort, entries, () => ({ progress: null })),
    0,
  );
  assert.equal(
    cohortOpacity(cohort, entries, (item) => ({
      progress: item === parent ? 1 : 0,
    })),
    1,
  );
  const opacity = cohortOpacity(cohort, entries, () => ({ progress: 0.5 }));
  assert.ok(opacity > 0 && opacity < 0.25);
  assert.equal(
    cohortOpacity(cohort, entries, (item) => ({
      progress: item === parent ? 0 : 1,
    })),
    0,
  );
  assert.deepEqual(cohortInitialState(cohort, entries), {
    opacity: 0,
    visibility: "visible",
  });
});

test("PowerPoint exports disjoint nested opacity and leaf masks as editable native builds", async (t) => {
  const dir = await temporary(t);
  await fs.cp(
    path.join(root, "skills/forma/assets/starters"),
    path.join(dir, "starters"),
    { recursive: true },
  );
  const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Native compositing regression</title><style>body{margin:0}section{background:white}</style></head><body><deck-stage width="640" height="360"><section><p style="margin:10px;font:20px Arial">Editable outside artwork</p><div style="position:absolute;left:100px;top:70px;width:350px;height:200px" data-anim="fade-in" data-anim-trigger="click" data-anim-duration="1000"><div style="position:absolute;left:0;top:0;width:140px;height:50px;background:red"></div><div style="position:absolute;left:80px;top:110px;width:100px;height:50px;background:blue" data-anim="path" data-anim-path="M0 0 L60 0" data-anim-trigger="with" data-anim-duration="1000"></div></div></section><section><div style="position:absolute;left:100px;top:70px;width:300px;height:200px" data-anim="path" data-anim-path="M0 0 L60 0" data-anim-trigger="click" data-anim-duration="1000"><div style="position:absolute;left:0;top:0;width:100px;height:50px;background:red"></div><div style="position:absolute;left:80px;top:80px;width:100px;height:60px;background:blue" data-anim="wipe-in" data-anim-dir="left" data-anim-trigger="with" data-anim-duration="1000"></div></div></section></deck-stage><script src="starters/deck.js"></script></body></html>`;
  await fs.writeFile(path.join(dir, "index.html"), source);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const output = path.join(dir, "compositing.pptx");
  const result = await exportArtifact("pptx", url, output);
  assert.equal(result.nativeAnimations, 4);
  assert.equal(result.staticAnimations, 0);
  const zip = unzipSync(await fs.readFile(output));
  assert.match(
    strFromU8(zip["ppt/slides/slide1.xml"]),
    /<a:t>Editable outside artwork<\/a:t>/,
  );
  assert.match(strFromU8(zip["ppt/slides/slide2.xml"]), /<p:animEffect/);
  assert.equal(await fs.readFile(path.join(dir, "index.html"), "utf8"), source);
});

test(
  "Impress plays nested opacity and preserves pending leaf-mask click boundaries",
  {
    skip: process.env.STUDIO_TEST_IMPRESS !== "1",
  },
  async (t) => {
    const dir = await temporary(t);
    await fs.cp(
      path.join(root, "skills/forma/assets/starters"),
      path.join(dir, "starters"),
      { recursive: true },
    );
    const specimen = (parent, child, trigger) =>
      `<section><div style="position:absolute;left:100px;top:70px;width:350px;height:220px" data-anim="${parent}" data-anim-trigger="click" data-anim-path="M0 0 L60 0" data-anim-duration="800"><div style="position:absolute;left:0;top:0;width:140px;height:50px;background:#ff0000"></div><div style="position:absolute;left:80px;top:110px;width:100px;height:60px;background:#0000ff" data-anim="${child}" data-anim-dir="left" data-anim-path="M0 0 L60 0" data-anim-trigger="${trigger}" data-anim-duration="800"></div></div></section>`;
    const slides = [
      specimen("fade-in", "path", "with"),
      specimen("path", "wipe-in", "after"),
      specimen("path", "wipe-in", "click"),
      specimen("path", "wipe-in", "with"),
      specimen("fade-in", "fade-in", "after"),
    ];
    await fs.writeFile(
      path.join(dir, "index.html"),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Native compositing playback</title><style>body{margin:0}section{background:white}</style></head><body><deck-stage width="640" height="360">${slides.join("")}</deck-stage><script src="starters/deck.js"></script></body></html>`,
    );
    const { server, url } = await serve(dir, 0);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const output = path.join(dir, "compositing-playback.pptx");
    const exported = await exportArtifact("pptx", url, output);
    assert.equal(exported.nativeAnimations, 10);
    const { stdout } = await run(
      "/usr/bin/python3",
      [path.join(root, "tests/powerpoint-compositing-impress.py"), output, dir],
      { timeout: 45000, maxBuffer: 1024 * 1024 },
    );
    const [fade, after, click, withParent, nestedFade] = JSON.parse(stdout);
    assert.equal(fade.before.red.pixels, 0);
    assert.equal(fade.before.blue.pixels, 0);
    assert.ok(
      fade.first.some(
        (frame) => frame.redPixel[1] > 10 && frame.redPixel[1] < 240,
      ),
      "The source fade passes through partial opacity",
    );
    assert.ok(
      fade.first.at(-1).blue.bounds[0] > 470,
      "The child path finishes while its ancestor fades",
    );
    for (const masked of [after, click, withParent]) {
      assert.equal(
        masked.before.blue.pixels,
        0,
        "The pending mask is hidden before its source click",
      );
      assert.ok(
        masked.first.at(-1).red.bounds[0] > 310,
        "The ancestor path remains native",
      );
    }
    assert.equal(
      after.first[1].blue.pixels,
      0,
      "The after mask waits for the parent",
    );
    assert.ok(after.first.at(-1).blue.pixels > 20000);
    assert.ok(
      click.first.every((frame) => frame.blue.pixels === 0),
      "The child does not consume the parent's click",
    );
    assert.ok(click.second.at(-1).blue.pixels > 20000);
    assert.ok(
      withParent.first.some(
        (frame) => frame.blue.pixels > 0 && frame.blue.pixels < 20000,
      ),
      "The mask reveals during the ancestor path",
    );
    assert.ok(withParent.first.at(-1).blue.pixels > 20000);
    assert.equal(
      nestedFade.first[1].blue.pixels,
      0,
      "The pending child fade keeps the opacity product at zero",
    );
    assert.ok(nestedFade.first.at(-1).blue.pixels > 20000);
    // Direction is deliberately not asserted: Impress reverses the documented
    // Office wipe directions. Native timing and clipping coordinates are tested.
  },
);
