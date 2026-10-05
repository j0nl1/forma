import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../skills/forma/scripts/build.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";

async function fixture(t, { libraries = true } = {}) {
  const dir = await temporary(t);
  await bundle(
    path.join(root, "skills/forma/assets/starters/chart-libraries.js"),
    path.join(dir, "libraries.js"),
  );
  await fs.copyFile(
    path.join(root, "skills/forma/assets/starters/chart-stage.js"),
    path.join(dir, "stage.js"),
  );
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{margin:0}chart-stage{width:600px;height:300px;--chart-surface:#f4f6ed}.mark{fill:#376e53;stroke:#102918;stroke-width:2}</style>${libraries ? '<script src="libraries.js"></script>' : ""}<script src="stage.js"></script></head><body><chart-stage name="test chart / values" zoom="x" max-zoom="4"></chart-stage></body></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url };
}
async function author(page) {
  await page.evaluate(async () => {
    window.stage = document.querySelector("chart-stage");
    await stage.ready;
    window.values = [
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ];
    window.draws = [];
    stage.draw((context) => {
      const { d3, width, height, view, layer, t, tips } = context;
      if (!values.length) return stage.showEmpty("No rows in this period");
      window.latest = context;
      draws.push({
        reason: context.reason,
        width,
        height,
        k: view.transform.k,
      });
      const baseX = d3.scaleLinear([0, 10], [20, width - 20]);
      const baseY = d3.scaleLinear([0, 10], [height - 20, 20]);
      window.x = view.x(baseX);
      window.y = view.y(baseY);
      window.band = view.x(d3.scaleBand(["a", "b"], [20, width - 20]));
      window.point = view.y(d3.scalePoint(["a", "b"], [height - 20, 20]));
      const marks = layer("marks")
        .selectAll("circle")
        .data(values, (d) => d.id)
        .join("circle")
        .attr("class", "mark")
        .attr("r", 12);
      window.motion = t(marks);
      motion.attr("cx", (d) => x(d.value)).attr("cy", (d) => y(d.value));
      tips(marks, function (d, event) {
        window.tipWitness = [this.tagName, d.id, event.type];
        return window.tipContent ?? `${d.id}: ${d.value}`;
      });
      layer("axis")
        .attr("transform", `translate(0,${height - 20})`)
        .call(d3.axisBottom(x));
    });
  });
  await page.waitForFunction(() => window.draws.length > 0);
}

test("chart draw API retains keyed layers, scales, refresh transitions, resize and reconnect", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await author(page);
    assert.deepEqual(
      await page.evaluate(() => ({
        reason: draws[0].reason,
        width: draws[0].width,
        height: draws[0].height,
        selection: typeof motion.duration,
        sankey: typeof d3.sankey,
      })),
      {
        reason: "mount",
        width: 600,
        height: 300,
        selection: "undefined",
        sankey: "function",
      },
    );
    await page.evaluate(() => {
      window.original = stage.querySelector("circle");
      window.originalLayer = latest.layer("marks").node();
      values[0].value = 6;
      stage.refresh();
    });
    await page.waitForFunction(() => latest.reason === "refresh");
    assert.deepEqual(
      await page.evaluate(() => ({
        same: original === stage.querySelector("circle"),
        layer: originalLayer === latest.layer("marks").node(),
        duration: motion.duration(),
        name: motion._name,
      })),
      { same: true, layer: true, duration: 250, name: "chart-stage" },
    );
    await page.waitForFunction(
      () => +stage.querySelector("circle").getAttribute("cx") === 356,
    );
    await page.evaluate(() => {
      stage.style.width = "420px";
      stage.style.height = "240px";
    });
    await page.waitForFunction(
      () => latest.width === 420 && latest.height === 240,
    );
    assert.equal(await page.evaluate(() => latest.reason), "resize");
    assert.equal(
      await page.evaluate(() => typeof motion.duration),
      "undefined",
    );
    await page.evaluate(() => {
      latest.layer("axis").remove();
      stage.refresh();
    });
    await page.waitForFunction(
      () => stage.querySelectorAll('[data-layer="axis"]').length === 1,
    );
    await page.evaluate(() => {
      stage.remove();
      document.body.append(stage);
    });
    await page.waitForFunction(() => latest.reason === "resize");
    assert.equal(
      await page.evaluate(() => original === stage.querySelector("circle")),
      true,
    );
    await page.evaluate(() => {
      const brush = d3.brushX().extent([
        [0, 0],
        [100, 40],
      ]);
      latest.layer("brush").call(brush).call(brush.move, [20, 60]);
      window.brushRange = d3.brushSelection(latest.layer("brush").node());
    });
    assert.deepEqual(await page.evaluate(() => brushRange), [20, 60]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      values[0].value = 7;
      stage.refresh();
    });
    await page.waitForFunction(
      () => +stage.querySelector("circle").getAttribute("cx") === 286,
    );
    assert.equal(
      await page.evaluate(() => typeof motion.duration),
      "undefined",
    );
  });
});

test("real wheel and drag gestures, axis policies, max zoom and reset affect redraws", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await author(page);
    await page.mouse.move(300, 150);
    await page.mouse.wheel(0, -400);
    await page.waitForFunction(
      () => latest.reason === "zoom" && latest.view.transform.k > 1,
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        y: y.domain(),
        band: band.range().map((n, i) => n !== [20, 580][i]),
        point: point.range(),
      })),
      { y: [0, 10], band: [true, true], point: [280, 20] },
    );
    const before = await page.evaluate(() => latest.view.transform.x);
    await page.waitForTimeout(200);
    await page.mouse.move(300, 150);
    await page.mouse.down();
    await page.mouse.move(370, 150, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(
      (before) => latest.view.transform.x !== before,
      before,
    );
    await page.mouse.wheel(0, -3000);
    await page.waitForFunction(() => latest.view.transform.k === 4);
    await page.getByRole("button", { name: "Reset view" }).click();
    await page.waitForFunction(
      () => latest.view.transform.k === 1 && latest.view.transform.x === 0,
    );
    assert.equal(
      await page.getByRole("button", { name: "Reset view" }).isVisible(),
      false,
    );
    await page.evaluate(() => stage.setAttribute("zoom", "y"));
    await page.mouse.move(300, 150);
    await page.mouse.wheel(0, -350);
    await page.waitForFunction(() => latest.view.transform.k > 1);
    assert.deepEqual(await page.evaluate(() => x.domain()), [0, 10]);
    assert.notDeepEqual(await page.evaluate(() => y.domain()), [0, 10]);
    assert.notDeepEqual(await page.evaluate(() => point.range()), [280, 20]);
    await page.evaluate(() => stage.setAttribute("zoom", "none"));
    await page.waitForFunction(() => latest.view.transform.k === 1);
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => latest.view.transform.k), 1);
  });
});

test("tooltip formatter, edge placement and inert markup preserve values without active content", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await author(page);
    const circle = page.locator("chart-stage circle").first();
    await circle.hover();
    assert.equal(await page.locator(".cs-tip").innerText(), "a: 1");
    assert.deepEqual(await page.evaluate(() => tipWitness), [
      "circle",
      "a",
      "pointermove",
    ]);
    await page.evaluate(() => {
      window.customRan = 0;
      customElements.define(
        "bad-tooltip",
        class extends HTMLElement {
          connectedCallback() {
            customRan++;
          }
        },
      );
      window.tipContent = {
        html: '<b id="bad" style="color:red" onclick="window.pwned=1">Exact &amp; formatted</b><script>window.pwned=1</script><form name="remove"><input name="remove"></form><bad-tooltip>active</bad-tooltip><svg onload="window.pwned=1"></svg><a href="javascript:window.pwned=1" tabindex="0">text</a><img src="j a v a s c r i p t:bad" srcset="//remote.invalid/a 1x"><img src="data:text/plain,a"><img src="./local.png" onerror="window.pwned=1">',
      };
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      window.imageData = canvas.toDataURL();
    });
    await page.route("**/local.png", async (route) =>
      route.fulfill({
        body: Buffer.from(
          (await page.evaluate(() => imageData)).split(",")[1],
          "base64",
        ),
        contentType: "image/png",
      }),
    );
    await circle.dispatchEvent("pointermove", {
      clientX: 598,
      clientY: 298,
      pointerType: "mouse",
    });
    assert.deepEqual(
      await page.evaluate(() => ({
        forbidden: stage.tip.querySelectorAll(
          "script,form,bad-tooltip,svg,[href],[style],[onclick],[onerror],[srcset],[id]",
        ).length,
        images: [...stage.tip.querySelectorAll("img")].map((i) =>
          i.getAttribute("src"),
        ),
        ran: customRan,
        pwned: window.pwned ?? null,
        bounds:
          stage.tip.offsetLeft >= 4 &&
          stage.tip.offsetTop >= 4 &&
          stage.tip.offsetLeft + stage.tip.offsetWidth <= 596 &&
          stage.tip.offsetTop + stage.tip.offsetHeight <= 296,
      })),
      {
        forbidden: 0,
        images: [null, null, "./local.png"],
        ran: 0,
        pwned: null,
        bounds: true,
      },
    );
    assert.match(
      await page.locator(".cs-tip").innerText(),
      /Exact & formatted/,
    );
    assert.equal(
      await page.evaluate(() => latest.esc(`<&>"'`)),
      "&lt;&amp;&gt;&quot;&#39;",
    );
    await page.evaluate(() => {
      window.tipContent = "<b>plain text</b>";
    });
    await circle.dispatchEvent("pointermove", { clientX: 60, clientY: 100 });
    assert.equal(await page.locator(".cs-tip b").count(), 0);
    assert.equal(
      await page.locator(".cs-tip").innerText(),
      "<b>plain text</b>",
    );
    await page.evaluate(() => {
      window.tipContent = false;
    });
    await circle.dispatchEvent("pointermove", { clientX: 60, clientY: 100 });
    assert.equal(
      await page.locator(".cs-tip").evaluate((e) => e.style.opacity),
      "0",
    );
    await page.evaluate(() => {
      window.tipContent = "Visible";
    });
    await circle.hover();
    await page.evaluate(() => stage.refresh());
    await page.waitForFunction(() => stage.tip.style.opacity === "0");
  });
});

test("touch tooltip and a real two-finger pinch use the D3 gesture engine", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await author(page);
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 2,
    });
    await page.evaluate(() => stage.configureZoom());
    const circle = await page
      .locator("chart-stage circle")
      .first()
      .boundingBox();
    const touch = {
      x: circle.x + circle.width / 2,
      y: circle.y + circle.height / 2,
      id: 1,
    };
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touch],
    });
    assert.match(await page.locator(".cs-tip").innerText(), /a: 1/);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal(
      await page.locator(".cs-tip").evaluate((e) => e.style.opacity),
      "1",
    );
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: 220, y: 150, id: 1 },
        { x: 380, y: 150, id: 2 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: 160, y: 150, id: 1 },
        { x: 440, y: 150, id: 2 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForFunction(() => latest.view.transform.k > 1.5);
    assert.deepEqual(await page.evaluate(() => y.domain()), [0, 10]);
    assert.equal(
      await page.locator(".cs-tip").evaluate((e) => e.style.opacity),
      "0",
    );
  });
});

test("downloads contain computed SVG styles and a decoded opaque 2x PNG; empty and errors recover", async (t) => {
  const { dir, url } = await fixture(t);
  await withPage(url, async (page, errors) => {
    await author(page);
    const svgDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "↓ SVG" }).click();
    const svg = await svgDownload;
    assert.equal(svg.suggestedFilename(), "test-chart-values.svg");
    const svgFile = path.join(dir, "chart.svg");
    await svg.saveAs(svgFile);
    const contents = await fs.readFile(svgFile, "utf8");
    assert.match(contents, /fill: rgb\(55, 110, 83\)/);
    assert.match(contents, /fill="#f4f6ed"/);
    assert.doesNotMatch(contents, /cs-tools|cs-tip/);
    const pngDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "↓ PNG" }).click();
    const png = await pngDownload;
    assert.equal(png.suggestedFilename(), "test-chart-values.png");
    const pngFile = path.join(dir, "chart.png");
    await png.saveAs(pngFile);
    const image = (await fs.readFile(pngFile)).toString("base64");
    assert.deepEqual(
      await page.evaluate(async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          background: [...context.getImageData(2, 2, 1, 1).data],
          mark: [...context.getImageData(152, 508, 1, 1).data],
        };
      }, image),
      {
        width: 1200,
        height: 600,
        background: [244, 246, 237, 255],
        mark: [55, 110, 83, 255],
      },
    );
    await page.evaluate(() => {
      window.downloadCount = 0;
      document.addEventListener("click", (e) => {
        if (e.target.tagName === "A" && e.target.download) downloadCount++;
      });
      values = [];
      stage.refresh();
    });
    await page.waitForFunction(() =>
      stage.noteElement.classList.contains("cs-on"),
    );
    assert.equal(
      await page.locator(".cs-note").innerText(),
      "No rows in this period",
    );
    await page.getByRole("button", { name: "↓ SVG" }).click();
    assert.equal(await page.evaluate(() => downloadCount), 0);
    await page.evaluate(() =>
      stage.draw(() => {
        throw new Error("Intentional chart error");
      }),
    );
    await page.waitForFunction(() =>
      stage.noteElement.hasAttribute("data-error"),
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Chart rendering failed:.*Intentional chart error/);
    errors.splice(0);
    await author(page);
    await page.waitForFunction(
      () => !stage.noteElement.classList.contains("cs-on"),
    );
    assert.equal(
      await page.locator("chart-stage>svg").evaluate((e) => e.style.visibility),
      "",
    );
  });
});

test("missing local libraries reject readiness and show a useful in-stage error", async (t) => {
  const { url } = await fixture(t, { libraries: false });
  await withPage(url, async (page) => {
    assert.match(
      await page.evaluate(async () => {
        try {
          await document.querySelector("chart-stage").ready;
          return "unexpected";
        } catch (error) {
          return error.message;
        }
      }),
      /Load the local chart-libraries bundle/,
    );
    assert.equal(await page.locator(".cs-note[data-error]").isVisible(), true);
  });
});

test("hidden stages defer drawing, coalesced refreshes retain priority and SVG export captures the current zoom", async (t) => {
  const { dir, url } = await fixture(t);
  await withPage(url, async (page) => {
    await page.evaluate(async () => {
      const stage = document.querySelector("chart-stage");
      await stage.ready;
      stage.style.display = "none";
      window.hiddenDraws = 0;
      stage.draw(() => hiddenDraws++);
    });
    await page.waitForTimeout(70);
    assert.equal(await page.evaluate(() => hiddenDraws), 0);
    await page.evaluate(() => {
      document.querySelector("chart-stage").style.display = "block";
    });
    await page.waitForFunction(() => hiddenDraws > 0);
    await author(page);
    await page.evaluate(() => {
      window.before = draws.length;
      stage.refresh();
      stage.refresh();
      stage.schedule("resize");
      stage.schedule("zoom");
    });
    await page.waitForFunction(() => draws.length > before);
    assert.deepEqual(
      await page.evaluate(() => ({
        count: draws.length - before,
        reason: latest.reason,
      })),
      { count: 1, reason: "refresh" },
    );
    await page.evaluate(() => {
      d3.select(stage.svgElement).call(
        stage.zoomBehavior.transform,
        d3.zoomIdentity.translate(-100, -30).scale(2),
      );
    });
    await page.waitForFunction(() => latest.reason === "zoom");
    const live = await page
      .locator("chart-stage circle")
      .first()
      .getAttribute("cx");
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "↓ SVG" }).click();
    const download = await pending;
    const target = path.join(dir, "zoom.svg");
    await download.saveAs(target);
    const svg = await fs.readFile(target, "utf8");
    assert.match(svg, new RegExp(`cx="${live}"`));
    assert.equal(await page.locator("chart-stage circle").count(), 2);
  });
});
