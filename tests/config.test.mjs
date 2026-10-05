import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { temporary, root } from "./helpers.mjs";
import {
  initConfig,
  checkConfig,
  resolveConfig,
} from "../skills/forma/scripts/config.mjs";
import {
  resolvePreferences,
  validatePreferences,
} from "../skills/forma/scripts/lib/config-model.mjs";

const profile = {
  schema_version: 1,
  output: { directory: "deliverables" },
  defaults: { language: "en-US" },
  generation: {
    speech: {
      method: "harness",
      capability: "speech-tool",
      model: "small",
      voices: { host: "one", guest: "two" },
    },
  },
};
const snapshot = {
  schemaVersion: 1,
  capabilities: [
    {
      id: "speech-tool",
      kind: "speech",
      method: "harness",
      languages: ["en"],
      voices: ["one", "two"],
      models: ["small"],
    },
  ],
};

test("configuration is optional and read-only resolution creates no project files", async (t) => {
  const dir = await temporary(t);
  const result = await resolveConfig(dir, { needs: ["speech"] });
  assert.equal(result.configured, false);
  assert.equal(result.outputDirectory, path.join(dir, "designs"));
  assert.deepEqual(
    result.decisions.map((item) => item.code),
    ["output_unspecified", "language_unspecified", "select_capability"],
  );
  assert.deepEqual(await fs.readdir(dir), []);
});

test("template and CLI round trip, refusing replacement and symlink destinations", async (t) => {
  const dir = await temporary(t);
  const result = await initConfig(dir);
  assert.equal(
    (await checkConfig(dir)).preferences.output.directory,
    "designs",
  );
  const original = await fs.readFile(result.file);
  await assert.rejects(initConfig(dir), { code: "EEXIST" });
  assert.deepEqual(await fs.readFile(result.file), original);
  const cli = path.join(root, "skills/forma/scripts/config.mjs");
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const checked = run("check", dir);
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).configured, true);
  assert.equal(run("init", dir, "--needs", "speech").status, 1);
  await fs.unlink(result.file);
  await fs.symlink("missing.toml", result.file);
  await assert.rejects(initConfig(dir), { code: "EEXIST" });
  assert.deepEqual(await fs.readdir(dir), ["forma.toml"]);
});

test("TOML comments and quoted strings are data, with bounded safe parsing", async (t) => {
  const dir = await temporary(t);
  const file = path.join(dir, "forma.toml");
  await fs.writeFile(
    file,
    'schema_version = 1\n[output]\ndirectory = "deliverables # literal" # actual comment\n',
  );
  assert.equal(
    (await checkConfig(dir)).preferences.output.directory,
    "deliverables # literal",
  );
  for (const source of [
    "schema_version = 1\nschema_version = 1",
    'schema_version = 1\n[__proto__]\nkey = "data"',
    'schema_version = 1\nconstructor = "private-input"',
  ]) {
    await fs.writeFile(file, source);
    await assert.rejects(
      checkConfig(dir),
      (error) =>
        /Invalid forma.toml/.test(error.message) &&
        !error.message.includes("private-input"),
    );
  }
  await fs.writeFile(file, "#".repeat(65537));
  await assert.rejects(checkConfig(dir), /64 KiB/);
  await fs.writeFile(
    file,
    "schema_version = 1\n[defaults]\nlanguage = 1979-05-27",
  );
  await assert.rejects(checkConfig(dir), /string/);
});

test("unknown fields, types, credentials and prototype keys fail schema validation", () => {
  for (const value of [
    { schema_version: 2 },
    { schema_version: 1, output: { directory: "$HOME/output" } },
    { schema_version: 1, output: { directory: "https://example.test/output" } },
    { schema_version: 1, defaults: { language: "not_a_locale" } },
    { schema_version: 1, audio: { preset: "unknown" } },
    { schema_version: 1, generation: { speech: { api_key: "private" } } },
    {
      schema_version: 1,
      generation: { speech: { method: "supplied", capability: "tool" } },
    },
    JSON.parse('{"schema_version":1,"__proto__":{}}'),
    JSON.parse(
      '{"schema_version":1,"generation":{"speech":{"voices":{"constructor":"voice"}}}}',
    ),
  ])
    assert.throws(() => validatePreferences(value));
});

test("task fields override project preferences, with no backend voice or model leakage", () => {
  const resolved = resolvePreferences(
    "/project",
    profile,
    {
      output: { directory: "/chosen" },
      generation: { speech: { voices: { guest: "one" } } },
    },
    snapshot,
    ["speech"],
  );
  assert.equal(resolved.outputDirectory, "/chosen");
  assert.equal(resolved.generation.speech.status, "ready");
  assert.deepEqual(resolved.preferences.generation.speech.voices, {
    host: "one",
    guest: "one",
  });
  for (const explicit of [
    { method: "local" },
    { capability: "new-tool" },
    { method: "supplied" },
  ]) {
    const switched = resolvePreferences(
      "/project",
      profile,
      { generation: { speech: explicit } },
      snapshot,
      ["speech"],
    );
    assert.deepEqual(switched.preferences.generation.speech, explicit);
  }
  assert.equal(profile.generation.speech.model, "small");
});

test("required-only capability resolution reports unavailable, unsupported and unknown support", () => {
  assert.deepEqual(
    resolvePreferences("/project", profile, {}, snapshot, []).generation,
    {},
  );
  assert.equal(
    resolvePreferences("/project", profile, {}, undefined, ["speech"])
      .generation.speech.status,
    "unchecked",
  );
  const missing = resolvePreferences(
    "/project",
    profile,
    {},
    { schemaVersion: 1, capabilities: [] },
    ["speech"],
  );
  assert.equal(missing.decisions[0].code, "selected_capability_unavailable");
  const unknown = structuredClone(snapshot);
  delete unknown.capabilities[0].voices;
  delete unknown.capabilities[0].models;
  delete unknown.capabilities[0].languages;
  assert.deepEqual(
    resolvePreferences("/project", profile, {}, unknown, [
      "speech",
    ]).decisions.map((item) => item.code),
    ["verify_language_support", "verify_model_support", "verify_voice_support"],
  );
  const unsupported = structuredClone(snapshot);
  unsupported.capabilities[0].languages = ["en-GB"];
  unsupported.capabilities[0].models = [];
  unsupported.capabilities[0].voices = [];
  const result = resolvePreferences("/project", profile, {}, unsupported, [
    "speech",
  ]);
  assert.equal(result.generation.speech.status, "needs_input");
  assert.deepEqual(
    result.decisions.map((item) => item.code),
    [
      "language_unsupported",
      "model_unsupported",
      "voice_unsupported",
      "voice_unsupported",
    ],
  );
  const duplicate = structuredClone(snapshot);
  duplicate.capabilities.push(duplicate.capabilities[0]);
  assert.throws(
    () => resolvePreferences("/project", profile, {}, duplicate, ["speech"]),
    /Duplicate/,
  );
});

test("file companions resolve mechanically and cannot escape the selected project", async (t) => {
  const dir = await temporary(t);
  await initConfig(dir);
  await fs.writeFile(path.join(dir, "task.json"), JSON.stringify(profile));
  await fs.writeFile(path.join(dir, "session.json"), JSON.stringify(snapshot));
  const resolved = await resolveConfig(dir, {
    request: "task.json",
    capabilities: "session.json",
    needs: ["speech"],
  });
  assert.equal(resolved.generation.speech.status, "ready");
  assert.equal(resolved.outputDirectory, path.join(dir, "deliverables"));
  const cli = spawnSync(
    process.execPath,
    [
      path.join(root, "skills/forma/scripts/config.mjs"),
      "resolve",
      dir,
      "--request",
      "task.json",
      "--capabilities",
      "session.json",
      "--needs",
      "speech",
    ],
    { encoding: "utf8" },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), resolved);
  await assert.rejects(
    resolveConfig(dir, { request: "../outside.json" }),
    /allowed root/,
  );
  const outside = await temporary(t);
  await fs.writeFile(path.join(outside, "outside.json"), "{}");
  await fs.symlink(
    path.join(outside, "outside.json"),
    path.join(dir, "escape.json"),
  );
  await assert.rejects(
    resolveConfig(dir, { request: "escape.json" }),
    /allowed root/,
  );
});
