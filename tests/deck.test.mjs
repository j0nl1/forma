import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  effects,
  parseEffect,
  parsePath,
  buildSteps,
  effectOptions,
  effectFrames,
} from "../skills/forma/assets/starters/deck-effects.js";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/forma/scripts/export.mjs";
import { execFileSync } from "node:child_process";
const parse = (effect, options = {}) =>
  parseEffect({
    "data-anim": effect,
    ...Object.fromEntries(
      Object.entries(options).map(([key, value]) => [
        `data-anim-${key}`,
        String(value),
      ]),
    ),
  });
async function fixture(
  t,
  content,
  { attributes = "", before = "", query = "" } = {},
) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-deck-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.cp(
    path.resolve("skills/forma/assets/starters"),
    path.join(dir, "starters"),
    { recursive: true },
  );
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{margin:0}deck-stage>section,deck-stage>article{background:#faf9f5;color:#152f37;padding:25px;font:20px system-ui}.tile{width:240px;height:160px;background:#fa6028;transform:translateX(12px);opacity:.65}h2{margin:0 0 10px}</style>${before}</head><body><deck-stage width="800" height="500" ${attributes}>${content}</deck-stage><script src="starters/deck.js"></script></body></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url: url + query };
}
const ready = (page) =>
  page.waitForFunction(() => document.querySelector("deck-stage")?.ready);
test("all 44 build effects retain timing units, direction families and repeat/reverse restrictions", () => {
  assert.equal(Object.keys(effects).length, 44);
  assert.equal(parse("float-in").duration, 1000);
  assert.equal(parse("bounce-out").duration, 2000);
  assert.equal(parse("pulse").duration, 500);
  const spin = parse("spin", {
    duration: 100,
    delay: 75,
    repeat: 3,
    "auto-reverse": "",
    rotate: -90,
  });
  assert.equal(spin.autoReverse, true);
  assert.equal(effectOptions(spin, 75).iterations, 6);
  assert.equal(spin.duration, 100);
  assert.equal(
    parseEffect({
      "data-anim": "fade-in",
      "data-duration": ".4",
      "data-delay": ".25",
    }).duration,
    400,
  );
  assert.equal(
    parseEffect({
      "data-anim": "fade-in",
      "data-duration": ".4",
      "data-anim-duration": "0",
    }).duration,
    1,
  );
  assert.equal(parse("fade-in", { "auto-reverse": true }).autoReverse, false);
  assert.equal(parse("appear", { duration: 1000, repeat: 9 }).repeat, 1);
  assert.equal(parse("wipe-in").direction, "bottom");
  assert.equal(parse("split-in").direction, "vertical");
  assert.equal(parse("circle-out").direction, "out");
  assert.equal(parse("teeter", { rotate: 0 }), null);
  assert.equal(parse("grow", { scale: 1 }), null);
  assert.equal(parse("unknown"), null);
  assert.equal(parse("path", { path: "M 0 0" }), null);
  assert.equal(parse("fade-in", { trigger: " click " }).trigger, "click");
  const geometry = { width: 800, height: 500, fly: () => [-300, 0] };
  for (const name of Object.keys(effects)) {
    const entry = parse(name, { path: "M 0 0 L 50 50" });
    assert.ok(effectFrames(entry, geometry).length >= 2, name);
  }
});
test("build steps chain after the longest concurrent repeat/reverse and cubic paths retain authored origins", () => {
  const entries = [
    parse("spin", { duration: 100, repeat: 3, "auto-reverse": true }),
    parse("fade-in", { trigger: "with", duration: 50, delay: 20 }),
    parse("appear", { trigger: "after", delay: 10 }),
    parse("fade-out", { trigger: "click", delay: 25 }),
    parse("pulse", { trigger: "with", delay: 10 }),
  ].map((entry, documentIndex) => ({ ...entry, documentIndex }));
  const steps = buildSteps(entries);
  assert.equal(steps.length, 2);
  assert.deepEqual(
    steps[0].items.map((item) => item.start),
    [0, 20, 610],
  );
  assert.deepEqual(
    steps[1].items.map((item) => item.start),
    [25, 35],
  );
  const points = parsePath("M 20 10 C 20 110 120 110 120 10 L 220 10");
  assert.equal(points.length, 18);
  assert.deepEqual(points[0], [0, 0]);
  assert.deepEqual(points[8], [50, 75]);
  assert.deepEqual(points.at(-1), [200, 0]);
  assert.equal(parsePath("M nope"), null);
  assert.equal(parsePath("C 1 2 3"), null);
  assert.equal(parsePath("M 0 0 " + "C 1 2 3 4 5 6 ".repeat(10)).length, 32);
});
test("click groups, held end states and navigation cancel only runtime effects without changing authored transforms", async (t) => {
  const { url } = await fixture(
    t,
    `<section data-label="Builds"><h2>Builds</h2><div id="entrance" class="tile" data-anim="fade-in" data-anim-trigger="click" data-anim-duration="100"></div><div id="emphasis" data-anim="grow" data-anim-trigger="with" data-anim-duration="100" data-anim-scale="1.8">Grow</div><div id="exit" data-anim="fade-out" data-anim-trigger="after" data-anim-duration="100">Exit</div><div id="path" data-anim="path" data-anim-trigger="click" data-anim-path="M 10 10 C 10 60 110 60 110 10" data-anim-duration="100">Path</div></section><article data-label="Other"><h2>Other slide</h2></article>`,
  );
  await withPage(url, async (page) => {
    await ready(page);
    await page.evaluate(() => {
      window.events = [];
      document
        .querySelector("deck-stage")
        .addEventListener("deckstep", (event) => events.push(event.detail));
      window.originalTransform = getComputedStyle(
        document.querySelector("#entrance"),
      ).transform;
    });
    assert.equal(await page.locator("[data-build-hidden]").count(), 1);
    assert.equal(
      await page
        .locator("#exit")
        .evaluate((e) => getComputedStyle(e).visibility),
      "visible",
    );
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.locator("deck-stage").evaluate((e) => e.stepsRemaining),
      1,
    );
    await page.evaluate(() =>
      document
        .querySelector("deck-stage")
        .buildPlayer.state.animations.forEach(({ animation }) =>
          animation.finish(),
        ),
    );
    assert.equal(
      await page
        .locator("#entrance")
        .evaluate((e) => Number(getComputedStyle(e).opacity)),
      0.65,
    );
    assert.equal(
      await page
        .locator("#emphasis")
        .evaluate((e) => getComputedStyle(e).scale),
      "1.8",
    );
    assert.equal(
      await page
        .locator("#exit")
        .evaluate((e) => getComputedStyle(e).visibility),
      "hidden",
    );
    assert.equal(
      await page
        .locator("#entrance")
        .evaluate((e) => getComputedStyle(e).transform),
      await page.evaluate(() => originalTransform),
    );
    await page.keyboard.press("ArrowRight");
    await page.evaluate(() =>
      document
        .querySelector("deck-stage")
        .buildPlayer.state.animations.forEach(({ animation }) =>
          animation.finish(),
        ),
    );
    assert.equal(
      await page
        .locator("#path")
        .evaluate((e) => getComputedStyle(e).translate),
      "100px",
    );
    assert.equal(await page.locator("#path").getAttribute("style"), null);
    assert.equal(await page.evaluate(() => events.length), 2);
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("deck-stage").evaluate((e) => e.index), 1);
    assert.equal(
      await page
        .locator("#path")
        .evaluate((e) => getComputedStyle(e).translate),
      "none",
    );
    assert.equal(await page.locator("[data-deck-anim-hidden]").count(), 0);
    await page.keyboard.press("ArrowLeft");
    assert.equal(
      await page.locator("deck-stage").evaluate((e) => e.stepsRemaining),
      0,
    );
    assert.equal(
      await page
        .locator("#emphasis")
        .evaluate((e) => getComputedStyle(e).scale),
      "1.8",
    );
    assert.equal(
      await page
        .locator("#exit")
        .evaluate((e) => getComputedStyle(e).visibility),
      "hidden",
    );
    await page.locator("deck-stage").evaluate((e) => {
      e.remove();
      document.body.append(e);
    });
    await ready(page);
    assert.equal(await page.locator("deck-stage").evaluate((e) => e.length), 2);
  });
});
test("all effect frames and masks interpolate in the browser; reduced motion and fallback preserve click gating", async (t) => {
  const content = Object.keys(effects)
    .map(
      (effect, index) =>
        `<section data-label="${effect}"><div class="tile" id="effect-${index}" data-anim="${effect}" data-anim-trigger="click" data-anim-duration="1000" data-anim-path="M 0 0 L 50 30"></div></section>`,
    )
    .join("");
  const { url } = await fixture(t, content);
  await withPage(url, async (page) => {
    await ready(page);
    const sampled = await page.evaluate(() => {
      const deck = document.querySelector("deck-stage"),
        result = [];
      for (let index = 0; index < deck.length; index++) {
        deck.show(index);
        deck.next();
        const record = deck.buildPlayer.state.animations[0];
        record.animation.pause();
        record.animation.currentTime = record.entry.duration / 2;
        const style = getComputedStyle(record.entry.element);
        result.push({
          effect: record.entry.effect,
          mask: style.maskImage,
          progress: style.getPropertyValue("--codex-deck-progress"),
          frames: record.animation.effect.getKeyframes().length,
          style: record.entry.element.getAttribute("style"),
        });
      }
      return result;
    });
    assert.equal(sampled.length, 44);
    assert.ok(sampled.every((item) => item.style === null));
    for (const item of sampled.filter((item) =>
      [
        "wheel-in",
        "split-out",
        "random-bars-in",
        "dissolve-in",
        "plus-in",
      ].includes(item.effect),
    )) {
      assert.notEqual(item.mask, "none", item.effect);
      assert.equal(Number(item.progress), 0.5, item.effect);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("deck-stage").evaluate((e) => {
      e.goTo(1);
      e.goTo(0);
    });
    assert.equal(
      await page.locator("deck-stage").evaluate((e) => e.stepsRemaining),
      0,
    );
    await page.locator("deck-stage").evaluate((e) => e.goTo(1));
    assert.equal(
      await page.locator("deck-stage").evaluate((e) => e.stepsRemaining),
      1,
    );
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("deck-stage").evaluate((e) => e.index), 1);
    assert.equal(
      await page.locator("deck-stage").evaluate((e) => e.stepsRemaining),
      0,
    );
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("deck-stage").evaluate((e) => e.index), 2);
  });
  const fallback = await fixture(
    t,
    '<section><div class="tile" data-anim="wheel-in" data-anim-trigger="click"></div></section>',
    { before: "<script>CSS.registerProperty=undefined;</script>" },
  );
  await withPage(fallback.url, async (page) => {
    await ready(page);
    await page.keyboard.press("ArrowRight");
    const sample = await page
      .locator("deck-stage > section .tile")
      .evaluate((e) => {
        const a = e.getAnimations()[0];
        a.pause();
        a.currentTime = 1000;
        return {
          opacity: Number(getComputedStyle(e).opacity),
          mask: getComputedStyle(e).maskImage,
        };
      });
    assert.equal(sample.opacity, 0.325);
    assert.equal(sample.mask, "none");
  });
});
test("print, capture and reduced motion retain different state contracts while skip, notes and fullscreen work", async (t) => {
  const content =
    '<section data-speaker-notes="Author notes"><h2>First</h2><div class="tile" data-anim="fade-in" data-anim-trigger="click"></div><div id="gone" data-anim="disappear" data-anim-trigger="click">Print base content</div></section><section data-deck-skip data-label="Skipped"><h2>Skip me</h2></section><section><h2>Last</h2></section>';
  const { dir, url } = await fixture(t, content, {
    before:
      '<script type="application/json" id="speaker-notes">["Legacy notes", "Hidden notes", "Last notes"]</script>',
  });
  await withPage(url, async (page) => {
    await ready(page);
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    assert.equal(
      await page.locator("deck-stage").locator(".notes").textContent(),
      "Author notes",
    );
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() =>
      document.querySelector("#gone").hasAttribute("data-deck-anim-hidden"),
    );
    await page.emulateMedia({ media: "print" });
    await page.waitForFunction(
      () => document.querySelector("deck-stage").printing,
    );
    assert.equal(
      await page
        .locator("#gone")
        .evaluate((e) => getComputedStyle(e).visibility),
      "visible",
    );
    assert.equal(
      await page.locator("deck-stage > [data-deck-skip]").isVisible(),
      false,
    );
    await page.emulateMedia({ media: "screen" });
    await page.waitForFunction(
      () => !document.querySelector("deck-stage").printing,
    );
    assert.equal(
      await page.locator("deck-stage").evaluate((e) => e.stepsRemaining),
      0,
    );
    assert.equal(
      await page
        .locator("#gone")
        .evaluate((e) => getComputedStyle(e).visibility),
      "hidden",
    );
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("deck-stage").evaluate((e) => e.index), 2);
    assert.equal(
      await page.locator("deck-stage").locator(".notes").textContent(),
      "Last notes",
    );
    await page.keyboard.press("2");
    assert.equal(await page.locator("deck-stage").evaluate((e) => e.index), 1);
    assert.equal(
      await page.locator("deck-stage").locator("output").textContent(),
      "– / 2",
    );
    await page.keyboard.press("r");
    assert.equal(await page.locator("deck-stage").evaluate((e) => e.index), 0);
    await page.keyboard.press("f");
    await page.waitForFunction(
      () =>
        !!document.fullscreenElement &&
        document.querySelector("deck-stage").hasAttribute("data-fullscreen"),
    );
    assert.equal(
      await page.locator("deck-stage").locator(".rail").isVisible(),
      false,
    );
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("f");
    await page.waitForFunction(
      () =>
        !document.fullscreenElement &&
        !document.querySelector("deck-stage").hasAttribute("data-fullscreen"),
    );
    assert.equal(
      await page.locator("deck-stage").locator(".rail").isVisible(),
      true,
    );
    await page
      .locator("deck-stage")
      .evaluate((e) => e.setAttribute("noscale", ""));
    assert.equal(await page.locator("[data-deck-anim-hidden]").count(), 0);
    assert.equal(
      await page
        .locator("deck-stage > section .tile")
        .evaluate((e) => e.getAnimations().length),
      0,
    );
  });
  const output = path.join(dir, "deck.pdf");
  await exportArtifact("pdf", url, output);
  assert.match(
    execFileSync("pdfinfo", [output], { encoding: "utf8" }),
    /Pages:\s+2/,
  );
  const capture = await fixture(t, content, { query: "?_snthumb=0" });
  await withPage(capture.url, async (page) => {
    await ready(page);
    assert.equal(
      await page.locator("deck-stage").locator(".rail").isVisible(),
      false,
    );
    assert.equal(
      await page.locator("deck-stage").locator(".rail-resize").isVisible(),
      false,
    );
    assert.equal(
      await page.locator("deck-stage").evaluate((deck) => {
        const viewport = deck.shadowRoot.querySelector(".viewport");
        return viewport.clientWidth === deck.clientWidth;
      }),
      true,
    );
    assert.equal(
      await page.locator("deck-stage").evaluate((e) => e.stepsRemaining),
      0,
    );
    assert.equal(await page.locator("[data-deck-anim-hidden]").count(), 0);
    await page.goto(
      capture.url.replace("_snthumb=0", "deck-thumbnail=0") + "#3",
    );
    await ready(page);
    assert.equal(
      await page.locator("deck-stage").locator(".rail").isVisible(),
      false,
    );
    assert.equal(await page.locator("deck-stage").evaluate((e) => e.index), 2);
  });
});

test("gradient masks change rendered pixels throughout the reveal rather than applying a generic fade", async (t) => {
  const names = [
    "wheel-in",
    "wedge-in",
    "split-in",
    "random-bars-in",
    "blinds-in",
    "checkerboard-in",
    "dissolve-in",
    "box-in",
    "circle-in",
    "diamond-in",
    "plus-in",
    "strips-in",
  ];
  const { url } = await fixture(
    t,
    names
      .map(
        (name) =>
          `<section><div class="tile" data-anim="${name}" data-anim-trigger="click" data-anim-duration="1000"></div></section>`,
      )
      .join(""),
  );
  await withPage(url, async (page) => {
    const coverage = async (buffer) =>
      page.evaluate(async (source) => {
        const image = new Image();
        image.src = "data:image/png;base64," + source;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let pixels = 0;
        for (let i = 0; i < bytes.length; i += 4)
          if (bytes[i] > 200 && bytes[i + 1] < 200) pixels++;
        return pixels / (canvas.width * canvas.height);
      }, buffer.toString("base64"));
    const samples = [];
    for (let index = 0; index < names.length; index++) {
      await page.locator("deck-stage").evaluate((deck, index) => {
        deck.show(index);
        deck.next();
        const a = deck.buildPlayer.state.animations[0].animation;
        a.pause();
        a.currentTime = 200;
      }, index);
      const low = await coverage(
        await page
          .locator("deck-stage > section .tile")
          .nth(index)
          .screenshot(),
      );
      await page
        .locator("deck-stage")
        .evaluate(
          (deck) =>
            (deck.buildPlayer.state.animations[0].animation.currentTime = 800),
        );
      const high = await coverage(
        await page
          .locator("deck-stage > section .tile")
          .nth(index)
          .screenshot(),
      );
      samples.push({ name: names[index], low, high });
      assert.ok(high > low + 0.08, JSON.stringify(samples.at(-1)));
      assert.ok(high > 0.5, JSON.stringify(samples.at(-1)));
    }
    const at20 = samples.map((sample) => Math.round(sample.low * 100));
    assert.ok(new Set(at20).size >= 5, JSON.stringify(samples));
  });
});

test("live repeat/reverse timing waits for the whole group and respects reduced-motion click groups", async (t) => {
  const { url } = await fixture(
    t,
    `<section><div id="spin" class="tile" data-anim="spin" data-anim-trigger="click" data-anim-duration="100" data-anim-repeat="3" data-anim-auto-reverse="true" data-anim-rotate="90"></div><div id="concurrent" data-anim="fade-in" data-anim-trigger="with" data-anim-duration="50" data-anim-delay="20">Concurrent</div><div id="after" data-anim="appear" data-anim-trigger="after" data-anim-delay="10">After all repeats</div><div data-anim="fade-in" data-anim-trigger="click">Second click</div></section>`,
  );
  await withPage(url, async (page) => {
    await page.keyboard.press("ArrowRight");
    const scheduled = await page.locator("deck-stage").evaluate((deck) =>
      deck.buildPlayer.state.animations.map(({ entry, animation }) => {
        animation.pause();
        return { effect: entry.effect, ...animation.effect.getTiming() };
      }),
    );
    assert.equal(scheduled[0].iterations, 6);
    assert.equal(scheduled[0].direction, "alternate");
    assert.equal(scheduled[2].delay, 610);
    const rotation = async (time) =>
      page.locator("#spin").evaluate((element, time) => {
        element.getAnimations()[0].currentTime = time;
        return getComputedStyle(element).rotate;
      }, time);
    assert.ok(Math.abs(parseFloat(await rotation(100)) - 90) < 1e-8);
    assert.ok(Math.abs(parseFloat(await rotation(200))) < 1e-8);
    assert.ok(Math.abs(parseFloat(await rotation(600))) < 1e-8);
    assert.equal(
      await page
        .locator("#after")
        .evaluate((element) => getComputedStyle(element).visibility),
      "hidden",
    );
    await page
      .locator("#after")
      .evaluate((element) => (element.getAnimations()[0].currentTime = 611));
    assert.equal(
      await page
        .locator("#after")
        .evaluate((element) => getComputedStyle(element).visibility),
      "visible",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("deck-stage").evaluate((deck) => {
      deck.buildPlayer.clear();
      deck.show(0);
    });
    assert.equal(
      await page.locator("deck-stage").evaluate((deck) => deck.stepsRemaining),
      2,
    );
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.locator("deck-stage").evaluate((deck) => deck.stepsRemaining),
      1,
    );
    assert.equal(
      await page
        .locator("#after")
        .evaluate((element) => getComputedStyle(element).visibility),
      "visible",
    );
  });
});

test("narrow viewports center the actual scaled slide inside the visible stage", async (t) => {
  const { url } = await fixture(
    t,
    '<section><h2>Visible on a phone</h2><div class="tile">Content</div></section>',
  );
  await withPage(url, async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const deck = document.querySelector("deck-stage"),
        art = deck.shadowRoot.querySelector(".art").getBoundingClientRect(),
        view = deck.shadowRoot
          .querySelector(".viewport")
          .getBoundingClientRect();
      return (
        art.left >= view.left - 0.5 &&
        art.right <= view.right + 0.5 &&
        art.top >= view.top - 0.5 &&
        art.bottom <= view.bottom + 0.5 &&
        art.width > 380
      );
    });
    assert.equal(
      await page.locator("deck-stage > section > h2").isVisible(),
      true,
    );
    await page
      .getByRole("button", { name: "Enter fullscreen", exact: true })
      .click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.waitForFunction(() => {
      const art = document
        .querySelector("deck-stage")
        .shadowRoot.querySelector(".art")
        .getBoundingClientRect();
      return art.left >= -0.5 && art.right <= innerWidth + 0.5;
    });
  });
});
