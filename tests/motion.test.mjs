import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary } from "./helpers.mjs";
import { prepareDemo } from "../tools/demo.mjs";
import { serve } from "../skills/codex-design/scripts/preview.mjs";
import { withPage } from "../skills/codex-design/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/codex-design/scripts/export.mjs";
import {
  readMotionSource,
  saveMotionSource,
  motionBindings,
} from "../skills/codex-design/scripts/lib/motion-source.mjs";
import {
  deriveScenes,
  authoredTime,
  retimeScene,
  advancePlayback,
  parseScenes,
  parsePlayback,
  Easing,
  interpolate,
  animate,
} from "../skills/codex-design/assets/starters/motion-model.js";

test("retiming preserves authored cues, all choreography and cross-section motion", () => {
  const scenes = [
    { name: "Opening", dur: 2 },
    { name: "Build", dur: 4 },
    { name: "Close", dur: 2 },
  ];
  const original = deriveScenes(scenes),
    edited = deriveScenes(retimeScene(scenes, 1, 8));
  assert.deepEqual(edited.cues, original.cues);
  assert.equal(edited.duration, 12);
  for (const [play, authored] of [
    [0, 0],
    [2, 2],
    [6, 4],
    [10, 6],
    [12, 8],
  ])
    assert.equal(authoredTime(edited, play), authored);
  for (const boundary of [2, 10]) {
    const before = authoredTime(edited, boundary - 0.00001),
      after = authoredTime(edited, boundary + 0.00001);
    assert.ok(
      after - before < 0.00003,
      "Authored time must remain continuous at every section boundary",
    );
  }
  const twice = deriveScenes(retimeScene(edited.scenes, 1, 2));
  assert.deepEqual(twice.cues, original.cues);
  assert.equal(authoredTime(twice, 3), 4);
  assert.equal(
    deriveScenes([
      { name: "Same", dur: 1 },
      { name: "Same", dur: 2 },
    ]).cues.Same,
    0,
  );
});

test("motion curves, keyframes and finite playback retain the reference contracts", () => {
  for (const [name, ease] of Object.entries(Easing)) {
    assert.ok(Math.abs(ease(0)) < 1e-9, name);
    assert.ok(Math.abs(ease(1) - 1) < 1e-9, name);
  }
  assert.ok(Easing.easeOutBack(0.7) > 1);
  const tween = interpolate([0, 1, 3], [0, 10, 30], [Easing.easeInQuad]);
  assert.equal(tween(-1), 0);
  assert.equal(tween(0.5), 2.5);
  assert.equal(tween(2), 20);
  assert.equal(tween(4), 30);
  assert.equal(animate({ start: 1, end: 1, from: 0, to: 10 })(1), 0);
  assert.equal(animate({ start: 1, end: 1, from: 0, to: 10 })(2), 10);
  assert.deepEqual(advancePlayback(1.9, 0.2, 2, { mode: "times", count: 2 }), {
    time: 0.10000000000000009,
    passes: 1,
    playing: true,
  });
  assert.deepEqual(
    advancePlayback(1.9, 0.2, 2, { mode: "times", count: 2 }, 1),
    { time: 2, passes: 2, playing: false },
  );
  assert.equal(advancePlayback(0, 5, 2, { mode: "loop" }).time, 1);
  assert.throws(() => parseScenes([{ name: "X", dur: 301 }]), /duration/);
  assert.throws(() => parsePlayback({ mode: "times", count: 0 }), /repeat/);
  assert.equal(
    deriveScenes([
      { name: "Long A", dur: 200 },
      { name: "Long B", dur: 200 },
    ]).duration,
    400,
  );
});

test("timing source updates preserve surrounding HTML, escape script endings and detect stale edits", async (t) => {
  const dir = await temporary(t),
    file = path.join(dir, "animation.html");
  const html =
    '<h1>Keep this artwork</h1><script>window.OM_SCENES = \'[{"name":"Opening","dur":2}]\'; window.OM_PLAYBACK = \'{"mode":"loop"}\';</script><script>window.unrelated = 7;</script>';
  await fs.writeFile(file, html);
  const old = await readMotionSource(file);
  await saveMotionSource(file, {
    ...old,
    scenes: [
      {
        name: "Opening",
        dur: 4,
        nat: 2,
        desc: "</script><script>unexpected()</script>",
      },
    ],
    playback: { mode: "times", count: 2 },
  });
  const saved = await fs.readFile(file, "utf8");
  assert.ok(saved.startsWith("<h1>Keep this artwork</h1>"));
  assert.ok(saved.endsWith("<script>window.unrelated = 7;</script>"));
  assert.equal(saved.includes("unexpected()</script>"), false);
  assert.equal((await readMotionSource(file)).scenes[0].nat, 2);
  await assert.rejects(saveMotionSource(file, old), /Source changed/);
  assert.throws(
    () => motionBindings(html + '<script>window.CODEX_SCENES = "[]";</script>'),
    /Use between|Duplicate/,
  );
});

test("continuous React composition seeks synchronously, preserves nodes and persists editing", async (t) => {
  const dir = await temporary(t);
  await prepareDemo(dir);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url + "animation.html", async (page) => {
    await page.waitForFunction(() => window.codexTimeline);
    assert.equal(
      await page.locator("[data-codex-exportable-video-duration]").count(),
      1,
    );
    await page.evaluate(() => {
      window.savedNode = document.querySelector("[data-shared-element]");
      codexTimeline.seek(1);
    });
    const at1 = await page.locator(".card").evaluate((e) => e.style.transform);
    for (const time of [1.85, 2.15, 3.85, 4.15, 6, 1]) {
      const authored = await page.evaluate((time) => {
        codexTimeline.root.dispatchEvent(
          new CustomEvent("codex-seek-to-time", {
            detail: { time, sync: true },
          }),
        );
        return document.querySelector("[data-authored-time]").textContent;
      }, time);
      assert.equal(+authored, time);
      assert.equal(
        await page.evaluate(
          () => savedNode === document.querySelector("[data-shared-element]"),
        ),
        true,
      );
      assert.ok((await page.locator("[data-codex-caption]").count()) <= 1);
    }
    assert.equal(
      await page.locator(".card").evaluate((e) => e.style.transform),
      at1,
    );
    assert.equal(await page.locator(".cd-diagnostics").count(), 0);
    await page.evaluate(() =>
      codexTimeline.root.dispatchEvent(
        new CustomEvent("codex-seek-to-time", {
          detail: { time: 1, playing: true },
        }),
      ),
    );
    assert.equal(
      await page.locator("[data-composition-playing]").textContent(),
      "true",
    );
    await page.waitForFunction(
      () =>
        document.querySelector("[data-composition-playing]").textContent ===
        "false",
    );
    assert.equal(await page.evaluate(() => codexTimeline.time), 1);
    await page
      .getByRole("button", { name: "Select Collect", exact: true })
      .click();
    await page.getByLabel("Playback seconds", { exact: true }).fill("4");
    assert.equal(await page.evaluate(() => codexTimeline.duration), 8);
    await page.evaluate(() => codexTimeline.seek(4));
    assert.equal(
      +(await page.locator("[data-authored-time]").textContent()),
      3,
    );
    await page.getByLabel("Section speed", { exact: true }).fill("2");
    assert.equal(await page.evaluate(() => codexTimeline.duration), 5);
    await page.evaluate(() => codexTimeline.seek(2.5));
    assert.equal(
      +(await page.locator("[data-authored-time]").textContent()),
      3,
    );
    await page
      .getByRole("button", { name: "Motion editor", exact: true })
      .click();
    assert.equal(await page.locator(".cd-editor").count(), 0);
    await page.reload();
    await page.waitForFunction(() => window.codexTimeline);
    assert.equal(await page.evaluate(() => codexTimeline.duration), 5);
    assert.equal(await page.evaluate(() => codexTimeline.time), 2.5);
    assert.equal(await page.locator(".cd-editor").count(), 0);
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => codexTimeline.time), 2.6);
    await page.keyboard.press("Home");
    assert.equal(await page.evaluate(() => codexTimeline.time), 0);
    await page
      .getByRole("button", { name: "Motion editor", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Select Collect", exact: true })
      .click();
    const edge = page.getByRole("button", {
      name: "Stretch Collect",
      exact: true,
    });
    const beforeDrag = await page.evaluate(() => codexTimeline.duration);
    const bounds = await edge.boundingBox();
    await page.mouse.move(bounds.x + 4, bounds.y + 10);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 84, bounds.y + 10);
    await page.mouse.up();
    assert.ok((await page.evaluate(() => codexTimeline.duration)) > beforeDrag);
    await page.evaluate(() => {
      codexTimeline.root.dispatchEvent(
        new CustomEvent("codex-timeline-scenes-update", {
          detail:
            '[{"name":"Opening","dur":0.1},{"name":"Collect","dur":0.1},{"name":"Return","dur":0.1}]',
        }),
      );
      codexTimeline.root.dispatchEvent(
        new CustomEvent("codex-timeline-playback-update", {
          detail: '{"mode":"times","count":2}',
        }),
      );
    });
    // Start at zero so a previously clamped end frame cannot satisfy the wait before React commits Play.
    await page.evaluate(() => codexTimeline.seek(0));
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(
      () =>
        Math.abs(codexTimeline.time - 0.3) < 1e-9 &&
        document.querySelector("[data-composition-playing]").textContent ===
          "false",
    );
    assert.equal(
      await page.getByRole("button", { name: "Play", exact: true }).count(),
      1,
    );
  });
});

test("continuous composition standalone works without the runtime source or bundle files", async (t) => {
  const dir = await temporary(t);
  await prepareDemo(dir);
  await exportArtifact(
    "html",
    path.join(dir, "animation.html"),
    path.join(dir, "standalone.html"),
  );
  await fs.rm(path.join(dir, "animation.bundle.js"));
  await fs.rm(path.join(dir, "starters"), { recursive: true });
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url + "standalone.html", async (page) => {
    await page.waitForFunction(() => window.codexTimeline);
    await page.evaluate(() => codexTimeline.seek(3));
    assert.equal(
      +(await page.locator("[data-authored-time]").textContent()),
      3,
    );
    assert.equal(await page.locator(".card").count(), 1);
  });
});

test("motion edits write through only to the explicitly enabled source and reject stale or foreign writes", async (t) => {
  const dir = await temporary(t);
  await prepareDemo(dir);
  const file = path.join(dir, "animation.html");
  const { server, url } = await serve(dir, 0, { motionFile: "animation.html" });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const initial = await (await fetch(url + "__codex_motion")).json();
  const rejected = await fetch(url + "__codex_motion", {
    method: "POST",
    headers: {
      Origin: "https://example.com",
      "Content-Type": "application/json",
      "X-Codex-Motion-Token": initial.token,
    },
    body: JSON.stringify(initial),
  });
  assert.equal(rejected.status, 403);
  await withPage(url + "animation.html?edit-source", async (page) => {
    await page
      .getByRole("status")
      .filter({ hasText: "Source connected" })
      .waitFor();
    await page.getByLabel("Playback seconds", { exact: true }).fill("4");
    await page
      .getByRole("status")
      .filter({ hasText: "Timing saved to source" })
      .waitFor();
    const saved = await readMotionSource(file);
    assert.equal(saved.scenes[0].dur, 4);
    assert.equal(saved.scenes[0].nat, 2);
    await page.reload();
    await page.waitForFunction(() => window.codexTimeline?.duration === 8);
    assert.equal(await page.evaluate(() => codexTimeline.duration), 8);
    await page
      .getByRole("button", { name: "Export video", exact: true })
      .click();
    await page.getByLabel("Video fps", { exact: true }).fill("5");
    await page.getByLabel("Capture scale", { exact: true }).fill("1");
    await page.getByLabel("Export end seconds", { exact: true }).fill("0.4");
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Render and download", exact: true })
      .click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "animation.mp4");
    const data = await fs.readFile(await download.path());
    assert.equal(data.subarray(4, 8).toString(), "ftyp");
  });
  const stale = await fetch(url + "__codex_motion", {
    method: "POST",
    headers: {
      Origin: url.slice(0, -1),
      "Content-Type": "application/json",
      "X-Codex-Motion-Token": initial.token,
    },
    body: JSON.stringify(initial),
  });
  assert.equal(stale.status, 409);
});

test("video ranges, custom bridges, supersampling and diagnostics render real frames", async (t) => {
  const dir = await temporary(t);
  await fs.writeFile(
    path.join(dir, "custom.html"),
    '<html><body style="margin:0;background:red"><script>window.legacyClock={duration:0.4,setPlaying(){},setTime(t){document.body.style.background=t<0.2?"red":"blue";}};</script></body></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const output = path.join(dir, "range.mp4");
  const result = await exportArtifact("video", url + "custom.html", output, {
    bridgeGlobal: "legacyClock",
    width: 320,
    height: 240,
    fps: 5,
    startMs: 200,
    endMs: 400,
    deviceScaleFactor: 2,
    crf: 12,
  });
  assert.equal(result.frames, 1);
  assert.equal(result.duration, 0.2);
  assert.equal(result.deviceScaleFactor, 2);
  const raw = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    output,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  const offset = (120 * 320 + 160) * 3;
  assert.ok(raw[offset + 2] > 200);
  assert.ok(raw[offset] < 20);
  const held = await exportArtifact(
    "video",
    url + "custom.html",
    path.join(dir, "held.gif"),
    {
      bridgeGlobal: "legacyClock",
      width: 320,
      height: 240,
      fps: 10,
      startMs: 200,
      endMs: 400,
    },
  );
  assert.ok(held.flags.some((flag) => flag.kind === "duplicate_frames"));
  await assert.rejects(
    exportArtifact(
      "video",
      url + "custom.html",
      path.join(dir, "invalid.mp4"),
      { bridgeGlobal: "legacyClock", width: 320, height: 240, endMs: 500 },
    ),
    /interval/,
  );
});

// Numeric samples independently calculated from the reference's mathematical
// curve contracts; no reference runtime is imported or evaluated.
test("all twenty reference easing curves match interior samples and tween output", () => {
  const samples = [0.1, 0.25, 0.5, 0.75, 0.9];
  const expected = {
    linear: [0.1, 0.25, 0.5, 0.75, 0.9],
    easeInQuad: [0.01, 0.0625, 0.25, 0.5625, 0.81],
    easeOutQuad: [0.19, 0.4375, 0.75, 0.9375, 0.99],
    easeInOutQuad: [0.02, 0.125, 0.5, 0.875, 0.98],
    easeInCubic: [0.001, 0.015625, 0.125, 0.421875, 0.729],
    easeOutCubic: [0.271, 0.578125, 0.875, 0.984375, 0.999],
    easeInOutCubic: [0.004, 0.0625, 0.5, 0.9375, 0.996],
    easeInQuart: [0.0001, 0.00390625, 0.0625, 0.31640625, 0.6561],
    easeOutQuart: [0.3439, 0.68359375, 0.9375, 0.99609375, 0.9999],
    easeInOutQuart: [0.0008, 0.03125, 0.5, 0.96875, 0.9992],
    easeInSine: [
      0.012311659404862, 0.076120467488713, 0.292893218813452, 0.61731656763491,
      0.843565534959769,
    ],
    easeOutSine: [
      0.156434465040231, 0.38268343236509, 0.707106781186547, 0.923879532511287,
      0.987688340595138,
    ],
    easeInOutSine: [
      0.024471741852423, 0.146446609406726, 0.5, 0.853553390593274,
      0.975528258147577,
    ],
    easeInExpo: [
      0.001953125, 0.00552427172802, 0.03125, 0.176776695296637, 0.5,
    ],
    easeOutExpo: [
      0.5, 0.823223304703363, 0.96875, 0.99447572827198, 0.998046875,
    ],
    easeInOutExpo: [0.001953125, 0.015625, 0.5, 0.984375, 0.998046875],
    easeInBack: [
      -0.01431422, -0.0641365625, -0.0876975, 0.1825903125, 0.59117202,
    ],
    easeOutBack: [
      0.40882798, 0.8174096875, 1.0876975, 1.0641365625, 1.01431422,
    ],
    easeInOutBack: [
      -0.037518552, -0.09968184375, 0.5, 1.09968184375, 1.037518552,
    ],
    easeOutElastic: [
      1.25, 0.911611652351682, 1.015625, 1.00552427172802, 0.998046875,
    ],
  };
  assert.deepEqual(Object.keys(Easing).sort(), Object.keys(expected).sort());
  for (const [name, values] of Object.entries(expected)) {
    const tween = animate({
      from: -20,
      to: 80,
      start: 2,
      end: 6,
      ease: Easing[name],
    });
    for (const [index, progress] of samples.entries()) {
      assert.ok(
        Math.abs(Easing[name](progress) - values[index]) < 1e-12,
        `${name} at ${progress}`,
      );
      assert.ok(
        Math.abs(tween(2 + progress * 4) - (-20 + values[index] * 100)) < 1e-10,
        `${name} tween at ${progress}`,
      );
    }
  }
});
