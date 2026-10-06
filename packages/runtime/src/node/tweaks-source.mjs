import {
  sourceTransaction,
  replaceSource,
} from "../../../core/src/lib/source-transaction.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import { contained } from "../../../core/src/lib/files.mjs";
import { tweakValues, mergeTweaks } from "../browser/controls/tweaks-model.js";
const hash = (value) => createHash("sha256").update(value).digest("hex");
export function tweakBinding(html) {
  const candidates = [];
  const visit = (node) => {
    if (
      node.tagName === "script" &&
      !node.attrs.some((attr) => attr.name === "src")
    ) {
      const location = node.sourceCodeLocation;
      const start = location?.startTag?.endOffset,
        end = location?.endTag?.startOffset;
      if (end === undefined) return;
      const body = html.slice(start, end);
      if (
        node.attrs.some(
          (attr) => attr.name === "id" && attr.value === "codex-tweak-defaults",
        )
      ) {
        if (
          !node.attrs.some(
            (attr) => attr.name === "type" && attr.value === "application/json",
          )
        )
          throw new Error("Tweak defaults script must be application/json");
        candidates.push({ start, end, values: tweakValues(JSON.parse(body)) });
      } else if (
        body.includes("/*EDITMODE-BEGIN*/") ||
        body.includes("/*EDITMODE-END*/")
      ) {
        const open = "/*EDITMODE-BEGIN*/",
          close = "/*EDITMODE-END*/";
        const offset = body.indexOf(open),
          stop = body.indexOf(close);
        if (
          offset < 0 ||
          stop < offset ||
          body.indexOf(open, offset + open.length) >= 0 ||
          body.indexOf(close, stop + close.length) >= 0 ||
          !/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*$/.test(
            body.slice(0, offset),
          )
        )
          throw new Error(
            "Use one JSON EDITMODE block in a literal variable declaration",
          );
        candidates.push({
          start: start + offset + open.length,
          end: start + stop,
          values: tweakValues(
            JSON.parse(body.slice(offset + open.length, stop)),
          ),
        });
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(parse(html, { sourceCodeLocationInfo: true }));
  if (candidates.length !== 1)
    throw new Error(
      "Provide exactly one tweak defaults JSON block in the root HTML document",
    );
  return candidates[0];
}
export async function tweaksSource(root, filename, token) {
  const html = contained(root, await fs.realpath(path.resolve(root, filename)));
  if (path.extname(html) !== ".html")
    throw new Error(
      "Tweak source must be an HTML document inside the preview root",
    );
  let pending = Promise.resolve();
  const read = async () => {
    if (contained(root, await fs.realpath(html)) !== html)
      throw new Error("Tweak source path changed");
    const text = await fs.readFile(html, "utf8");
    return { text, binding: tweakBinding(text), version: hash(text) };
  };
  const metadata = (current) => ({
    values: current.binding.values,
    version: current.version,
    token,
  });
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
          if (req.headers.origin && req.headers.origin !== origin)
            return reply(403, { error: "Origin is not allowed" });
          await pending;
          return reply(200, metadata(await read()));
        }
        if (req.method !== "POST")
          return reply(405, { error: "Method is not allowed" });
        if (
          req.headers.origin !== origin ||
          req.headers["x-codex-tweaks-token"] !== token ||
          req.headers["content-type"] !== "application/json"
        )
          return reply(403, {
            error: "Tweak edits require this preview's origin and token",
          });
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 262144)
            throw new Error("Tweak request is too large");
        }
        const value = JSON.parse(body);
        if (
          Object.keys(value).some((key) => !["version", "edits"].includes(key))
        )
          throw new Error("Unexpected tweak save option");
        const edits = tweakValues(value.edits);
        const save = pending.then(() =>
          sourceTransaction(html, async () => {
            const current = await read();
            if (current.version !== value.version) {
              const error = new Error(
                "Tweak source changed; reload before saving",
              );
              error.status = 409;
              throw error;
            }
            const merged = mergeTweaks(current.binding.values, edits);
            const json = JSON.stringify(merged, null, 2).replace(
              /</g,
              "\\u003c",
            );
            await replaceSource(
              html,
              current.text,
              current.text.slice(0, current.binding.start) +
                json +
                current.text.slice(current.binding.end),
            );
            return metadata(await read());
          }),
        );
        pending = save.catch(() => {});
        reply(200, await save);
      } catch (error) {
        reply(error.status ?? 400, { error: error.message });
      }
    },
  };
}
