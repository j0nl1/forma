import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary } from "./helpers.mjs";
import { prepareDemo } from "../tools/demo.mjs";
import { serve } from "../skills/studio-design/scripts/preview.mjs";
import { withPage } from "../skills/studio-design/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/studio-design/scripts/export.mjs";

async function setup(t) {
  const dir = await temporary(t);
  await prepareDemo(dir);
  await fs.writeFile(
    path.join(dir, "paint.html"),
    '<html lang="en"><body><script src="starters/watercolor-kit.js"></script></body></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url };
}

test("paint darkens multiplicatively, reserve restores seeded paper and seek is deterministic", async (t) => {
  const { url } = await setup(t);
  await withPage(url + "paint.html", async (page) => {
    const result = await page.evaluate(() => {
      const kit = CodexWatercolorKit,
        p = kit.paper(100, 80, { seed: 12, grain: 0 });
      const pixel = () => [
        ...p.render().getContext("2d").getImageData(50, 40, 1, 1).data,
      ];
      const plain = pixel();
      const clean = {
        load: 1,
        deckle: 0,
        feather: 0,
        granulation: 0,
        mottle: 0,
        edgePool: 0,
      };
      p.wash(["rect", 10, 10, 80, 60], [0.5, 0.75, 0.9], clean);
      const first = pixel();
      p.glaze(["rect", 10, 10, 80, 60], [0.5, 0.75, 0.9], clean);
      const second = pixel();
      p.reserve(["ellipse", 50, 40, 15], { feather: 0, alpha: 1 });
      const lifted = pixel();
      p.seek(0.5);
      const middle = p.canvas.toDataURL();
      p.seek(1);
      p.seek(0);
      p.seek(0.5);
      return {
        plain,
        first,
        second,
        lifted,
        deterministic: middle === p.canvas.toDataURL(),
        operations: p.ops.map((o) => o.k),
        pigment: kit.pigment("indigo"),
      };
    });
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(result.first[channel] < result.plain[channel]);
      assert.ok(result.second[channel] < result.first[channel]);
      assert.ok(
        Math.abs(
          result.first[channel] -
            result.plain[channel] * [0.5, 0.75, 0.9][channel],
        ) <= 1,
      );
    }
    assert.deepEqual(result.lifted, result.plain);
    assert.equal(result.deterministic, true);
    assert.deepEqual(result.operations, ["wash", "glaze", "reserve"]);
    assert.deepEqual(result.pigment, [0.2, 0.24, 0.42]);
  });
});

test("all paint operations support weighted replay, baking, shape types and stable image layers", async (t) => {
  const { url } = await setup(t);
  await withPage(url + "paint.html", async (page) => {
    const result = await page.evaluate(async () => {
      window.paintContract = (p) => {
        p.wash(
          [
            "union",
            [
              ["ellipse", 35, 45, 25, 16, 20],
              ["rect", 65, 10, 20, 24],
            ],
          ],
          "aqua",
          { seed: 3, blooms: [[33, 42, 8]], weight: (x) => (x < 10 ? 0 : 1) },
        );
        p.gradedWash(
          ["blob", 62, 45, 22, 25, { wobble: 0.22, seed: 4 }],
          [
            [0, "#456"],
            [1, "fawn"],
          ],
          {
            axis: "x",
            profile: [
              [0, 1],
              [1, 0.2],
            ],
          },
        );
        p.gradedWash(
          [
            "poly",
            [
              [10, 15],
              [30, 8],
              [35, 28],
            ],
          ],
          "rose",
          "sky",
          { front: 0.3, soft: 0.2 },
        );
        p.glaze(
          [
            "path",
            (c) => {
              c.moveTo(20, 25);
              c.bezierCurveTo(25, 10, 70, 20, 55, 40);
              c.closePath();
            },
          ],
          "shadow_violet",
        );
        p.reserve(["ellipse", 35, 40, 8], { feather: 2, alpha: 0.6 });
        p.ink(
          [
            [10, 65],
            [48, 63],
            [85, 72],
          ],
          { width: 2, wobble: 0, lost: 0, grain: 0 },
        );
        p.hatch(["rect", 30, 20, 25, 15], { angle: 20, spacing: 4 });
        p.dryStroke(
          [
            [12, 78],
            [60, 76],
            [87, 85],
          ],
          "umber",
          { width: 4 },
        );
        p.splatter(72, 60, 12, "teal", { n: 5, seed: 6 });
        p.caption("a quiet study", { size: 5, spacing: 1, y: 94 });
      };
      const options = {
        width: 100,
        height: 100,
        seed: 12,
        quality: 1,
        scale: 1,
      };
      const kit = CodexWatercolorKit,
        layers = kit.layers(paintContract, options);
      await layers.warm();
      const atMiddle = kit.frame(paintContract, { ...options, at: 0.5 });
      kit.frame(paintContract, { ...options, at: 1 });
      const same = kit.frame(paintContract, { ...options, at: 0.5 });
      const callbacks = [];
      const frames = await kit.bake(
        paintContract,
        { ...options, steps: 4, type: "image/png" },
        (i, steps, image) =>
          callbacks.push([
            i,
            steps,
            image === kit.frame(paintContract, { ...options, at: i / steps }),
          ]),
      );
      return {
        count: layers.count,
        kinds: Array.from({ length: layers.count }, (_, i) => layers.kind(i)),
        bounds: Array.from({ length: layers.count }, (_, i) => layers.box(i)),
        spans: Array.from({ length: layers.count }, (_, i) => layers.span(i)),
        deterministic: atMiddle === same,
        baked: frames[2] === atMiddle,
        callbacks,
        cacheIdentity: layers === kit.layers(paintContract, options),
        hidden: layers.src(0, 0),
        images: Array.from({ length: layers.count }, (_, i) =>
          layers.src(i)?.startsWith("data:image/png"),
        ),
      };
    });
    assert.equal(result.count, 10);
    assert.deepEqual(
      new Set(result.kinds),
      new Set([
        "wash",
        "gradedWash",
        "glaze",
        "reserve",
        "ink",
        "hatch",
        "dryStroke",
        "splatter",
        "caption",
      ]),
    );
    assert.equal(result.deterministic, true);
    assert.equal(result.baked, true);
    assert.equal(result.cacheIdentity, true);
    assert.equal(result.hidden, null);
    assert.ok(
      result.callbacks.every(
        ([i, steps, identical]) => steps === 4 && identical,
      ),
    );
    assert.ok(result.images.every(Boolean));
    assert.equal(result.spans[0].from, 0);
    assert.equal(result.spans.at(-1).to, 1);
    for (const box of result.bounds)
      assert.ok(
        box &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.w <= 1.00001 &&
          box.y + box.h <= 1.00001,
      );
  });
});

test("separate multiply/reserve layers reproduce the flat painting at native resolution", async (t) => {
  const { url } = await setup(t);
  await withPage(url + "paint.html", async (page) => {
    const result = await page.evaluate(async () => {
      const painting = (p) => {
        p.wash(["ellipse", 35, 40, 25, 30], "aqua");
        p.wash(["ellipse", 60, 45, 25, 20], "rose");
        p.reserve(["ellipse", 45, 40, 10], { feather: 2, alpha: 0.8 });
        p.ink(
          [
            [5, 60],
            [70, 65],
          ],
          { lost: 0, wobble: 0, grain: 0 },
        );
      };
      const o = { width: 80, height: 80, seed: 9, quality: 1 };
      const decode = (url) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = url;
        });
      const kit = CodexWatercolorKit,
        layers = kit.layers(painting, o),
        result = document.createElement("canvas");
      result.width = 80;
      result.height = 80;
      const c = result.getContext("2d");
      c.drawImage(await decode(layers.paper), 0, 0);
      for (let i = 0; i < layers.count; i++) {
        const box = layers.box(i);
        c.globalCompositeOperation =
          layers.kind(i) === "reserve" ? "source-over" : "multiply";
        c.drawImage(
          await decode(layers.src(i)),
          Math.round(box.x * 80),
          Math.round(box.y * 80),
        );
      }
      const flat = document.createElement("canvas");
      flat.width = 80;
      flat.height = 80;
      flat
        .getContext("2d")
        .drawImage(await decode(kit.frame(painting, o)), 0, 0);
      const a = c.getImageData(0, 0, 80, 80).data,
        b = flat.getContext("2d").getImageData(0, 0, 80, 80).data;
      let max = 0,
        sum = 0;
      for (let i = 0; i < a.length; i++) {
        if (i % 4 === 3) continue;
        const difference = Math.abs(a[i] - b[i]);
        max = Math.max(max, difference);
        sum += difference;
      }
      return { max, mean: sum / (80 * 80 * 3) };
    });
    assert.ok(result.max <= 3, JSON.stringify(result));
    assert.ok(result.mean < 0.7, JSON.stringify(result));
  });
});

test("live watercolor controls complete, replay, pause and survive detach", async (t) => {
  const { url } = await setup(t);
  await withPage(url + "paint.html", async (page) => {
    await page.evaluate(() => {
      const el = document.createElement("watercolor-kit");
      el.setAttribute("width", "100");
      el.setAttribute("height", "100");
      el.setAttribute("duration", "0.1");
      el.setAttribute("autoplay", "false");
      el.setAttribute("controls", "");
      document.body.append(el);
      el.painting = (p) => p.wash(["blob", 50, 50, 30], "sky");
      window.livePaint = el;
      window.doneCount = 0;
      el.addEventListener("watercolor-done", () => doneCount++);
    });
    assert.equal(await page.evaluate(() => livePaint.progress), 0);
    await page.evaluate(() => livePaint.play(0));
    await page.waitForFunction(() => doneCount === 1);
    assert.equal(await page.evaluate(() => livePaint.progress), 1);
    await page
      .getByRole("button", { name: "Paint again", exact: true })
      .click();
    await page.waitForFunction(() => doneCount === 2);
    await page.evaluate(() => {
      livePaint.seek(0.4);
      livePaint.pause();
    });
    assert.equal(await page.evaluate(() => livePaint.progress), 0.4);
    await page.evaluate(() => {
      livePaint.play(0);
      livePaint.remove();
    });
    await page.waitForTimeout(180);
    assert.deepEqual(
      await page.evaluate(() => ({ progress: livePaint.progress, doneCount })),
      { progress: 0, doneCount: 2 },
    );
  });
});

test("React watercolor frames are synchronous, retime completely, export and download real PNG", async (t) => {
  const { dir, url } = await setup(t);
  await withPage(url + "watercolor.html", async (page) => {
    await page.waitForFunction(() => window.codexTimeline);
    const frame = async (time) =>
      page.evaluate((time) => {
        codexTimeline.seek(time);
        return document.querySelector("[data-codex-watercolor-reveal]").src;
      }, time);
    const at3 = await frame(3);
    await frame(8);
    assert.equal(
      await page.locator("[data-codex-watercolor-stroke]").count(),
      13,
    );
    assert.equal(await frame(3), at3);
    await page.getByLabel("Playback seconds", { exact: true }).fill("12");
    assert.equal(await frame(6), at3);
    await frame(14);
    assert.equal(
      await page.locator("[data-codex-watercolor-stroke]").count(),
      13,
    );
    const promise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download PNG", exact: true })
      .click();
    const download = await promise;
    assert.equal(download.suggestedFilename(), "watercolor-bird.png");
    const png = await fs.readFile(await download.path());
    assert.deepEqual(
      [...png.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
  });
  await exportArtifact(
    "html",
    path.join(dir, "watercolor.html"),
    path.join(dir, "standalone.html"),
  );
  await fs.rm(path.join(dir, "watercolor.bundle.js"));
  await withPage(url + "standalone.html", async (page) => {
    await page.waitForFunction(() => window.codexTimeline);
    await page.evaluate(() => codexTimeline.seek(8));
    assert.equal(
      await page.locator("[data-codex-watercolor-stroke]").count(),
      13,
    );
  });
});
