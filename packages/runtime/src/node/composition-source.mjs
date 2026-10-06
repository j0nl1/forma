import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import { motionBindings } from "./motion-source.mjs";
import {
  sourceTransaction,
  replaceSource,
} from "../../../core/src/lib/source-transaction.mjs";
import {
  CompositionError,
  parseClipDocument,
  compileComposition,
  moveClip,
} from "../browser/composition-model.js";

const histories = new Map();
const hash = (source) => createHash("sha256").update(source).digest("hex");
const error = (code, message, status = 400) => {
  const value = new CompositionError(code, message);
  value.status = status;
  throw value;
};
async function selectedFile(file) {
  const resolved = path.resolve(file);
  if (
    path.extname(resolved).toLowerCase() !== ".html" ||
    (await fs.realpath(resolved)) !== resolved ||
    !(await fs.stat(resolved)).isFile()
  )
    error(
      "SOURCE_PATH",
      "Composition source must be an explicitly selected regular HTML file without symlinks",
    );
  return resolved;
}

export function compositionBinding(source, { optional = false } = {}) {
  const found = [],
    parseErrors = [];
  const document = parse(source, {
    sourceCodeLocationInfo: true,
    onParseError: (value) => parseErrors.push(value),
  });
  const visit = (node, inTemplate = false) => {
    if (
      node.attrs?.some(
        (item) => item.name === "id" && item.value === "studio-motion-clips",
      )
    )
      found.push({ node, inTemplate });
    for (const child of node.childNodes ?? []) visit(child, inTemplate);
    if (node.content) visit(node.content, true);
  };
  visit(document);
  if (!found.length && optional) return null;
  if (found.length !== 1)
    error(
      "AMBIGUOUS_BINDING",
      "Use exactly one explicit studio-motion-clips JSON script block",
    );
  const { node, inTemplate } = found[0],
    location = node.sourceCodeLocation;
  if (
    inTemplate ||
    node.tagName !== "script" ||
    node.attrs.some((item) => item.name === "src") ||
    node.attrs.find((item) => item.name === "type")?.value !==
      "application/json" ||
    !location?.startTag ||
    !location?.endTag
  )
    error(
      "INVALID_BINDING",
      "studio-motion-clips must be a complete inline application/json script outside templates",
    );
  if (
    parseErrors.some(
      (item) =>
        item.code === "duplicate-attribute" &&
        item.startOffset >= location.startTag.startOffset &&
        item.startOffset <= location.startTag.endOffset,
    )
  )
    error("AMBIGUOUS_BINDING", "Clip script attributes must be unambiguous");
  const start = location.startTag.endOffset,
    end = location.endTag.startOffset;
  return {
    start,
    end,
    document: parseClipDocument(source.slice(start, end)),
    version: hash(source),
  };
}
function inspect(source) {
  const binding = compositionBinding(source),
    timing = motionBindings(source);
  return {
    ...binding,
    scenes: timing.scenes.value,
    playback: timing.playback.value,
    plan: compileComposition({
      scenes: timing.scenes.value,
      clips: binding.document,
    }),
  };
}
function state(file) {
  if (!histories.has(file))
    histories.set(file, { undo: [], redo: [], operations: new Map() });
  return histories.get(file);
}
function result(current, history) {
  return {
    document: current.document,
    clips: current.document.clips,
    scenes: current.scenes,
    playback: current.playback,
    plan: current.plan,
    version: current.version,
    undoDepth:
      history.undo.at(-1)?.afterVersion === current.version
        ? history.undo.length
        : 0,
    redoDepth:
      history.redo.at(-1)?.beforeVersion === current.version
        ? history.redo.length
        : 0,
  };
}
export async function readCompositionSource(file) {
  file = await selectedFile(file);
  return result(inspect(await fs.readFile(file, "utf8")), state(file));
}

// Writes touch only the owned JSON body. Scene/playback literals remain authority.
export async function saveCompositionSource(file, value) {
  file = await selectedFile(file);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) =>
        !["baseVersion", "clipId", "start", "operationId", "action"].includes(
          key,
        ),
    )
  )
    error("INVALID_OPERATION", "Unexpected composition save option");
  if (
    typeof value.baseVersion !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.baseVersion) ||
    typeof value.operationId !== "string" ||
    !/^[A-Za-z0-9_.:-]{1,128}$/.test(value.operationId)
  )
    error(
      "INVALID_OPERATION",
      "Composition saves require baseVersion and a stable operationId",
    );
  const action = value.action ?? "move";
  if (
    !["move", "undo", "redo"].includes(action) ||
    (action === "move"
      ? typeof value.clipId !== "string" || value.start === undefined
      : value.clipId !== undefined || value.start !== undefined)
  )
    error(
      "INVALID_OPERATION",
      "Use move with clipId/start, or undo/redo without clip fields",
    );
  return sourceTransaction(file, async () => {
    await selectedFile(file);
    const source = await fs.readFile(file, "utf8"),
      current = inspect(source),
      history = state(file);
    const request = JSON.stringify(value),
      replay = history.operations.get(value.operationId);
    if (replay) {
      if (replay.request !== request)
        error(
          "OPERATION_REUSED",
          "operationId was already used for a different edit",
          409,
        );
      if (replay.version !== current.version)
        error(
          "SOURCE_CONFLICT",
          "Source changed after this operation; reload before editing",
          409,
        );
      return result(current, history);
    }
    if (value.baseVersion !== current.version)
      error(
        "SOURCE_CONFLICT",
        "Source changed since this composition loaded; reload before editing",
        409,
      );
    let body, record;
    if (action === "move") {
      const document = moveClip(current.document, value.clipId, value.start);
      compileComposition({ scenes: current.scenes, clips: document });
      body = JSON.stringify(document, null, 2).replaceAll("<", "\\u003c");
      if (JSON.stringify(document) === JSON.stringify(current.document))
        body = source.slice(current.start, current.end);
    } else {
      record = history[action].at(-1);
      if (
        !record ||
        (action === "undo" ? record.afterVersion : record.beforeVersion) !==
          current.version
      )
        error(
          "HISTORY_CONFLICT",
          `No matching composition edit to ${action}`,
          409,
        );
      body = action === "undo" ? record.beforeBody : record.afterBody;
    }
    const updated =
      source.slice(0, current.start) + body + source.slice(current.end);
    const next = inspect(updated);
    if (updated !== source) {
      await replaceSource(file, source, updated);
      if (action === "move") {
        if (history.undo.at(-1)?.afterVersion !== current.version)
          history.undo.length = 0;
        history.undo.push({
          beforeVersion: current.version,
          afterVersion: next.version,
          beforeBody: source.slice(current.start, current.end),
          afterBody: body,
        });
        if (history.undo.length > 50) history.undo.shift();
        history.redo.length = 0;
      } else if (action === "undo") {
        history.undo.pop();
        history.redo.push(record);
      } else {
        history.redo.pop();
        history.undo.push(record);
      }
    }
    history.operations.set(value.operationId, {
      request,
      version: next.version,
    });
    if (history.operations.size > 100)
      history.operations.delete(history.operations.keys().next().value);
    return result(next, history);
  });
}
