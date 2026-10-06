import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { contained } from "../../../core/src/lib/files.mjs";
import { sourceTransaction } from "../../../core/src/lib/source-transaction.mjs";
import {
  IMAGE_STATE_FILE,
  IMAGE_LEGACY_FILE,
  imageValue,
} from "../browser/images/image-model.js";
export async function readImageState(root, directory) {
  if (contained(root, await fs.realpath(directory)) !== directory)
    throw new Error("Image state directory changed.");
  for (const filename of [IMAGE_STATE_FILE, IMAGE_LEGACY_FILE]) {
    const file = path.join(directory, filename);
    try {
      if ((await fs.lstat(file)).isSymbolicLink())
        throw new Error("Image state path changed.");
      if (contained(root, await fs.realpath(file)) !== file)
        throw new Error("Image state path changed.");
      const text = await fs.readFile(file, "utf8");
      const slots = JSON.parse(text);
      if (!slots || typeof slots !== "object" || Array.isArray(slots))
        throw new Error("Image state must be an object keyed by slot id.");
      return { slots, bytes: text, file };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { slots: Object.create(null), bytes: "", file: null };
}
export async function imageSource(root, filename, token) {
  const html = contained(root, await fs.realpath(path.resolve(root, filename)));
  if (path.extname(html) !== ".html")
    throw new Error(
      "Image source must be an HTML document inside the preview root.",
    );
  const directory = path.dirname(html),
    sidecar = path.join(directory, IMAGE_STATE_FILE);
  let pending = Promise.resolve();
  const read = async () => {
    if (contained(root, await fs.realpath(html)) !== html)
      throw new Error("Image source path changed.");
    const value = await readImageState(root, directory);
    return {
      ...value,
      version: createHash("sha256")
        .update((value.file || "") + "\0" + value.bytes)
        .digest("hex"),
    };
  };
  const metadata = (current) => ({
    slots: current.slots,
    version: current.version,
    token,
  });
  await read();
  return {
    html,
    sidecar,
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
          req.headers["x-codex-images-token"] !== token ||
          req.headers["content-type"] !== "application/json"
        )
          return reply(403, {
            error: "Image edits require this preview's origin and token.",
          });
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 32 * 1024 * 1024)
            throw new Error("Image state request is too large.");
          chunks.push(chunk);
        }
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (
          !value ||
          Array.isArray(value) ||
          Object.keys(value).some(
            (key) => !["edits", "version"].includes(key),
          ) ||
          typeof value.version !== "string" ||
          !Array.isArray(value.edits) ||
          !value.edits.length ||
          value.edits.length > 100
        )
          throw new Error("Invalid image save request.");
        const ids = new Set();
        const edits = value.edits.map((edit) => {
          if (
            !edit ||
            Object.keys(edit).some((key) => !["id", "value"].includes(key)) ||
            typeof edit.id !== "string" ||
            !edit.id ||
            edit.id.length > 256 ||
            edit.id.includes("\0") ||
            ids.has(edit.id)
          )
            throw new Error("Invalid or duplicate image edit.");
          ids.add(edit.id);
          return {
            id: edit.id,
            value: edit.value === null ? null : imageValue(edit.value),
          };
        });
        const save = pending.then(() =>
          sourceTransaction(sidecar, async () => {
            const current = await read();
            if (current.version !== value.version) {
              const error = new Error(
                "Image state changed. Download your draft and reload before saving.",
              );
              error.status = 409;
              throw error;
            }
            const slots = Object.assign(Object.create(null), current.slots);
            for (const edit of edits)
              if (edit.value === null) delete slots[edit.id];
              else slots[edit.id] = edit.value;
            const temporary = `${sidecar}.${randomUUID()}.tmp`;
            try {
              await fs.writeFile(
                temporary,
                JSON.stringify(slots, null, 2) + "\n",
                { flag: "wx" },
              );
              if ((await read()).version !== current.version) {
                const error = new Error(
                  "Image state changed while preparing the save.",
                );
                error.status = 409;
                throw error;
              }
              await fs.rename(temporary, sidecar);
            } finally {
              await fs.rm(temporary, { force: true });
            }
            return metadata(await read());
          }),
        );
        pending = save.catch(() => {});
        reply(200, await save);
      } catch (error) {
        reply(error.status || 400, { error: error.message });
      }
    },
  };
}
