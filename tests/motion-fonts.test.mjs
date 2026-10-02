import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../skills/studio-design/scripts/build.mjs";
import { serve } from "../skills/studio-design/scripts/preview.mjs";
import { withPage } from "../skills/studio-design/scripts/lib/browser.mjs";
import { exportArtifact } from "../skills/studio-design/scripts/export.mjs";
import {
  fontOrigins,
  cssURLs,
  cssImport,
  rewriteCSSURLs,
} from "../skills/studio-design/assets/starters/font-css.js";
import { fontRequestAllowed } from "../skills/studio-design/scripts/lib/font-network.mjs";

test("font CSS handles escaped URLs and nested import conditions without treating strings or comments as requests", async () => {
  const value = String.raw`local("url(fake)"), URL("font \28 copy\29 .ttf"),url(font\ space.woff2) /* url(ignored) */,url("data:font/woff2;base64,YQ==")`;
  assert.deepEqual(
    cssURLs(value).map((item) => item.value),
    ["font (copy).ttf", "font space.woff2", "data:font/woff2;base64,YQ=="],
  );
  const rewritten = await rewriteCSSURLs(value, (url) =>
    url.startsWith("data:")
      ? null
      : "https://fonts.example/" + encodeURIComponent(url),
  );
  assert.ok(rewritten.includes('local("url(fake)")'));
  assert.ok(rewritten.includes("/* url(ignored) */"));
  assert.deepEqual(
    cssURLs(rewritten).map((item) => item.value),
    [
      "https://fonts.example/font%20(copy).ttf",
      "https://fonts.example/font%20space.woff2",
      "data:font/woff2;base64,YQ==",
    ],
  );
  assert.deepEqual(
    cssImport(
      'url("faces.css") layer(type) supports((display: grid) and (color: red)) screen and (min-width: 1px)',
    ).wrappers,
    [
      "@layer type",
      "@supports (display: grid) and (color: red)",
      "@media screen and (min-width: 1px)",
    ],
  );
  assert.deepEqual(
    cssImport('"fonts.css" layer supports(display: grid)').wrappers,
    ["@layer", "@supports (display: grid)"],
  );
  assert.deepEqual(
    fontOrigins(["https://fonts.example/", "https://fonts.example"]),
    ["https://fonts.example"],
  );
  for (const input of [
    "https://fonts.example",
    ["file:///fonts"],
    ["https://user:secret@fonts.example"],
    ["https://fonts.example/path"],
    ["https://fonts.example?query=1"],
  ])
    assert.throws(() => fontOrigins(input));
  for (const type of ["font", "stylesheet", "fetch"])
    assert.equal(
      fontRequestAllowed("https://fonts.example/a", "GET", type, [
        "https://fonts.example",
      ]),
      true,
    );
  for (const [url, method, type] of [
    ["https://other.example/a", "GET", "font"],
    ["https://fonts.example/a", "POST", "fetch"],
    ["https://fonts.example/a", "GET", "script"],
    ["https://fonts.example/a", "GET", "image"],
    ["https://user@fonts.example/a", "GET", "font"],
  ])
    assert.equal(
      fontRequestAllowed(url, method, type, ["https://fonts.example"]),
      false,
    );
});

const fontPath = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf";
async function setup(
  t,
  {
    remote,
    configured = true,
    authoredInter = false,
    captions = false,
    blobFont = false,
    editor = false,
  } = {},
) {
  const dir = await temporary(t);
  const font = await fs.readFile(fontPath);
  await fs.mkdir(path.join(dir, "styles", "nested"), { recursive: true });
  await fs.mkdir(path.join(dir, "styles", "assets"), { recursive: true });
  await fs.writeFile(path.join(dir, "direct.ttf"), font);
  await fs.writeFile(
    path.join(dir, "styles", "assets", "font (copy).ttf"),
    font,
  );
  await fs.writeFile(
    path.join(dir, "styles", "base.css"),
    '@import "nested/faces.css" layer(type) supports(display: grid) screen;',
  );
  await fs.writeFile(
    path.join(dir, "styles", "nested", "faces.css"),
    String.raw`@media (min-width:1px){@font-face{font-family:PortableMono;src:url("../assets/font \28 copy\29 .ttf") format("truetype"),url("../assets/font (copy).ttf") format("truetype");font-display:swap}} @media not all{@font-face{font-family:InactiveFixture;src:url("../assets/font (copy).ttf");font-weight:700}}`,
  );
  const runtime = path.join(
    root,
    "skills/studio-design/assets/starters/animations.jsx",
  );
  await fs.writeFile(
    path.join(dir, "main.jsx"),
    `
    import React from "react";import {createRoot} from "react-dom/client";
    import {CompositionStage,useComposition,Captions} from ${JSON.stringify(runtime)};
    function Piece(){const {T}=useComposition();return <><div id="probe" style={{position:"absolute",left:20,top:40,fontFamily:"${blobFont ? "BlobFixture" : remote ? "RemoteMono" : "PortableMono"},sans-serif",fontSize:40,lineHeight:1.25,color:"#18222b"}}>iiiiii !<output hidden>{T}</output></div>${captions ? '<Captions items={[{at:0,text:"iiiiii !"}]}/>' : ""}</>;}
    window.fontRoot=createRoot(document.getElementById("root"));
    fontRoot.render(<CompositionStage width={400} height={240} bg="#f7f7f2" autoplay={false}
      scenes={window.CODEX_SCENES} playback={window.CODEX_PLAYBACK} source={${editor}} fontOrigins={${JSON.stringify(remote && configured ? [new URL(remote).origin] : [])}}><Piece/></CompositionStage>);
  `,
  );
  await bundle(path.join(dir, "main.jsx"), path.join(dir, "bundle.js"));
  const blobBootstrap = blobFont
    ? `<script>window.blobFontURL=URL.createObjectURL(new Blob([Uint8Array.from(atob(${JSON.stringify(font.toString("base64"))}),c=>c.charCodeAt(0))],{type:"font/ttf"}));const fontStyle=document.createElement("style");fontStyle.textContent='@import url("data:text/css;base64,${Buffer.from('@font-face{font-family:DataFixture;src:url("data:font/ttf;base64,' + font.toString("base64") + '")}').toString("base64")}");@font-face{font-family:BlobFixture;src:url("'+blobFontURL+'")}';document.head.append(fontStyle);</script>`
    : "";
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Portable motion fonts</title><style>body{margin:0}</style><style>@font-face{font-family:${authoredInter ? "Inter" : "InlineFixture"};font-weight:500;src:url("direct.ttf");font-display:swap}</style><link rel="stylesheet" href="${remote ?? "styles/base.css"}"></head><body><script>window.CODEX_SCENES='[{"name":"Opening","dur":1}]';window.CODEX_PLAYBACK='{"mode":"loop"}';</script>${blobBootstrap}<div id="root"></div><script src="bundle.js"></script></body></html>`,
  );
  const { server, url } = await serve(
    dir,
    0,
    editor
      ? {
          motionFile: "index.html",
          fontOrigins: remote && configured ? [new URL(remote).origin] : [],
        }
      : {},
  );
  const requests = [];
  server.on("request", (req) => requests.push(req.url));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url, font, requests };
}
async function ready(page) {
  await page.waitForFunction(() => window.codexTimeline?.root.codexFontsReady);
  await page.evaluate(() => codexTimeline.root.codexFontsReady);
  return page.evaluate(() => {
    const root = codexTimeline.root;
    const probe = document.getElementById("probe");
    const range = document.createRange();
    range.selectNodeContents(probe);
    return {
      warning: root.dataset.codexFontWarning,
      ready: root.dataset.codexFontsInlined,
      css: root.querySelector("[data-codex-motion-fonts]")?.textContent ?? "",
      width: range.getBoundingClientRect().width,
      faces: [...document.fonts].map((face) => ({
        family: face.family,
        status: face.status,
      })),
      svg: new XMLSerializer().serializeToString(root),
    };
  });
}
const pixels = (png) =>
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { input: png, maxBuffer: 1048576 },
  );
const meanError = (a, b) => {
  assert.equal(a.length, b.length);
  let error = 0;
  for (let i = 0; i < a.length; i++) error += Math.abs(a[i] - b[i]);
  return error / a.length;
};

test("all inline sheets, conditional CSS imports and repeated font URLs become portable without changing glyph geometry", async (t) => {
  const { dir, url, font, requests } = await setup(t);
  let original, png;
  await withPage(
    url + "?capture",
    async (page) => {
      original = await ready(page);
      assert.equal(original.ready, "true");
      assert.equal(original.warning, undefined);
      assert.ok(original.css.includes(font.toString("base64")));
      assert.ok(original.css.includes("InlineFixture"));
      assert.ok(original.css.includes("PortableMono"));
      assert.ok(original.css.includes("@supports (display: grid)"));
      assert.ok(original.css.includes("@layer type"));
      assert.ok(original.css.includes("@media not all"));
      assert.ok(
        cssURLs(original.css).every((item) => item.value.startsWith("data:")),
      );
      assert.ok(
        original.faces.some(
          (face) => face.family === "PortableMono" && face.status === "loaded",
        ),
      );
      assert.ok(original.width > 190 && original.width < 195);
      assert.ok(
        requests.filter(
          (url) => decodeURIComponent(url) === "/styles/assets/font (copy).ttf",
        ).length <= 2,
        "Repeated source descriptors share the embedding request",
      );
      png = await page.screenshot();
    },
    { width: 400, height: 240 },
  );
  await fs.rm(path.join(dir, "styles"), { recursive: true });
  await fs.rm(path.join(dir, "direct.ttf"));
  await fs.rm(path.join(dir, "bundle.js"));
  await fs.writeFile(
    path.join(dir, "clone.html"),
    `<!doctype html><html lang="en"><head><meta name="codex-fixed-sheet" content="off"><title>Independent offline SVG</title><style>body{margin:0}</style></head><body>${original.svg}</body></html>`,
  );
  await withPage(
    url + "clone.html",
    async (page) => {
      const geometry = await page.locator("#probe").evaluate((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect().width;
      });
      assert.equal(geometry, original.width);
      const embedded = pixels(await page.screenshot());
      const baseline = pixels(png);
      assert.ok(
        meanError(embedded, baseline) < 0.1,
        "The offline SVG retains the actual rendered local font",
      );
      await page
        .locator("[data-codex-motion-fonts]")
        .evaluate((node) => node.remove());
      const fallback = pixels(await page.screenshot());
      assert.ok(
        meanError(fallback, baseline) > 1,
        "This comparison must distinguish missing-font fallback",
      );
      const changed = await page.locator("#probe").evaluate((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect().width;
      });
      assert.ok(Math.abs(changed - original.width) > 8);
    },
    { width: 400, height: 240 },
  );
  await fs.writeFile(
    path.join(dir, "raster.html"),
    `<!doctype html><html lang="en"><head><meta name="codex-fixed-sheet" content="off"><title>Portable SVG image</title><style>body{margin:0}img{display:block}</style></head><body><img width="400" height="240" src="data:image/svg+xml;base64,${Buffer.from(original.svg).toString("base64")}" alt="Standalone SVG font sample"></body></html>`,
  );
  await withPage(
    url + "raster.html",
    async (page) => {
      const bitmap = pixels(await page.screenshot());
      assert.ok(
        meanError(bitmap, pixels(png)) < 0.1,
        "The serialized SVG is self-contained when decoded as an image",
      );
    },
    { width: 400, height: 240 },
  );
});

async function provider(t, { redirectTo } = {}) {
  const font = await fs.readFile(fontPath),
    requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.url === "/entry.css") {
      res.writeHead(302, { Location: redirectTo ?? "/nested/faces.css" });
      res.end();
    } else if (req.url === "/nested/faces.css") {
      res.writeHead(200, { "Content-Type": "text/css" });
      res.end(
        '@font-face{font-family:RemoteMono;src:url("../font.ttf");font-display:swap}',
      );
    } else if (req.url === "/font.ttf") {
      res.writeHead(200, { "Content-Type": "font/ttf" });
      res.end(font);
    } else {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end("window.externalFontScriptRan=true;");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: "http://0.0.0.0:" + server.address().port, requests };
}

test("configured remote font CSS, opaque CSSOM and redirects retain actual source bytes and real encoded output", async (t) => {
  const source = await provider(t);
  const { dir, url, font } = await setup(t, {
    remote: source.url + "/entry.css",
  });
  await assert.rejects(
    withPage(url + "?capture", async () => {}),
    /Browser errors/,
  );
  assert.equal(
    source.requests.length,
    0,
    "A stage declaration cannot grant the export helper remote access",
  );
  await withPage(
    url + "?capture",
    async (page) => {
      assert.equal(
        await page.evaluate(() => {
          try {
            document.styleSheets[2].cssRules;
            return false;
          } catch {
            return true;
          }
        }),
        true,
      );
      const state = await ready(page);
      assert.equal(state.warning, undefined);
      assert.ok(state.css.includes(font.toString("base64")));
      assert.ok(
        state.faces.some(
          (face) => face.family === "RemoteMono" && face.status === "loaded",
        ),
      );
      assert.ok(state.width > 190 && state.width < 195);
    },
    { width: 400, height: 240, fontOrigins: [source.url] },
  );
  const output = path.join(dir, "remote-font.mp4");
  const result = await exportArtifact("video", url, output, {
    fontOrigins: [source.url],
    fps: 2,
    deviceScaleFactor: 1,
    audio: "none",
  });
  assert.equal(result.frames, 2);
  assert.equal(
    result.flags.some(
      (flag) =>
        flag.kind === "fonts_incomplete" || flag.kind === "fonts_timeout",
    ),
    false,
  );
  const decoded = execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      output,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { maxBuffer: 1048576 },
  );
  assert.equal(decoded.length, 400 * 240 * 3);
  assert.ok(
    decoded.some((value) => value < 100),
    "The encoded frame includes actual font ink",
  );
});

test("remote grants exclude scripts and unconfigured redirect targets, while ordinary previews report omitted embedding", async (t) => {
  const source = await provider(t);
  const { dir, url } = await setup(t, {
    remote: source.url + "/entry.css",
    configured: false,
  });
  await withPage(
    url + "?capture",
    async (page) => {
      const state = await ready(page);
      assert.match(state.warning, /unconfigured/);
      assert.equal(state.css.includes("RemoteMono"), false);
      assert.equal(state.ready, "true");
    },
    { fontOrigins: [source.url] },
  );
  await fs.writeFile(
    path.join(dir, "script.html"),
    `<!doctype html><html lang="en"><head><title>Font policy boundary</title></head><body><script src="${source.url}/script.js"></script></body></html>`,
  );
  await assert.rejects(
    withPage(
      url + "script.html",
      async (page) => {
        assert.equal(
          await page.evaluate(() => window.externalFontScriptRan),
          undefined,
        );
      },
      { fontOrigins: [source.url] },
    ),
    /Browser errors/,
  );
  assert.equal(source.requests.includes("/script.js"), false);
  const target = await provider(t);
  const redirected = await provider(t, {
    redirectTo: target.url + "/font.ttf",
  });
  const other = await setup(t, { remote: redirected.url + "/entry.css" });
  await assert.rejects(
    withPage(other.url + "?capture", async () => {}, {
      fontOrigins: [redirected.url],
    }),
    /Browser errors/,
  );
  assert.equal(
    target.requests.length,
    0,
    "The configured font source cannot grant another origin through a redirect",
  );
});

test("the pinned default Inter is offline and retains an explicitly authored Inter face", async (t) => {
  const bundled = await fs.readFile(
    new URL(
      "../skills/studio-design/assets/starters/fonts/inter-medium.woff2",
      import.meta.url,
    ),
  );
  assert.equal(
    createHash("sha256").update(bundled).digest("hex"),
    "0ff3e94614e1493eb556314fd247ae6c4a85a7783b4cc86be539940cf83f2a48",
  );
  assert.match(
    await fs.readFile(
      new URL(
        "../skills/studio-design/assets/starters/fonts/OFL.txt",
        import.meta.url,
      ),
      "utf8",
    ),
    /SIL OPEN FONT LICENSE Version 1.1/,
  );
  let packagedWidth;
  for (const authoredInter of [false, true]) {
    const { url, font } = await setup(t, { captions: true, authoredInter });
    await withPage(url + "?capture", async (page) => {
      const state = await ready(page);
      await page.evaluate(() => codexTimeline.seek(0.4));
      assert.equal(state.warning, undefined);
      assert.equal(
        state.css.includes(bundled.toString("base64")),
        !authoredInter,
      );
      assert.ok(
        state.faces.some(
          (face) => face.family === "Inter" && face.status === "loaded",
        ),
      );
      const width = await page
        .locator("[data-codex-caption]")
        .evaluate((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getBoundingClientRect().width;
        });
      if (authoredInter) {
        assert.ok(state.css.includes(font.toString("base64")));
        assert.ok(width > 140 && width < 146);
        assert.ok(
          width > packagedWidth * 1.5,
          "The custom family must retain its actual glyphs instead of the packaged Inter fallback",
        );
      } else {
        packagedWidth = width;
        assert.ok(width > 40 && width < 90);
      }
    });
  }
});

test("blob fonts and data stylesheet imports survive revocation, serialization and owned-root cleanup", async (t) => {
  const { dir, url, font } = await setup(t, { blobFont: true });
  let state, png;
  await withPage(
    url + "?capture",
    async (page) => {
      state = await ready(page);
      assert.equal(state.warning, undefined);
      assert.ok(state.css.includes("BlobFixture"));
      assert.ok(state.css.includes("DataFixture"));
      assert.ok(
        cssURLs(state.css).every((item) => item.value.startsWith("data:")),
      );
      assert.ok(state.css.includes(font.toString("base64")));
      await page.evaluate(() => URL.revokeObjectURL(blobFontURL));
      png = await page.screenshot();
      await page.evaluate(() => {
        window.oldFontRoot = codexTimeline.root;
        window.fontRoot.unmount();
      });
      assert.deepEqual(
        await page.evaluate(() => ({
          style: !!oldFontRoot.querySelector("[data-codex-motion-fonts]"),
          ready: oldFontRoot.dataset.codexFontsInlined ?? null,
          pending: !!oldFontRoot.codexFontsReady,
          bridge: !!window.codexTimeline,
        })),
        { style: false, ready: null, pending: false, bridge: false },
      );
    },
    { width: 400, height: 240 },
  );
  await fs.writeFile(
    path.join(dir, "blob-clone.html"),
    `<!doctype html><html lang="en"><head><meta name="codex-fixed-sheet" content="off"><title>Revoked font SVG</title><style>body{margin:0}</style></head><body>${state.svg}</body></html>`,
  );
  await withPage(
    url + "blob-clone.html",
    async (page) => {
      assert.ok(meanError(pixels(await page.screenshot()), pixels(png)) < 0.1);
    },
    { width: 400, height: 240 },
  );
});

test("the connected editor uses only the font origins granted when its preview server starts", async (t) => {
  const source = await provider(t);
  const { url } = await setup(t, {
    remote: source.url + "/entry.css",
    editor: true,
  });
  const binding = await fetch(url + "__codex_motion").then((response) =>
    response.json(),
  );
  const headers = {
    Origin: new URL(url).origin,
    "Content-Type": "application/json",
    "X-Codex-Motion-Token": binding.token,
  };
  const options = {
    format: "mp4",
    fps: 2,
    deviceScaleFactor: 1,
    audio: "none",
  };
  const rejected = await fetch(url + "__codex_motion/export", {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...options,
      fontOrigins: ["https://unconfigured.example"],
    }),
  });
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error, /Unexpected export option/);
  const result = await fetch(url + "__codex_motion/export", {
    method: "POST",
    headers,
    body: JSON.stringify(options),
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("content-type"), "video/mp4");
  assert.ok((await result.arrayBuffer()).byteLength > 1000);
  assert.equal(
    (result.headers.get("x-codex-export-warnings") ?? "").includes("Font"),
    false,
  );
  assert.ok(source.requests.includes("/font.ttf"));
});
