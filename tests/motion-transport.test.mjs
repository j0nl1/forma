import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";

async function setup(t) {
  const dir = await temporary(t);
  const runtime = path.join(
    root,
    "packages/runtime/src/browser/motion/animations.jsx",
  );
  await fs.writeFile(
    path.join(dir, "main.jsx"),
    `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { CompositionStage, useComposition, useTimeline } from ${JSON.stringify(runtime)};
    function Probe() {
      const timeline = useTimeline();
      const composition = useComposition();
      return <div style={{padding:20,color:"white"}}>
        <output id="probe" data-state={JSON.stringify({
          displayed:timeline.time, own:timeline.playing, external:timeline.extPlaying,
          playing:composition.playing, authored:composition.T
        })}>A persistent composition</output>
        <button id="own-toggle" onClick={() => timeline.setPlaying(p => !p)}>Toggle authored playback</button>
      </div>;
    }
    window.testRoot = createRoot(document.getElementById("root"));
    testRoot.render(<CompositionStage width={400} height={240} autoplay={false}
      persistKey="transport-fixture" scenes='[{"name":"Opening","dur":2},{"name":"Build","dur":2},{"name":"Close","dur":2}]'
      playback='{"mode":"times","count":2}'><Probe/></CompositionStage>);
  `,
  );
  await bundle(path.join(dir, "main.jsx"), path.join(dir, "bundle.js"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    '<!doctype html><html lang="en"><body style="margin:0"><div id="root"></div><script src="bundle.js"></script></body></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return url;
}
const read = (page) =>
  page.evaluate(() => ({
    ...JSON.parse(document.getElementById("probe").dataset.state),
    actual: codexTimeline.time,
    duration: codexTimeline.duration,
  }));
const near = (actual, expected, tolerance = 0.00001) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} should be near ${expected}`,
  );
async function freeze(page) {
  await page.waitForFunction(() => window.codexTimeline);
  await page.clock.install({ time: new Date("2026-10-01T10:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-01T10:00:01Z"));
}
const seek = (page, time, playing = false) =>
  page.evaluate(
    ({ time, playing }) => {
      codexTimeline.root.dispatchEvent(
        new CustomEvent("codex-seek-to-time", { detail: { time, playing } }),
      );
    },
    { time, playing },
  );
const timing = (page, { duration, count }) =>
  page.evaluate(
    ({ duration, count }) => {
      if (duration !== undefined)
        codexTimeline.root.dispatchEvent(
          new CustomEvent("codex-timeline-scenes-update", {
            detail: JSON.stringify(
              ["Opening", "Build", "Close"].map((name) => ({
                name,
                dur: duration / 3,
              })),
            ),
          }),
        );
      if (count !== undefined)
        codexTimeline.root.dispatchEvent(
          new CustomEvent("codex-timeline-playback-update", {
            detail: JSON.stringify({ mode: "times", count }),
          }),
        );
    },
    { duration, count },
  );

test("hover previews while either clock plays without persisting the preview and every transport clears it", async (t) => {
  const url = await setup(t);
  await withPage(url, async (page) => {
    await freeze(page);
    await seek(page, 1);
    const track = await page.getByLabel("Timeline position").boundingBox();
    const point = (fraction) => ({
      x: track.x + track.width * fraction,
      y: track.y + track.height / 2,
    });
    let p = point(0.75);
    await page.mouse.move(p.x, p.y);
    near((await read(page)).displayed, 4.5);
    near((await read(page)).actual, 1);
    assert.equal(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("transport-fixture:time")),
      ),
      1,
    );
    await page.evaluate(() => codexTimeline.setPlaying(true));
    near((await read(page)).displayed, 1);
    await page.clock.runFor(160);
    const before = (await read(page)).actual;
    p = point(0.5);
    await page.mouse.move(p.x, p.y);
    await page.clock.runFor(160);
    const active = await read(page);
    near(active.displayed, 3);
    assert.ok(active.actual > before);
    assert.equal(active.own, true);
    await page.mouse.move(0, 0);
    near((await read(page)).displayed, (await read(page)).actual);
    await seek(page, 2, true);
    p = point(0.75);
    await page.mouse.move(p.x, p.y);
    assert.deepEqual(
      [(await read(page)).own, (await read(page)).external],
      [false, true],
    );
    near((await read(page)).displayed, 4.5);
    await seek(page, 2.1, true);
    near((await read(page)).displayed, 2.1);
    near((await read(page)).actual, 2.1);
    await page.mouse.move(p.x - 1, p.y);
    await page
      .getByLabel("Timeline position")
      .dispatchEvent("pointercancel", { pointerId: 1 });
    near((await read(page)).displayed, 2.1);
    await page.mouse.move(p.x - 2, p.y);
    await page.getByLabel("Timeline position").focus();
    await page.getByRole("button", { name: "Reset", exact: true }).focus();
    near((await read(page)).displayed, 2.1);
  });
});

test("captured mouse and real touch scrubs clamp outside the track and release cancelled gestures", async (t) => {
  const url = await setup(t);
  await withPage(
    url,
    async (page) => {
      await freeze(page);
      const input = page.getByLabel("Timeline position");
      const track = await input.boundingBox(),
        y = track.y + track.height / 2;
      await page.mouse.move(track.x + track.width / 4, y);
      await page.mouse.down();
      near((await read(page)).actual, 1.5);
      await page.mouse.move(track.x + track.width + 20, y);
      near((await read(page)).actual, 6);
      await page.mouse.move(track.x - 20, y);
      near((await read(page)).actual, 0);
      await page.mouse.up();
      const session = await page.context().newCDPSession(page);
      const touch = (type, fraction) =>
        session.send("Input.dispatchTouchEvent", {
          type,
          touchPoints:
            fraction === undefined
              ? []
              : [{ x: track.x + track.width * fraction, y, id: 0 }],
        });
      await touch("touchStart", 0.25);
      near((await read(page)).actual, 1.5, 0.03);
      near(Number(await input.inputValue()), (await read(page)).actual, 0.011);
      await input.dispatchEvent("pointercancel", {
        pointerId: 99,
        pointerType: "touch",
      });
      await touch("touchMove", 0.75);
      near((await read(page)).actual, 4.5, 0.03);
      await touch("touchCancel");
      const cancelled = (await read(page)).actual;
      await input.dispatchEvent("pointermove", {
        pointerId: 2,
        pointerType: "touch",
        clientX: track.x,
        clientY: y,
        buttons: 1,
      });
      near((await read(page)).actual, cancelled);
      near((await read(page)).displayed, cancelled);
      await touch("touchStart", 0.25);
      await touch("touchEnd");
      near((await read(page)).actual, 1.5, 0.03);
      await page.mouse.move(track.x + track.width / 4, y);
      await page.mouse.down();
      await input.dispatchEvent("pointercancel", {
        pointerId: 1,
        pointerType: "mouse",
      });
      await page.mouse.move(track.x + track.width * 0.75, y);
      near((await read(page)).actual, 1.5);
      await page.mouse.up();
      const edge = page.getByRole("button", {
        name: "Stretch Opening",
        exact: true,
      });
      const bounds = await edge.boundingBox();
      await page.mouse.move(bounds.x + 4, bounds.y + 10);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 24, bounds.y + 10);
      const duration = (await read(page)).duration;
      assert.ok(duration > 6);
      await edge.dispatchEvent("pointercancel", {
        pointerId: 1,
        pointerType: "mouse",
      });
      await page.mouse.move(bounds.x + 44, bounds.y + 10);
      near((await read(page)).duration, duration);
      await page.mouse.up();
      await session.detach();
    },
    { width: 390, height: 844 },
  );
});

test("live viewport fitting keeps the authored stage visible across short, narrow, tall and wide windows", async (t) => {
  const url = await setup(t);
  await withPage(url, async (page) => {
    await page.waitForFunction(() => window.codexTimeline);
    await seek(page, 2);
    for (const viewport of [
      { width: 320, height: 360 },
      { width: 480, height: 240 },
      { width: 1920, height: 360 },
      { width: 600, height: 1800 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await page.waitForFunction(() => {
        const svg = codexTimeline.root.getBoundingClientRect();
        const available = document
          .querySelector(".cd-viewport")
          .getBoundingClientRect();
        return (
          svg.width > 0 &&
          svg.height > 0 &&
          svg.left >= available.left - 0.01 &&
          svg.right <= available.right + 0.01 &&
          svg.top >= available.top - 0.01 &&
          svg.bottom <= available.bottom + 0.01
        );
      });
      const size = await page.evaluate(() => {
        const svg = codexTimeline.root.getBoundingClientRect();
        return { width: svg.width, height: svg.height };
      });
      near(size.width / size.height, 400 / 240);
      near((await read(page)).actual, 2);
    }
  });
});

test("external seeks renew a 400ms latch and yield atomically to pause, retiming and the own clock", async (t) => {
  const url = await setup(t);
  await withPage(url, async (page) => {
    await freeze(page);
    await page.evaluate(() => codexTimeline.setPlaying(true));
    await page.clock.runFor(100);
    await seek(page, 2, true);
    await page.clock.runFor(250);
    assert.deepEqual(await read(page), {
      displayed: 2,
      own: false,
      external: true,
      playing: true,
      authored: 2,
      actual: 2,
      duration: 6,
    });
    await seek(page, 2.2, true);
    await page.clock.runFor(250);
    assert.equal((await read(page)).external, true);
    await page.clock.runFor(149);
    assert.equal((await read(page)).external, true);
    await page.clock.runFor(1);
    // The deadline fires at 400ms; React may commit on a later task under load.
    // Wait for that commit without advancing the clock or relaxing the deadline.
    await page.waitForFunction(
      () =>
        !JSON.parse(document.getElementById("probe").dataset.state).external,
      null,
      { polling: 10, timeout: 2000 },
    );
    assert.equal((await read(page)).external, false);
    near((await read(page)).actual, 2.2);
    await seek(page, 3, true);
    await seek(page, 3.1);
    assert.equal((await read(page)).playing, false);
    await seek(page, 4, true);
    await timing(page, { duration: 3 });
    await page.waitForFunction(
      () =>
        !JSON.parse(document.getElementById("probe").dataset.state).external,
      null,
      { polling: 10, timeout: 2000 },
    );
    assert.equal((await read(page)).external, false);
    near((await read(page)).actual, 3);
    await seek(page, 1, true);
    await page.evaluate(() => codexTimeline.setPlaying(true));
    assert.deepEqual(
      [(await read(page)).own, (await read(page)).external],
      [true, false],
    );
    await page.clock.runFor(450);
    assert.equal((await read(page)).playing, true);
    assert.ok((await read(page)).actual > 1.3);
    await page.evaluate(() => window.testRoot.unmount());
    await page.clock.runFor(500);
    assert.equal(
      await page.evaluate(
        () => "codexTimeline" in window || "__animStage" in window,
      ),
      false,
    );
  });
});

test("resuming authored playback starts a fresh finite pass budget and live timing changes restart it", async (t) => {
  const url = await setup(t);
  await withPage(url, async (page) => {
    await freeze(page);
    await timing(page, { duration: 0.6, count: 2 });
    await seek(page, 0.45);
    await page.locator("#own-toggle").click();
    await page.clock.runFor(240);
    const partial = (await read(page)).actual;
    assert.ok(partial > 0.03 && partial < 0.2);
    await page.locator("#own-toggle").click();
    await page.clock.runFor(1000);
    near((await read(page)).actual, partial);
    await page.locator("#own-toggle").click();
    await page.clock.runFor(700);
    assert.equal((await read(page)).own, true);
    await page.evaluate(() => codexTimeline.setPlaying(true));
    await page.clock.runFor(600);
    assert.equal((await read(page)).own, false);
    near((await read(page)).actual, 0.6);
    await page.locator("#own-toggle").click();
    near((await read(page)).actual, 0);
    await page.clock.runFor(700);
    assert.equal((await read(page)).own, true);
    await timing(page, { count: 1 });
    await page.clock.runFor(80);
    assert.equal((await read(page)).own, true);
    await page.clock.runFor(600);
    assert.equal((await read(page)).own, false);
    await page.locator("#own-toggle").click();
    await page.clock.runFor(300);
    await timing(page, { duration: 0.9, count: 2 });
    await page.clock.runFor(700);
    assert.equal((await read(page)).own, true);
    await page.clock.runFor(900);
    assert.equal((await read(page)).own, false);
    near((await read(page)).actual, 0.9);
  });
});

test("storage denial preserves editing, scrubbing and playback without crashing", async (t) => {
  const url = await setup(t);
  await withPage(url, async (page) => {
    await page.addInitScript(() => {
      for (const key of ["getItem", "setItem"])
        Storage.prototype[key] = () => {
          throw new DOMException("Storage unavailable", "SecurityError");
        };
    });
    await page.reload();
    await freeze(page);
    near((await read(page)).actual, 0);
    await page
      .getByRole("button", { name: "Select Build", exact: true })
      .click();
    await page.getByLabel("Playback seconds", { exact: true }).fill("4");
    near((await read(page)).duration, 8);
    await seek(page, 4);
    near((await read(page)).authored, 3);
    await page
      .getByRole("button", { name: "Motion editor", exact: true })
      .click();
    await page.evaluate(() => codexTimeline.setPlaying(true));
    await page.clock.runFor(160);
    assert.ok((await read(page)).actual > 4);
    await page.reload();
    await page.waitForFunction(() => window.codexTimeline);
    near((await read(page)).actual, 0);
    near((await read(page)).duration, 6);
    assert.equal(await page.locator(".cd-editor").count(), 1);
  });
});
