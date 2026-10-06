import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { temporary } from "./helpers.mjs";
import {
  compositionBinding,
  readCompositionSource,
  saveCompositionSource,
} from "../packages/runtime/src/node/composition-source.mjs";

const payload = {
  schemaVersion: 1,
  clips: [
    {
      id: "title",
      kind: "caption",
      timeBasis: "authored",
      start: 1,
      duration: 1,
      track: 0,
      text: "</script><script>globalThis.executed=true</script>",
    },
    {
      id: "second",
      kind: "visual",
      timeBasis: "authored",
      start: { after: "title", offset: 0 },
      duration: 1,
      track: 1,
      params: { color: "red" },
    },
  ],
};
const prefix =
  '<!doctype html>\r\n<title>Preserve bytes</title>\r\n<script>window.CODEX_SCENES = \'[{"name":"Opening","dur":6,"nat":6}]\'; window.CODEX_PLAYBACK = \'{"mode":"loop"}\';</script>\n<script type="application/json" id="studio-motion-clips" data-owned="yes">';
const suffix =
  '</script>\r\n<div>  Artwork &amp; notes  </div><script>throw new Error("Input scripts must never run")</script>';
const source = () =>
  prefix + JSON.stringify(payload).replaceAll("<", "\\u003c") + suffix;
const code = (expected) => (error) => error.code === expected;

test("composition source moves only exact JSON bytes, retaining untouched timing, artwork and script data", async (t) => {
  const dir = await temporary(t),
    file = path.join(dir, "motion.html"),
    before = source();
  await fs.writeFile(file, before);
  const current = await readCompositionSource(file);
  assert.equal(current.plan.clips[1].start, 2);
  assert.equal(current.undoDepth, 0);
  assert.equal(await fs.readFile(file, "utf8"), before);
  const operation = {
    baseVersion: current.version,
    clipId: "title",
    start: 2,
    operationId: "move-title",
  };
  const saved = await saveCompositionSource(file, operation);
  const updated = await fs.readFile(file, "utf8");
  assert.ok(updated.startsWith(prefix));
  assert.ok(updated.endsWith(suffix));
  assert.equal(updated.includes("globalThis.executed=true</script>"), false);
  assert.deepEqual(saved.scenes, current.scenes);
  assert.deepEqual(saved.playback, current.playback);
  assert.equal(saved.plan.clips[1].start, 3);
  assert.equal(saved.undoDepth, 1);
  assert.equal(
    (await saveCompositionSource(file, operation)).version,
    saved.version,
  );
  assert.equal(await fs.readFile(file, "utf8"), updated);
  await assert.rejects(
    saveCompositionSource(file, { ...operation, start: 3 }),
    code("OPERATION_REUSED"),
  );
  await assert.rejects(
    saveCompositionSource(file, { ...operation, operationId: "stale" }),
    code("SOURCE_CONFLICT"),
  );
  await assert.rejects(
    saveCompositionSource(file, {
      ...operation,
      baseVersion: saved.version,
      operationId: "overflow",
      start: 6,
    }),
    code("CLIP_OUT_OF_RANGE"),
  );
  assert.equal(await fs.readFile(file, "utf8"), updated);
  assert.deepEqual(await fs.readdir(dir), ["motion.html"]);
});
test("per-file undo and redo restore exact original slices with content conflict checks", async (t) => {
  const dir = await temporary(t),
    file = path.join(dir, "motion.html"),
    original = source();
  await fs.writeFile(file, original);
  const initial = await readCompositionSource(file);
  const moved = await saveCompositionSource(file, {
    baseVersion: initial.version,
    clipId: "title",
    start: 2,
    operationId: "first",
  });
  const undo = await saveCompositionSource(file, {
    action: "undo",
    baseVersion: moved.version,
    operationId: "undo-first",
  });
  assert.equal(await fs.readFile(file, "utf8"), original);
  assert.equal(undo.version, initial.version);
  assert.equal(undo.redoDepth, 1);
  const redo = await saveCompositionSource(file, {
    action: "redo",
    baseVersion: undo.version,
    operationId: "redo-first",
  });
  assert.equal(redo.document.clips[0].start, 2);
  assert.equal(redo.redoDepth, 0);
  await fs.appendFile(file, "<!-- External source edit -->");
  const external = await readCompositionSource(file);
  assert.equal(external.undoDepth, 0);
  await assert.rejects(
    saveCompositionSource(file, {
      action: "undo",
      baseVersion: external.version,
      operationId: "external-undo",
    }),
    code("HISTORY_CONFLICT"),
  );
  await assert.rejects(
    saveCompositionSource(file, {
      action: "undo",
      baseVersion: redo.version,
      operationId: "stale-undo",
    }),
    code("SOURCE_CONFLICT"),
  );
});
test("shared source transaction serializes concurrent edits and does not lose a stale draft", async (t) => {
  const dir = await temporary(t),
    file = path.join(dir, "motion.html");
  await fs.writeFile(file, source());
  const initial = await readCompositionSource(file);
  const results = await Promise.allSettled(
    [2, 3].map((start) =>
      saveCompositionSource(file, {
        baseVersion: initial.version,
        clipId: "title",
        start,
        operationId: `move-${start}`,
      }),
    ),
  );
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(
    results.find((item) => item.status === "rejected").reason.code,
    "SOURCE_CONFLICT",
  );
  // Path resolution can complete in either order; the successful edit must be
  // persisted and the other draft must receive the conflict above.
  const winner = [2, 3][
    results.findIndex((item) => item.status === "fulfilled")
  ];
  assert.equal(
    (await readCompositionSource(file)).document.clips[0].start,
    winner,
  );
});
test("bindings reject missing, duplicate, non-JSON, ambiguous attributes and template blocks", () => {
  assert.throws(
    () => compositionBinding("<div></div>"),
    code("AMBIGUOUS_BINDING"),
  );
  assert.throws(
    () =>
      compositionBinding(
        source() +
          '<script id="studio-motion-clips" type="application/json">{}</script>',
      ),
    code("AMBIGUOUS_BINDING"),
  );
  assert.throws(
    () =>
      compositionBinding(
        source().replace('type="application/json"', 'type="text/javascript"'),
      ),
    code("INVALID_BINDING"),
  );
  assert.throws(
    () =>
      compositionBinding(
        source().replace('data-owned="yes"', 'src="input.js"'),
      ),
    code("INVALID_BINDING"),
  );
  assert.throws(
    () =>
      compositionBinding(
        source().replace(
          'id="studio-motion-clips"',
          'id="studio-motion-clips" id="other"',
        ),
      ),
    code("AMBIGUOUS_BINDING"),
  );
  assert.throws(
    () => compositionBinding("<template>" + source() + "</template>"),
    code("INVALID_BINDING"),
  );
  assert.throws(
    () => compositionBinding(prefix + "globalThis.executed=true" + suffix),
    code("INVALID_JSON"),
  );
  assert.throws(
    () =>
      compositionBinding(
        prefix + JSON.stringify(payload).replaceAll("<", "\\u003c"),
      ),
    code("INVALID_BINDING"),
  );
});
test("no implicit migration, execution or writes during read-only CLI inspection", async (t) => {
  const dir = await temporary(t),
    file = path.join(dir, "motion.html"),
    original = source();
  await fs.writeFile(file, original);
  const command = path.resolve("packages/cli/src/commands/composition.mjs");
  const inspected = JSON.parse(
    execFileSync(process.execPath, [command, "inspect", file], {
      encoding: "utf8",
    }),
  );
  assert.deepEqual(inspected.diagnostics, []);
  assert.equal(inspected.plan.clips[0].start, 1);
  assert.equal(await fs.readFile(file, "utf8"), original);
  const moved = JSON.parse(
    execFileSync(
      process.execPath,
      [
        command,
        "move",
        file,
        "--clip",
        "title",
        "--start",
        "2",
        "--base-version",
        inspected.version,
        "--operation-id",
        "cli-move",
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(moved.document.clips[0].start, 2);
  const missing = path.join(dir, "missing.html");
  await fs.writeFile(missing, "<div>No owned composition data</div>");
  const failed = spawnSync(process.execPath, [command, "inspect", missing], {
    encoding: "utf8",
  });
  assert.equal(failed.status, 1);
  assert.equal(
    JSON.parse(failed.stderr).diagnostics[0].code,
    "AMBIGUOUS_BINDING",
  );
  assert.equal(
    await fs.readFile(missing, "utf8"),
    "<div>No owned composition data</div>",
  );
  await assert.rejects(
    saveCompositionSource(file, {
      clipId: "title",
      start: 1,
      operationId: "missing-version",
    }),
    code("INVALID_OPERATION"),
  );
});
