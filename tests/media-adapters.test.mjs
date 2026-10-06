import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromiumCapture } from "../packages/media/src/adapters/chromium-capture.mjs";
import { exportArtifact } from "../packages/exports/src/export.mjs";
import { temporary } from "./helpers.mjs";

test("fast capture preserves requested scale or reports a standard fallback", async () => {
  const png = Buffer.alloc(24);
  png.writeUInt32BE(10, 16);
  png.writeUInt32BE(10, 20);
  let detached = 0,
    standard = 0;
  const page = {
    context: () => ({
      newCDPSession: async () => ({
        send: async () => ({ data: png.toString("base64") }),
        detach: async () => detached++,
      }),
    }),
    evaluate: async () => {},
    screenshot: async () => {
      standard++;
      return Buffer.from("standard");
    },
  };
  const capture = await chromiumCapture(page, {
    method: "fast",
    width: 10,
    height: 10,
    scale: 2,
  });
  assert.equal((await capture.capture()).toString(), "standard");
  assert.equal(capture.method, "standard");
  assert.equal(capture.flags[0].kind, "fast_capture_fallback");
  await capture.capture();
  await capture.close();
  assert.equal(detached, 1);
  assert.equal(standard, 2);
});

test("export workflow accepts a page-session and format adapter while preserving publication rules", async (t) => {
  const directory = await temporary(t),
    output = path.join(directory, "result.pdf");
  let closed = false;
  const adapters = {
    pageSession: async (url, work) => {
      assert.equal(url, "http://127.0.0.1/example");
      try {
        return await work({ evaluate: async () => {} }, []);
      } finally {
        closed = true;
      }
    },
    pdf: async (page, temporary) => fs.writeFile(temporary, "adapter-result"),
  };
  await exportArtifact("pdf", "http://127.0.0.1/example", output, {}, adapters);
  assert.equal(await fs.readFile(output, "utf8"), "adapter-result");
  assert.ok(closed);
  await assert.rejects(
    () =>
      exportArtifact("pdf", "http://127.0.0.1/example", output, {}, adapters),
    /overwrite/,
  );
});
