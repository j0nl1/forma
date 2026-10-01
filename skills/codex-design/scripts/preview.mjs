#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, contained, main } from "./lib/files.mjs";
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
  ".pdf": "application/pdf",
};
export async function serve(root, port = 4311) {
  root = await fs.realpath(root);
  const server = http.createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? "")) {
        res.writeHead(403);
        res.end();
        return;
      }
      const decoded = decodeURIComponent((req.url ?? "/").split("?")[0]);
      if (
        decoded.includes("\0") ||
        decoded.split("/").some((part) => part.startsWith("."))
      )
        throw new Error("Invalid or hidden path");
      let file = contained(root, path.resolve(root, "." + decoded));
      const stat = await fs.stat(file);
      if (stat.isDirectory()) file = path.join(file, "index.html");
      file = contained(root, await fs.realpath(file));
      const data = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
        "Content-Length": data.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
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
    });
    if (positional.length !== 1)
      throw new Error("Usage: node preview.mjs <folder> [--port 4311]");
    const port = Number(flags.port ?? 4311);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("Invalid port");
    const { server, url } = await serve(path.resolve(positional[0]), port);
    console.log(JSON.stringify({ url, root: path.resolve(positional[0]) }));
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () => server.close());
  });
