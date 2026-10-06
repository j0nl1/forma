import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { contained, write } from "../../../core/src/lib/files.mjs";
import { validateCanvasState } from "../browser/canvas-model.js";
const hash = (value) => createHash("sha256").update(value).digest("hex");
export async function canvasSource(root, filename, token) {
  const html = contained(root, await fs.realpath(path.resolve(root, filename)));
  if (path.extname(html) !== ".html")
    throw new Error(
      "Canvas source must be an HTML document inside the preview root",
    );
  const sidecar = path.join(
    path.dirname(html),
    path.basename(html, ".html") + ".design-canvas.state.json",
  );
  let pending = Promise.resolve();
  const read = async () => {
    if (
      contained(root, await fs.realpath(html)) !== html ||
      (await fs.realpath(path.dirname(sidecar))) !== path.dirname(sidecar)
    )
      throw new Error("Canvas source path changed");
    let bytes = "";
    try {
      if (contained(root, await fs.realpath(sidecar)) !== sidecar)
        throw new Error("Canvas state path changed");
      bytes = await fs.readFile(sidecar, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return {
      state: bytes ? validateCanvasState(JSON.parse(bytes)) : { sections: {} },
      version: hash(await fs.readFile(html)) + ":" + hash(bytes),
      token,
    };
  };
  await read();
  return {
    html,
    async handle(req, res) {
      const reply = (status, value) => {
        res.writeHead(status, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(JSON.stringify(value));
      };
      try {
        const origin = `http://${req.headers.host}`;
        if (req.method === "GET") {
          if (req.headers.origin && req.headers.origin !== origin) {
            reply(403, { error: "Origin is not allowed" });
            return;
          }
          reply(200, await read());
          return;
        }
        if (req.method !== "POST") {
          reply(405, { error: "Method is not allowed" });
          return;
        }
        if (
          req.headers.origin !== origin ||
          req.headers["x-codex-canvas-token"] !== token ||
          req.headers["content-type"] !== "application/json"
        ) {
          reply(403, {
            error: "Canvas edits require this preview's origin and token",
          });
          return;
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 1048576)
            throw new Error("Canvas request is too large");
        }
        const value = JSON.parse(body);
        if (
          Object.keys(value).some((key) => !["state", "version"].includes(key))
        )
          throw new Error("Unexpected canvas save option");
        const state = validateCanvasState(value.state);
        const save = pending.then(async () => {
          const current = await read();
          if (
            typeof value.version !== "string" ||
            value.version !== current.version
          ) {
            const error = new Error(
              "Canvas source changed; reload before saving",
            );
            error.status = 409;
            throw error;
          }
          await write(sidecar, JSON.stringify(state, null, 2) + "\n");
          return read();
        });
        pending = save.catch(() => {});
        reply(200, await save);
      } catch (error) {
        reply(error.status ?? 400, { error: error.message });
      }
    },
  };
}
