import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import { write } from "./files.mjs";
import {
  parseScenes,
  parsePlayback,
} from "../../assets/starters/motion-model.js";

const version = (html) => createHash("sha256").update(html).digest("hex");

// Source editing addresses dedicated declarative scripts, never arbitrary JS.
// JSON string literals are decoded as data; imported scripts are not evaluated.
export function motionBindings(html) {
  const bindings = {};
  const document = parse(html, { sourceCodeLocationInfo: true });
  const visit = (node) => {
    if (
      node.tagName === "script" &&
      !node.attrs.some(
        (a) =>
          a.name === "src" ||
          (a.name === "type" && a.value !== "text/javascript"),
      )
    ) {
      const location = node.sourceCodeLocation;
      const start = location.startTag.endOffset,
        end = location.endTag?.startOffset;
      const body = html.slice(start, end);
      // Restrict these scripts to assignments. Comments, executable statements,
      // and ambiguous duplicate bindings require a deliberate source edit.
      const expression =
        /\s*window\.(CODEX_SCENES|CODEX_PLAYBACK|OM_SCENES|OM_PLAYBACK)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*;\s*/gy;
      let cursor = 0;
      const found = [];
      while (cursor < body.length) {
        if (!body.slice(cursor).trim()) break;
        expression.lastIndex = cursor;
        const match = expression.exec(body);
        if (!match) {
          found.length = 0;
          break;
        }
        const literal = match[2];
        // Double quotes use JSON escaping. Single quotes support the reference
        // convention with unescaped JSON double quotes and escaped apostrophes.
        let raw;
        if (literal.startsWith('"')) raw = JSON.parse(literal);
        else {
          const inner = literal.slice(1, -1);
          let decoded = "";
          for (let i = 0; i < inner.length; i++) {
            if (inner[i] !== "\\") {
              decoded += inner[i];
              continue;
            }
            const next = inner[++i];
            const escapes = {
              n: "\n",
              r: "\r",
              t: "\t",
              b: "\b",
              f: "\f",
              "'": "'",
              '"': '"',
              "\\": "\\",
            };
            if (Object.hasOwn(escapes, next)) decoded += escapes[next];
            else if (
              next === "u" &&
              /^[\da-f]{4}$/i.test(inner.slice(i + 1, i + 5))
            ) {
              decoded += String.fromCharCode(
                parseInt(inner.slice(i + 1, i + 5), 16),
              );
              i += 4;
            } else
              throw new Error(
                "Unsupported escape in timing literal; use JSON.stringify encoding",
              );
          }
          raw = decoded;
        }
        const role = match[1].endsWith("SCENES") ? "scenes" : "playback";
        const offset = match.index + match[0].indexOf(literal);
        found.push({
          role,
          name: match[1],
          value: role === "scenes" ? parseScenes(raw) : parsePlayback(raw),
          start: start + offset,
          end: start + offset + literal.length,
        });
        cursor = expression.lastIndex;
      }
      for (const item of found) {
        if (bindings[item.role])
          throw new Error(`Duplicate ${item.role} binding`);
        bindings[item.role] = item;
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(document);
  if (!bindings.scenes || !bindings.playback)
    throw new Error(
      "Use dedicated plain inline scripts with scene and playback JSON string assignments",
    );
  return { ...bindings, version: version(html) };
}
export async function readMotionSource(file) {
  const binding = motionBindings(await fs.readFile(file, "utf8"));
  return {
    scenes: binding.scenes.value,
    playback: binding.playback.value,
    version: binding.version,
  };
}
export async function saveMotionSource(file, value) {
  const scenes = parseScenes(value.scenes),
    playback = parsePlayback(value.playback);
  const html = await fs.readFile(file, "utf8");
  const binding = motionBindings(html);
  if (value.version !== binding.version) {
    const error = new Error(
      "Source changed since this preview loaded. Reload before applying timing.",
    );
    error.status = 409;
    throw error;
  }
  let updated = html;
  for (const role of ["scenes", "playback"].sort(
    (a, b) => binding[b].start - binding[a].start,
  )) {
    const serialized = JSON.stringify(
      JSON.stringify(role === "scenes" ? scenes : playback),
    ).replaceAll("<", "\\u003c");
    updated =
      updated.slice(0, binding[role].start) +
      serialized +
      updated.slice(binding[role].end);
  }
  await write(file, updated);
  return { version: version(updated) };
}
