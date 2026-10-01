#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { args, contained, main } from "./lib/files.mjs";
import { readMotionSource, saveMotionSource } from "./lib/motion-source.mjs";
import { canvasSource } from "./lib/canvas-source.mjs";
import { deckSource } from "./lib/deck-source.mjs";
import { tweaksSource } from "./lib/tweaks-source.mjs";
import { textSource } from "./lib/text-source.mjs";
import { imageSource, readImageState } from "./lib/image-source.mjs";
import { injectHead } from "./lib/inject-head.mjs";
import { injectPlainCanvas } from "./lib/plain-canvas.mjs";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
};
export async function serve(
  root,
  port = 4311,
  { motionFile, canvasFile, deckFile, tweaksFile, textFile, imageFile } = {},
) {
  root = await fs.realpath(root);
  const token = randomBytes(32).toString("hex");
  let pendingSave = Promise.resolve();
  let exporting = false;
  const canvas = canvasFile
    ? await canvasSource(root, canvasFile, token)
    : null;
  const deck = deckFile ? await deckSource(root, deckFile, token) : null;
  const tweaks = tweaksFile
    ? await tweaksSource(root, tweaksFile, token)
    : null;
  const text = textFile ? await textSource(root, textFile, token) : null;
  const imageTarget = imageFile ?? deckFile ?? canvasFile;
  const images = imageTarget
    ? await imageSource(root, imageTarget, token)
    : null;
  if (motionFile) {
    motionFile = contained(
      root,
      await fs.realpath(path.resolve(root, motionFile)),
    );
    if (path.extname(motionFile) !== ".html")
      throw new Error(
        "Motion source must be an HTML document inside the preview root",
      );
    await readMotionSource(motionFile);
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? "")) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (images && req.url === "/__codex_images") {
        await images.handle(req, res);
        return;
      }
      if (text && req.url === "/__codex_text") {
        await text.handle(req, res);
        return;
      }
      if (text && req.url === "/__codex_text/editor.js") {
        if (!["GET", "HEAD"].includes(req.method)) {
          res.writeHead(405);
          res.end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/javascript",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(req.method === "HEAD" ? undefined : text.script);
        return;
      }
      if (canvas && req.url === "/__codex_canvas") {
        await canvas.handle(req, res);
        return;
      }
      if (deck && req.url === "/__codex_deck") {
        await deck.handle(req, res);
        return;
      }
      if (tweaks && req.url === "/__codex_tweaks") {
        await tweaks.handle(req, res);
        return;
      }
      if (
        motionFile &&
        ["/__codex_motion", "/__codex_motion/export"].includes(req.url)
      ) {
        const reply = (code, data) => {
          res.writeHead(code, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          res.end(JSON.stringify(data));
        };
        if (req.method === "GET" && req.url === "/__codex_motion") {
          if (
            req.headers.origin &&
            req.headers.origin !== `http://${req.headers.host}`
          ) {
            reply(403, { error: "Origin is not allowed" });
            return;
          }
          reply(200, { ...(await readMotionSource(motionFile)), token });
          return;
        }
        if (req.method !== "POST") {
          reply(405, { error: "Method is not allowed" });
          return;
        }
        if (
          req.headers.origin !== `http://${req.headers.host}` ||
          req.headers["x-codex-motion-token"] !== token ||
          req.headers["content-type"] !== "application/json"
        ) {
          reply(403, {
            error: "Source edits require this preview's origin and token",
          });
          return;
        }
        let body = "";
        try {
          for await (const chunk of req) {
            body += chunk;
            if (Buffer.byteLength(body) > 32768)
              throw new Error("Timing request is too large");
          }
          const value = JSON.parse(body);
          if (req.url === "/__codex_motion/export") {
            if (exporting) {
              reply(409, { error: "A video export is already running" });
              return;
            }
            if (!["mp4", "webm", "gif"].includes(value.format))
              throw new Error("Choose MP4, WebM, or GIF");
            const allowed = new Set([
              "format",
              "fps",
              "crf",
              "deviceScaleFactor",
              "startMs",
              "endMs",
              "audio",
            ]);
            if (Object.keys(value).some((key) => !allowed.has(key)))
              throw new Error("Unexpected export option");
            exporting = true;
            let directory;
            try {
              directory = await fs.mkdtemp(
                path.join(os.tmpdir(), "codex-motion-export-"),
              );
              await pendingSave;
              const { exportArtifact } = await import("./export.mjs");
              const relative = path
                .relative(root, motionFile)
                .split(path.sep)
                .map(encodeURIComponent)
                .join("/");
              const output = path.join(directory, `animation.${value.format}`);
              const result = await exportArtifact(
                "video",
                `http://127.0.0.1:${server.address().port}/${relative}`,
                output,
                value,
              );
              const video = await fs.readFile(output);
              res.writeHead(200, {
                "Content-Type": {
                  mp4: "video/mp4",
                  webm: "video/webm",
                  gif: "image/gif",
                }[value.format],
                "Content-Disposition": `attachment; filename="animation.${value.format}"`,
                "Cache-Control": "no-store",
                "Content-Length": video.length,
                "X-Codex-Export-Warnings": result.flags
                  .map((flag) => flag.message)
                  .join("; "),
              });
              res.end(video);
            } finally {
              exporting = false;
              if (directory)
                await fs.rm(directory, { recursive: true, force: true });
            }
            return;
          }
          const save = pendingSave.then(async () => {
            // Re-resolve on every write; symlink replacement cannot redirect it.
            const resolved = contained(root, await fs.realpath(motionFile));
            if (resolved !== motionFile)
              throw new Error("Motion source path changed");
            return saveMotionSource(resolved, value);
          });
          pendingSave = save.catch(() => {});
          reply(200, await save);
        } catch (error) {
          reply(error.status ?? 400, { error: error.message });
        }
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      const decoded = decodeURIComponent((req.url ?? "/").split("?")[0]);
      if (
        ["image-slots.state.json", ".image-slots.state.json"].includes(
          path.posix.basename(decoded),
        )
      ) {
        const parents = decoded.split("/").slice(0, -1);
        if (
          decoded.includes("\0") ||
          parents.some((part) => part.startsWith("."))
        )
          throw new Error("Invalid image state path");
        const directory = contained(
          root,
          await fs.realpath(
            path.resolve(root, "." + path.posix.dirname(decoded)),
          ),
        );
        const value = await readImageState(root, directory);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(
          req.method === "HEAD" ? undefined : JSON.stringify(value.slots),
        );
        return;
      }
      if (
        decoded.includes("\0") ||
        decoded.split("/").some((part) => part.startsWith("."))
      )
        throw new Error("Invalid or hidden path");
      let file = contained(root, path.resolve(root, "." + decoded));
      const stat = await fs.stat(file);
      if (stat.isDirectory()) file = path.join(file, "index.html");
      file = contained(root, await fs.realpath(file));
      let data = await fs.readFile(file);
      const authoredText =
        text && file === text.html ? data.toString("utf8") : null;
      if (path.extname(file) === ".html")
        data = Buffer.from(await injectPlainCanvas(data.toString("utf8")));
      for (const [service, name, endpoint] of [
        [tweaks, "tweaks", "/__codex_tweaks"],
        [deck, "deck", "/__codex_deck"],
        [canvas, "canvas", "/__codex_canvas"],
        [images, "images", "/__codex_images"],
      ])
        if (service && file === service.html)
          data = Buffer.from(
            injectHead(
              data.toString("utf8"),
              `<meta name="codex-${name}-source" content="${endpoint}">`,
            ),
          );
      if (text && file === text.html)
        data = Buffer.from(text.inject(data.toString("utf8"), authoredText));
      const headers = {
        "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
        "Content-Length": data.length,
        ETag: `"${createHash("sha256").update(data).digest("hex")}"`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      };
      if (req.method === "GET" && req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        const start = match?.[1]
          ? Number(match[1])
          : Math.max(0, data.length - Number(match?.[2]));
        const end =
          match?.[1] && match[2]
            ? Math.min(data.length - 1, Number(match[2]))
            : data.length - 1;
        if (
          !match ||
          (!match[1] && !match[2]) ||
          (!match[1] && Number(match[2]) <= 0) ||
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          start >= data.length ||
          end < start
        ) {
          res.writeHead(416, { "Content-Range": `bytes */${data.length}` });
          res.end();
          return;
        }
        res.writeHead(206, {
          ...headers,
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${data.length}`,
        });
        res.end(data.subarray(start, end + 1));
        return;
      }
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (e) {
      res.writeHead(e.code === "ENOENT" ? 404 : 403);
      res.end("Not available");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional, flags } = args(process.argv.slice(2), {
      "--port": "value",
      "--motion-file": "value",
      "--canvas-file": "value",
      "--deck-file": "value",
      "--tweaks-file": "value",
      "--text-file": "value",
      "--image-file": "value",
    });
    if (positional.length !== 1)
      throw new Error(
        "Usage: node preview.mjs <folder> [--port 4311] [--motion-file animation.html] [--canvas-file canvas.html] [--deck-file deck.html] [--tweaks-file prototype.html] [--text-file document.html] [--image-file artwork.html]",
      );
    const port = Number(flags.port ?? 4311);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("Invalid port");
    const { server, url } = await serve(path.resolve(positional[0]), port, {
      motionFile: flags["motion-file"],
      canvasFile: flags["canvas-file"],
      deckFile: flags["deck-file"],
      tweaksFile: flags["tweaks-file"],
      textFile: flags["text-file"],
      imageFile: flags["image-file"],
    });
    console.log(JSON.stringify({ url, root: path.resolve(positional[0]) }));
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () => server.close());
  });
