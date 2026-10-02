import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { temporary, root } from "./helpers.mjs";
import { generateSound } from "../skills/codex-design/scripts/sound-effects.mjs";
import { serve } from "../skills/codex-design/scripts/preview.mjs";
import { exportArtifact } from "../skills/codex-design/scripts/export.mjs";
import { inlineHtml } from "../skills/codex-design/scripts/lib/inline.mjs";

const execute = promisify(execFile);
const fixtureKey = "local-fixture-key-no-provider-credit";
const prompt = "A gentle synthetic verification chime";
const cli = path.join(root, "skills/codex-design/scripts/sound-effects.mjs");
let encoded;
function syntheticMp3() {
  // This local sine wave is test data, never a claimed provider generation.
  encoded ??= execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:sample_rate=44100:duration=0.6",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    "-threads",
    "1",
    "-f",
    "mp3",
    "pipe:1",
  ]);
  return encoded;
}
async function api(
  t,
  handler = (_req, res) => {
    res.writeHead(200, { "content-type": "audio/mpeg" });
    res.end(syntheticMp3());
  },
) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    res.on("error", () => {});
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: JSON.parse(Buffer.concat(chunks).toString()),
      });
      await handler(req, res);
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ detail: "Local fixture failure" }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  return {
    endpoint: `http://127.0.0.1:${server.address().port}/v1/sound-generation`,
    requests,
  };
}
async function files(dir) {
  return (await fs.readdir(dir, { recursive: true })).sort();
}
async function noSound(dir) {
  assert.equal(
    (await files(dir)).some((file) => file.endsWith(".mp3")),
    false,
  );
  assert.equal(
    (await files(dir)).some((file) => /pending|\.tmp$/.test(file)),
    false,
  );
}
function streams(file) {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name,sample_rate",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8" },
    ),
  ).streams;
}

test("sound planning stays offline, writes nothing and omits duration while retaining zero influence", async (t) => {
  const dir = await temporary(t),
    fixture = await api(t);
  const plan = await generateSound(dir, prompt, {
    endpoint: fixture.endpoint,
    apiKey: fixtureKey,
    promptInfluence: 0,
    name: "gentle-chime",
  });
  assert.equal(plan.generated, false);
  assert.equal(plan.project, dir);
  assert.equal(plan.relativePath, "scraps/gentle-chime.mp3");
  assert.deepEqual(plan.body, { text: prompt, prompt_influence: 0 });
  assert.equal(JSON.stringify(plan).includes(fixtureKey), false);
  assert.equal(fixture.requests.length, 0);
  assert.deepEqual(await files(dir), []);
  const defaultPlan = await generateSound(dir, prompt);
  assert.equal(defaultPlan.body.prompt_influence, 0.3);
  assert.equal(
    defaultPlan.endpoint,
    "https://api.elevenlabs.io/v1/sound-generation",
  );
  assert.match(defaultPlan.relativePath, /^scraps\/[a-z0-9_-]+\.mp3$/);
  assert.deepEqual(await files(dir), []);
});

test("sound request bounds are inclusive and reject invalid prompts, numbers, endpoints and names before IO", async (t) => {
  const dir = await temporary(t);
  for (const [durationSeconds, promptInfluence] of [
    [0.5, 0],
    [22, 1],
  ]) {
    const plan = await generateSound(dir, prompt, {
      durationSeconds,
      promptInfluence,
    });
    assert.equal(plan.body.duration_seconds, durationSeconds);
    assert.equal(plan.body.prompt_influence, promptInfluence);
  }
  for (const value of [0.49, 22.01, -1, NaN, Infinity])
    await assert.rejects(
      generateSound(dir, prompt, { durationSeconds: value }),
    );
  for (const value of [-0.01, 1.01, NaN, Infinity])
    await assert.rejects(
      generateSound(dir, prompt, { promptInfluence: value }),
    );
  for (const value of ["", "   ", null])
    await assert.rejects(generateSound(dir, value));
  for (const endpoint of [
    "http://api.elevenlabs.io/v1/sound-generation",
    "file:///tmp/sound",
    "https://key:secret@example.com/sound",
    "https://example.com/sound?key=secret",
    "https://example.com/sound#secret",
  ])
    await assert.rejects(generateSound(dir, prompt, { endpoint }));
  for (const name of [
    "../outside",
    "nested/sound",
    "bad name",
    "BAD",
    "sound.wav",
  ])
    await assert.rejects(generateSound(dir, prompt, { name }));
  assert.deepEqual(await files(dir), []);
});

test("missing keys, occupied explicit names, escaping scraps and invalid metadata never trigger generation", async (t) => {
  const fixture = await api(t),
    dir = await temporary(t);
  await assert.rejects(
    generateSound(dir, prompt, {
      generate: true,
      apiKey: "",
      endpoint: fixture.endpoint,
    }),
    /key/i,
  );
  await fs.mkdir(path.join(dir, "scraps"));
  await fs.writeFile(
    path.join(dir, "scraps/occupied.mp3"),
    "Preserve this existing file",
  );
  await assert.rejects(
    generateSound(dir, prompt, {
      generate: true,
      apiKey: fixtureKey,
      endpoint: fixture.endpoint,
      name: "occupied",
    }),
    /exist|occupied|overwrite/i,
  );
  assert.equal(
    await fs.readFile(path.join(dir, "scraps/occupied.mp3"), "utf8"),
    "Preserve this existing file",
  );
  const escape = await temporary(t),
    outside = await temporary(t);
  await fs.symlink(outside, path.join(escape, "scraps"));
  await assert.rejects(
    generateSound(escape, prompt, {
      generate: true,
      apiKey: fixtureKey,
      endpoint: fixture.endpoint,
    }),
    /symlink|root|directory/i,
  );
  assert.deepEqual(await files(outside), []);
  const malformed = await temporary(t);
  await fs.writeFile(
    path.join(malformed, "design.json"),
    '{"schemaVersion":1,"assets":"invalid"}',
  );
  await assert.rejects(
    generateSound(malformed, prompt, {
      generate: true,
      apiKey: fixtureKey,
      endpoint: fixture.endpoint,
    }),
    /metadata|assets/i,
  );
  assert.equal(fixture.requests.length, 0);
  await noSound(malformed);
});

test("one configured local POST creates a decoded MP3 and preserves project metadata and provenance", async (t) => {
  const dir = await temporary(t),
    fixture = await api(t);
  const original = {
    schemaVersion: 1,
    designSystems: [{ slug: "kept" }],
    assets: [
      { path: "existing.html", type: "document", source: "Reviewed fixture" },
    ],
    custom: { kept: 42 },
  };
  await fs.writeFile(path.join(dir, "design.json"), JSON.stringify(original));
  const result = await generateSound(dir, prompt, {
    generate: true,
    apiKey: fixtureKey,
    endpoint: fixture.endpoint,
    name: "actual-chime.mp3",
    promptInfluence: 0,
  });
  assert.equal(result.generated, true);
  assert.deepEqual(result.registration, { registered: true });
  assert.equal(result.relativePath, "scraps/actual-chime.mp3");
  assert.equal(result.file, path.join(dir, result.relativePath));
  const bytes = await fs.readFile(result.file);
  assert.deepEqual(bytes, syntheticMp3());
  assert.equal(result.bytes, bytes.length);
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(
    streams(result.file).map((s) => s.codec_name),
    ["mp3"],
  );
  assert.equal(fixture.requests.length, 1);
  const request = fixture.requests[0];
  assert.equal(request.method, "POST");
  assert.equal(request.headers["xi-api-key"], fixtureKey);
  assert.match(request.headers["content-type"], /application\/json/);
  assert.deepEqual(request.body, { text: prompt, prompt_influence: 0 });
  const meta = JSON.parse(
    await fs.readFile(path.join(dir, "design.json"), "utf8"),
  );
  assert.deepEqual(meta.custom, original.custom);
  assert.deepEqual(meta.designSystems, original.designSystems);
  assert.deepEqual(meta.assets[0], original.assets[0]);
  assert.equal(meta.assets.length, 2);
  assert.equal(meta.assets[1].path, result.relativePath);
  assert.equal(meta.assets[1].type, "audio");
  assert.equal(meta.assets[1].source, "configured-sound-provider");
  assert.equal(meta.assets[1].generation.provider, "configured-sound-provider");
  assert.equal(meta.assets[1].generation.endpoint, fixture.endpoint);
  assert.equal(meta.assets[1].generation.prompt, prompt);
  assert.equal(meta.assets[1].generation.promptInfluence, 0);
  assert.equal("requestedDurationSeconds" in meta.assets[1].generation, false);
  assert.equal(meta.assets[1].generation.bytes, result.bytes);
  assert.equal(meta.assets[1].generation.sha256, result.sha256);
  assert.equal(JSON.stringify(meta).includes(fixtureKey), false);
  assert.equal(JSON.stringify(result).includes(fixtureKey), false);
  assert.equal(
    (await files(dir)).some((file) => /pending|\.tmp$/.test(file)),
    false,
  );
});

test("derived names remain independent and an occupied explicit reservation prevents duplicate HTTP requests", async (t) => {
  const dir = await temporary(t);
  let release, received;
  const started = new Promise((resolve) => {
    received = resolve;
  });
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const fixture = await api(t, async (_req, res) => {
    received();
    await waiting;
    res.writeHead(200, { "content-type": "audio/mpeg" });
    res.end(syntheticMp3());
  });
  const first = generateSound(dir, prompt, {
    generate: true,
    apiKey: fixtureKey,
    endpoint: fixture.endpoint,
    name: "reserved",
  });
  await started;
  await assert.rejects(
    generateSound(dir, prompt, {
      generate: true,
      apiKey: fixtureKey,
      endpoint: fixture.endpoint,
      name: "reserved",
    }),
  );
  release();
  const result = await first;
  const next = await generateSound(dir, prompt, {
    generate: true,
    apiKey: fixtureKey,
    endpoint: fixture.endpoint,
  });
  const last = await generateSound(dir, prompt, {
    generate: true,
    apiKey: fixtureKey,
    endpoint: fixture.endpoint,
  });
  assert.equal(
    new Set([result.relativePath, next.relativePath, last.relativePath]).size,
    3,
  );
  assert.equal(fixture.requests.length, 3);
  assert.deepEqual(await fs.readFile(result.file), syntheticMp3());
});

test("concurrent distinct sounds preserve both registrations and existing project metadata", async (t) => {
  const dir = await temporary(t);
  await fs.writeFile(
    path.join(dir, "design.json"),
    JSON.stringify({
      schemaVersion: 1,
      assets: [],
      custom: "Preserved during concurrent generation",
    }),
  );
  let ready = 0,
    release;
  const both = new Promise((resolve) => {
    release = resolve;
  });
  const fixture = await api(t, async (_req, res) => {
    if (++ready === 2) release();
    await both;
    res.writeHead(200, { "content-type": "audio/mpeg" });
    res.end(syntheticMp3());
  });
  const results = await Promise.all(
    ["first", "second"].map((name) =>
      generateSound(dir, prompt, {
        generate: true,
        apiKey: fixtureKey,
        endpoint: fixture.endpoint,
        name,
      }),
    ),
  );
  assert.equal(fixture.requests.length, 2);
  const meta = JSON.parse(
    await fs.readFile(path.join(dir, "design.json"), "utf8"),
  );
  assert.equal(meta.custom, "Preserved during concurrent generation");
  assert.deepEqual(meta.assets.map((asset) => asset.path).sort(), [
    "scraps/first.mp3",
    "scraps/second.mp3",
  ]);
  for (const result of results) {
    assert.equal(result.registration.registered, true);
    assert.deepEqual(await fs.readFile(result.file), syntheticMp3());
  }
});

test("HTTP failures, JSON, invalid MP3 headers and redirects leave no audio and are never retried", async (t) => {
  const cases = [
    {
      status: 401,
      type: "application/json",
      bytes: Buffer.from(JSON.stringify({ detail: fixtureKey })),
    },
    {
      status: 429,
      type: "application/json",
      bytes: Buffer.from('{"detail":"Quota fixture"}'),
    },
    {
      status: 500,
      type: "application/json",
      bytes: Buffer.from('{"detail":"Server fixture"}'),
    },
    {
      status: 200,
      type: "application/json",
      bytes: Buffer.from('{"detail":"Not audio"}'),
    },
    {
      status: 200,
      type: "audio/mpeg",
      bytes: Buffer.from("ID3not an actual MP3 file"),
    },
    {
      status: 200,
      type: "audio/mpeg",
      bytes: Buffer.from([0xff, 0xfb, 0x90, 0x64]),
    },
    {
      status: 200,
      type: "application/octet-stream",
      bytes: Buffer.from([0xff, 0xf1, 0x50, 0x80, 0, 0x1f, 0xfc]),
    },
  ];
  for (const item of cases) {
    const dir = await temporary(t),
      fixture = await api(t, (_req, res) => {
        res.writeHead(item.status, { "content-type": item.type });
        res.end(item.bytes);
      });
    await assert.rejects(
      generateSound(dir, prompt, {
        generate: true,
        apiKey: fixtureKey,
        endpoint: fixture.endpoint,
      }),
      (error) => {
        assert.equal(error.message.includes(fixtureKey), false);
        return true;
      },
    );
    assert.equal(fixture.requests.length, 1);
    await noSound(dir);
  }
  const destination = await api(t),
    redirect = await api(t, (_req, res) => {
      res.writeHead(307, { location: destination.endpoint });
      res.end();
    });
  const dir = await temporary(t);
  await assert.rejects(
    generateSound(dir, prompt, {
      generate: true,
      apiKey: fixtureKey,
      endpoint: redirect.endpoint,
    }),
  );
  assert.equal(redirect.requests.length, 1);
  assert.equal(destination.requests.length, 0);
  await noSound(dir);
});

test("complete MPEG frames with invalid side information are rejected before publication or registration", async (t) => {
  const dir = await temporary(t);
  const original = {
    schemaVersion: 1,
    assets: [],
    custom: "Preserve the reviewed project ledger",
  };
  await fs.writeFile(path.join(dir, "design.json"), JSON.stringify(original));
  // Valid MPEG headers and frame lengths do not guarantee decodable side information.
  const frame = Buffer.alloc(417, 255);
  frame.set([255, 251, 144, 0]);
  const malformed = Buffer.concat([frame, frame, frame]);
  const fixture = await api(t, (_req, res) => {
    res.writeHead(200, { "content-type": "audio/mpeg" });
    res.end(malformed);
  });
  await assert.rejects(
    generateSound(dir, prompt, {
      generate: true,
      apiKey: fixtureKey,
      endpoint: fixture.endpoint,
      name: "invalid-side-info",
    }),
    /decode|invalid|MP3/i,
  );
  assert.equal(fixture.requests.length, 1);
  await noSound(dir);
  assert.deepEqual(await fs.readdir(path.join(dir, "scraps")), []);
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(dir, "design.json"), "utf8")),
    original,
  );
});

test("missing FFmpeg fails before HTTP while an offline CLI plan remains usable", async (t) => {
  const dir = await temporary(t),
    emptyPath = await temporary(t),
    fixture = await api(t);
  const env = {
    ...process.env,
    PATH: emptyPath,
    ELEVENLABS_API_KEY: fixtureKey,
  };
  const argv = [
    cli,
    dir,
    "--prompt",
    prompt,
    "--endpoint",
    fixture.endpoint,
    "--name",
    "no-decoder",
  ];
  const planned = await execute(process.execPath, argv, { env });
  assert.equal(JSON.parse(planned.stdout).generated, false);
  await assert.rejects(
    execute(process.execPath, [...argv, "--generate"], { env }),
    (error) => {
      assert.match(error.stderr, /ffmpeg/i);
      assert.equal(error.stdout.includes(fixtureKey), false);
      assert.equal(error.stderr.includes(fixtureKey), false);
      return true;
    },
  );
  assert.equal(fixture.requests.length, 0);
  await noSound(dir);
  assert.equal((await files(dir)).includes("design.json"), false);
});

test("streaming timeouts and oversized bodies are bounded through body consumption with no partial output", async (t) => {
  const timeoutDir = await temporary(t),
    slow = await api(t, (_req, res) => {
      res.writeHead(200, { "content-type": "audio/mpeg" });
      res.write(syntheticMp3().subarray(0, 100));
    });
  await assert.rejects(
    Promise.race([
      generateSound(timeoutDir, prompt, {
        generate: true,
        apiKey: fixtureKey,
        endpoint: slow.endpoint,
        timeoutMs: 100,
      }),
      new Promise((_resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Fixture watchdog expired")),
          3000,
        );
        timer.unref();
      }),
    ]),
    (error) => {
      assert.match(error.message, /timeout|timed out|abort/i);
      return true;
    },
  );
  assert.equal(slow.requests.length, 1);
  await noSound(timeoutDir);
  const largeDir = await temporary(t),
    large = await api(t, (_req, res) => {
      res.writeHead(200, { "content-type": "audio/mpeg" });
      res.write(syntheticMp3());
      res.end(Buffer.alloc(16 * 1024 * 1024));
    });
  await assert.rejects(
    generateSound(largeDir, prompt, {
      generate: true,
      apiKey: fixtureKey,
      endpoint: large.endpoint,
    }),
    /size|large|limit|MiB|response/i,
  );
  assert.equal(large.requests.length, 1);
  await noSound(largeDir);
});

test("a generated MP3 remains available when project registration changes during the request", async (t) => {
  const dir = await temporary(t);
  await fs.writeFile(
    path.join(dir, "design.json"),
    JSON.stringify({ schemaVersion: 1, assets: [], custom: "Initial" }),
  );
  const fixture = await api(t, async (_req, res) => {
    await fs.writeFile(
      path.join(dir, "design.json"),
      JSON.stringify({
        schemaVersion: 99,
        assets: [],
        custom: "Changed during HTTP",
      }),
    );
    res.writeHead(200, { "content-type": "audio/mpeg" });
    res.end(syntheticMp3());
  });
  const result = await generateSound(dir, prompt, {
    generate: true,
    apiKey: fixtureKey,
    endpoint: fixture.endpoint,
  });
  assert.equal(result.generated, true);
  assert.equal(result.registration.registered, false);
  assert.equal(typeof result.registration.error, "string");
  assert.deepEqual(await fs.readFile(result.file), syntheticMp3());
  assert.deepEqual(
    streams(result.file).map((s) => s.codec_name),
    ["mp3"],
  );
  assert.equal(
    JSON.parse(await fs.readFile(path.join(dir, "design.json"), "utf8")).custom,
    "Changed during HTTP",
  );
});

test("CLI plans hide environment keys and explicitly configured local generation returns an actual MP3", async (t) => {
  const dir = await temporary(t),
    fixture = await api(t);
  const env = { ...process.env, ELEVENLABS_API_KEY: fixtureKey };
  const argv = [
    cli,
    dir,
    "--prompt",
    prompt,
    "--endpoint",
    fixture.endpoint,
    "--name",
    "cli-chime",
    "--duration",
    "0.5",
    "--prompt-influence",
    "0",
  ];
  const planned = await execute(process.execPath, argv, { env });
  assert.equal(planned.stdout.includes(fixtureKey), false);
  assert.equal(planned.stderr.includes(fixtureKey), false);
  const plan = JSON.parse(planned.stdout);
  assert.equal(plan.generated, false);
  assert.deepEqual(plan.body, {
    text: prompt,
    duration_seconds: 0.5,
    prompt_influence: 0,
  });
  assert.deepEqual(await files(dir), []);
  assert.equal(fixture.requests.length, 0);
  const generated = await execute(process.execPath, [...argv, "--generate"], {
    env,
  });
  assert.equal(generated.stdout.includes(fixtureKey), false);
  assert.equal(generated.stderr.includes(fixtureKey), false);
  const result = JSON.parse(generated.stdout);
  assert.equal(result.generated, true);
  assert.equal(fixture.requests.length, 1);
  assert.deepEqual(await fs.readFile(result.file), syntheticMp3());
  assert.deepEqual(
    streams(result.file).map((s) => s.codec_name),
    ["mp3"],
  );
});

test("synthetic local generated MP3 stays portable and contributes real audio to a video export", async (t) => {
  const dir = await temporary(t),
    fixture = await api(t);
  const sound = await generateSound(dir, prompt, {
    generate: true,
    apiKey: fixtureKey,
    endpoint: fixture.endpoint,
  });
  const input = path.join(dir, "index.html");
  await fs.writeFile(
    input,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Synthetic sound consumer</title></head><body style="margin:0"><main id="art" style="width:160px;height:100px;background:#275dad"><audio src="${sound.relativePath}" muted data-codex-exportable-video-play-start="0" data-codex-exportable-video-play-end="0.5" data-codex-exportable-video-volume="0.8"></audio></main><script>window.codexTimeline={duration:0.6,width:160,height:100,root:document.getElementById("art"),setPlaying(){},seek(time){this.root.style.background=time<0.3?"#275dad":"#307457"}}</script></body></html>`,
  );
  await fs.writeFile(path.join(dir, "portable.html"), await inlineHtml(input));
  await fs.rm(sound.file);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await exportArtifact(
    "video",
    url + "portable.html",
    path.join(dir, "sound.mp4"),
    { fps: 5, deviceScaleFactor: 1 },
  );
  assert.equal(result.audio, true);
  assert.equal(result.audioTracks, 1);
  assert.deepEqual(
    streams(result.output).map((s) => s.codec_name),
    ["h264", "aac"],
  );
  const bytes = execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    result.output,
    "-map",
    "0:a:0",
    "-f",
    "f32le",
    "-ar",
    "48000",
    "-ac",
    "1",
    "pipe:1",
  ]);
  const samples = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const band = samples.subarray(4800, 19200);
  const power = (frequency) => {
    let sine = 0,
      cosine = 0;
    for (let i = 0; i < band.length; i++) {
      const angle = (2 * Math.PI * frequency * i) / 48000;
      sine += band[i] * Math.sin(angle);
      cosine += band[i] * Math.cos(angle);
    }
    return Math.hypot(sine, cosine) / band.length;
  };
  assert.ok(power(660) > 0.02);
  assert.ok(power(660) > power(1000) * 10);
});
