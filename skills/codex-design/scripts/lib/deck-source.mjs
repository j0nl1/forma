import { sourceTransaction, replaceSource } from "./source-transaction.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import { contained } from "./files.mjs";
import {
  validateDeckOperation,
  moveDeckItems,
  editDeckNotes,
} from "../../assets/starters/deck-operations.js";
const versionOf = (html) => createHash("sha256").update(html).digest("hex");
const elements = (node) => [node, ...(node.childNodes ?? []).flatMap(elements)];
const attr = (node, name) => node.attrs?.find((value) => value.name === name);
const escape = (value) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
function inspect(html) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const all = elements(document);
  const deck = all.find((node) => node.tagName === "deck-stage");
  const slides =
    deck?.childNodes?.filter(
      (node) =>
        node.tagName && !["script", "style", "template"].includes(node.tagName),
    ) ?? [];
  if (
    !deck?.sourceCodeLocation?.endTag ||
    !slides.length ||
    slides.some(
      (node) =>
        !node.sourceCodeLocation?.startTag ||
        !node.sourceCodeLocation?.endOffset,
    )
  )
    throw new Error(
      "Deck editing requires literal slides in the first deck-stage HTML element",
    );
  return {
    slides,
    all,
    notes: all.find(
      (node) =>
        node.tagName === "script" &&
        attr(node, "id")?.value === "speaker-notes",
    ),
  };
}
function replacements(html, changes) {
  for (const [start, end, value] of changes.sort((a, b) => b[0] - a[0]))
    html = html.slice(0, start) + value + html.slice(end);
  return html;
}
export function applyDeckSource(html, input) {
  const { slides, all, notes } = inspect(html);
  const operation = validateDeckOperation(input, slides.length);
  if (operation.type === "undo")
    throw new Error("Undo requires the preview's source history");
  const span = (node) => [
    node.sourceCodeLocation.startOffset,
    node.sourceCodeLocation.endOffset,
  ];
  const text = (node) => html.slice(...span(node));
  const changes = [];
  if (operation.type === "move") {
    const ordered = moveDeckItems(slides, operation.from, operation.to);
    slides.forEach((node, index) =>
      changes.push([...span(node), text(ordered[index])]),
    );
  } else if (operation.type === "remove") {
    operation.indices.forEach((index) =>
      changes.push([...span(slides[index]), ""]),
    );
  } else if (operation.type === "skip") {
    const node = slides[operation.index],
      location = node.sourceCodeLocation;
    const existing = location.attrs?.["data-deck-skip"];
    if (existing && !operation.value)
      changes.push([existing.startOffset, existing.endOffset, ""]);
    if (!existing && operation.value) {
      const at = location.startTag.endOffset - 1;
      changes.push([at, at, ' data-deck-skip=""']);
    }
  } else if (operation.type === "duplicate") {
    const node = slides[operation.index],
      [start, end] = span(node);
    const local = [];
    const descendants = elements(node);
    for (const [name, mapping] of [
      ["id", operation.ids],
      ["storage-key", operation.storageKeys],
    ]) {
      const originals = new Set(
        descendants.map((child) => attr(child, name)?.value).filter(Boolean),
      );
      if (Object.keys(mapping).some((key) => !originals.has(key)))
        throw new Error("Duplicate key does not belong to this slide");
      const used = new Set(
        all.map((child) => attr(child, name)?.value).filter(Boolean),
      );
      if (Object.values(mapping).some((value) => used.has(value)))
        throw new Error("Duplicate state key is already in use");
      for (const child of descendants) {
        const original = attr(child, name),
          location = child.sourceCodeLocation?.attrs?.[name];
        if (!original || !location) continue;
        const value = Object.hasOwn(mapping, original.value)
          ? mapping[original.value]
          : null;
        if (name === "id" || value)
          local.push([
            location.startOffset - start,
            location.endOffset - start,
            value ? `${name}="${escape(value)}"` : "",
          ]);
      }
    }
    changes.push([end, end, "\n" + replacements(text(node), local)]);
  }
  if (notes?.sourceCodeLocation?.endTag && operation.type !== "skip") {
    const location = notes.sourceCodeLocation;
    try {
      const values = JSON.parse(
        html.slice(location.startTag.endOffset, location.endTag.startOffset),
      );
      if (
        Array.isArray(values) &&
        values.every((value) => typeof value === "string")
      ) {
        while (values.length < slides.length) values.push("");
        changes.push([
          location.startTag.endOffset,
          location.endTag.startOffset,
          JSON.stringify(editDeckNotes(values, operation)).replace(
            /</g,
            "\\u003c",
          ),
        ]);
      }
    } catch {}
  }
  return replacements(html, changes);
}
export async function deckSource(root, filename, token) {
  const html = contained(root, await fs.realpath(path.resolve(root, filename)));
  if (path.extname(html) !== ".html")
    throw new Error(
      "Deck source must be an HTML document inside the preview root",
    );
  let pending = Promise.resolve();
  const history = [];
  const read = async () => {
    if (contained(root, await fs.realpath(html)) !== html)
      throw new Error("Deck source path changed");
    const source = await fs.readFile(html, "utf8");
    return {
      source,
      version: versionOf(source),
      count: inspect(source).slides.length,
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
      const metadata = (current) => ({
        version: current.version,
        count: current.count,
        token,
        undoDepth: history.length,
      });
      try {
        const origin = `http://${req.headers.host}`;
        if (req.method === "GET") {
          if (req.headers.origin && req.headers.origin !== origin)
            return reply(403, { error: "Origin is not allowed" });
          return reply(200, metadata(await read()));
        }
        if (req.method !== "POST")
          return reply(405, { error: "Method is not allowed" });
        if (
          req.headers.origin !== origin ||
          req.headers["x-codex-deck-token"] !== token ||
          req.headers["content-type"] !== "application/json"
        )
          return reply(403, {
            error: "Deck edits require this preview's origin and token",
          });
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 131072)
            throw new Error("Deck request is too large");
        }
        const value = JSON.parse(body);
        if (
          Object.keys(value).some(
            (key) => !["operation", "version", "count"].includes(key),
          )
        )
          throw new Error("Unexpected deck save option");
        const save = pending.then(() =>
          sourceTransaction(html, async () => {
            const current = await read();
            if (
              value.version !== current.version ||
              value.count !== current.count
            ) {
              const error = new Error(
                "Deck source changed; reload before editing",
              );
              error.status = 409;
              throw error;
            }
            const operation = validateDeckOperation(
              value.operation,
              current.count,
            );
            let source;
            if (operation.type === "undo") {
              const last = history.at(-1);
              if (!last || last.after !== current.version)
                throw new Error("No matching source edit to undo");
              source = last.before;
            } else source = applyDeckSource(current.source, operation);
            await replaceSource(html, current.source, source);
            if (operation.type === "undo") history.pop();
            else {
              history.push({
                before: current.source,
                after: versionOf(source),
              });
              if (history.length > 100) history.shift();
            }
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
