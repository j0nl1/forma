import { copyCatalogResource } from "./helpers.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unzipSync, strFromU8 } from "fflate";
import { temporary, root } from "./helpers.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { captureSlide } from "../packages/exports/src/lib/pptx-capture.mjs";
import { preparePptxCompositingFrames } from "../packages/exports/src/lib/pptx-motion-frames.mjs";
import { applyPptxMotion } from "../packages/exports/src/lib/pptx-motion.mjs";

export function frameFixture(
  trigger = "with",
  duration = 800,
  family = "fade-in",
) {
  return `<section><p style="position:absolute;left:20px;top:20px;margin:0;font:20px Arial" data-anim="fade-in" data-anim-trigger="after" data-anim-duration="100">Editable outside copy</p><div style="position:absolute;left:120px;top:90px;width:300px;height:180px;background:red" data-anim="${family}" data-anim-dir="left" data-anim-trigger="click" data-anim-duration="${duration}"><div style="position:absolute;left:60px;top:45px;width:100px;height:60px;background:blue" data-anim="path" data-anim-path="M0 0 L60 0" data-anim-trigger="${trigger}" data-anim-duration="${duration}"></div></div></section>`;
}
export async function frameDeck(t, slides) {
  const dir = await temporary(t);
  await copyCatalogResource("slide-deck", path.join(dir, "starters"));
  const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bounded compositing frames</title><style>body{margin:0}section{background:white}</style></head><body><deck-stage width="640" height="360">${slides}</deck-stage><script src="starters/deck.js"></script></body></html>`;
  await fs.writeFile(path.join(dir, "index.html"), source);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, source, url };
}

test("overlapping opacity and moving parent masks preserve their builds as bounded pictures", async (t) => {
  const { dir, source, url } = await frameDeck(
    t,
    frameFixture("click") + frameFixture("after", 800, "wipe-in"),
  );
  const output = path.join(dir, "frames.pptx");
  const result = await exportArtifact("pptx", url, output);
  assert.equal(result.rasterAnimations, 4);
  assert.equal(result.nativeAnimations, 2);
  assert.equal(result.staticAnimations, 0);
  assert.match(result.warnings.join("\n"), /20 fps/);
  const zip = unzipSync(await fs.readFile(output));
  for (const index of [1, 2]) {
    const xml = strFromU8(zip[`ppt/slides/slide${index}.xml`]);
    assert.match(xml, /<a:t>Editable outside copy<\/a:t>/);
    assert.equal((xml.match(/nodeType="mainSeq"/g) ?? []).length, 1);
    assert.ok((xml.match(/<p:pic>/g) ?? []).length > 20);
  }
  assert.equal(
    Object.keys(zip).filter((name) => /\.(mp4|webm)$/.test(name)).length,
    0,
  );
  assert.equal(await fs.readFile(path.join(dir, "index.html"), "utf8"), source);
});

test(
  "Impress composites overlapping alpha and retains separate source clicks and after timing",
  {
    skip: process.env.STUDIO_TEST_IMPRESS !== "1",
  },
  async (t) => {
    const native = `<div style="position:absolute;left:420px;top:280px;width:160px;height:70px;background:#00ff00" data-anim="path" data-anim-path="M0 0 L40 0" data-anim-trigger="click" data-anim-duration="800"><div style="position:absolute;left:20px;top:10px;width:50px;height:30px;background:blue" data-anim="path" data-anim-path="M0 0 L20 0" data-anim-trigger="after" data-anim-duration="800"></div></div>`;
    const mixed = frameFixture().replace("</section>", native + "</section>");
    const exit = frameFixture("with", 800, "fade-out").replace(
      'data-anim-trigger="with" data-anim-duration="800"',
      'data-anim-trigger="with" data-anim-duration="1600"',
    );
    const { dir, url } = await frameDeck(
      t,
      frameFixture() +
        frameFixture("click") +
        frameFixture("after", 800, "wipe-in") +
        mixed +
        exit,
    );
    const output = path.join(dir, "frame-playback.pptx");
    const exported = await exportArtifact("pptx", url, output);
    assert.equal(exported.rasterAnimations, 10);
    const { stdout } = await promisify(execFile)(
      "/usr/bin/python3",
      [path.join(root, "tests/powerpoint-frames-impress.py"), output, dir],
      { timeout: 35000, maxBuffer: 1024 * 1024 },
    );
    const [withParent, click, after, nativeAfterRaster, fadedOut] =
      JSON.parse(stdout);
    for (const slide of [
      withParent,
      click,
      after,
      nativeAfterRaster,
      fadedOut,
    ]) {
      assert.deepEqual(
        slide.printed.blueBase,
        [0, 0, 255],
        "Print retains the original source position without compositing animation pictures",
      );
      assert.deepEqual(
        slide.printed.redTail,
        [255, 0, 0],
        "Print has no moving-child ghost trail",
      );
    }
    for (const item of [withParent, click, after]) {
      assert.equal(
        item.before.red.pixels,
        0,
        "Pending parent artwork is hidden before the click",
      );
      assert.equal(item.before.blue.pixels, 0);
    }
    const middle = withParent.first.find(
      (frame) => frame.redPixel[1] > 20 && frame.redPixel[1] < 230,
    );
    assert.ok(middle, "The group passes through partial alpha");
    assert.ok(
      Math.abs(middle.redPixel[1] - middle.bluePixel[0]) <= 2,
      "The overlap receives parent alpha once, without per-leaf purple blending",
    );
    assert.ok(Math.abs(middle.bluePixel[0] - middle.bluePixel[1]) <= 2);
    assert.ok(
      withParent.first.at(-1).blue.bounds[0] > 470,
      "The child moves while its parent fades",
    );
    assert.ok(
      click.first.at(-1).blue.bounds[0] < 370,
      "A later child click holds its initial path position",
    );
    assert.ok(
      click.second.at(-1).blue.bounds[0] > 470,
      "The second click moves the child",
    );
    assert.ok(
      after.first[1].red.bounds[2] < 830,
      "The source mask has a partial reveal",
    );
    assert.ok(
      after.first[1].red.bounds[0] < 250,
      "The raster mask preserves the browser's left reveal edge",
    );
    assert.ok(
      after.first[1].blue.bounds[0] < 370,
      "The after path waits for its parent mask",
    );
    assert.ok(after.first.at(-1).blue.bounds[0] > 470);
    assert.ok(
      nativeAfterRaster.first.at(-1).nativeBlue[0] < 890,
      "The native component keeps its later click after the raster component",
    );
    assert.ok(
      nativeAfterRaster.second[1].nativeBlue[0] < 960,
      "The native child keeps its after delay on the shared schedule",
    );
    assert.ok(
      nativeAfterRaster.second.at(-1).nativeBlue[0] > 990,
      "The later native component retains both composed path effects",
    );
    assert.ok(fadedOut.before.blue.pixels > 20000);
    assert.equal(fadedOut.first.at(-1).blue.pixels, 0);
    assert.equal(fadedOut.first.at(-1).red.pixels, 0);
  },
);

test("frame budgets and unsafe stacking retain original artwork, styles, and animation state", async (t) => {
  const { url } = await frameDeck(
    t,
    frameFixture() + frameFixture("click", 2950),
  );
  await withPage(url, async (page) => {
    await page.evaluate(() =>
      document.querySelector("deck-stage").preparePrint(),
    );
    await page.emulateMedia({ media: "print" });
    const capture = async (index) => ({
      ...(await page.evaluate(captureSlide, index)),
      sourceIndex: index,
    });
    const original = await capture(0);
    const state = () =>
      page.evaluate(() => {
        // The editable source DOM is authoritative. Runtime-owned thumbnail
        // copies can normalize empty style attributes during their refresh.
        return [...document.querySelectorAll("*")].map((element) =>
          element.getAttribute("style"),
        );
      });
    const outside = await page.evaluateHandle(() => {
      const element = document.querySelector("section p");
      return ["paused", "running", "finished"].map((state, index) => {
        const animation = element.animate([{ opacity: 1 }, { opacity: 0.9 }], {
          duration: 100000,
          fill: "both",
        });
        animation.playbackRate = [2, 0, 3][index];
        animation.currentTime = state === "finished" ? 100000 : 375;
        if (state === "paused") animation.pause();
        if (state === "finished") animation.finish();
        return animation;
      });
    });
    const animationState = () =>
      outside.evaluate((animations) =>
        animations.map((animation) => ({
          state: animation.playState,
          time: animation.currentTime,
          rate: animation.playbackRate,
        })),
      );
    const before = await state(),
      animationBefore = await animationState();
    const screenshot = page.screenshot.bind(page);
    page.screenshot = async () => Buffer.alloc(32 * 1024 * 1024 + 1);
    const byteFailure = await preparePptxCompositingFrames(page, original);
    page.screenshot = screenshot;
    assert.match(byteFailure.warnings.join("\n"), /32 MiB/);
    assert.equal(byteFailure.frames, 0);
    assert.ok(original.objects.some((object) => object.kind === "shape"));
    assert.deepEqual(await state(), before);
    assert.deepEqual(await animationState(), animationBefore);
    const tooLong = await capture(1),
      objects = structuredClone(tooLong.objects);
    const countFailure = await preparePptxCompositingFrames(page, tooLong);
    assert.match(
      countFailure.warnings.join("\n"),
      /inclusive frame count exceeds 120/,
    );
    assert.deepEqual(tooLong.objects, objects);
    const interleaved = await capture(0);
    const child = interleaved.objects.findIndex(
      (object) => object.animIds?.length > 1,
    );
    interleaved.objects.splice(child, 0, {
      kind: "shape",
      sourceId: "unrelated",
      x: 300,
      y: 0,
      w: 10,
      h: 10,
    });
    const stackingFailure = await preparePptxCompositingFrames(
      page,
      interleaved,
    );
    assert.match(stackingFailure.warnings.join("\n"), /interleaved/);
    assert.equal(stackingFailure.frames, 0);
    assert.deepEqual(await state(), before);
    const successful = await capture(0);
    const result = await preparePptxCompositingFrames(page, successful);
    assert.ok(result.frames > 0);
    assert.deepEqual(await state(), before);
    assert.deepEqual(await animationState(), animationBefore);
    await outside.evaluate((animations) =>
      animations.forEach((animation) => animation.cancel()),
    );
    await outside.dispose();
  });
});

test("prepared frame decks cannot silently bypass a disabled or existing sequence", async (t) => {
  const { dir, url } = await frameDeck(t, frameFixture());
  const output = path.join(dir, "existing-frames.pptx");
  await exportArtifact("pptx", url, output);
  const bytes = await fs.readFile(output);
  const captured = {
    animations: [{ id: "source", attributes: { "data-anim": "fade-in" } }],
    rasterBuilds: [{ ids: ["source"], frames: [] }],
  };
  assert.throws(
    () => applyPptxMotion(bytes, [captured]),
    /single enabled animation sequence/,
  );
  assert.throws(
    () => applyPptxMotion(bytes, [captured], { enabled: false }),
    /single enabled animation sequence/,
  );
});

test("frame isolation does not start authored paint transitions", async (t) => {
  const { dir, url, source } = await frameDeck(
    t,
    frameFixture("with", 400, "fade-out"),
  );
  await fs.writeFile(
    path.join(dir, "index.html"),
    source.replace(
      "section{background:white}",
      "section{background:white;transition:background-color 5s}",
    ),
  );
  await withPage(url, async (page) => {
    await page.evaluate(() =>
      document.querySelector("deck-stage").preparePrint(),
    );
    await page.emulateMedia({ media: "print" });
    const captured = {
      ...(await page.evaluate(captureSlide, 0)),
      sourceIndex: 0,
    };
    const result = await preparePptxCompositingFrames(page, captured);
    assert.ok(result.frames > 0);
    const frame = captured.objects.filter((object) => object.png).at(-1);
    const opaque = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let count = 0;
      for (let index = 3; index < pixels.length; index += 4)
        if (pixels[index]) count++;
      return count;
    }, frame.png.toString("base64"));
    assert.equal(
      opaque,
      0,
      "The final exit picture is transparent, without an ancestor background transition",
    );
    assert.equal(
      await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((animation) => animation instanceof CSSTransition).length,
      ),
      0,
    );
    assert.equal(
      await page
        .locator("deck-stage > section")
        .evaluate((element) => element.getAttribute("style")),
      null,
    );
  });
});
