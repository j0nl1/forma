import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../skills/studio-design/scripts/build.mjs";
import { serve } from "../skills/studio-design/scripts/preview.mjs";
import { withPage } from "../skills/studio-design/scripts/lib/browser.mjs";
import { inlineHtml } from "../skills/studio-design/scripts/lib/inline.mjs";
import {
  buildRamp,
  metaParts,
  requestFor,
  attributeName,
  closestMetric,
  triple,
} from "../skills/studio-design/assets/starters/data-overlay-model.js";
import {
  linearOf,
  ownLinear,
  mulLin,
  quadOffset,
  cornerRad,
} from "../skills/studio-design/assets/starters/data-overlay-geometry.js";
import { layoutCallouts } from "../skills/studio-design/assets/starters/data-overlay-layout.js";
const data = {
  suggest: { window: ["last 28 days", "weekends only", "last 24 hours"] },
  views: [
    {
      id: "reach",
      label: "Reach",
      basis: "100 active users",
      asOf: "2026-10-01",
      source: "Synthetic fixture: a=37,b=28 / 100",
      refreshable: true,
      sentence: {
        metric: "reach",
        cohort: "all users",
        window: "last 28 days",
      },
      spectrum: { colors: ["#ffffff", "#336699"], domain: [0, 1] },
      legend: true,
      deltaBasis: "prior 28 days",
      finding: "Synthetic example only",
      elements: [
        {
          id: "a",
          value: 0.37,
          delta: 0.04,
          callout: {
            pin: 3,
            head: "Composer",
            body: "37 of 100 synthetic users",
          },
        },
        {
          id: "b",
          value: 0.28,
          callout: { head: "Templates", body: "28 of 100 synthetic users" },
        },
        { id: "nil", value: null },
        { id: "spot" },
      ],
    },
    {
      id: "weekly",
      sentence: { metric: "reach", cohort: "all users", window: "last 7 days" },
      basis: "40 active users",
      elements: [{ id: "b", value: 0.5 }],
      dim: 1,
    },
    {
      id: "output",
      sentence: {
        metric: "output",
        cohort: "new users",
        window: "last 7 days",
      },
      elements: [
        {
          id: "a",
          callout: {
            head: "Keep creation clear",
            body: "Observation → consequence → direction",
          },
        },
        {
          id: "b",
          callout: { head: "Templates", body: "A second annotation" },
        },
      ],
    },
  ],
};
async function fixture(t, { src = "", contents = data } = {}) {
  const dir = await temporary(t);
  await bundle(
    path.join(root, "skills/studio-design/assets/starters/data-overlay.js"),
    path.join(dir, "overlay.js"),
  );
  await fs.writeFile(path.join(dir, "data.json"), JSON.stringify(contents));
  await fs.writeFile(
    path.join(dir, "data.js"),
    `window.__overlays=${JSON.stringify(contents)};`,
  );
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{margin:0;background:#f6f4ef;font:16px sans-serif}.screen{height:600px;width:600px;position:relative;padding:80px 30px}.subject{width:120px;height:60px;display:block;border:1px solid #999;background:#fff;border-radius:22px;margin-bottom:55px}#b{position:absolute;left:300px;top:80px}#other{opacity:.7}#nil{position:absolute;left:300px;top:260px}#spot{position:absolute;left:30px;top:360px}.occluder{position:absolute;left:25px;top:75px;width:130px;height:70px;background:#222;z-index:50}</style><script src="overlay.js"></script></head><body><data-overlay controls="on" ${src ? `src="${src}"` : ""}><div class="screen"><button id="a" class="subject" data-metric-id="a">Create</button><button id="b" class="subject" data-metric-id="b">Templates</button><div id="other" class="subject" data-metric-id="other" style="opacity:.7">Other</div><div id="nil" class="subject" data-metric-id="nil">No measure</div><div id="spot" class="subject" data-metric-id="spot">Spotlight</div></div></data-overlay></body></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url };
}
async function authored(page) {
  await page.evaluate((data) => {
    window.overlay = document.querySelector("data-overlay");
    overlay.setViews(data);
  }, data);
  await page.waitForFunction(
    () =>
      document
        .querySelector("data-overlay")
        .shadowRoot.querySelectorAll(".dv-box").length === 3,
  );
}

test("spectra retain linear, distinct quantile, discrete, flipped, flat and baseline semantics", () => {
  const linear = buildRamp(
    { colors: ["#000", "#fff"], domain: [0, 10] },
    [0, 10],
  );
  assert.equal(linear.color(5), "rgb(128,128,128)");
  const quantile = buildRamp(
    { colors: ["#000", "#fff"], scale: "quantile" },
    [1, 2, 2, 100, 100],
  );
  assert.equal(quantile.color(2), "rgb(128,128,128)");
  assert.equal(quantile.color(100), "rgb(255,255,255)");
  assert.equal(
    buildRamp(
      { colors: ["#000", "#fff"], steps: 3, domain: [0, 10] },
      [],
    ).color(3),
    "rgb(128,128,128)",
  );
  assert.equal(
    buildRamp({ colors: ["#000", "#fff"], good: "low" }, [0, 10]).color(0),
    "rgb(255,255,255)",
  );
  const diverging = buildRamp(
    {
      colors: ["#000", "#aaa", "#fff"],
      domain: [0, 10],
      baseline: 2,
      good: "low",
      scale: "quantile",
    },
    [0, 1, 2, 10],
  );
  assert.equal(diverging.color(2), "rgb(170,170,170)");
  assert.equal(diverging.flipped, false);
  assert.equal(
    buildRamp({ colors: ["#000", "#fff"] }, [4, 4]).color(4),
    "rgb(128,128,128)",
  );
  assert.equal(
    buildRamp({ colors: ["hsl(0 0% 0%)", "red"] }, [0, 1]).color(1),
    "rgb(85,138,66)",
  );
  assert.deepEqual(
    metaParts({
      range: "Oct 1 - Oct 7",
      n: 1200,
      unit: "active users",
      about: "exports and shares",
    }),
    {
      text: "Oct 1 - Oct 7 · 1,200 active users · exports and shares",
      range: true,
      about: true,
    },
  );
  assert.equal(
    metaParts({ n: true, unit: "users/day", range: "<script>", about: "  " })
      .text,
    "",
  );
  assert.equal(attributeName("x] , script["), "data-metric-id");
  assert.equal(
    closestMetric(data.views, {
      metric: "output",
      cohort: "all users",
      window: "last 28 days",
    }).id,
    "output",
  );
  assert.equal(triple({ label: "Accessibility" }).metric, "Accessibility");
  const request = requestFor({
    src: "data:text/plain,unsafe",
    mode: "refresh",
    active: {
      id: "<bad>",
      sentence: { metric: "reach", cohort: "<bad>", window: "last 7 days" },
    },
  });
  assert.equal(request.mode, "missing");
  assert.equal(request.want.cohort, "");
  assert.equal(request.src, "");
  assert.doesNotMatch(request.text, /<bad>|data:text/);
});

test("affine geometry and deterministic callouts preserve transforms, unsupported fallbacks and author placement", () => {
  assert.deepEqual(linearOf("matrix(0,1,-1,0,20,30)"), [0, 1, -1, 0]);
  assert.equal(linearOf("matrix3d(1,0,0,0,0,1,0,0,0,0,1,0.1,0,0,0,1)"), false);
  const linear = ownLinear({
    transform: "matrix(1,0,0,1,8,9)",
    rotate: "90deg",
    scale: "2 3",
    zoom: "1",
  });
  assert.ok(Math.abs(linear[1] - 2) < 1e-8);
  assert.ok(Math.abs(linear[2] + 3) < 1e-8);
  assert.deepEqual(mulLin([2, 0, 0, 3], [0, 1, -1, 0]), [0, 3, -2, 0]);
  assert.deepEqual(quadOffset([0, 1, -1, 0], 100, 50), { ox: -50, oy: 0 });
  assert.deepEqual(cornerRad("50% 12px"), ["50%", "12px"]);
  const items = [
    {
      id: "__proto__",
      ax: 100,
      ay: 100,
      aw: 40,
      ah: 40,
      cw: 100,
      ch: 60,
      gap: 10,
      order: 0,
      fixed: true,
      place: "above",
      dx: 20,
    },
    {
      id: "second",
      ax: 140,
      ay: 100,
      aw: 40,
      ah: 40,
      cw: 100,
      ch: 60,
      gap: 10,
      order: 1,
    },
  ];
  const output = layoutCallouts(items, 600, 400);
  assert.deepEqual(output["__proto__"], { x: 120, y: 30 });
  assert.deepEqual(output, layoutCallouts(items, 600, 400));
  assert.notDeepEqual(output.second, output["__proto__"]);
});

test("live overlay paints values, nil measurements and spotlights, dims/restores and keeps annotations inert", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await authored(page);
    assert.equal(await page.locator("data-overlay .dv-tag").count(), 3);
    assert.match(
      await page.locator("data-overlay .dv-legend").innerText(),
      /100 active users.*Δ vs prior 28 days.*as of/,
    );
    assert.equal(await page.locator("data-overlay .dv-wash.nil").count(), 1);
    assert.equal(await page.locator("data-overlay .dv-spot").count(), 1);
    assert.match(
      await page.locator('data-overlay .dv-tag[data-for="a"]').innerText(),
      /37%.*▲4.0%/,
    );
    assert.equal(
      await page.locator("#other").evaluate((e) => e.style.opacity),
      "0.25",
    );
    assert.deepEqual(
      await page.locator("data-overlay .dv-co .inl").allTextContents(),
      ["3", "1"],
    );
    const rects = () =>
      page
        .locator("data-overlay .dv-co")
        .evaluateAll((nodes) => nodes.map((e) => [e.style.left, e.style.top]));
    const before = await rects();
    await page.evaluate(() => overlay.measure());
    await page.waitForTimeout(100);
    assert.deepEqual(await rects(), before);
    await page.evaluate(() => {
      overlay.views[0].elements[0].callout.body =
        '<img src="bad" onerror="window.pwned=1">';
      overlay.view = "reach";
    });
    assert.equal(await page.locator("data-overlay .dv-co img").count(), 0);
    await page.evaluate(() => {
      overlay.view = "weekly";
    });
    assert.equal(
      await page.locator("#other").evaluate((e) => e.style.opacity),
      "0.7",
    );
    assert.equal(await page.locator("data-overlay .dv-co").count(), 0);
    await page.evaluate(() => {
      overlay.view = "reach";
      overlay.remove();
    });
    assert.equal(
      await page.evaluate(() => overlay.querySelector("#other").style.opacity),
      "0.7",
    );
    await page.evaluate(() => document.body.append(overlay));
    await page.waitForFunction(
      () => document.querySelector("#other").style.opacity === "0.25",
    );
    await page.evaluate(() => overlay.setViews([]));
    assert.equal(
      await page.locator("#other").evaluate((e) => e.style.opacity),
      "0.7",
    );
  });
});

test("computed geometry follows own/inherited transforms, rounded corners, reflows, scrolling and occluders", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await authored(page);
    await page.evaluate(() => {
      document.querySelector("#a").style.transform = "rotate(20deg)";
      document.querySelector("#a").style.borderRadius = "50%";
    });
    await page.waitForFunction(() =>
      document
        .querySelector("data-overlay")
        .shadowRoot.querySelector('[data-id="a"]')
        .style.transform.includes("matrix"),
    );
    const compare = () =>
      page.evaluate(() => {
        const target = document.querySelector("#a").getBoundingClientRect(),
          paint = overlay.shadowRoot
            .querySelector('[data-id="a"]')
            .getBoundingClientRect();
        return ["left", "top", "width", "height"].map((k) =>
          Math.abs(target[k] - paint[k]),
        );
      });
    assert.ok((await compare()).every((d) => d < 2));
    assert.match(
      await page
        .locator('data-overlay [data-id="a"]')
        .evaluate((e) => e.style.borderRadius),
      /50%/,
    );
    await page.evaluate(() => {
      const parent = document.createElement("div");
      parent.style.transform = "skewX(10deg) scale(1.2)";
      parent.style.width = "150px";
      const a = document.querySelector("#a");
      a.before(parent);
      parent.append(a);
    });
    await page.waitForTimeout(100);
    assert.ok((await compare()).every((d) => d < 2));
    await page.evaluate(() => {
      document.querySelector("#a").style.translate = "25px 10px";
      document.querySelector("#a").style.rotate = "10deg";
    });
    await page.waitForTimeout(100);
    assert.ok((await compare()).every((d) => d < 2));
    await page.evaluate(() => {
      const modal = document.createElement("div");
      modal.className = "occluder";
      modal.style.left = "0";
      modal.style.top = "30px";
      modal.style.width = "220px";
      modal.style.height = "160px";
      document.querySelector(".screen").append(modal);
    });
    await page.waitForFunction(
      () =>
        !document
          .querySelector("data-overlay")
          .shadowRoot.querySelector('[data-id="a"]'),
    );
    assert.equal(
      await page.locator('data-overlay .dv-co[data-for="a"]').count(),
      0,
    );
    await page.locator(".occluder").evaluate((e) => e.remove());
    await page.waitForFunction(() =>
      document
        .querySelector("data-overlay")
        .shadowRoot.querySelector('[data-id="a"]'),
    );
    await page.evaluate(() => {
      document.querySelector("#a").style.width = "160px";
      document.querySelector(".screen").style.height = "1400px";
    });
    await page.waitForTimeout(100);
    assert.ok((await compare()).every((d) => d < 2));
    await page.evaluate(() => window.scrollTo(0, 80));
    await page.waitForTimeout(100);
    assert.ok((await compare()).every((d) => d < 2));
  });
});

test("nested non-subjects do not compound fading, subject ancestors and hidden elements remain intact", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await authored(page);
    await page.evaluate(() => {
      const other = document.querySelector("#other");
      other.innerHTML = '<div data-metric-id="child">Child</div>';
      const hidden = document.createElement("div");
      hidden.dataset.metricId = "hidden";
      hidden.style.opacity = "0";
      hidden.textContent = "Hidden";
      document.querySelector(".screen").append(hidden);
      const subjectParent = document.createElement("div");
      subjectParent.dataset.metricId = "parent";
      const a = document.querySelector("#a");
      a.before(subjectParent);
      subjectParent.append(a);
    });
    await page.waitForTimeout(100);
    assert.equal(
      await page
        .locator('[data-metric-id="child"]')
        .evaluate((e) => e.style.opacity),
      "",
    );
    assert.equal(
      await page
        .locator('[data-metric-id="parent"]')
        .evaluate((e) => e.style.opacity),
      "",
    );
    assert.equal(
      await page
        .locator('[data-metric-id="hidden"]')
        .evaluate((e) => e.style.opacity),
      "0",
    );
    await page.evaluate(() => {
      overlay.views[0].dim = 0;
      overlay.view = "reach";
    });
    assert.equal(
      await page.locator("#other").evaluate((e) => e.style.opacity),
      "0",
    );
    await page.evaluate(() => {
      document.querySelector("#other").removeAttribute("data-metric-id");
      overlay.measure();
    });
    await page.waitForTimeout(100);
    assert.equal(
      await page.locator("#other").evaluate((e) => e.style.opacity),
      "0.7",
    );
  });
});

test("sentence switching is exact for cohort/window and snaps metrics without inventing slices", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await authored(page);
    const windowToken = page.getByRole("button", {
      name: "window: last 28 days",
      exact: true,
    });
    await windowToken.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => overlay.view), "weekly");
    assert.equal(await page.locator("data-overlay .dv-tag").innerText(), "50%");
    await page
      .getByRole("button", { name: "metric: reach", exact: true })
      .click();
    await page.getByRole("option", { name: "output", exact: true }).click();
    assert.equal(await page.evaluate(() => overlay.view), "output");
    assert.match(
      await page.locator("data-overlay .dv-sent").innerText(),
      /new users.*last 7 days/,
    );
    await page
      .getByRole("button", { name: "window: last 7 days", exact: true })
      .click();
    await page
      .getByRole("option", { name: "last 28 days", exact: true })
      .click();
    assert.equal(await page.evaluate(() => overlay.view), "output");
    assert.equal(
      await page.locator("data-overlay").getAttribute("data-state"),
      "stale",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Ask your assistant to fetch metrics" })
        .count(),
      1,
    );
    await page
      .getByRole("button", { name: "window: last 28 days", exact: true })
      .click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("data-overlay .dv-menu").count(), 0);
    assert.equal(
      await page.evaluate(() => overlay.shadowRoot.activeElement?.dataset.tok),
      "window",
    );
  });
});

test("provenance drops only the subtitle fields it actually replaces and never hides a missing denominator", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await authored(page);
    await page.evaluate(() => {
      overlay.views[0].meta = {
        range: "Sep 4 - Oct 1",
        n: 100,
        unit: "active users",
      };
      overlay.view = "reach";
    });
    assert.match(
      await page.locator("data-overlay .dv-meta").innerText(),
      /100 active users/,
    );
    assert.match(
      await page.locator("data-overlay .dv-legend").innerText(),
      /100 active users/,
    );
    assert.doesNotMatch(
      await page.locator("data-overlay .dv-legend").innerText(),
      /as of/,
    );
    await page.evaluate(() => {
      overlay.views[0].meta.about = "creation reach among active users";
      overlay.view = "reach";
    });
    assert.doesNotMatch(
      await page.locator("data-overlay .dv-legend").innerText(),
      /100 active users/,
    );
    await page.evaluate(() => {
      delete overlay.views[0].basis;
      overlay.view = "reach";
    });
    assert.match(
      await page.locator("data-overlay .dv-legend").innerText(),
      /basis not stated/,
    );
    await page.evaluate(() => {
      overlay.setAttribute("controls", "off");
    });
    assert.match(
      await page.locator("data-overlay .dv-legend").innerText(),
      /as of/,
    );
    assert.equal(
      await page.locator("data-overlay .dv-meta").isVisible(),
      false,
    );
  });
});

test("source JSON/JS loads, reloads and disabling preserve real passthrough while stale fetches cannot replace new data", async (t) => {
  const { dir, url } = await fixture(t);
  await withPage(url, async (page) => {
    await page.evaluate(
      () => (window.overlay = document.querySelector("data-overlay")),
    );
    const initial = await page.locator("#a").boundingBox(),
      font = await page
        .locator("#a")
        .evaluate((e) => getComputedStyle(e).fontFamily);
    assert.equal(
      await page.locator("data-overlay .dv-sent").isVisible(),
      false,
    );
    await page.evaluate(() => overlay.setAttribute("src", "data.json"));
    await page.waitForFunction(
      () => document.querySelector("data-overlay").views.length === 3,
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector("data-overlay")
          .shadowRoot.querySelectorAll(".dv-box").length === 3,
    );
    await page.evaluate(() => overlay.removeAttribute("src"));
    assert.deepEqual(await page.locator("#a").boundingBox(), initial);
    assert.equal(
      await page.locator("#a").evaluate((e) => getComputedStyle(e).fontFamily),
      font,
    );
    assert.equal(
      await page.locator("#other").evaluate((e) => e.style.opacity),
      "0.7",
    );
    assert.equal(
      await page.locator("data-overlay .dv-sent").isVisible(),
      false,
    );
    await page.evaluate(() => overlay.setAttribute("src", "data.js"));
    await page.waitForFunction(
      () =>
        document
          .querySelector("data-overlay")
          .shadowRoot.querySelectorAll(".dv-box").length === 3,
    );
    const updated = structuredClone(data);
    updated.views[0].elements[0].value = 0.44;
    await fs.writeFile(
      path.join(dir, "data.js"),
      `window.__overlays=${JSON.stringify(updated)};`,
    );
    await page.evaluate(() =>
      overlay.dispatchEvent(new Event("overlay:reload")),
    );
    await page.waitForFunction(
      () =>
        document.querySelector("data-overlay").views[0].elements[0].value ===
        0.44,
    );
    await page.route("**/slow.json", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route
        .fulfill({
          contentType: "application/json",
          body: JSON.stringify({ views: [{ id: "old", elements: [] }] }),
        })
        .catch(() => {});
    });
    await page.evaluate(() => overlay.setAttribute("src", "slow.json"));
    await page.evaluate(() => overlay.setAttribute("src", "data.json"));
    await page.waitForFunction(
      () => document.querySelector("data-overlay").views[0].id === "reach",
    );
    await page.waitForTimeout(160);
    assert.equal(await page.evaluate(() => overlay.view), "reach");
    await fs.writeFile(path.join(dir, "data.json"), JSON.stringify(updated));
    await page.evaluate(() =>
      window.postMessage({ type: "overlay:reload" }, location.origin),
    );
    await page.waitForFunction(
      () =>
        document.querySelector("data-overlay").views[0].elements[0].value ===
        0.44,
    );
  });
});

test("requests copy actual review drafts, normalize typed cuts, adopt new views and time out visibly without model calls", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await authored(page);
    await page.evaluate(() => {
      window.requests = [];
      window.copied = [];
      overlay.addEventListener("data-overlay:fetch", (e) =>
        requests.push(e.detail),
      );
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            copied.push(text);
          },
        },
      });
    });
    await page
      .getByRole("button", { name: "Ask your assistant to fetch metrics" })
      .click();
    assert.equal(
      await page.locator("data-overlay").getAttribute("data-state"),
      "loading",
    );
    assert.equal(await page.evaluate(() => requests[0].mode), "refresh");
    assert.match(
      await page
        .getByRole("textbox", { name: "Metric request text" })
        .inputValue(),
      /recorded source query/,
    );
    assert.equal(
      await page.evaluate(() => copied[0] === requests[0].text),
      true,
    );
    assert.match(
      await page.locator("data-overlay .dv-draft [role=status]").innerText(),
      /Paste into your assistant chat/,
    );
    await page
      .getByRole("button", { name: "Draft ready — awaiting data" })
      .click();
    assert.equal(
      await page.locator("data-overlay").getAttribute("data-state"),
      null,
    );
    await page
      .getByRole("button", { name: "window: last 28 days", exact: true })
      .click();
    const input = page.getByRole("textbox", {
      name: "ask for a different window",
    });
    assert.equal(await input.getAttribute("placeholder"), "weekends only");
    await input.fill("<script>");
    await input.press("Enter");
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.equal(await page.evaluate(() => requests.length), 1);
    await input.fill(" last   7 days ");
    await input.press("Enter");
    assert.equal(await page.evaluate(() => overlay.view), "weekly");
    assert.equal(await page.evaluate(() => requests.length), 1);
    await page
      .getByRole("button", { name: "window: last 7 days", exact: true })
      .click();
    const custom = page.getByRole("textbox", {
      name: "ask for a different window",
    });
    await custom.fill("Weekends — only");
    await custom.press("Enter");
    assert.equal(
      await page.evaluate(() => requests[1].want.window),
      "Weekends - only",
    );
    assert.equal(
      await page.locator("data-overlay").getAttribute("data-state"),
      "loading",
    );
    await page.evaluate(() => {
      const next = [
        ...overlay.views,
        {
          id: "weekends",
          sentence: {
            metric: "reach",
            cohort: "all users",
            window: "Weekends - only",
          },
          basis: "10 synthetic active users",
          elements: [{ id: "a", value: 0.8 }],
        },
      ];
      overlay.setViews(next);
    });
    assert.equal(await page.evaluate(() => overlay.view), "weekends");
    assert.equal(
      await page.locator("data-overlay").getAttribute("data-state"),
      null,
    );
    assert.equal(await page.locator("data-overlay .dv-tag").innerText(), "80%");
    await page.clock.install();
    await page.evaluate(async () => {
      overlay.onRequest = async () => {};
      await overlay.ask("refresh");
    });
    await page.clock.runFor(90010);
    assert.equal(
      await page.locator("data-overlay").getAttribute("data-state"),
      "stale",
    );
    await page.evaluate(() => overlay.setViews(overlay.views));
    assert.equal(
      await page.locator("data-overlay").getAttribute("data-state"),
      null,
    );
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Unavailable");
          },
        },
      });
      overlay.onRequest = null;
    });
    await page.evaluate(() => overlay.ask("refresh"));
    assert.match(
      await page.locator("data-overlay .dv-draft [role=status]").innerText(),
      /Copy the draft below/,
    );
  });
});

test("placeholder rotation stops while typing and disconnect tears down its menu and restores important opacity", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await authored(page);
    await page.clock.install();
    await page
      .getByRole("button", { name: "window: last 28 days", exact: true })
      .click();
    const input = page.getByRole("textbox", {
      name: "ask for a different window",
    });
    assert.equal(await input.getAttribute("placeholder"), "weekends only");
    await page.clock.runFor(3565);
    assert.equal(await input.getAttribute("placeholder"), "last 24 hours");
    await input.fill("custom range");
    await page.clock.runFor(7000);
    assert.equal(await input.getAttribute("placeholder"), "last 24 hours");
    await page.evaluate(() => overlay.remove());
    await page.clock.runFor(7000);
    assert.equal(
      await page.evaluate(() => overlay.shadowRoot.querySelector(".dv-menu")),
      null,
    );
    await page.evaluate(() => {
      const other = overlay.querySelector("#other");
      other.style.setProperty("opacity", ".6", "important");
      document.body.append(overlay);
    });
    await page.clock.runFor(150);
    await page.evaluate(() => (overlay.view = "weekly"));
    assert.deepEqual(
      await page.evaluate(() => ({
        value: overlay.querySelector("#other").style.opacity,
        priority: overlay
          .querySelector("#other")
          .style.getPropertyPriority("opacity"),
      })),
      { value: "0.6", priority: "important" },
    );
  });
});

test("CSS animation tracking, custom identity attributes and visible duplicate selection survive late layout", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await authored(page);
    await page.evaluate(() => {
      const a = document.querySelector("#a");
      a.animate(
        [{ transform: "translateX(0px)" }, { transform: "translateX(80px)" }],
        { duration: 800, fill: "forwards" },
      );
    });
    await page.waitForTimeout(280);
    assert.ok(
      await page.evaluate(() => {
        const real = document.querySelector("#a").getBoundingClientRect(),
          paint = overlay.shadowRoot
            .querySelector('[data-id="a"]')
            .getBoundingClientRect();
        return Math.abs(real.left - paint.left) < 5;
      }),
    );
    await page.waitForTimeout(650);
    assert.ok(
      await page.evaluate(() => {
        const real = document.querySelector("#a").getBoundingClientRect(),
          paint = overlay.shadowRoot
            .querySelector('[data-id="a"]')
            .getBoundingClientRect();
        return Math.abs(real.left - paint.left) < 2;
      }),
    );
    await page.evaluate(() => {
      for (const target of overlay.querySelectorAll("[data-metric-id]")) {
        target.setAttribute(
          "data-stable",
          target.getAttribute("data-metric-id"),
        );
        target.removeAttribute("data-metric-id");
      }
      overlay.setAttribute("id-attr", "data-stable");
    });
    await page.waitForFunction(
      () => document.querySelector("data-overlay").rects.length === 5,
    );
    assert.equal(await page.locator("data-overlay .dv-box").count(), 3);
    await page.evaluate(() => {
      const duplicate = document.createElement("button");
      duplicate.setAttribute("data-stable", "a");
      duplicate.style.cssText =
        "position:absolute;left:480px;top:400px;width:90px;height:40px";
      duplicate.textContent = "Visible duplicate";
      document.querySelector(".screen").append(duplicate);
      const modal = document.createElement("div");
      modal.className = "occluder";
      modal.style.cssText =
        "position:absolute;left:80px;top:70px;width:200px;height:90px;background:#000;z-index:50";
      document.querySelector(".screen").append(modal);
    });
    await page.waitForTimeout(100);
    assert.equal(
      await page
        .locator('data-overlay [data-id="a"]')
        .evaluate((e) => parseFloat(e.style.left)),
      480,
    );
  });
});

test("standalone JSON and reviewed script data exports reload without their original files", async (t) => {
  for (const src of ["data.json", "data.js"]) {
    const { dir, url } = await fixture(t, { src });
    const output = await inlineHtml(path.join(dir, "index.html"));
    await fs.writeFile(path.join(dir, "portable.html"), output);
    await fs.rm(path.join(dir, "data.json"));
    await fs.rm(path.join(dir, "data.js"));
    await fs.rm(path.join(dir, "overlay.js"));
    await withPage(url + "portable.html", async (page) => {
      await page.waitForFunction(
        () =>
          document
            .querySelector("data-overlay")
            .shadowRoot.querySelectorAll(".dv-box").length === 3,
      );
      assert.match(
        await page.locator("data-overlay .dv-tag").first().innerText(),
        /37%/,
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelector("data-overlay").views.length,
        ),
        3,
      );
    });
  }
});

test("default handoff writes the real browser clipboard and hover isolates the matching callout", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await authored(page);
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: new URL(url).origin,
      });
    await page
      .getByRole("button", { name: "Ask your assistant to fetch metrics" })
      .click();
    const expected = await page
      .getByRole("textbox", { name: "Metric request text" })
      .inputValue();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      expected,
    );
    await page
      .getByRole("button", { name: "Draft ready — awaiting data" })
      .click();
    await page.locator("#a").hover();
    await page.waitForFunction(() =>
      document
        .querySelector("data-overlay")
        .shadowRoot.querySelector(".dv-layer")
        .hasAttribute("data-iso"),
    );
    assert.equal(
      await page
        .locator('data-overlay .dv-co[data-for="a"]')
        .getAttribute("data-hot"),
      "",
    );
    await page.waitForTimeout(140);
    assert.equal(
      await page
        .locator('data-overlay .dv-co[data-for="b"]')
        .evaluate((e) => getComputedStyle(e).opacity),
      "0",
    );
    await page.mouse.move(1000, 50);
    await page.waitForTimeout(140);
    assert.equal(
      await page
        .locator('data-overlay .dv-co[data-for="b"]')
        .evaluate((e) => getComputedStyle(e).opacity),
      "1",
    );
  });
});

test("independent nested overlays own their descendant fades and empty/error data can recover", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await authored(page);
    await page.evaluate(() => {
      const inner = document.createElement("data-overlay");
      inner.id = "inner";
      inner.innerHTML =
        '<span data-metric-id="inner-subject" style="display:block;width:90px;height:30px">Inner subject</span><span id="inner-other" data-metric-id="inner-other" style="display:block;width:90px;height:30px;opacity:.8">Inner other</span>';
      document.querySelector(".screen").append(inner);
      inner.setViews([
        { id: "inner-view", elements: [{ id: "inner-subject" }], dim: 0.4 },
      ]);
    });
    await page.waitForTimeout(100);
    assert.equal(
      await page
        .locator('[data-metric-id="inner-subject"]')
        .evaluate((e) => e.style.opacity),
      "",
    );
    assert.equal(
      await page.locator("#inner-other").evaluate((e) => e.style.opacity),
      "0.4",
    );
    await page.evaluate(() => overlay.setViews([]));
    assert.equal(
      await page.locator("#inner-other").evaluate((e) => e.style.opacity),
      "0.4",
    );
    await page.evaluate(() => document.querySelector("#inner").remove());
    await page.evaluate(() =>
      overlay.setViews([{ id: "malformed", elements: {} }]),
    );
    assert.equal(await page.locator("data-overlay .dv-box").count(), 0);
    await page.evaluate(() => overlay.setViews([]));
    await page.route("**/broken.json", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "invalid JSON",
      }),
    );
    await page.evaluate(() => overlay.setAttribute("src", "broken.json"));
    await page.waitForFunction(() =>
      document
        .querySelector("data-overlay")
        .shadowRoot.querySelector(".dv-empty")
        ?.textContent.includes("could not be loaded"),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Ask your assistant to fetch metrics" })
        .count(),
      1,
    );
    await page.evaluate(() => overlay.setAttribute("src", "data.json"));
    await page.waitForFunction(
      () =>
        document
          .querySelector("data-overlay")
          .shadowRoot.querySelectorAll(".dv-box").length === 3,
    );
    assert.equal(
      await page.locator("data-overlay").getAttribute("data-state"),
      null,
    );
  });
});
