import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";

test("connected export UI reports real frame progress and cancels a pending renderer", async (t) => {
  const dir = await temporary(t),
    runtime = path.join(
      root,
      "packages/runtime/src/browser/motion/animations.jsx",
    );
  await fs.writeFile(
    path.join(dir, "main.jsx"),
    `import React from 'react';import {createRoot} from 'react-dom/client';import {CompositionStage,useFrameRenderer} from ${JSON.stringify(runtime)};function Art(){useFrameRenderer(ctx=>ctx.time>0?new Promise(()=>{}):undefined,{id:'pending'});return <div/>;}createRoot(document.getElementById('root')).render(<CompositionStage scenes={window.CODEX_SCENES} playback={window.CODEX_PLAYBACK} width={160} height={120} source autoplay={false}><Art/></CompositionStage>);`,
  );
  await bundle(path.join(dir, "main.jsx"), path.join(dir, "app.js"));
  const scenes = JSON.stringify([{ name: "Opening", dur: 0.4 }]);
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="en"><head><title>Connected export</title><meta name="codex-fixed-sheet" content="off"></head><body><div id="root"></div><script>window.CODEX_SCENES=${JSON.stringify(scenes)};window.CODEX_PLAYBACK='{"mode":"times","count":1}';</script><script src="app.js"></script></body></html>`,
  );
  const { server, url } = await serve(dir, 0, { motionFile: "index.html" });
  t.after(() => new Promise((r) => server.close(r)));
  await withPage(url, async (page, errors) => {
    await page.getByText("Source connected.", { exact: false }).waitFor();
    await page
      .getByRole("button", { name: "Export video", exact: true })
      .click();
    await page
      .getByRole("spinbutton", { name: "Video fps", exact: true })
      .fill("5");
    await page
      .getByRole("button", { name: "Render and download", exact: true })
      .click();
    const bar = page.getByRole("progressbar", { name: "Export progress" });
    await bar.waitFor();
    assert.equal(await bar.getAttribute("value"), "1");
    assert.equal(await bar.getAttribute("max"), "2");
    await page
      .getByRole("button", { name: "Cancel export", exact: true })
      .click();
    await page.getByText("Video export cancelled", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Render and download", exact: true })
        .isEnabled(),
      true,
    );
    for (let i = errors.length - 1; i >= 0; i--)
      if (
        /HTTP 409:.*\/__codex_motion\/export|409 \(Conflict\)/.test(errors[i])
      )
        errors.splice(i, 1);
  });
  assert.deepEqual((await fs.readdir(dir)).sort(), [
    "app.js",
    "index.html",
    "main.jsx",
  ]);
});
