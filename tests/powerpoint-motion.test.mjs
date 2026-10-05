import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import PptxGenJS from "pptxgenjs";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { temporary, root } from "./helpers.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/forma/scripts/export.mjs";
import { applyPptxMotion } from "../skills/forma/scripts/lib/pptx-motion.mjs";
import { effects } from "../skills/forma/assets/starters/deck-effects.js";

const execute = promisify(execFile);
const xml = (buffer, file = "ppt/slides/slide1.xml") =>
  strFromU8(unzipSync(buffer)[file]);

async function generated(names, { split = false } = {}) {
  const deck = new PptxGenJS();
  deck.layout = "LAYOUT_WIDE";
  const captures = [];
  for (const [index, effect] of names.entries()) {
    const slide = deck.addSlide();
    const id = `source-${index}`,
      geometry = { x: 300, y: 200, w: 400, h: 200 };
    const objects = [];
    for (let part = 0; part < (split ? 2 : 1); part++) {
      const objectName = `shape-${index}-${part}`;
      const rect = {
        ...geometry,
        x: geometry.x + part * 200,
        w: split ? 200 : 400,
      };
      slide.addShape(deck.ShapeType.rect, {
        objectName,
        x: rect.x / 96,
        y: rect.y / 96,
        w: rect.w / 96,
        h: rect.h / 96,
        fill: { color: "4488CC" },
      });
      objects.push({ ...rect, objectName, animIds: [id], kind: "shape" });
    }
    captures.push({
      width: 1280,
      height: 720,
      objects,
      animations: [
        {
          id,
          geometry,
          documentIndex: 0,
          attributes: {
            "data-anim": effect,
            "data-anim-trigger": "click",
            "data-anim-duration": "800",
            "data-anim-path": "M0 0 L200 0 L200 120",
          },
        },
      ],
    });
  }
  return { buffer: await deck.write({ outputType: "nodebuffer" }), captures };
}

test("PowerPoint maps all 44 build names to resolved native shape targets and preserves editable groups", async () => {
  const names = Object.keys(effects);
  const { buffer, captures } = await generated(names, { split: true });
  const result = applyPptxMotion(buffer, captures);
  assert.equal(result.animationCount, 44);
  assert.equal(result.staticAnimationCount, 0);
  assert.ok(
    result.warnings.some((warning) => warning.includes("linear samples")),
  );
  assert.ok(
    result.warnings.some((warning) => warning.includes("filter geometry")),
  );
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("box-out uses a 1/60000-degree group rotation"),
    ),
  );
  for (const [index, name] of names.entries()) {
    const slide = xml(result.buffer, `ppt/slides/slide${index + 1}.xml`);
    const ids = new Set(
      [...slide.matchAll(/<p:cNvPr id="(\d+)"/g)].map((match) => match[1]),
    );
    const timingIds = [...slide.matchAll(/<p:cTn id="(\d+)"/g)].map(
      (match) => match[1],
    );
    assert.equal(
      new Set(timingIds).size,
      timingIds.length,
      `${name} time node IDs`,
    );
    for (const [, target] of slide.matchAll(/<p:spTgt spid="(\d+)"/g))
      assert.ok(ids.has(target), `${name} target ${target}`);
    assert.match(slide, /nodeType="clickEffect"/);
    assert.doesNotMatch(slide, /<p:attrNameLst><\/p:attrNameLst>/);
    assert.equal((slide.match(/<p:sp>/g) ?? []).length, 2);
    for (const [, duration] of slide.matchAll(/\bdur="([^"]+)"/g))
      assert.match(duration, /^\d+$|^indefinite$/);
  }
  assert.match(
    xml(result.buffer, "ppt/slides/slide5.xml"),
    /filter="wipe\(up\)"/,
  );
  assert.match(xml(result.buffer, "ppt/slides/slide5.xml"), /<p:grpSp>/);
  assert.match(
    xml(result.buffer, "ppt/slides/slide26.xml"),
    /<p:animRot from="1" to="1">/,
  );
  assert.doesNotMatch(
    xml(result.buffer, "ppt/slides/slide25.xml"),
    /<p:animRot/,
  );
});

test("PowerPoint preserves automatic, click, with and after timing even when an earlier target stays static", async () => {
  const { buffer, captures } = await generated(["spin"]);
  const captured = captures[0],
    base = captured.animations[0];
  captured.animations = [
    {
      ...base,
      id: "missing",
      attributes: {
        "data-anim": "fade-in",
        "data-anim-duration": "700",
        "data-anim-delay": "100",
      },
    },
    {
      ...base,
      attributes: {
        "data-anim": "spin",
        "data-anim-duration": "500",
        "data-anim-trigger": "after",
        "data-anim-repeat": "2",
        "data-anim-auto-reverse": "true",
      },
    },
    {
      ...base,
      id: "click",
      attributes: {
        "data-anim": "appear",
        "data-anim-trigger": "click",
        "data-anim-delay": "20",
      },
    },
    {
      ...base,
      id: "with",
      attributes: {
        "data-anim": "appear",
        "data-anim-trigger": "with",
        "data-anim-delay": "30",
      },
    },
  ];
  const result = applyPptxMotion(buffer, captures),
    slide = xml(result.buffer);
  assert.equal(result.animationCount, 1);
  assert.equal(result.staticAnimationCount, 3);
  assert.match(slide, /evt="onBegin" delay="0"><p:tn val="\d+"/);
  assert.match(slide, /dur="700" fill="hold"/);
  assert.match(slide, /repeatCount="2000"><p:stCondLst><p:cond delay="800"/);
  assert.match(
    slide,
    /nodeType="clickEffect"[^>]*><p:stCondLst><p:cond delay="20"/,
  );
  assert.match(
    slide,
    /nodeType="withEffect"[^>]*><p:stCondLst><p:cond delay="50"/,
  );
  assert.equal((slide.match(/delay="indefinite"/g) ?? []).length, 1);
});

test("PowerPoint leaves flattened and nested animation targets static without dropping their schedule", async () => {
  const { buffer, captures } = await generated(["fade-in", "grow"]);
  captures[0].objects[0].flattenedAnimationIds = [captures[0].animations[0].id];
  captures[1].objects[0].animIds.push("ancestor");
  const result = applyPptxMotion(buffer, captures);
  assert.equal(result.animationCount, 0);
  assert.equal(result.staticAnimationCount, 2);
  assert.equal(result.buffer, buffer);
  assert.ok(result.warnings.some((warning) => warning.includes("flattened")));
  assert.ok(result.warnings.some((warning) => warning.includes("nested")));
});

test("PowerPoint adds native builds beside existing media timing without replacing media nodes", async () => {
  const { buffer, captures } = await generated(["fade-in"]);
  const zip = unzipSync(buffer),
    file = "ppt/slides/slide1.xml";
  const media =
    '<p:video><p:cMediaNode><p:cTn id="101" dur="indefinite"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cMediaNode></p:video>';
  const timing = `<p:timing><p:tnLst><p:par><p:cTn id="100" nodeType="tmRoot" dur="indefinite"><p:childTnLst>${media}</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
  zip[file] = strToU8(
    strFromU8(zip[file]).replace("</p:sld>", `${timing}</p:sld>`),
  );
  const result = applyPptxMotion(Buffer.from(zipSync(zip)), captures),
    slide = xml(result.buffer);
  assert.equal(result.animationCount, 1);
  assert.ok(slide.includes(media));
  assert.equal((slide.match(/<p:timing>/g) ?? []).length, 1);
  assert.match(slide, /<p:cTn id="102"[^>]*nodeType="mainSeq"/);
});

test("actual HTML export resolves grouped builds and static opt-out", async (t) => {
  const dir = await temporary(t);
  await fs.cp(
    path.join(root, "skills/forma/assets/starters"),
    path.join(dir, "starters"),
    { recursive: true },
  );
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Native build fixture</title><style>body{margin:0}section{background:white}.target{position:absolute;left:100px;top:100px;width:250px;height:150px;background:#4488cc;color:white;font:24px Arial}.target span{display:block}</style></head><body><deck-stage width="800" height="500"><section><div class="target" data-anim="zoom-in" data-anim-trigger="click"><span>Editable first line</span><span>Editable second line</span></div></section><section><div class="target" data-anim="blinds-out" data-anim-trigger="click">Native filter</div></section></deck-stage><script src="starters/deck.js"></script></body></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const out = path.join(dir, "native.pptx");
  const result = await exportArtifact("pptx", url, out);
  assert.equal(result.nativeAnimations, 2);
  assert.equal(result.staticAnimations, 0);
  const slide = xml(await fs.readFile(out));
  assert.match(slide, /<p:grpSp>/);
  assert.match(slide, /Editable first line/);
  assert.match(slide, /<p:animScale>/);
  const staticOut = path.join(dir, "static.pptx");
  const staticResult = await exportArtifact("pptx", url, staticOut, {
    pptxAnimations: "static",
  });
  assert.equal(staticResult.nativeAnimations, 0);
  assert.doesNotMatch(xml(await fs.readFile(staticOut)), /<p:timing>/);
});

async function affineFixture(t) {
  const dir = await temporary(t);
  await fs.cp(
    path.join(root, "skills/forma/assets/starters"),
    path.join(dir, "starters"),
    { recursive: true },
  );
  const simple = [
    ["spin", "transform-origin:0 0", "data-anim-rotate=90"],
    ["grow", "transform-origin:0 0", "data-anim-scale=1.5"],
    [
      "spin",
      "transform:rotate(25deg) scale(.8);translate:20px 15px;rotate:15deg;transform-origin:25px 20px",
      "data-anim-rotate=90",
    ],
  ];
  const nested = [
    ["path", "spin", "with"],
    ["grow", "path", "with"],
    ["path", "spin", "after"],
    ["path", "spin", "click"],
  ];
  const sections = [
    ...simple.map(
      ([effect, style, attributes]) =>
        `<section><div class="blue" style="left:250px;top:170px;width:200px;height:100px;${style}" data-anim="${effect}" data-anim-trigger="click" data-anim-duration="600" ${attributes}></div></section>`,
    ),
    ...nested.map(
      ([parent, child, trigger]) =>
        `<section><div class="red" style="left:200px;top:120px;width:300px;height:220px" data-anim="${parent}" data-anim-trigger="click" data-anim-duration="600" data-anim-scale="1.5" data-anim-path="M0 0 L120 0"><div class="blue" style="left:45px;top:55px;width:100px;height:65px" data-anim="${child}" data-anim-trigger="${trigger}" data-anim-duration="600" data-anim-rotate="90" data-anim-path="M0 0 L80 0"></div></div></section>`,
    ),
  ];
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Composed affine playback fixture</title><style>body{margin:0}section{background:white}.blue,.red{position:absolute}.blue{background:#295acb}.red{background:#ed3029}</style></head><body><deck-stage width="1280" height="720">${sections.join("")}</deck-stage><script src="starters/deck.js"></script></body></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const expected = await withPage(url, async (page) => {
    await page.evaluate(() =>
      document.querySelector("deck-stage").preparePrint(),
    );
    await page.emulateMedia({ media: "print" });
    return page.evaluate(async () => {
      const { parseEffect, effectFrames, effectOptions, buildSteps } =
        await import("./starters/deck-effects.js");
      return [...document.querySelector("deck-stage").slides].map((slide) => {
        const entries = [...slide.querySelectorAll("[data-anim]")].map(
          (element, documentIndex) => ({
            ...parseEffect(element),
            element,
            documentIndex,
            opacity: 1,
          }),
        );
        const steps = buildSteps(entries),
          root = slide.getBoundingClientRect();
        const bounds = () => {
          const r = slide.querySelector(".blue").getBoundingClientRect();
          return [
            r.left - root.left,
            r.top - root.top,
            r.right - root.left,
            r.bottom - root.top,
          ];
        };
        const result = { before: bounds(), steps: [] };
        for (const step of steps.slice(1)) {
          for (const { entry, start } of step.items) {
            const animation = entry.element.animate(
              effectFrames(entry, { width: 1280, height: 720 }),
              effectOptions(entry, start, false),
            );
            animation.pause();
            animation.currentTime = step.duration;
          }
          result.steps.push(bounds());
        }
        return result;
      });
    });
  });
  const file = path.join(dir, "affine.pptx");
  const result = await exportArtifact("pptx", url, file);
  return { file, result, expected };
}

test("actual HTML export preserves custom pivots, CSS base transforms and composed click steps", async (t) => {
  const { file, result, expected } = await affineFixture(t);
  assert.equal(result.nativeAnimations, 11);
  assert.equal(result.staticAnimations, 0);
  assert.deepEqual(expected[0].steps[0], [150, 170, 250, 370]);
  assert.deepEqual(expected[1].steps[0], [250, 170, 550, 320]);
  assert.deepEqual(expected[6].steps[0], [365, 175, 465, 240]);
  assert.deepEqual(expected[6].steps[1], [382.5, 157.5, 447.5, 257.5]);
  const buffer = await fs.readFile(file);
  assert.match(xml(buffer), /<p:attrName>ppt_x<\/p:attrName>/);
  assert.match(
    xml(buffer, "ppt/slides/slide4.xml"),
    /Studio animation composed-/,
  );
  assert.equal(
    (xml(buffer, "ppt/slides/slide7.xml").match(/delay="indefinite"/g) ?? [])
      .length,
    2,
  );
});

test("moving ancestor clips retain explicit static diagnostics", async () => {
  const { buffer, captures } = await generated(["path"]),
    capture = captures[0],
    base = capture.animations[0];
  capture.objects[0].animIds = ["child", base.id];
  capture.animations.push({
    ...base,
    id: "child",
    documentIndex: 1,
    clippedByAncestor: true,
    attributes: { "data-anim": "spin", "data-anim-trigger": "with" },
  });
  const result = applyPptxMotion(buffer, captures);
  assert.equal(result.animationCount, 0);
  assert.equal(result.staticAnimationCount, 2);
  assert.ok(
    result.warnings.some((warning) => warning.includes("ancestor clips")),
  );
});

test("Impress imports and round-trips all native build families when installed", async (t) => {
  try {
    await execute("libreoffice", ["--version"]);
  } catch {
    t.skip("LibreOffice is not installed.");
    return;
  }
  const dir = await temporary(t),
    output = path.join(dir, "roundtrip");
  await fs.mkdir(output);
  const { buffer, captures } = await generated(Object.keys(effects), {
    split: true,
  });
  await fs.writeFile(
    path.join(dir, "builds.pptx"),
    applyPptxMotion(buffer, captures).buffer,
  );
  await execute(
    "libreoffice",
    [
      `-env:UserInstallation=file://${dir}/profile`,
      "--headless",
      "--convert-to",
      "odp",
      "--outdir",
      output,
      path.join(dir, "builds.pptx"),
    ],
    { timeout: 30000 },
  );
  const content = xml(
    await fs.readFile(path.join(output, "builds.odp")),
    "content.xml",
  );
  assert.equal((content.match(/<draw:page /g) ?? []).length, 44);
  assert.equal(
    (content.match(/presentation:node-type="on-click"/g) ?? []).length,
    44,
  );
  assert.equal((content.match(/<anim:transitionFilter\b/g) ?? []).length, 26);
  assert.match(content, /svg:type="rotate"/);
  assert.match(content, /svg:type="scale"/);
  assert.match(content, /smil:attributeName="opacity"/);
  assert.match(content, /smil:keyTimes="0;0.5;1"/);
});

test(
  "real Impress playback preserves automatic visibility and click/with/after groups",
  { skip: process.env.STUDIO_TEST_IMPRESS !== "1" },
  async (t) => {
    const dir = await temporary(t),
      deck = new PptxGenJS();
    deck.layout = "LAYOUT_WIDE";
    const slide = deck.addSlide(),
      capture = { width: 1280, height: 720, objects: [], animations: [] };
    for (const [index, [effect, trigger, delay]] of [
      ["appear", "after", 0],
      ["fade-in", "click", 0],
      ["appear", "with", 300],
      ["disappear", "after", 0],
    ].entries()) {
      const id = `target-${index}`,
        objectName = `shape-${index}`,
        geometry = { x: 50 + index * 300, y: 50, w: 200, h: 200 };
      slide.addShape(deck.ShapeType.rect, {
        objectName,
        x: geometry.x / 96,
        y: geometry.y / 96,
        w: geometry.w / 96,
        h: geometry.h / 96,
        fill: { color: "4488CC" },
      });
      capture.objects.push({ ...geometry, objectName, animIds: [id] });
      capture.animations.push({
        id,
        geometry,
        documentIndex: index,
        attributes: {
          "data-anim": effect,
          "data-anim-trigger": trigger,
          "data-anim-delay": String(delay),
          "data-anim-duration": "600",
        },
      });
    }
    const repeatedSlide = deck.addSlide();
    const repeatedCapture = {
      width: 1280,
      height: 720,
      objects: [],
      animations: [],
    };
    for (const [index, effect] of ["path", "appear"].entries()) {
      const id = `repeat-${index}`,
        objectName = id,
        geometry = { x: index ? 950 : 50, y: 50, w: 200, h: 200 };
      repeatedSlide.addShape(deck.ShapeType.rect, {
        objectName,
        x: geometry.x / 96,
        y: geometry.y / 96,
        w: geometry.w / 96,
        h: geometry.h / 96,
        fill: { color: "4488CC" },
      });
      repeatedCapture.objects.push({ ...geometry, objectName, animIds: [id] });
      repeatedCapture.animations.push({
        id,
        geometry,
        documentIndex: index,
        attributes: {
          "data-anim": effect,
          "data-anim-trigger": "after",
          "data-anim-duration": "300",
          "data-anim-repeat": "2",
          "data-anim-auto-reverse": "true",
          "data-anim-path": "M0 0 L300 0",
        },
      });
    }
    const file = path.join(dir, "playback.pptx");
    await fs.writeFile(
      file,
      applyPptxMotion(await deck.write({ outputType: "nodebuffer" }), [
        capture,
        repeatedCapture,
      ]).buffer,
    );
    const all = await generated(Object.keys(effects), { split: true });
    for (const captured of all.captures) {
      captured.animations[0].attributes["data-anim-duration"] = "400";
      if (captured.animations[0].attributes["data-anim"] === "box-out")
        captured.animations[0].attributes["data-anim-repeat"] = "2";
    }
    const allFile = path.join(dir, "all-effects.pptx");
    await fs.writeFile(
      allFile,
      applyPptxMotion(all.buffer, all.captures).buffer,
    );
    const affine = await affineFixture(t);
    const { stdout } = await execute(
      "/usr/bin/python3",
      [
        path.join(root, "tests/powerpoint-motion-impress.py"),
        file,
        dir,
        allFile,
        JSON.stringify(Object.keys(effects)),
        affine.file,
        JSON.stringify(affine.expected),
      ],
      { timeout: 120000 },
    );
    const samples = JSON.parse(stdout),
      blue = [68, 136, 204],
      white = [255, 255, 255];
    assert.deepEqual(samples.initial, [blue, white, white, blue]);
    assert.deepEqual(samples.early[2], white);
    assert.deepEqual(samples.early[3], blue);
    assert.ok(
      samples.early[1][0] > blue[0] && samples.early[1][0] < white[0],
      "fade is between its visible and hidden states",
    );
    assert.deepEqual(samples.middle[2], blue);
    assert.deepEqual(samples.finished, [blue, blue, blue, white]);
    assert.deepEqual(samples["repeat-middle"].marker, white);
    assert.ok(
      samples["repeat-middle"].left > 150,
      "the second forward iteration is still moving",
    );
    assert.deepEqual(samples["repeat-finished"][0], blue);
    assert.deepEqual(samples["repeat-finished"][3], blue);
    assert.equal(samples.affine.length, affine.expected.length);
    for (const [index, actual] of samples.affine.entries()) {
      const expected = affine.expected[index];
      for (const [label, bounds] of [
        ["before", expected.before],
        ["first", expected.steps[0]],
        ...(expected.steps.length > 1 ? [["second", expected.steps[1]]] : []),
      ])
        for (let coordinate = 0; coordinate < 4; coordinate++)
          assert.ok(
            Math.abs(actual[label][coordinate] - bounds[coordinate]) <= 3,
            `Affine slide ${index + 1} ${label} bounds ${actual[label]} must match browser ${bounds}`,
          );
      for (const [label, bounds] of [
        ["first", expected.steps[0]],
        ...(expected.steps.length > 1 ? [["second", expected.steps[1]]] : []),
      ]) {
        for (const axis of [0, 1])
          assert.ok(
            Math.abs(
              actual[label][axis + 2] -
                actual[label][axis] -
                (bounds[axis + 2] - bounds[axis]),
            ) <= 3,
            `Affine slide ${index + 1} retains its browser extent`,
          );
      }
      if (index >= 5) {
        assert.ok(
          Math.abs(actual.middle[2] - actual.middle[0] - 100) <= 2,
          "The child waits for its after/click boundary before rotating",
        );
        assert.ok(
          Math.abs(actual.middle[3] - actual.middle[1] - 65) <= 2,
          "The waiting child retains its original height",
        );
      }
      assert.notDeepEqual(
        actual.middle,
        actual.before,
        `Affine slide ${index + 1} moves progressively`,
      );
      assert.notDeepEqual(
        actual.middle,
        actual.first,
        `Affine slide ${index + 1} has an intermediate state`,
      );
    }
    assert.equal(samples.effects.length, 44);
    for (const result of samples.effects) {
      const spec = effects[result.effect];
      if (spec.kind === "entrance") {
        assert.equal(result.before.pixels, 0, `${result.effect} starts hidden`);
        assert.ok(
          result.after.pixels > 75000,
          `${result.effect} finishes visible: ${JSON.stringify(result)}`,
        );
      } else if (spec.kind === "exit") {
        assert.ok(
          result.before.pixels > 75000,
          `${result.effect} starts visible`,
        );
        assert.equal(
          result.after.pixels,
          0,
          `${result.effect} finishes hidden`,
        );
      } else {
        assert.ok(
          result.before.pixels > 75000 && result.after.pixels > 30000,
          `${result.effect} retains its artwork`,
        );
      }
      if (result.effect === "box-out") {
        assert.ok(
          result.repeatMiddle.pixels > 0 &&
            result.repeatMiddle.pixels < result.before.pixels,
          "box-out resets and progressively clips during its second iteration",
        );
        const [left, top, right, bottom] = result.before.bounds;
        for (const frame of result.middle) {
          assert.ok(frame.pixels > 0 && frame.pixels < result.before.pixels);
          const [x1, y1, x2, y2] = frame.bounds;
          assert.ok(
            x1 > left && y1 > top && x2 < right && y2 < bottom,
            "box-out closes toward its center instead of opening a hole",
          );
          assert.ok(Math.abs(x1 + x2 - left - right) <= 4);
          assert.ok(Math.abs(y1 + y2 - top - bottom) <= 4);
        }
      }
      if (!["appear", "disappear"].includes(result.effect)) {
        assert.ok(
          result.middle.some(
            (frame) =>
              JSON.stringify(frame) !== JSON.stringify(result.before) &&
              (frame.pixels !== result.after.pixels ||
                JSON.stringify(frame.bounds) !==
                  JSON.stringify(result.after.bounds)),
          ),
          `${result.effect} has an intermediate rendered state`,
        );
      }
    }
  },
);
