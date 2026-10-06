import fs from "node:fs/promises";
import { injectHead } from "../../../core/src/lib/inject-head.mjs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contained } from "../../../core/src/lib/files.mjs";
import {
  sourceTransaction,
  replaceSource,
} from "../../../core/src/lib/source-transaction.mjs";
import { inspectText, applyTextEdits, textVersion } from "./text-bindings.mjs";
import { bundle } from "./build.mjs";
export async function textSource(root, filename, token) {
  const html = contained(root, await fs.realpath(path.resolve(root, filename)));
  if (path.extname(html) !== ".html")
    throw new Error(
      "Text source must be an HTML document inside the preview root.",
    );
  const attribute = `data-codex-text-${token.slice(0, 12)}`;
  const history = [],
    redo = [];
  let pending = Promise.resolve();
  const read = async () => {
    if (contained(root, await fs.realpath(html)) !== html)
      throw new Error("Text source path changed.");
    const source = await fs.readFile(html, "utf8");
    return { source, ...inspectText(source) };
  };
  const metadata = (current) => ({
    version: current.version,
    token,
    filename: path.basename(html),
    entries: current.entries.map(
      ({ start, end, elementEnd, marker, selector, ...entry }) => ({
        ...entry,
        sourceSelector: selector,
        selector: `[${attribute}="${marker}"]`,
      }),
    ),
    undoDepth: history.at(-1)?.after === current.version ? history.length : 0,
    redoDepth: redo.at(-1)?.beforeVersion === current.version ? redo.length : 0,
  });
  await read();
  const folder = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-text-runtime-"),
  );
  let script;
  try {
    const output = path.join(folder, "editor.js");
    await bundle(
      fileURLToPath(new URL("../browser/text-editor.js", import.meta.url)),
      output,
    );
    script = await fs.readFile(output);
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
  return {
    html,
    script,
    inject(source, authoredSource = source) {
      const binding = JSON.stringify(
        metadata({ ...inspectText(authoredSource), source: authoredSource }),
      ).replace(/</g, "\\u003c");
      const additions = `<script type="application/json" id="codex-text-binding" data-codex-injected>${binding}</script><script src="/__codex_text/editor.js" defer data-codex-injected></script>`;
      const marked = new Map(
        inspectText(source).entries.map((entry) => [
          entry.elementEnd,
          entry.marker,
        ]),
      );
      for (const [end, marker] of [...marked].sort((a, b) => b[0] - a[0])) {
        if (!Number.isInteger(end)) continue;
        const offset = source[end - 2] === "/" ? end - 2 : end - 1;
        source =
          source.slice(0, offset) +
          ` ${attribute}="${marker}"` +
          source.slice(offset);
      }
      return injectHead(source, additions);
    },
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
            return reply(403, { error: "Origin is not allowed." });
          await pending;
          return reply(200, metadata(await read()));
        }
        if (req.method !== "POST")
          return reply(405, { error: "Method is not allowed." });
        if (
          req.headers.origin !== origin ||
          req.headers["x-codex-text-token"] !== token ||
          req.headers["content-type"] !== "application/json"
        )
          return reply(403, {
            error: "Text edits require this preview's origin and token.",
          });
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1048576)
            throw new Error("Text edit request is too large.");
          chunks.push(chunk);
        }
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (
          !value ||
          Array.isArray(value) ||
          Object.keys(value).some(
            (key) => !["version", "edits", "action"].includes(key),
          ) ||
          typeof value.version !== "string" ||
          (value.action !== undefined &&
            (!["undo", "redo"].includes(value.action) ||
              value.edits !== undefined))
        )
          throw new Error("Unexpected text save option.");
        const save = pending.then(() =>
          sourceTransaction(html, async () => {
            const current = await read();
            if (value.version !== current.version) {
              const error = new Error(
                "Source changed. Your draft is retained; reload before saving.",
              );
              error.status = 409;
              throw error;
            }
            let updated, record;
            if (value.action === "undo") {
              record = history.at(-1);
              if (!record || record.after !== current.version)
                throw new Error("No matching source edit to undo.");
              updated = record.before;
            } else if (value.action === "redo") {
              record = redo.at(-1);
              if (!record || record.beforeVersion !== current.version)
                throw new Error("No matching source edit to redo.");
              updated = record.afterSource;
            } else updated = applyTextEdits(current.source, value.edits);
            await replaceSource(html, current.source, updated);
            if (value.action === "undo") {
              history.pop();
              redo.push({
                ...record,
                beforeVersion: textVersion(updated),
                afterSource: current.source,
              });
            } else if (value.action === "redo") {
              redo.pop();
              history.push({
                before: current.source,
                after: textVersion(updated),
              });
            } else if (updated !== current.source) {
              if (history.at(-1)?.after !== current.version) history.length = 0;
              history.push({
                before: current.source,
                after: textVersion(updated),
              });
              redo.length = 0;
              if (history.length > 100) history.shift();
            }
            return metadata(await read());
          }),
        );
        pending = save.catch(() => {});
        return reply(200, await save);
      } catch (error) {
        reply(error.status || 400, { error: error.message });
      }
    },
  };
}
