import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import {
  fileGeometry,
  fileName,
  fileUrl,
  sameFilePath,
  modalGeometry,
} from "../packages/runtime/src/browser/file-window-model.js";
import { inlineHtml } from "../packages/exports/src/lib/inline.mjs";
import { exportArtifact } from "../packages/cli/src/commands/export.mjs";
const target = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Live project</title><style>html,body{margin:0}section{height:600px;background:#cf362f}section:nth-child(2){background:#269d80}section:nth-child(3){background:#365bcf}section:nth-child(4){height:900px;background:#e4b754}button{position:absolute;top:620px;left:180px}.vh{position:fixed;width:5px;height:100vh}</style></head><body><section>First</section><section>Second</section><section>Third</section><section>Last strip</section><button onclick="window.clicked=true">Embedded action</button><div class="vh"></div></body></html>`;
async function fixture(t, html = "", files = { "project.html": target }) {
  const dir = await temporary(t);
  await bundle(
    path.join(root, "packages/runtime/src/browser/file-window.js"),
    path.join(dir, "app.js"),
  );
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), content);
  }
  const file = path.join(dir, "index.html");
  await fs.writeFile(
    file,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>File contracts</title><style>body{margin:30px;font:15px system-ui}file-window{margin-bottom:24px}</style></head><body>${html}<script>window.picks=[];window.actions=[];document.addEventListener('file-window:pick',e=>picks.push(e.detail));document.addEventListener('file-window:action',e=>actions.push(e.detail));</script><script src="app.js"></script></body></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url, file };
}
const ready = (page) =>
  page.waitForFunction(
    () => document.querySelector("file-window")?.state === "ready",
  );
function expectedMissing(errors, names) {
  for (let index = errors.length - 1; index >= 0; index--) {
    const value = errors[index];
    if (
      value ===
        "Failed to load resource: the server responded with a status of 404 (Not Found)" ||
      names.some(
        (name) =>
          value.startsWith("HTTP 404: ") &&
          new URL(value.slice(10)).pathname.endsWith("/" + name),
      )
    )
      errors.splice(index, 1);
  }
}

test("file geometry, paths and modal fit preserve physical crops and bounded viewport contracts", () => {
  const attrs = (values) => ({ getAttribute: (name) => values[name] ?? null });
  assert.deepEqual(fileGeometry(attrs({})), {
    width: 320,
    height: 200,
    cropWidth: 320,
    documentWidth: 320,
    x: 0,
    y: 0,
    scale: 1,
    frameHeight: 200,
    transform: "scale(1) translate(0px, 0px)",
  });
  const geometry = fileGeometry(
    attrs({
      width: "320",
      height: "200",
      "window-width": "400",
      "document-width": "1000",
      "window-x": "100",
      "window-y": "600",
    }),
  );
  assert.equal(geometry.scale, 0.8);
  assert.equal(geometry.frameHeight, 850);
  assert.equal(geometry.transform, "scale(0.8) translate(-100px, -600px)");
  const clamped = fileGeometry(
    attrs({
      width: "-4",
      height: "NaN",
      "window-width": "9999",
      "document-width": "1",
      "window-y": "Infinity",
    }),
  );
  assert.equal(clamped.width, 120);
  assert.equal(clamped.height, 200);
  assert.equal(clamped.documentWidth, 4000);
  assert.equal(clamped.y, 8000);
  const base = "http://localhost:4311/previews/index.html";
  assert.equal(fileName("../assets/a #b.dc.html", base), "a #b");
  assert.equal(
    fileUrl("../assets/a #b.html", base).pathname,
    "/assets/a%20%23b.html",
  );
  for (const value of [
    "https://example.com/a",
    "//example.com/a",
    "javascript:alert(1)",
    "",
  ])
    assert.throws(() => fileUrl(value, base));
  assert.equal(sameFilePath("../assets/a.html", "assets/a.html", base), true);
  assert.equal(sameFilePath("../assets/a.html", "a.html", base), false);
  assert.equal(sameFilePath("a.html", "a.html", base, "/previews/"), true);
  const modal = modalGeometry(geometry, 400, 600, 2700);
  assert.equal(modal.scale, 0.66);
  assert.equal(modal.width, 272);
  assert.equal(modal.pageWidth, 660);
  assert.equal(modal.height, 440);
  assert.equal(modal.pageHeight, 1782);
});

test("real file crops use exact frame geometry, inert input, keyboard picks and literal labels", async (t) => {
  const { url } = await fixture(
    t,
    '<file-window id="view" file="project.html" width="320" height="200" window-width="400" document-width="1000" window-x="100" window-y="600"></file-window>',
  );
  await withPage(url, async (page) => {
    await ready(page);
    assert.deepEqual(
      await page.locator("file-window iframe").evaluate((node) => ({
        width: node.style.width,
        height: node.style.height,
        transform: node.style.transform,
        inert: node.inert,
        tab: node.tabIndex,
        sandbox: node.getAttribute("sandbox"),
        pointer: getComputedStyle(node).pointerEvents,
      })),
      {
        width: "1000px",
        height: "850px",
        transform: "scale(0.8) translate(-100px, -600px)",
        inert: true,
        tab: -1,
        sandbox: "allow-scripts allow-same-origin",
        pointer: "none",
      },
    );
    await page.locator("file-window .fw-crop").click();
    await page.locator("file-window").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    assert.deepEqual(
      await page.evaluate(() => picks),
      Array(3).fill({ file: "project.html" }),
    );
    assert.equal(
      await page
        .locator("file-window")
        .evaluate((node) => !!node.frame.contentWindow.clicked),
      false,
    );
    await page.locator("file-window").evaluate((node) => {
      node.setAttribute("label", "<img src=x onerror=alert(1)>");
      node.setAttribute("window-x", "200");
      node.setAttribute("height", "240");
    });
    assert.equal(
      await page.locator("file-window .fw-label").innerText(),
      "<img src=x onerror=alert(1)>",
    );
    assert.equal(await page.locator("file-window .fw-label img").count(), 0);
    assert.equal(
      await page
        .locator("file-window iframe")
        .evaluate((node) => node.style.height),
      "900px",
    );
  });
});

test("real same-length rewrites reload via validators; one missing probe retains the preview, two remove it, reappearance recovers", async (t) => {
  const { url, dir } = await fixture(
    t,
    '<file-window file="project.html"></file-window>',
  );
  await withPage(url, async (page, errors) => {
    await ready(page);
    const nonce = await page.locator("file-window iframe").getAttribute("src");
    await fs.writeFile(
      path.join(dir, "project.html"),
      target.replace("First", "Fresh"),
    );
    await page.locator("file-window").evaluate((node) => node.checkFile());
    await page.waitForFunction(() =>
      document
        .querySelector("file-window")
        .frame.contentDocument?.body?.textContent?.includes("Fresh"),
    );
    assert.notEqual(
      await page.locator("file-window iframe").getAttribute("src"),
      nonce,
    );
    await fs.rm(path.join(dir, "project.html"));
    await page.locator("file-window").evaluate((node) => node.checkFile());
    assert.equal(await page.locator("file-window iframe").count(), 1);
    await page.locator("file-window").evaluate((node) => node.checkFile());
    assert.equal(await page.locator("file-window iframe").count(), 0);
    assert.equal(
      await page.locator("file-window").getAttribute("aria-disabled"),
      "true",
    );
    assert.equal(
      await page.locator("file-window").getAttribute("tabindex"),
      "-1",
    );
    await fs.writeFile(path.join(dir, "project.html"), target);
    await page.locator("file-window").evaluate((node) => node.checkFile());
    await ready(page);
    assert.equal(
      await page.locator("file-window").getAttribute("aria-disabled"),
      "false",
    );
    expectedMissing(errors, ["project.html"]);
  });
});

test("expected files retain twenty animated plans, reduced motion and two-minute silence extended by unrelated streaming content", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page, errors) => {
    await page.clock.install();
    await page.evaluate(async () => {
      const node = document.createElement("file-window");
      node.setAttribute("file", "future.html");
      node.setAttribute("expect", "");
      document.body.append(node);
      await node.checkFile();
    });
    assert.equal(await page.locator("file-window iframe").count(), 0);
    assert.equal(await page.locator("file-window .fw-plan").count(), 20);
    await page.clock.fastForward(119000);
    await page.evaluate(() =>
      CodexFileUpdate("unrelated", "html", "Streaming content", true),
    );
    await page.clock.fastForward(119000);
    assert.equal(
      await page.locator("file-window").evaluate((node) => node.state),
      "loading",
    );
    await page.clock.fastForward(1001);
    assert.equal(
      await page.locator("file-window").evaluate((node) => node.state),
      "unavailable",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      const node = document.createElement("file-window");
      node.setAttribute("file", "next.html");
      node.setAttribute("expect", "");
      document.body.append(node);
    });
    assert.equal(
      await page
        .locator("file-window")
        .last()
        .locator(".fw-plan")
        .evaluateAll(
          (nodes) =>
            nodes.filter((node) => getComputedStyle(node).display !== "none")
              .length,
        ),
      1,
    );
    expectedMissing(errors, ["future.html", "next.html"]);
  });
});

test("native global and event routing preserve the previous callback, matching project paths and both live embedded receivers", async (t) => {
  const receiver = target.replace(
    "</body>",
    "<script>window.received=[];window.CodexFileUpdate=(...args)=>received.push(args)</script></body>",
  );
  const { url } = await fixture(
    t,
    '<file-window id="a" file="a/project.html" action-label="Use file"></file-window><file-window id="b" file="b/project.html"></file-window>',
    { "a/project.html": receiver, "b/project.html": receiver },
  );
  await withPage(url, async (page) => {
    await page.waitForFunction(() =>
      [...document.querySelectorAll("file-window")].every(
        (node) => node.state === "ready",
      ),
    );
    await page.evaluate(() => {
      const prior = CodexFileUpdate;
      window.previousCalls = 0;
      CodexFileUpdate = (...args) => {
        previousCalls++;
        prior(...args);
      };
      FileWindow.routeUpdates();
      FileWindow.routeUpdates();
    });
    await page.locator("#a .fw-expand").click();
    await page.waitForFunction(
      () => document.getElementById("a").modal.frame?.contentWindow.received,
    );
    await page.evaluate(() =>
      document.dispatchEvent(
        new CustomEvent("codex:file-update", {
          bubbles: true,
          detail: {
            name: "project",
            kind: "html",
            content: "New content",
            streaming: true,
            viewportKey: "main",
            path: "a/project.html",
          },
        }),
      ),
    );
    const result = await page.evaluate(() => ({
      a: document.getElementById("a").frame.contentWindow.received.length,
      b: document.getElementById("b").frame.contentWindow.received.length,
      modal:
        document.getElementById("a").modal.frame.contentWindow.received.length,
      prior: previousCalls,
    }));
    assert.deepEqual(result, { a: 1, b: 0, modal: 1, prior: 1 });
    await page.locator("dialog .fw-action").click();
    assert.deepEqual(await page.evaluate(() => actions), [
      { file: "a/project.html" },
    ]);
    await page.evaluate(() =>
      document
        .getElementById("a")
        .setAttribute("action-label", "Updated action"),
    );
    assert.equal(
      await page.locator("dialog .fw-action").innerText(),
      "Updated action",
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog").count(), 0);
  });
});

test("lazy metadata probing waits for proximity and removes lazy deferral on attribute change; disconnect/reconnect binds real reloads again", async (t) => {
  const { url } = await fixture(
    t,
    '<div style="height:2500px"></div><file-window file="project.html" lazy></file-window>',
  );
  await withPage(url, async (page, errors) => {
    await page.waitForFunction(() => document.querySelector("file-window").key);
    assert.equal(await page.locator("file-window iframe").count(), 0);
    await page
      .locator("file-window")
      .evaluate((node) => node.removeAttribute("lazy"));
    await ready(page);
    await page.locator("file-window").evaluate((node) => {
      node.remove();
      document.body.append(node);
      node.reload();
    });
    await page.waitForFunction(() =>
      document.querySelector("file-window").frame.hasAttribute("data-ready"),
    );
    await page
      .locator("file-window")
      .evaluate((node) => node.setAttribute("file", "other.html"));
    await page.waitForFunction(
      () => document.querySelector("file-window").state === "unavailable",
    );
    expectedMissing(errors, ["other.html"]);
  });
});

test("expanded long files preserve real CSS viewport height, initial crop, final strip, body-transform escape and focus restoration", async (t) => {
  const { url } = await fixture(
    t,
    '<file-window file="project.html" window-y="600" document-width="1000" window-width="400"></file-window>',
  );
  await withPage(url, async (page) => {
    await ready(page);
    await page.evaluate(() => (document.body.style.transform = "scale(.8)"));
    await page.locator("file-window .fw-expand").click();
    await page.waitForFunction(
      () => document.querySelector("file-window").modal.documentHeight === 2700,
    );
    const before = await page.locator("file-window").evaluate((node) => ({
      scroll: node.modal.crop.scrollTop,
      scale: node.modal.scale,
      vh: node.modal.frame.contentDocument.querySelector(".vh").offsetHeight,
      frame: node.modal.frame.clientHeight,
      top: node.modal.dialog.getBoundingClientRect().top,
    }));
    assert.ok(
      Math.abs(before.scroll - 600 * before.scale) < 1,
      JSON.stringify(before),
    );
    assert.equal(before.vh, before.frame);
    assert.ok(before.top > 40);
    await page.locator("file-window").evaluate((node) => {
      node.modal.crop.scrollTop = node.modal.crop.scrollHeight;
      node.modal.sync();
    });
    const after = await page.locator("file-window").evaluate((node) => ({
      y: node.modal.frame.contentWindow.scrollY,
      vh: node.modal.frame.contentDocument.querySelector(".vh").offsetHeight,
      frame: node.modal.frame.clientHeight,
      remaining:
        2700 -
        node.modal.frame.contentWindow.scrollY -
        node.modal.frame.clientHeight,
    }));
    assert.equal(after.vh, after.frame);
    assert.ok(after.y > 1700);
    assert.ok(after.remaining < 3);
    await page.locator("file-window").evaluate((node) => {
      const section = node.modal.frame.contentDocument.createElement("section");
      section.style.height = "700px";
      node.modal.frame.contentDocument.body.append(section);
    });
    await page.waitForFunction(
      () => document.querySelector("file-window").modal.documentHeight === 3400,
    );
    await page.mouse.click(3, 3);
    assert.equal(await page.locator("dialog").count(), 0);
    assert.equal(
      await page
        .locator("file-window")
        .evaluate((node) => node.shadowRoot.activeElement === node.expand),
      true,
    );
  });
});

test("waiting modal avoids a broken frame, mounts on actual file arrival and closes when the file becomes unavailable", async (t) => {
  const { url, dir } = await fixture(
    t,
    '<file-window file="future.html" expect action-label="Use file"></file-window>',
  );
  await withPage(url, async (page, errors) => {
    await page.locator("file-window .fw-expand").click();
    assert.equal(await page.locator("dialog iframe").count(), 0);
    assert.equal(await page.locator("dialog .fw-action").isDisabled(), true);
    await fs.writeFile(path.join(dir, "future.html"), target);
    await page.evaluate(() =>
      CodexFileUpdate("future", "html", "Complete", false),
    );
    await ready(page);
    await page.waitForFunction(() =>
      document
        .querySelector("file-window")
        .modal.frame?.hasAttribute("data-ready"),
    );
    assert.equal(await page.locator("dialog .fw-action").isDisabled(), false);
    await fs.rm(path.join(dir, "future.html"));
    await page.locator("file-window").evaluate(async (node) => {
      await node.checkFile();
      await node.checkFile();
    });
    assert.equal(await page.locator("dialog").count(), 0);
    expectedMissing(errors, ["future.html"]);
  });
});

test("portable runtime and actual PNG retain the crop while live files remain explicit project dependencies", async (t) => {
  const { url, dir, file } = await fixture(
    t,
    '<file-window file="project.html" window-y="600" window-width="400" document-width="1000"></file-window>',
  );
  await fs.writeFile(path.join(dir, "portable.html"), await inlineHtml(file));
  await fs.rm(path.join(dir, "app.js"));
  await withPage(url + "portable.html", async (page) => {
    await ready(page);
    assert.equal(await page.locator("file-window iframe").count(), 1);
  });
  const output = path.join(dir, "crop.png");
  await exportArtifact("png", url + "portable.html", output);
  await withPage(url + "portable.html", async (page) => {
    const pixel = await page.evaluate(
      async (encoded) => {
        const image = new Image();
        image.src = "data:image/png;base64," + encoded;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return [...context.getImageData(60, 70, 1, 1).data];
      },
      (await fs.readFile(output)).toString("base64"),
    );
    assert.deepEqual(pixel, [38, 157, 128, 255]);
  });
});

test("HEAD rejection and absent validators fall back to real GET bytes, while interrupted stale probes cannot mount the former file", async (t) => {
  const { createServer } = await import("node:http");
  const { dir } = await fixture(t);
  const requests = [];
  const server = createServer(async (request, response) => {
    const route = new URL(request.url, "http://localhost").pathname;
    if (["/headless.html", "/validatorfree.html"].includes(route)) {
      requests.push(`${request.method} ${route}`);
      response.setHeader("Content-Type", "text/html");
      if (request.method === "HEAD") {
        response.statusCode = route === "/headless.html" ? 405 : 200;
        response.end();
        return;
      }
      response.write(target.slice(0, 100));
      response.end(target.slice(100));
      return;
    }
    const file = path.join(dir, route === "/" ? "index.html" : route.slice(1));
    try {
      const content = await fs.readFile(file);
      response.setHeader(
        "Content-Type",
        file.endsWith(".js") ? "application/javascript" : "text/html",
      );
      response.end(content);
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(
    `http://127.0.0.1:${server.address().port}/`,
    async (page, errors) => {
      await page.evaluate(async () => {
        const node = document.createElement("file-window");
        node.setAttribute("file", "headless.html");
        document.body.append(node);
        await node.checkFile();
      });
      await ready(page);
      assert.ok(requests.includes("HEAD /headless.html"));
      assert.ok(
        requests.filter((value) => value === "GET /headless.html").length >= 2,
      );
      assert.equal(
        await page.locator("file-window").evaluate((node) => node.key),
        `size:${Buffer.byteLength(target)}`,
      );
      await page
        .locator("file-window")
        .evaluate((node) => node.setAttribute("file", "validatorfree.html"));
      await ready(page);
      assert.ok(requests.includes("HEAD /validatorfree.html"));
      assert.ok(
        requests.filter((value) => value === "GET /validatorfree.html")
          .length >= 2,
      );
      let release;
      const blocked = new Promise((resolve) => (release = resolve));
      let started;
      const arrived = new Promise((resolve) => (started = resolve));
      await page.route("**/delayed.html", async (route) => {
        started();
        await blocked;
        await route
          .fulfill({ status: 200, headers: { etag: "old" }, body: target })
          .catch(() => {});
      });
      await page
        .locator("file-window")
        .evaluate((node) => node.setAttribute("file", "delayed.html"));
      await arrived;
      await page
        .locator("file-window")
        .evaluate((node) => node.setAttribute("file", "project.html"));
      release();
      await ready(page);
      assert.ok(
        (await page.locator("file-window iframe").getAttribute("src")).includes(
          "project.html",
        ),
      );
      for (let index = errors.length - 1; index >= 0; index--)
        if (
          errors[index] ===
            "Failed to load resource: the server responded with a status of 405 (Method Not Allowed)" ||
          (errors[index].startsWith("HTTP 405: ") &&
            errors[index].includes("/headless.html"))
        )
          errors.splice(index, 1);
    },
  );
});

test("narrow expanded files keep the scale floor, expose horizontal content, update geometry and close/action controls without picking the card", async (t) => {
  const { url } = await fixture(
    t,
    '<file-window file="project.html" window-x="500" document-width="1000" window-width="640" action-label="Choose"></file-window>',
  );
  await withPage(
    url,
    async (page) => {
      await ready(page);
      await page.locator("file-window .fw-expand").click();
      await page.waitForFunction(
        () =>
          document.querySelector("file-window").modal.documentHeight === 2700,
      );
      assert.equal(
        await page.locator("file-window").evaluate((node) => node.modal.scale),
        0.66,
      );
      assert.equal(
        await page
          .locator("file-window")
          .evaluate((node) => node.modal.crop.scrollLeft),
        330,
      );
      assert.ok(
        await page
          .locator("file-window")
          .evaluate(
            (node) => node.modal.crop.scrollWidth > node.modal.crop.clientWidth,
          ),
      );
      await page.locator("file-window").evaluate((node) => {
        node.removeAttribute("action-label");
        node.setAttribute("label", "Updated file");
      });
      assert.equal(await page.locator("dialog .fw-action").isVisible(), false);
      assert.equal(
        await page.locator("dialog").getAttribute("aria-label"),
        "Updated file",
      );
      await page.locator("dialog .fw-close").click();
      assert.equal(await page.locator("dialog").count(), 0);
      assert.deepEqual(await page.evaluate(() => picks), []);
      await page
        .locator("file-window")
        .evaluate((node) => node.setAttribute("no-expand", ""));
      assert.equal(
        await page.locator("file-window .fw-expand").isVisible(),
        false,
      );
    },
    { width: 400, height: 600 },
  );
});

test("five-second polling detects real files without update callbacks and visible-page resume recovers a changed document", async (t) => {
  const { url, dir } = await fixture(t);
  await withPage(url, async (page, errors) => {
    await page.clock.install();
    await page.evaluate(async () => {
      const node = document.createElement("file-window");
      node.setAttribute("file", "polled.html");
      node.setAttribute("expect", "");
      document.body.append(node);
      await node.checkFile();
    });
    await fs.writeFile(path.join(dir, "polled.html"), target);
    await page.clock.runFor(5001);
    await page.clock.resume();
    await ready(page);
    const previous = await page
      .locator("file-window iframe")
      .getAttribute("src");
    await fs.writeFile(
      path.join(dir, "polled.html"),
      target.replace("First", "Fresh"),
    );
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await page.waitForFunction(() =>
      document
        .querySelector("file-window")
        .frame.contentDocument?.body?.textContent?.includes("Fresh"),
    );
    assert.notEqual(
      await page.locator("file-window iframe").getAttribute("src"),
      previous,
    );
    expectedMissing(errors, ["polled.html"]);
  });
});

test("modal fallback closes from its backdrop, contains keyboard focus and cleans up after disconnect", async (t) => {
  const { url } = await fixture(
    t,
    '<file-window file="project.html" action-label="Choose"></file-window>',
  );
  await withPage(url, async (page) => {
    await ready(page);
    await page.evaluate(() => {
      HTMLDialogElement.prototype.showModal = () => {
        throw new Error("Native modal unavailable");
      };
    });
    await page.locator("file-window .fw-expand").click();
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator("file-window")
        .evaluate((node) => node.modal.root.activeElement === node.modal.crop),
      true,
    );
    await page.mouse.click(3, 3);
    assert.equal(await page.locator("dialog").count(), 0);
    await page.locator("file-window .fw-expand").click();
    await page.locator("file-window").evaluate((node) => node.remove());
    assert.equal(await page.locator("dialog").count(), 0);
    assert.equal(
      await page.evaluate(() =>
        [...document.documentElement.children].some(
          (node) => node.style.zIndex === "2147482999",
        ),
      ),
      false,
    );
  });
});
