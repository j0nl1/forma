import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../skills/forma/scripts/build.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/forma/scripts/export.mjs";

async function setup(t) {
  const dir = await temporary(t);
  const runtime = path.join(
    root,
    "skills/forma/assets/starters/animations.jsx",
  );
  await fs.writeFile(
    path.join(dir, "main.jsx"),
    `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { Stage, SceneStage, Sprite, TextSprite, ImageSprite, RectSprite, VideoSprite, useScene, useComposition, useTime, useSprite } from ${JSON.stringify(runtime)};
    window.mountCount = 0;
    const q = new URLSearchParams(location.search);
    function Probe(props) {
      const [id] = React.useState(() => ++window.mountCount);
      const scene = useScene();
      const time = useTime();
      const {T} = useComposition();
      return <div data-probe={scene.scene.name} data-id={id} data-context={JSON.stringify(scene)} data-global={time} data-authored={T}
        data-props={JSON.stringify(props)} style={{ position:"absolute",inset:0,background:scene.index ? "#202f3a" : "#704832" }}>
        <Sprite start={0} end={99}>{s => <span data-scene-sprite={s.localTime}/>}</Sprite>
      </div>;
    }
    function Progress({id}) { const s = useSprite(); return <span id={id} data-progress={s.progress}/>; }
    function Sprites() {
      return <>
        <Sprite start={1} end={5}><div id="gated"><TextSprite text="A title" entryDur={1} exitDur={1}/>
          <ImageSprite entryDur={1} exitDur={1} kenBurns placeholder={{label:"A photograph"}}/>
          <RectSprite entryDur={1} exitDur={1} render={s => ({left:50+s.localTime*10})}/></div></Sprite>
        <Sprite start={1} end={5} keepMounted>{s => <span id="kept" data-context={JSON.stringify(s)}/>}</Sprite>
        <Sprite start={0}><Progress id="infinite"/></Sprite>
        <Sprite start={1} end={1}><Progress id="zero"/></Sprite>
      </>;
    }
    function Video() { return <VideoSprite src="clip.mp4" start={0.2} end={0.8} speed={2} style={{width:160,height:100}}/>; }
    const scenes = [{name:"One",dur:2,desc:"First scene",custom:"Preserved metadata"},{name:"Two",dur:2}];
    window.sceneRoot = createRoot(document.getElementById("root"));
    const mode = q.get("mode");
    sceneRoot.render(mode === "sprites" ? <Stage width={400} height={240} duration={7} autoplay={false}><Sprites/></Stage>
      : mode === "video" ? <Stage width={160} height={100} duration={1} autoplay={false}><Video/></Stage>
      : <SceneStage width={400} height={240} scenes={mode === "invalid" ? "bad JSON" : JSON.stringify(scenes)}
          autoplay={false} loop={q.get("loop") !== "false"} playback={q.get("playback") ?? undefined} transition={q.get("transition") ?? "cut"}>
          {{ One: Probe, Two: Probe }}
        </SceneStage>);
  `,
  );
  await bundle(path.join(dir, "main.jsx"), path.join(dir, "bundle.js"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    '<!doctype html><html lang="en"><body style="margin:0"><div id="root"></div><script src="bundle.js"></script></body></html>',
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url };
}
const seek = (page, time) =>
  page.evaluate((time) => codexTimeline.seek(time), time);
const tick = (page, time, playing = true) =>
  page.evaluate(
    ({ time, playing }) => {
      codexTimeline.root.dispatchEvent(
        new CustomEvent("codex-seek-to-time", { detail: { time, playing } }),
      );
    },
    { time, playing },
  );
const read = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-probe]")].map((p) => ({
      name: p.dataset.probe,
      id: Number(p.dataset.id),
      time: Number(p.dataset.global),
      authored: Number(p.dataset.authored),
      context: JSON.parse(p.dataset.context),
      props: JSON.parse(p.dataset.props),
      sprite: Number(
        p.querySelector("[data-scene-sprite]").dataset.sceneSprite,
      ),
      frozen:
        p.closest("[data-codex-scene-layer]").dataset.codexSceneFrozen ===
        "true",
    })),
  );

test("sprites retain inclusive gates, mount policy, entry/hold/exit curves and overrides", async (t) => {
  const { url } = await setup(t);
  await withPage(url + "?mode=sprites", async (page) => {
    await page.waitForFunction(() => window.codexTimeline);
    assert.equal(await page.locator("#gated").count(), 0);
    assert.equal(await page.locator("#kept").count(), 1);
    const kept = () =>
      page.locator("#kept").evaluate((n) => JSON.parse(n.dataset.context));
    assert.deepEqual(await kept(), {
      localTime: 0,
      duration: 4,
      progress: 0,
      visible: false,
    });
    await seek(page, 1);
    assert.equal(await page.locator("#gated").count(), 1);
    assert.equal(
      await page.locator("#zero").getAttribute("data-progress"),
      "0",
    );
    await seek(page, 1.5);
    const styles = () =>
      page.evaluate(() =>
        Object.fromEntries(
          ["text", "image", "rect"].map((kind) => {
            const s = document.querySelector(
              `[data-codex-${kind}-sprite]`,
            ).style;
            return [
              kind,
              {
                opacity: Number(s.opacity),
                transform: s.transform,
                left: s.left,
              },
            ];
          }),
        ),
      );
    let s = await styles();
    assert.equal(s.image.opacity, 0.875);
    assert.equal(s.image.transform, "scale(0.995)");
    assert.equal(s.rect.opacity, 0.5);
    assert.equal(s.rect.left, "55px");
    assert.match(s.text.transform, /-1\.4/);
    await seek(page, 3);
    assert.equal(
      await page.locator("#infinite").getAttribute("data-progress"),
      "0",
    );
    s = await styles();
    assert.equal(s.image.transform, "scale(1.04)");
    assert.equal(s.text.opacity, 1);
    await seek(page, 4.5);
    s = await styles();
    assert.equal(s.image.opacity, 0.875);
    assert.equal(s.image.transform, "scale(1.0825)");
    assert.equal(s.rect.opacity, 0.75);
    assert.equal(s.text.opacity, 0.875);
    await seek(page, 5);
    assert.equal(await page.locator("#gated").count(), 1);
    assert.equal((await kept()).progress, 1);
    await seek(page, 5.01);
    assert.equal(await page.locator("#gated").count(), 0);
    assert.equal((await kept()).visible, false);
    await seek(page, 1.5);
    assert.equal((await styles()).image.opacity, 0.875);
    assert.equal(
      await page.evaluate(
        () => __animStage === codexTimeline && __animStage.fps === 60,
      ),
      true,
    );
    await page.evaluate(() => sceneRoot.unmount());
    assert.equal(
      await page.evaluate(() => !window.codexTimeline && !window.__animStage),
      true,
    );
  });
});

test("scene cuts mount only the active index, preserve metadata and stretch authored local time", async (t) => {
  const { url } = await setup(t);
  await withPage(url, async (page) => {
    await page.waitForFunction(() => window.codexTimeline);
    const first = (await read(page))[0];
    assert.equal(first.context.scene.custom, "Preserved metadata");
    await seek(page, 1.9);
    assert.equal((await read(page))[0].id, first.id);
    await seek(page, 2);
    const second = (await read(page))[0];
    assert.equal(second.name, "Two");
    assert.notEqual(second.id, first.id);
    assert.deepEqual(second.props, second.context);
    assert.equal(second.context.localTime, 0);
    assert.equal(second.time, 2);
    assert.equal(
      second.sprite,
      2,
      "Sprite keeps the global timeline inside a scene",
    );
    await seek(page, 4);
    assert.equal((await read(page))[0].context.progress, 1);
    await seek(page, 0);
    assert.notEqual((await read(page))[0].id, first.id);
    await page.evaluate(() =>
      codexTimeline.root.dispatchEvent(
        new CustomEvent("codex-timeline-scenes-update", {
          detail: JSON.stringify([
            { name: "One", dur: 4, nat: 2 },
            { name: "Two", dur: 2 },
          ]),
        }),
      ),
    );
    await page.waitForFunction(() => codexTimeline.duration === 6);
    await seek(page, 2);
    const stretched = (await read(page))[0].context;
    assert.equal(stretched.localTime, 1);
    assert.equal(stretched.dur, 2);
    assert.equal(stretched.total, 6);
    assert.equal(stretched.progress, 0.5);
    await page.evaluate(() =>
      codexTimeline.root.dispatchEvent(
        new CustomEvent("codex-timeline-scenes-update", {
          detail: JSON.stringify([{ name: "constructor", dur: 1 }]),
        }),
      ),
    );
    await page
      .getByRole("status")
      .filter({ hasText: "No component is mapped" })
      .waitFor();
    assert.equal(await page.locator("[data-probe]").count(), 0);
  });
  await withPage(url + "?mode=invalid", async (page) => {
    assert.match(
      await page.getByRole("status").innerText(),
      /valid scene list/,
    );
    assert.equal(await page.evaluate(() => !!window.codexTimeline), false);
  });
});

test("scene overlap freezes the last committed tree for two ticks and clears on paused or discontinuous seeks", async (t) => {
  const { url } = await setup(t);
  await withPage(url + "?transition=overlap", async (page) => {
    await page.waitForFunction(() => window.codexTimeline);
    await tick(page, 1.9);
    const last = (await read(page))[0];
    await page.evaluate(
      () => (window.outgoingNode = document.querySelector("[data-probe]")),
    );
    await tick(page, 2.01);
    let layers = await read(page);
    assert.equal(layers.length, 2);
    assert.deepEqual(layers[0], { ...last, frozen: true });
    assert.equal(
      await page.evaluate(
        () =>
          outgoingNode ===
          document.querySelector("[data-codex-scene-frozen=true] [data-probe]"),
      ),
      true,
    );
    await tick(page, 2.04);
    layers = await read(page);
    assert.equal(layers.length, 2);
    assert.deepEqual(layers[0], { ...last, frozen: true });
    await tick(page, 2.07);
    assert.equal((await read(page)).length, 1);
    await tick(page, 1.9);
    await seek(page, 2.01);
    assert.equal(
      (await read(page)).length,
      1,
      "An ordinary seek never overlaps",
    );
    await tick(page, 1.4);
    await tick(page, 2.01);
    assert.equal(
      (await read(page)).length,
      1,
      "A large jump is not continuous playback",
    );
    await tick(page, 1.9);
    await tick(page, 2.01);
    assert.equal((await read(page)).length, 2);
    await page.waitForTimeout(550);
    assert.equal(
      (await read(page)).length,
      1,
      "External-play timeout cannot leave a frozen ghost",
    );
    await tick(page, 1.9);
    await tick(page, 2.01);
    await page.evaluate(() =>
      codexTimeline.root.dispatchEvent(
        new CustomEvent("codex-timeline-scenes-update", {
          detail: JSON.stringify([
            { name: "One", dur: 2, desc: "Changed timing metadata" },
            { name: "Two", dur: 2 },
          ]),
        }),
      ),
    );
    await page.waitForFunction(
      () => document.querySelectorAll("[data-codex-scene-layer]").length === 1,
    );
  });
});

test("loop seams overlap only during effective looping, never on reset or a final finite pass", async (t) => {
  const { url } = await setup(t);
  for (const policy of ["loop", "once", "twice"]) {
    const query =
      policy === "loop"
        ? ""
        : "&playback=" +
          encodeURIComponent(
            JSON.stringify({ mode: "times", count: policy === "once" ? 1 : 2 }),
          );
    await withPage(url + "?transition=overlap" + query, async (page) => {
      await page.waitForFunction(() => window.codexTimeline);
      await tick(page, 3.9);
      const final = (await read(page))[0];
      await tick(page, 0.01);
      const layers = await read(page);
      assert.equal(layers.length, policy === "once" ? 1 : 2);
      if (layers.length === 2)
        assert.deepEqual(layers[0], { ...final, frozen: true });
      await tick(page, 3.9);
      await tick(page, 0);
      assert.equal((await read(page)).length, 1);
      await tick(page, 3.9);
      await seek(page, 4);
      assert.equal((await read(page)).length, 1);
      assert.equal((await read(page))[0].context.progress, 1);
    });
  }
  await withPage(url + "?capture=false&loop=false", async (page) => {
    await page.waitForFunction(() => window.codexTimeline);
    assert.equal(await page.evaluate(() => codexTimeline.captureActive), false);
    assert.equal(await page.locator(".cd-transport").first().isVisible(), true);
    const playback = await page
      .locator("svg")
      .getAttribute("data-codex-timeline-playback");
    assert.deepEqual(JSON.parse(playback), { mode: "times", count: 1 });
  });
});

test("nested video seeks exact source frames and actual encoded export waits for decoding", async (t) => {
  const { dir, url } = await setup(t);
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=160x100:r=20:d=0.5",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=160x100:r=20:d=0.5",
    "-filter_complex",
    "[0:v][1:v]concat=n=2:v=1:a=0",
    "-c:v",
    "libx264",
    "-g",
    "1",
    "-pix_fmt",
    "yuv420p",
    path.join(dir, "clip.mp4"),
  ]);
  await withPage(url + "?mode=video", async (page) => {
    await page.waitForFunction(
      () =>
        window.codexTimeline && document.querySelector("video").readyState >= 2,
    );
    await seek(page, 0.2);
    await page.waitForFunction(() => {
      const v = document.querySelector("video");
      return !v.seeking && Math.abs(v.currentTime - 0.6) < 0.001;
    });
    const state = await page.locator("video").evaluate((v) => ({
      time: v.currentTime,
      target: Number(v.dataset.codexVideoTarget),
      paused: v.paused,
    }));
    assert.ok(Math.abs(state.time - 0.6) < 0.001, JSON.stringify(state));
    assert.equal(state.target, 0.6000000000000001);
    assert.equal(state.paused, true);
    await seek(page, 0.4);
    await page.waitForFunction(() => {
      const v = document.querySelector("video");
      return !v.seeking && Math.abs(v.currentTime - 0.4) < 0.001;
    });
    assert.ok(
      Math.abs(
        (await page.locator("video").evaluate((v) => v.currentTime)) - 0.4,
      ) < 0.001,
    );
    await tick(page, 0.2, true);
    await page.waitForFunction(() => {
      const video = document.querySelector("video");
      return !video.seeking && Math.abs(video.currentTime - 0.6) < 0.001;
    });
    await new Promise((resolve) => setTimeout(resolve, 450));
    assert.equal(await page.evaluate(() => codexTimeline.time), 0.2);
    assert.equal(await page.locator("video").evaluate((v) => v.paused), true);
    assert.ok(
      Math.abs(
        (await page.locator("video").evaluate((v) => v.currentTime)) - 0.6,
      ) < 0.001,
    );
    await tick(page, 0.4, true);
    await page.waitForFunction(
      () =>
        !document.querySelector("video").seeking &&
        Math.abs(document.querySelector("video").currentTime - 0.4) < 0.001,
    );
    await seek(page, 0);
    await page.waitForFunction(
      () =>
        !document.querySelector("video").seeking &&
        Math.abs(document.querySelector("video").currentTime - 0.2) < 0.001,
    );
  });
  const output = path.join(dir, "nested.mp4");
  const result = await exportArtifact("video", url + "?mode=video", output, {
    fps: 5,
    deviceScaleFactor: 1,
  });
  assert.equal(result.frames, 5);
  const pixels = execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    output,
    "-vf",
    "scale=1:1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  assert.equal(pixels.length, 15);
  const blue = (i) => pixels[i * 3 + 2] > pixels[i * 3] + 80;
  assert.equal(blue(0), false);
  assert.equal(blue(1), true);
  assert.equal(blue(2), false);
  assert.equal(blue(4), true);
});
