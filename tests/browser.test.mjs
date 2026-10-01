import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary, root } from "./helpers.mjs";
import { prepareDemo } from "../tools/demo.mjs";
import { serve } from "../skills/codex-design/scripts/preview.mjs";
import { withPage } from "../skills/codex-design/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/codex-design/scripts/export.mjs";
import {
  compile,
  preview,
} from "../skills/codex-design/scripts/design-system.mjs";
import { bundle } from "../skills/codex-design/scripts/build.mjs";

test("native examples load without runtime errors and fit narrow layouts", async (t) => {
  const dir = await temporary(t);
  await prepareDemo(dir);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  for (const file of [
    "index.html",
    "prototype.html",
    "canvas.html",
    "canvas-react.html",
    "deck.html",
    "animation.html",
    "watercolor.html",
    "scenes.html",
    "data.html",
    "document.html",
  ])
    await t.test(file, async () => {
      await withPage(url + file, async (page) => {
        assert.ok(await page.title());
        await page.screenshot({ path: path.join(dir, file + ".png") });
        await page.setViewportSize({ width: 390, height: 844 });
        if (!["document.html"].includes(file))
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth + 1,
            ),
            false,
            file + " overflowed",
          );
      });
    });
});

test("prototype onboarding, favorites, filtering and validation work with focus recovery", async (t) => {
  const dir = await temporary(t);
  await prepareDemo(dir);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  await withPage(url + "prototype.html", async (page) => {
    assert.equal(await page.locator("#continue").isDisabled(), true);
    await page.getByRole("button", { name: "Design", exact: true }).click();
    assert.equal(await page.locator("#continue").isDisabled(), true);
    await page.getByRole("button", { name: "Science", exact: true }).click();
    await page.locator("#continue").click();
    assert.equal(await page.locator(".item").count(), 2);
    await page
      .getByRole("button", {
        name: "Favorite Attention is a design material",
        exact: true,
      })
      .click();
    await page.locator("#favorites").click();
    assert.equal(await page.locator(".item").count(), 1);
    await page.locator("#search").fill("no match");
    assert.match(await page.locator(".empty").innerText(), /No articles/);
    await page.locator("#add").click();
    await page.getByRole("button", { name: "Save to collection" }).click();
    assert.match(await page.locator("#form-error").innerText(), /title/);
    await page.locator("input[name=title]").fill("A useful reference");
    await page.locator("input[name=url]").fill("invalid");
    await page.getByRole("button", { name: "Save to collection" }).click();
    assert.match(await page.locator("#form-error").innerText(), /HTTP/);
    await page.locator("input[name=url]").fill("https://example.com/reference");
    await page.getByRole("button", { name: "Save to collection" }).click();
    assert.equal(await page.locator(".item").count(), 3);
    assert.equal(
      await page.locator("#add").evaluate((e) => e === document.activeElement),
      true,
    );
    await page.locator("#add").click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog").isVisible(), false);
    assert.equal(
      await page.locator("#add").evaluate((e) => e === document.activeElement),
      true,
    );
    await page.locator("#restart").click();
    assert.equal(await page.locator("#continue").isDisabled(), true);
  });
});

test("canvas renaming, ordering, removing, restoring and zoom controls work", async (t) => {
  const dir = await temporary(t);
  await prepareDemo(dir);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  await withPage(url + "canvas.html", async (page) => {
    const boards = page.locator("design-board");
    assert.equal(await boards.count(), 2);
    await boards
      .first()
      .getByRole("textbox", { name: "Artboard name" })
      .fill("Calm reading");
    assert.equal(await boards.first().getAttribute("label"), "Calm reading");
    await boards.first().getByRole("button", { name: "Move right" }).click();
    assert.equal(await boards.last().getAttribute("label"), "Calm reading");
    await boards
      .last()
      .getByRole("button", { name: "Remove artboard" })
      .click();
    assert.equal(await boards.count(), 1);
    await page.getByRole("button", { name: "Restore removed" }).click();
    assert.equal(await boards.count(), 2);
    await page.getByRole("button", { name: "Zoom out" }).click();
    assert.equal(
      await page.locator("design-canvas").evaluate((e) => e.zoom),
      0.9,
    );
  });
});

test("deck navigation advances gated builds and print shows every completed slide", async (t) => {
  const dir = await temporary(t);
  await prepareDemo(dir);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  await withPage(url + "deck.html", async (page) => {
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("deck-stage").evaluate((e) => e.index), 1);
    assert.equal(await page.locator("[data-build-hidden]").count(), 3);
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("deck-stage").evaluate((e) => e.index), 1);
    assert.equal(await page.locator("[data-build-hidden]").count(), 0);
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("deck-stage").evaluate((e) => e.index), 2);
    await page
      .getByRole("button", { name: "Remove slide", exact: true })
      .click();
    assert.equal(await page.locator("deck-stage>section").count(), 2);
    await page.getByRole("button", { name: "Restore slides" }).click();
    assert.equal(await page.locator("deck-stage>section").count(), 3);
    await page.emulateMedia({ media: "print" });
    for (const slide of await page.locator("deck-stage>section").all())
      assert.equal(await slide.isVisible(), true);
  });
  const pdf = path.join(dir, "deck.pdf");
  await exportArtifact("pdf", url + "deck.html", pdf);
  assert.match(
    execFileSync("pdfinfo", [pdf], { encoding: "utf8" }),
    /Pages:\s+3/,
  );
});

test("timeline deterministic seek, time-stretch and reduced motion keep complete state", async (t) => {
  const dir = await temporary(t);
  await prepareDemo(dir);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  await withPage(url + "animation-basic.html", async (page) => {
    const sample = () =>
      page.locator(".card").evaluate((e) => e.style.transform);
    await page.evaluate(() => codexTimeline.seek(3));
    const at3 = await sample();
    await page.evaluate(() => codexTimeline.seek(5));
    await page.evaluate(() => codexTimeline.seek(3));
    assert.equal(await sample(), at3);
    const timing = page.locator("motion-stage .scenes input").nth(1);
    await timing.fill("4");
    await timing.dispatchEvent("change");
    assert.equal(await page.evaluate(() => codexTimeline.duration), 8);
    await page.evaluate(() => codexTimeline.seek(4));
    assert.equal(await sample(), at3);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.waitForFunction(() => window.codexTimeline?.duration === 6);
    assert.equal(await page.locator("motion-stage").evaluate((e) => e.time), 6);
  });
});

test("systems preview actual React exports; standalone bundle works without source files", async (t) => {
  const dir = await temporary(t),
    system = path.join(dir, "system");
  await fs.cp(path.join(root, "examples/design-system"), system, {
    recursive: true,
  });
  await compile(system);
  await preview(system);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  await withPage(url + "system/preview.html", async (page) => {
    assert.equal(
      await page.getByRole("button", { name: "Create project" }).count(),
      1,
    );
    await page.getByRole("button", { name: "Create project" }).click();
  });
  await exportArtifact(
    "html",
    path.join(system, "preview.html"),
    path.join(dir, "standalone.html"),
  );
  await fs.rm(system, { recursive: true });
  await withPage(url + "standalone.html", async (page) =>
    assert.equal(
      await page.getByRole("button", { name: "Create project" }).count(),
      1,
    ),
  );
});

test("video writes real encoded frames and rejects an invalid export contract", async (t) => {
  const dir = await temporary(t);
  await prepareDemo(dir);
  await fs.writeFile(
    path.join(dir, "tiny.html"),
    '<html><body style="margin:0"><motion-stage style="height:100vh"><div data-art style="background:red"></div></motion-stage><script src="starters/timeline.js"></script><script>document.querySelector("motion-stage").configure({width:320,height:240,scenes:[{id:"a",duration:.4}],render(t){document.querySelector("[data-art]").style.background=t<.2?"red":"blue";}});</script></body></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  const output = path.join(dir, "video.mp4");
  const result = await exportArtifact("video", url + "tiny.html", output, {
    fps: 5,
  });
  assert.equal(result.frames, 2);
  assert.equal(result.audio, false);
  const metadata = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-of", "json", output],
      { encoding: "utf8" },
    ),
  );
  assert.equal(metadata.streams[0].width, 320);
  assert.equal(metadata.streams[0].height, 240);
  assert.equal(metadata.streams[0].nb_frames, "2");
  await assert.rejects(
    exportArtifact("video", url + "tiny.html", output),
    /overwrite/,
  );
  await assert.rejects(
    exportArtifact("video", url + "index.html", path.join(dir, "invalid.mp4")),
    /timeline bridge/,
  );
});

test("3D source bundles locally and provides real model export controls", async (t) => {
  const dir = await temporary(t);
  await fs.copyFile(
    path.join(root, "examples/three.html"),
    path.join(dir, "index.html"),
  );
  await bundle(
    path.join(root, "skills/codex-design/assets/starters/three-stage.js"),
    path.join(dir, "three-stage.bundle.js"),
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  await withPage(url, async (page) => {
    const fallback = await page.locator("three-stage").innerText();
    if (fallback.includes("WebGL is unavailable")) {
      assert.equal(
        await page.getByRole("button", { name: "Download GLB" }).isDisabled(),
        true,
      );
      return;
    }
    await page.getByRole("button", { name: "Reset camera" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download OBJ" }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "model.obj");
    assert.ok(
      (await fs.readFile(await download.path(), "utf8")).includes("v "),
    );
  });
});

test("video preserves different frames and supports WebM and GIF output", async (t) => {
  const dir = await temporary(t);
  await prepareDemo(dir);
  await fs.writeFile(
    path.join(dir, "tiny.html"),
    '<html><body style="margin:0"><motion-stage style="height:100vh"><div data-art style="background:red"></div></motion-stage><script src="starters/timeline.js"></script><script>document.querySelector("motion-stage").configure({width:320,height:240,scenes:[{id:"a",duration:.4}],render(t){document.querySelector("[data-art]").style.background=t<.2?"red":"blue";}});</script></body></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  for (const format of ["mp4", "webm", "gif"]) {
    const output = path.join(dir, "tiny." + format);
    await exportArtifact("video", url + "tiny.html", output, { fps: 5 });
    const raw = execFileSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      output,
      "-fps_mode",
      "passthrough",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ]);
    const offset = (120 * 320 + 160) * 3;
    assert.ok(raw[offset] > 200, format + " first frame should be red");
    assert.ok(
      raw[320 * 240 * 3 + offset + 2] > 200,
      format + " second frame should be blue",
    );
  }
});

test("local image slots, CSS controls and seeded watercolor work without host messages", async (t) => {
  const dir = await temporary(t);
  await prepareDemo(dir);
  await fs.writeFile(
    path.join(dir, "extras.html"),
    `<!doctype html><html lang="en"><style>:root{--accent:#275dad}body{margin:20px}image-slot{width:400px}canvas{display:block}</style><body><device-frame><p>Responsive content</p></device-frame><image-slot storage-key="fixture" alt="A local image"></image-slot><design-controls><label>Accent<input data-token="--accent" type="color" value="#275dad"></label></design-controls><canvas width="320" height="240"></canvas><script src="starters/frames.js"></script><script src="starters/image-slot.js"></script><script src="starters/controls.js"></script><script src="starters/watercolor.js"></script><script>window.painting=new CodexWatercolor(document.querySelector('canvas'),42);painting.wash({x:140,y:100,rx:70,ry:50}).line({points:[[20,20],[90,110],[180,160]],width:3}).splatter({x:100,y:90});painting.render(1);</script></body></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((r) => server.close(r)));
  await withPage(url + "extras.html", async (page) => {
    await page.getByRole("button", { name: "Tweaks", exact: true }).click();
    const color = page.locator("input[data-token]");
    await color.fill("#ff0000");
    await color.dispatchEvent("input");
    assert.equal(
      await page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--accent"),
      ),
      "#ff0000",
    );
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    assert.equal(
      await page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--accent"),
      ),
      "",
    );
    const png = await page.locator("canvas").screenshot();
    await page
      .getByLabel("Choose local image")
      .setInputFiles({ name: "local.png", mimeType: "image/png", buffer: png });
    await page.waitForFunction(() =>
      document.querySelector("image-slot").value.src.startsWith("data:"),
    );
    await page
      .getByRole("textbox", { name: "Alt text" })
      .fill("A seeded watercolor");
    await page.reload();
    assert.equal(
      await page.getByRole("textbox", { name: "Alt text" }).inputValue(),
      "A seeded watercolor",
    );
    await page.evaluate(() => painting.render(0.5));
    const midway = await page.locator("canvas").evaluate((c) => c.toDataURL());
    await page.evaluate(() => {
      painting.render(1);
      painting.render(0.5);
    });
    assert.equal(
      await page.locator("canvas").evaluate((c) => c.toDataURL()),
      midway,
    );
    await page.getByRole("button", { name: "Reset image" }).click();
    assert.equal(
      await page.locator("image-slot").evaluate((e) => e.value.src),
      "",
    );
  });
});
