import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../skills/studio-design/scripts/build.mjs";
import { serve } from "../skills/studio-design/scripts/preview.mjs";
import { withPage } from "../skills/studio-design/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/studio-design/scripts/export.mjs";
import { captionFrame } from "../skills/studio-design/assets/starters/motion-model.js";

const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} should be near ${expected}`,
  );

test("caption selection preserves numeric starts, stable ordering, inferred endings, gaps and 180ms fades", () => {
  const a = { at: "1", text: "First caption" },
    b = { at: 2, text: "Second caption" },
    c = { at: 3, until: 3.3, text: "Short caption" },
    d = { at: 4, text: "Final caption" };
  const items = [
    d,
    null,
    { at: "invalid", text: "Ignored" },
    c,
    b,
    a,
    { at: Infinity, text: "Ignored infinity" },
    {},
  ];
  const untouched = items.slice();
  assert.equal(captionFrame(items, 0.9), null);
  for (const [time, item, opacity] of [
    [1, a, 0],
    [1.045, a, 0.25],
    [1.09, a, 0.5],
    [1.18, a, 1],
    [1.91, a, 0.5],
    [2, b, 0],
    [2.09, b, 0.5],
    [2.5, b, 1],
    [3, c, 0],
    [3.15, c, 5 / 6],
    [3.21, c, 0.5],
    [4, d, 0],
    [4.18, d, 1],
    [100, d, 1],
  ]) {
    const frame = captionFrame(items, time);
    assert.equal(frame.item, item);
    near(frame.opacity, opacity);
  }
  for (const time of [3.3, 3.9]) assert.equal(captionFrame(items, time), null);
  assert.deepEqual(
    items,
    untouched,
    "Selection must not mutate the authored list",
  );
  for (const until of [undefined, null, "0.1", NaN, Infinity, -Infinity]) {
    const first = { at: 0, until, text: "Infer the next caption" };
    assert.equal(
      captionFrame([first, { at: 1, text: "Next" }], 0.5).item,
      first,
    );
    near(captionFrame([first, { at: 1, text: "Next" }], 0.95).opacity, 5 / 18);
  }
  const equal = [
    { at: 1, text: "Earlier equal entry" },
    { at: "1", text: "Last equal entry" },
  ];
  assert.equal(captionFrame(equal, 1.1).item, equal[1]);
  assert.equal(
    captionFrame(
      [
        { at: 0, until: 8, text: "Earlier" },
        { at: 1, until: 1.2, text: "Later" },
      ],
      1.3,
    ),
    null,
    "An expired latest entry must not revive overlapping content",
  );
  for (const at of [null, "", false, true, "1"])
    assert.equal(
      captionFrame([{ at, text: "Numeric coercion" }], Number(at) + 0.2)
        .opacity,
      1,
    );
  for (const input of [null, undefined, false, 0, ""])
    assert.equal(captionFrame(input, 1), null);
});

async function setup(t, { media = false } = {}) {
  const dir = await temporary(t);
  const runtime = path.join(
    root,
    "skills/studio-design/assets/starters/animations.jsx",
  );
  await fs.writeFile(
    path.join(dir, "main.jsx"),
    `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {CompositionStage, Shot, Captions, VideoSprite, useComposition} from ${JSON.stringify(runtime)};
    const query=new URLSearchParams(location.search);
    const captions=[{at:4,text:"Final caption"},null,{at:"bad",text:"Ignored caption"},{at:2.5,until:3.5,text:"Middle caption"},{at:"0.5",until:1.5,text:"Opening caption"},{at:1.5,until:NaN,text:"Boundary caption"}];
    function Media() {
      const [mount]=React.useState(() => ++window.mediaMounts);
      return <div data-mount={mount} style={{position:"absolute",inset:0,background:"#14683e"}}>
        <img id="nested-image" alt="Local blue artwork" src="image.svg" style={{position:"absolute",left:15,top:20,width:60,height:60}}/>
        <VideoSprite src="clip.mp4" start={0} end={1} style={{position:"absolute",left:100,top:20,width:80,height:80}}/>
      </div>;
    }
    function Piece() {
      const {T,CUES}=useComposition();
      return <>
        ${media ? '<Shot id="media-shot" from={CUES.Middle} to={CUES.Close}><Media/></Shot>' : ""}
        <Shot id="numeric-shot" from="1" to="2"><span>Numeric interval</span></Shot>
        <Shot id="open-shot" from={4} to={null}><span>Open interval</span></Shot>
        <Shot id="missing-shot"><span>No authored start</span></Shot>
        <Shot id="invalid-shot" from={-Infinity}><span>Invalid start</span></Shot>
        <Shot id="zero-shot" from={2} to={2}><span>Empty interval</span></Shot>
        <output id="authored" hidden>{T}</output>
        <Captions items={query.has("empty") ? null : captions} style={query.has("custom") ? {opacity:.37,fontFamily:"Georgia",fontSize:18,color:"#2b3339",textShadow:"none",bottom:10} : undefined}/>
      </>;
    }
    window.mediaMounts=0;
    window.contentRoot=createRoot(document.getElementById("root"));
    contentRoot.render(<CompositionStage width={400} height={240} bg="#faf8f0" autoplay={false} persistKey="content-fixture"
      scenes='[{"name":"Opening","dur":2},{"name":"Middle","dur":2},{"name":"Close","dur":2}]'><Piece/></CompositionStage>);
  `,
  );
  await bundle(path.join(dir, "main.jsx"), path.join(dir, "bundle.js"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Composition content contracts</title></head><body style="margin:0"><div id="root"></div><script src="bundle.js"></script></body></html>',
  );
  if (media) {
    await fs.writeFile(
      path.join(dir, "image.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#2c49c5"/></svg>',
    );
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=80x80:r=10:d=0.5",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=80x80:r=10:d=0.5",
      "-filter_complex",
      "[0:v][1:v]concat=n=2:v=1:a=0[v]",
      "-map",
      "[v]",
      "-c:v",
      "libx264",
      "-g",
      "1",
      "-pix_fmt",
      "yuv420p",
      path.join(dir, "clip.mp4"),
    ]);
  }
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url };
}
async function seek(page, time) {
  await page.evaluate((time) => codexTimeline.seek(time), time);
}
const caption = (page) =>
  page.evaluate(() => {
    const node = document.querySelector("[data-codex-caption]");
    if (!node) return null;
    const style = getComputedStyle(node);
    return {
      text: node.textContent,
      opacity: Number(style.opacity),
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      shadow: style.textShadow,
      color: style.color,
      left: style.left,
      right: style.right,
      bottom: style.bottom,
      align: style.textAlign,
      pointer: style.pointerEvents,
    };
  });

test("synchronous caption cuts use authored time and retain default typography and explicit style overrides", async (t) => {
  const { url } = await setup(t);
  await withPage(url + "?capture", async (page) => {
    await page.waitForFunction(() => window.codexTimeline);
    for (const [time, text, opacity] of [
      [0.5, "Opening caption", 0],
      [0.59, "Opening caption", 0.5],
      [0.68, "Opening caption", 1],
      [1.41, "Opening caption", 0.5],
      [1.5, "Boundary caption", 0],
      [1.59, "Boundary caption", 0.5],
      [2.41, "Boundary caption", 0.5],
      [2.5, "Middle caption", 0],
      [3.41, "Middle caption", 0.5],
      [4, "Final caption", 0],
      [4.09, "Final caption", 0.5],
      [6, "Final caption", 1],
    ]) {
      await seek(page, time);
      const actual = await caption(page);
      assert.equal(actual.text, text);
      near(actual.opacity, opacity);
      assert.equal(await page.locator("[data-codex-caption]").count(), 1);
    }
    for (const time of [0, 0.49, 3.5, 3.9]) {
      await seek(page, time);
      assert.equal(await caption(page), null);
    }
    await seek(page, 0.68);
    const typography = await caption(page);
    assert.equal(typography.fontFamily, "Inter, system-ui, sans-serif");
    assert.equal(typography.fontSize, "30px");
    assert.equal(typography.fontWeight, "500");
    assert.equal(typography.shadow, "rgba(0, 0, 0, 0.45) 0px 1px 14px");
    assert.equal(typography.color, "rgb(246, 244, 239)");
    assert.equal(typography.left, "32px");
    assert.equal(typography.right, "32px");
    assert.equal(typography.bottom, "16.7969px");
    assert.equal(typography.align, "center");
    assert.equal(typography.pointer, "none");
    await page.evaluate(() =>
      codexTimeline.root.dispatchEvent(
        new CustomEvent("codex-timeline-scenes-update", {
          detail:
            '[{"name":"Opening","dur":4,"nat":2},{"name":"Middle","dur":2},{"name":"Close","dur":2}]',
        }),
      ),
    );
    await seek(page, 1.18);
    near(Number(await page.locator("#authored").textContent()), 0.59);
    near((await caption(page)).opacity, 0.5);
    await seek(page, 3);
    assert.equal((await caption(page)).text, "Boundary caption");
    near((await caption(page)).opacity, 0);
    await seek(page, 4.5);
    assert.equal((await caption(page)).text, "Middle caption");
    near((await caption(page)).opacity, 0);
  });
  await withPage(url + "?capture&custom", async (page) => {
    await page.waitForFunction(() => window.codexTimeline);
    for (const time of [0.5, 0.59, 1.41]) {
      await seek(page, time);
      const actual = await caption(page);
      near(actual.opacity, 0.37);
      assert.equal(actual.fontFamily, "Georgia");
      assert.equal(actual.fontSize, "18px");
      assert.equal(actual.shadow, "none");
      assert.equal(actual.color, "rgb(43, 51, 57)");
      assert.equal(actual.bottom, "10px");
    }
  });
  await withPage(url + "?capture&empty", async (page) => {
    await page.waitForFunction(() => window.codexTimeline);
    await seek(page, 1);
    assert.equal(await caption(page), null);
  });
});

test("shot gates retain numeric boundary semantics and never discard hidden decoded media", async (t) => {
  const { dir, url } = await setup(t, { media: true });
  await withPage(url + "?capture&empty", async (page) => {
    await page.waitForFunction(
      () =>
        window.codexTimeline && document.querySelector("video").readyState >= 2,
    );
    await page.evaluate(() => {
      window.keptImage = document.getElementById("nested-image");
      window.keptVideo = document.querySelector("video");
    });
    const visibility = (id) =>
      page
        .locator("#" + id)
        .evaluate((node) => getComputedStyle(node).visibility);
    for (const time of [0, 1, 2, 4, 6]) {
      await seek(page, time);
      assert.equal(
        await visibility("numeric-shot"),
        time === 1 ? "visible" : "hidden",
      );
      assert.equal(
        await visibility("open-shot"),
        time >= 4 ? "visible" : "hidden",
      );
      for (const id of ["missing-shot", "invalid-shot", "zero-shot"])
        assert.equal(await visibility(id), "hidden");
    }
    for (const [time, visible, source, blue] of [
      [0.6, false, 0.6, true],
      [2.1, true, 0.1, false],
      [2.6, true, 0.6, true],
      [4.6, false, 0.6, true],
      [1.1, false, 0.1, false],
      [2.6, true, 0.6, true],
    ]) {
      await seek(page, time);
      await page.waitForFunction(
        (source) =>
          !document.querySelector("video").seeking &&
          Math.abs(document.querySelector("video").currentTime - source) <
            0.001,
        source,
      );
      assert.equal(
        await visibility("media-shot"),
        visible ? "visible" : "hidden",
      );
      const actual = await page.evaluate(() => {
        const image = document.getElementById("nested-image"),
          video = document.querySelector("video");
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0, 1, 1);
        return {
          imageSame: image === keptImage,
          videoSame: video === keptVideo,
          imageReady: image.complete && image.naturalWidth === 60,
          videoReady: video.readyState >= 2,
          paused: video.paused,
          pixel: [...context.getImageData(0, 0, 1, 1).data],
          mounts: mediaMounts,
        };
      });
      for (const key of [
        "imageSame",
        "videoSame",
        "imageReady",
        "videoReady",
        "paused",
      ])
        assert.equal(actual[key], true, key);
      assert.equal(actual.mounts, 1);
      assert.equal(actual.pixel[2] > actual.pixel[0] + 100, blue);
    }
    await page.evaluate(() =>
      codexTimeline.root.dispatchEvent(
        new CustomEvent("codex-timeline-scenes-update", {
          detail:
            '[{"name":"Opening","dur":4,"nat":2},{"name":"Middle","dur":4,"nat":2},{"name":"Close","dur":2}]',
        }),
      ),
    );
    await seek(page, 3.9);
    assert.equal(await visibility("media-shot"), "hidden");
    await seek(page, 4);
    assert.equal(await visibility("media-shot"), "visible");
    await seek(page, 8);
    assert.equal(await visibility("media-shot"), "hidden");
    assert.equal(await page.evaluate(() => mediaMounts), 1);
  });
  const output = path.join(dir, "shots.mp4");
  const result = await exportArtifact("video", url + "?capture&empty", output, {
    fps: 10,
    startMs: 1900,
    endMs: 2800,
    deviceScaleFactor: 1,
    audio: "none",
  });
  assert.equal(result.frames, 9);
  const pixels = execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    output,
    "-vf",
    "format=rgb24,crop=1:1:140:60",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  assert.equal(pixels.length, 27);
  assert.ok(
    pixels[0] > 200 && pixels[1] > 200 && pixels[2] > 200,
    "The hidden media frame shows the stage background",
  );
  const redEntry = pixels[3] > pixels[5] + 100;
  if (!redEntry) {
    const archive = path.join(
      os.homedir(),
      ".codex-artifacts",
      root.replace(/^[/\\]+/, ""),
      "research",
      "shot-entry-failures",
    );
    try {
      await fs.mkdir(archive, { recursive: true });
      const run = await fs.mkdtemp(path.join(archive, "capture-"));
      await Promise.all([
        fs.copyFile(output, path.join(run, "shots.mp4")),
        fs.copyFile(path.join(dir, "clip.mp4"), path.join(run, "source.mp4")),
        fs.writeFile(
          path.join(run, "pixels.json"),
          JSON.stringify({ fps: 10, startMs: 1900, pixels: [...pixels] }),
        ),
      ]);
      t.diagnostic(`Incorrect video entry evidence retained at ${run}`);
    } catch (error) {
      t.diagnostic(`Could not retain video entry evidence: ${error.message}`);
    }
  }
  assert.ok(redEntry, "The shot opens with decoded red media");
  assert.ok(
    pixels[20] > pixels[18] + 100,
    "The blue media frame is decoded inside the visible shot",
  );
});

test("real encoded caption frames retain the authored fade envelope and explicit opacity", async (t) => {
  const { dir, url } = await setup(t);
  await fs.copyFile(
    new URL(
      "../skills/studio-design/assets/starters/fonts/inter-medium.woff2",
      import.meta.url,
    ),
    path.join(dir, "inter-medium.woff2"),
  );
  const frames = async (name, query) => {
    const output = path.join(dir, name + ".mp4");
    const result = await exportArtifact("video", url + query, output, {
      fps: 10,
      startMs: 500,
      endMs: 800,
      deviceScaleFactor: 1,
      crf: 0,
      audio: "none",
    });
    assert.equal(result.frames, 3);
    return execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      output,
      "-vf",
      "format=rgb24,crop=350:50:25:180",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ]);
  };
  const stride = 350 * 50 * 3;
  const defaultFrames = await frames("default-captions", "?capture");
  assert.equal(defaultFrames.length, stride * 3);
  // Render the inspected layout/style contract without the animation runtime.
  // Compare actual rasters rather than assuming linear glyph antialiasing.
  await fs.writeFile(
    path.join(dir, "caption-reference.html"),
    `<!doctype html><html lang="en"><head><meta name="codex-fixed-sheet" content="off"><title>Independent caption reference</title><style>
    body{margin:0}article{position:relative;width:400px;height:240px;background:#faf8f0}
    @font-face{font-family:Inter;font-weight:500;font-style:normal;font-display:swap;src:url("inter-medium.woff2") format("woff2")}
    #caption{position:absolute;left:8%;right:8%;bottom:7%;text-align:center;pointer-events:none;font:500 30px Inter,system-ui,sans-serif;color:#f6f4ef;text-shadow:0 1px 14px rgba(0,0,0,.45)}
  </style></head><body><article><div id="caption">Opening caption</div></article></body></html>`,
  );
  const referencePNGs = [];
  await withPage(
    url + "caption-reference.html",
    async (page) => {
      for (const opacity of [0, 0.1 / 0.18, 1]) {
        await page
          .locator("#caption")
          .evaluate((node, opacity) => (node.style.opacity = opacity), opacity);
        referencePNGs.push(await page.screenshot());
      }
    },
    { width: 400, height: 240 },
  );
  const referenceVideo = path.join(dir, "independent-caption-reference.mp4");
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "-framerate",
      "10",
      "-i",
      "pipe:0",
      "-vf",
      "scale=400:240:flags=lanczos,setsar=1",
      "-c:v",
      "libx264",
      "-crf",
      "0",
      "-pix_fmt",
      "yuv420p",
      referenceVideo,
    ],
    { input: Buffer.concat(referencePNGs) },
  );
  const decodedReference = execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    referenceVideo,
    "-vf",
    "format=rgb24,crop=350:50:25:180",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  const expected = [0, 1, 2].map((frame) =>
    decodedReference.subarray(frame * stride, (frame + 1) * stride),
  );
  const differences = [1, 2].map((frame) => {
    let ink = 0;
    for (let pixel = 0; pixel < stride; pixel++)
      ink += Math.max(
        0,
        defaultFrames[pixel] - defaultFrames[frame * stride + pixel],
      );
    return ink;
  });
  assert.ok(
    differences[1] > 100000,
    "A fully visible caption must contribute actual ink to the encoded frame",
  );
  const referenceInk = [1, 2].map((frame) => {
    let ink = 0;
    for (let pixel = 0; pixel < stride; pixel++)
      ink += Math.max(0, expected[0][pixel] - expected[frame][pixel]);
    return ink;
  });
  near(
    differences[0] / differences[1],
    referenceInk[0] / referenceInk[1],
    0.005,
  );
  for (const frame of [0, 1, 2]) {
    let error = 0;
    for (let pixel = 0; pixel < stride; pixel++)
      error += Math.abs(
        defaultFrames[frame * stride + pixel] - expected[frame][pixel],
      );
    assert.ok(
      error / stride < 2,
      "Encoded caption pixels must match the independently rendered reference within codec color conversion error",
    );
  }
  const overridden = await frames("override-captions", "?capture&custom");
  assert.equal(overridden.length, stride * 3);
  for (const frame of [1, 2]) {
    let difference = 0;
    for (let pixel = 0; pixel < stride; pixel++)
      difference += Math.abs(
        overridden[pixel] - overridden[frame * stride + pixel],
      );
    assert.ok(
      difference < stride * 0.5,
      "Authored opacity must remain constant at each encoded fade timestamp",
    );
  }
});
