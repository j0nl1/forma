import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unzipSync, strFromU8 } from "fflate";
import { withPage } from "../skills/studio-design/scripts/lib/browser.mjs";
import {
  parseEffect,
  buildSteps,
} from "../skills/studio-design/assets/starters/deck-effects.js";
import { tracksFor } from "../skills/studio-design/scripts/lib/pptx-motion-effects.mjs";
import {
  composedTargets,
  composeSteps,
} from "../skills/studio-design/scripts/lib/pptx-motion-compose.mjs";
import { temporary, root } from "./helpers.mjs";
import { serve } from "../skills/studio-design/scripts/preview.mjs";
import { exportArtifact } from "../skills/studio-design/scripts/export.mjs";

const repeatCases = [
  {
    parent: { effect: "path", duration: 800, repeat: 2 },
    child: { effect: "spin", duration: 1600, trigger: "with" },
  },
  {
    parent: { effect: "path", duration: 800, repeat: 2 },
    child: { effect: "path", duration: 400, repeat: 4, trigger: "with" },
  },
  {
    parent: { effect: "path", duration: 400, repeat: 2, reverse: true },
    child: { effect: "grow", duration: 600, trigger: "after" },
  },
  {
    parent: { effect: "path", duration: 800, repeat: 2 },
    child: { effect: "spin", duration: 600, trigger: "click" },
  },
];
async function repeatedFixture(t, cases = repeatCases.slice(0, 1)) {
  const dir = await temporary(t);
  await fs.cp(
    path.join(root, "skills/studio-design/assets/starters"),
    path.join(dir, "starters"),
    { recursive: true },
  );
  const attributes = (value, parent) =>
    `data-anim="${value.effect}" data-anim-path="M0 0 L${parent ? "160 0" : "0 80"}" data-anim-repeat="${value.repeat ?? 1}" data-anim-duration="${value.duration}" data-anim-trigger="${value.trigger ?? "click"}" data-anim-rotate="90" data-anim-scale="1.5" ${value.reverse ? 'data-anim-auto-reverse="true"' : ""}`;
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Nested repeat regression</title><style>body{margin:0}section{background:white}</style></head><body><deck-stage width="1280" height="720">${cases.map((value) => `<section><div class="parent" style="position:absolute;left:200px;top:150px;width:300px;height:200px;background:#ed3029" ${attributes(value.parent, true)}><div class="child" style="position:absolute;left:50px;top:60px;width:100px;height:60px;background:#295acb" ${attributes(value.child, false)}></div></div></section>`).join("")}</deck-stage><script src="starters/deck.js"></script></body></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const file = path.join(dir, "repeat.pptx");
  const result = await exportArtifact("pptx", url, file);
  return { dir, file, result, url };
}

test("nested repeated path and child spin retain native composed playback", async (t) => {
  const { result } = await repeatedFixture(t);
  assert.equal(
    result.nativeAnimations,
    2,
    "Both source builds must animate, including the second parent iteration",
  );
  assert.equal(result.staticAnimations, 0);
});

function composition(value) {
  const slide = { width: 1280, height: 720 };
  const entries = [value.parent, value.child].map((spec, index) => {
    const entry = {
      ...parseEffect({
        "data-anim": spec.effect,
        "data-anim-path": index ? "M0 0 L0 80" : "M0 0 L160 0",
        "data-anim-duration": String(spec.duration),
        "data-anim-repeat": String(spec.repeat ?? 1),
        "data-anim-trigger": spec.trigger ?? "click",
        "data-anim-rotate": "90",
        ...(spec.reverse ? { "data-anim-auto-reverse": "true" } : {}),
      }),
      id: index ? "child" : "parent",
      documentIndex: index,
      geometry: index
        ? { x: 250, y: 210, w: 100, h: 60 }
        : { x: 200, y: 150, w: 300, h: 200 },
    };
    entry.tracks = tracksFor(entry, slide).tracks;
    return entry;
  });
  const objects = entries.map((entry, index) => ({
    ...entry.geometry,
    kind: "shape",
    animIds: index ? ["child", "parent"] : ["parent"],
  }));
  const components = composedTargets(entries, objects, slide);
  for (const component of components)
    for (const [index, cohort] of component.cohorts.entries())
      cohort.targets = [String(index + 2)];
  return {
    components,
    steps: composeSteps(buildSteps(entries), components, slide),
  };
}

test("composed repeat resets have distinct left and right values without resetting a concurrent child", () => {
  const { steps } = composition(repeatCases[0]);
  const [parent, child] = steps[1].items
    .filter((item) => item.entry.segments)
    .map((item) => item.entry);
  assert.equal(parent.repeat, 1);
  assert.deepEqual(
    parent.segments.map((part) => [part.start, part.duration]),
    [
      [0, 800],
      [800, 800],
    ],
  );
  assert.equal(parent.segments[0].tracks.get("ppt_x").at(-1)[1] * 1280, 160);
  assert.equal(parent.segments[1].tracks.get("ppt_x")[0][1], 0);
  assert.deepEqual(
    parent.segments[1].tracks.get("ppt_x"),
    [
      [0, 0],
      [1, 0.125],
    ],
    "Linear motion simplifies without bridging its repeat reset",
  );
  assert.equal(
    child.segments[0].tracks.get("rotation").at(-1)[1],
    child.segments[1].tracks.get("rotation")[0][1],
  );
  const reversed = composition(repeatCases[2]).steps[1].items.find(
    (item) => item.entry.segments,
  ).entry;
  assert.equal(reversed.segments[0].tracks.get("ppt_x").at(-1)[1], 0);
  assert.equal(reversed.segments[1].tracks.get("ppt_x")[0][1], 0);
});

test("one hundred linear repeats stay bounded and excessive composed timing stays explicit", async (t) => {
  const simple = {
    parent: { effect: "path", duration: 100, repeat: 100 },
    child: { effect: "path", duration: 100, repeat: 100, trigger: "with" },
  };
  const { file, result } = await repeatedFixture(t, [simple]);
  assert.equal(result.nativeAnimations, 2);
  const slide = strFromU8(
    unzipSync(await fs.readFile(file))["ppt/slides/slide1.xml"],
  );
  assert.ok(
    slide.length < 1000000,
    "Linear iteration segments must not duplicate hundreds of redundant samples",
  );
  const complex = {
    parent: { effect: "path", duration: 101, repeat: 100 },
    child: { effect: "spin", duration: 103, repeat: 100, trigger: "with" },
  };
  const planned = composition(complex);
  assert.match(
    planned.components[0].issue,
    /exceeds 256 native segments or 32768 sampled time points/,
  );
});

async function browserEndpoints(url) {
  return withPage(url, async (page) => {
    await page.evaluate(() =>
      document.querySelector("deck-stage").preparePrint(),
    );
    await page.emulateMedia({ media: "print" });
    return page.evaluate(async () => {
      const { parseEffect, buildSteps, effectFrames, effectOptions } =
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
        const root = slide.getBoundingClientRect();
        return buildSteps(entries)
          .slice(1)
          .map((step) => {
            for (const { entry, start } of step.items) {
              const animation = entry.element.animate(
                effectFrames(entry, { width: 1280, height: 720 }),
                effectOptions(entry, start, false),
              );
              animation.pause();
              animation.currentTime = step.duration;
            }
            return Object.fromEntries(
              [
                ["red", ".parent"],
                ["blue", ".child"],
              ].map(([key, selector]) => {
                const b = slide.querySelector(selector).getBoundingClientRect();
                return [
                  key,
                  [
                    b.left - root.left,
                    b.top - root.top,
                    b.right - root.left,
                    b.bottom - root.top,
                  ],
                ];
              }),
            );
          });
      });
    });
  });
}

test(
  "real Impress playback resets nested iterations and preserves reverse, after and click phases",
  { skip: process.env.STUDIO_TEST_IMPRESS !== "1" },
  async (t) => {
    const { file, dir, url, result } = await repeatedFixture(t, repeatCases);
    assert.equal(result.nativeAnimations, 8);
    const expected = await browserEndpoints(url);
    const { stdout } = await promisify(execFile)(
      "/usr/bin/python3",
      [path.join(root, "tests/powerpoint-motion-repeat-impress.py"), file, dir],
      { timeout: 40000 },
    );
    const results = JSON.parse(stdout);
    for (const [index, result] of results.entries()) {
      for (const [step, key] of [
        [0, "first"],
        ...(result.second ? [[1, "second"]] : []),
      ])
        for (const color of ["red", "blue"])
          for (let axis = 0; axis < 4; axis++)
            assert.ok(
              Math.abs(
                result[key][color][axis] - expected[index][step][color][axis],
              ) <= 3,
              `Repeat slide ${index + 1} ${key} ${color}: ${result[key][color]} versus browser ${expected[index][step][color]}`,
            );
    }
    const frames = (index) =>
      results[index].frames.filter((frame) => frame.red && frame.blue);
    const resets = (values, color, axis, threshold) =>
      values
        .slice(1)
        .flatMap((frame, index) =>
          values[index][color][axis] - frame[color][axis] > threshold
            ? [[values[index], frame]]
            : [],
        );
    assert.equal(
      resets(frames(0), "red", 0, 100).length,
      1,
      "Parent path must reset once, rather than stretch one cycle",
    );
    for (const [before, after] of resets(frames(0), "red", 0, 100)) {
      for (const axis of [0, 1])
        assert.ok(
          Math.abs(
            before.blue[axis + 2] -
              before.blue[axis] -
              (after.blue[axis + 2] - after.blue[axis]),
          ) < 8,
          "Child spin continues through the parent reset",
        );
    }
    assert.equal(resets(frames(1), "red", 0, 100).length, 1);
    assert.equal(
      resets(frames(1), "blue", 1, 40).length,
      3,
      "The child performs all four iterations",
    );
    let cycles = 0,
      atPeak = false;
    for (const frame of frames(2)) {
      if (frame.red[0] > 335) atPeak = true;
      if (atPeak && frame.red[0] < 220) {
        cycles++;
        atPeak = false;
      }
      if (cycles < 2)
        assert.ok(
          Math.abs(frame.blue[2] - frame.blue[0] - 100) <= 2,
          "After effect waits until every reverse iteration ends",
        );
    }
    assert.equal(cycles, 2, "Both complete forward/reverse cycles must render");
    assert.equal(resets(frames(3), "red", 0, 100).length, 1);
    assert.ok(
      Math.abs(results[3].first.blue[2] - results[3].first.blue[0] - 100) <= 2,
      "Child spin waits for its own click",
    );
  },
);
