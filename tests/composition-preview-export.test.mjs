import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { temporary } from "./helpers.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";

async function fixture(t, hang) {
  const dir = await temporary(t),
    file = path.join(dir, "motion.html");
  await fs.writeFile(
    file,
    `<!doctype html><html lang="en"><body style="margin:0;background:red"><script>window.CODEX_SCENES = '[{"name":"Render","dur":2}]'; window.CODEX_PLAYBACK = '{"mode":"loop"}';</script><script>
    window.codexTimeline={duration:2,width:160,height:90,root:document.body,
      setPlaying(){},seek(time){document.body.style.background=time<.1?"red":"blue"},
      async beginFrame(time){if(${hang}&&time>0)return new Promise(()=>{});this.seek(time);return {time}},
      async completeFrame(token){return token},verifyFrame(){return true}};
  </script></body></html>`,
  );
  const { server, url } = await serve(dir, 0, { motionFile: "motion.html" });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const source = await (await fetch(url + "__codex_motion")).json();
  const headers = {
    Origin: url.slice(0, -1),
    "Content-Type": "application/json",
    "X-Codex-Motion-Token": source.token,
  };
  return { dir, file, url, headers };
}
const status = async (url, headers) =>
  (await fetch(url + "__codex_motion/export/status", { headers })).json();
const post = (url, headers, route, value) =>
  fetch(url + "__codex_motion/export/" + route, {
    method: "POST",
    headers,
    body: JSON.stringify(value),
  });
async function until(get, predicate) {
  const end = Date.now() + 10000;
  let value;
  while (Date.now() < end) {
    value = await get();
    if (predicate(value)) return value;
    await pause(30);
  }
  assert.fail(
    `Export did not reach the expected state: ${JSON.stringify(value)}`,
  );
}

test("connected export publishes compact actual frame progress and cancellation stops a pending frame", async (t) => {
  const { dir, file, url, headers } = await fixture(t, true),
    before = await fs.readFile(file, "utf8");
  assert.deepEqual(await status(url, headers), { job: null });
  assert.equal((await fetch(url + "__codex_motion/export/status")).status, 403);
  assert.equal(
    (
      await fetch(url + "__codex_motion/export/status", {
        headers: { ...headers, Origin: "https://example.com" },
      })
    ).status,
    403,
  );
  assert.equal((await post(url, headers, "status", {})).status, 405);
  const rendering = fetch(url + "__codex_motion/export", {
    method: "POST",
    headers,
    body: JSON.stringify({ format: "mp4", fps: 10, audio: "none" }),
  });
  const { job } = await until(
    () => status(url, headers),
    (state) => state.job?.phase === "capture" && state.job.frame === 1,
  );
  assert.equal(job.status, "rendering");
  assert.equal(job.frames, 20);
  assert.equal(typeof job.elapsedMs, "number");
  assert.deepEqual(Object.keys(job).sort(), [
    "elapsedMs",
    "format",
    "frame",
    "frames",
    "id",
    "phase",
    "status",
  ]);
  assert.equal(
    (
      await post(
        url,
        { ...headers, "X-Codex-Motion-Token": "wrong" },
        "cancel",
        { jobId: job.id },
      )
    ).status,
    403,
  );
  assert.equal(
    (await post(url, headers, "cancel", { jobId: "foreign-job" })).status,
    409,
  );
  assert.equal(
    (
      await post(url, headers, "cancel", {
        jobId: job.id,
        output: "/tmp/foreign.mp4",
      })
    ).status,
    400,
  );
  const cancelled = await post(url, headers, "cancel", { jobId: job.id });
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).job.status, "cancelled");
  const original = await rendering;
  assert.equal(original.status, 409);
  assert.ok(original.headers.get("content-type").includes("application/json"));
  assert.equal((await original.json()).code, "EXPORT_CANCELLED");
  assert.equal((await status(url, headers)).job.status, "cancelled");
  assert.equal(
    (await post(url, headers, "cancel", { jobId: job.id })).status,
    409,
  );
  assert.deepEqual(await fs.readdir(dir), ["motion.html"]);
  assert.equal(await fs.readFile(file, "utf8"), before);
});
test("completed export preserves the binary contract and cannot be cancelled afterward", async (t) => {
  const { url, headers } = await fixture(t, false);
  const response = await fetch(url + "__codex_motion/export", {
    method: "POST",
    headers,
    body: JSON.stringify({ format: "mp4", fps: 5, endMs: 200, audio: "none" }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "video/mp4");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
  const { job } = await status(url, headers);
  assert.equal(job.status, "complete");
  assert.equal(job.frame, 1);
  assert.equal(job.frames, 1);
  assert.equal(
    (await post(url, headers, "cancel", { jobId: job.id })).status,
    409,
  );
});

test("disconnecting the owned binary request aborts its pending renderer", async (t) => {
  const { url, headers } = await fixture(t, true);
  const controller = new AbortController();
  const rendering = fetch(url + "__codex_motion/export", {
    method: "POST",
    headers,
    signal: controller.signal,
    body: JSON.stringify({ format: "mp4", fps: 10, audio: "none" }),
  }).catch((error) => error);
  const active = await until(
    () => status(url, headers),
    (state) => state.job?.frame === 1,
  );
  controller.abort();
  assert.equal((await rendering).name, "AbortError");
  const cancelled = await until(
    () => status(url, headers),
    (state) => state.job?.status === "cancelled",
  );
  assert.equal(cancelled.job.id, active.job.id);
  assert.equal(cancelled.job.frame, 1);
  assert.equal(
    (await post(url, headers, "cancel", { jobId: active.job.id })).status,
    409,
  );
});
