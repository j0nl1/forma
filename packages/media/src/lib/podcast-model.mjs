import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { safeFile } from "../../../core/src/lib/files.mjs";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const maxSeconds = 7200;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
export function object(value, keys, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  for (const key of Object.keys(value))
    assert(keys.includes(key), `Unknown ${label} field: ${key}`);
}
function text(value, label) {
  assert(
    typeof value === "string" && value.trim().length > 0,
    `${label} must be nonempty text`,
  );
}
function identifier(value, label) {
  assert(
    typeof value === "string" && idPattern.test(value),
    `${label} must be a stable alphanumeric ID`,
  );
}
export function hash(value, label) {
  assert(
    typeof value === "string" && hashPattern.test(value),
    `${label} must be a lowercase SHA-256 hash`,
  );
}
function list(value, maximum, label) {
  assert(
    Array.isArray(value) && value.length > 0 && value.length <= maximum,
    `${label} needs 1..${maximum} entries`,
  );
}
export function relativePath(value) {
  text(value, "File path");
  assert(
    !value.includes("\\") && !/^[a-z][a-z0-9+.-]*:/i.test(value),
    "File paths must be local relative paths",
  );
  return value;
}
export async function boundedBytes(file, maximum) {
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    assert(
      stat.isFile() && stat.size > 0 && stat.size <= maximum,
      `File must contain 1..${maximum} bytes: ${file}`,
    );
    const bytes = Buffer.alloc(stat.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await handle.read(bytes, size, bytes.length - size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    assert(size === stat.size, `File changed while being read: ${file}`);
    return bytes.subarray(0, size);
  } finally {
    await handle.close();
  }
}
export async function readData(file) {
  return JSON.parse(
    (await boundedBytes(file, 4 * 1024 * 1024)).toString("utf8"),
  );
}
export function renderHash(language, segment) {
  return sha256(
    JSON.stringify({ language, speaker: segment.speaker, text: segment.text }),
  );
}
export async function loadEpisode(file) {
  const episodeFile = await fs.realpath(path.resolve(file));
  const root = path.dirname(episodeFile);
  const episode = await readData(episodeFile);
  object(
    episode,
    ["schemaVersion", "language", "timing", "speakers", "sources", "segments"],
    "episode",
  );
  assert(episode.schemaVersion === 1, "Episode schemaVersion must be 1");
  text(episode.language, "Episode language");
  try {
    assert(
      Intl.getCanonicalLocales(episode.language).length === 1,
      "Invalid episode language",
    );
  } catch {
    throw new Error("Episode language must be a valid BCP-47 language tag");
  }
  object(
    episode.timing,
    ["wordsPerMinute", "targetSeconds", "toleranceSeconds"],
    "timing",
  );
  const {
    wordsPerMinute: rate,
    targetSeconds: target,
    toleranceSeconds: tolerance,
  } = episode.timing;
  assert(
    Number.isFinite(rate) && rate > 0 && rate <= 1000,
    "wordsPerMinute must be an explicit estimate in (0, 1000]",
  );
  assert(
    target === undefined ||
      (Number.isFinite(target) && target > 0 && target <= maxSeconds),
    "targetSeconds must be in (0, 7200]",
  );
  assert(
    tolerance === undefined ||
      (target !== undefined &&
        Number.isFinite(tolerance) &&
        tolerance >= 0 &&
        tolerance <= target),
    "toleranceSeconds needs a target and must be in [0, targetSeconds]",
  );
  list(episode.speakers, 12, "Speakers");
  const speakers = new Set();
  for (const speaker of episode.speakers) {
    object(speaker, ["id", "label"], "speaker");
    identifier(speaker.id, "Speaker ID");
    text(speaker.label, "Speaker label");
    assert(!speakers.has(speaker.id), `Duplicate speaker: ${speaker.id}`);
    speakers.add(speaker.id);
  }
  list(episode.sources, 100, "Sources");
  const sources = new Map();
  for (const source of episode.sources) {
    object(source, ["id", "path", "sha256", "anchors"], "source");
    identifier(source.id, "Source ID");
    assert(!sources.has(source.id), `Duplicate source: ${source.id}`);
    hash(source.sha256, "Source sha256");
    const sourceFile = await safeFile(root, relativePath(source.path));
    const bytes = await boundedBytes(sourceFile, 64 * 1024 * 1024);
    assert(
      sha256(bytes) === source.sha256,
      `Source hash mismatch: ${source.id}`,
    );
    list(source.anchors, 10000, "Source anchors");
    const anchors = new Set();
    for (const anchor of source.anchors) {
      object(anchor, ["id", "locator", "text"], "anchor");
      identifier(anchor.id, "Anchor ID");
      text(anchor.locator, "Anchor locator");
      text(anchor.text, "Anchor text");
      assert(
        !anchors.has(anchor.id),
        `Duplicate source anchor: ${source.id}/${anchor.id}`,
      );
      anchors.add(anchor.id);
    }
    sources.set(source.id, anchors);
  }
  list(episode.segments, 2000, "Segments");
  const ids = new Set();
  const segmenter = new Intl.Segmenter(episode.language, {
    granularity: "word",
  });
  const segments = episode.segments.map((segment) => {
    object(segment, ["id", "speaker", "kind", "text", "references"], "segment");
    identifier(segment.id, "Segment ID");
    assert(!ids.has(segment.id), `Duplicate segment: ${segment.id}`);
    ids.add(segment.id);
    assert(
      speakers.has(segment.speaker),
      `Unknown speaker: ${segment.speaker}`,
    );
    assert(
      ["content", "transition"].includes(segment.kind),
      "Segment kind must be content or transition",
    );
    text(segment.text, "Segment text");
    assert(
      segment.text.length <= 50000,
      "Segment text exceeds 50000 characters",
    );
    assert(
      Array.isArray(segment.references),
      "Segment references must be an array",
    );
    assert(
      segment.kind === "transition" || segment.references.length > 0,
      `Content segment needs source references: ${segment.id}`,
    );
    for (const ref of segment.references) {
      object(ref, ["source", "anchor"], "reference");
      assert(
        sources.get(ref.source)?.has(ref.anchor),
        `Unknown source anchor: ${ref.source}/${ref.anchor}`,
      );
    }
    const words = Array.from(segmenter.segment(segment.text)).filter(
      (part) => part.isWordLike,
    ).length;
    assert(words > 0, `Segment needs spoken words: ${segment.id}`);
    return {
      id: segment.id,
      renderHash: renderHash(episode.language, segment),
      words,
      estimatedSeconds: (words / rate) * 60,
    };
  });
  const estimatedSeconds = segments.reduce(
    (sum, segment) => sum + segment.estimatedSeconds,
    0,
  );
  assert(
    estimatedSeconds <= maxSeconds,
    "Estimated episode exceeds 7200 seconds",
  );
  return {
    root,
    episode,
    report: {
      schemaVersion: 1,
      language: episode.language,
      referenceIntegrity: "structural-only",
      estimateBasis:
        "Intl.Segmenter word units at caller-supplied wordsPerMinute; pauses and delivery are not predicted",
      wordsPerMinute: rate,
      estimatedSeconds,
      words: segments.reduce((sum, segment) => sum + segment.words, 0),
      sources: episode.sources.map(({ id, sha256: digest }) => ({
        id,
        sha256: digest,
      })),
      segments,
    },
  };
}
export function timingResult(seconds, timing) {
  const target = timing.targetSeconds ?? null;
  const tolerance = timing.toleranceSeconds ?? null;
  return {
    targetSeconds: target,
    toleranceSeconds: tolerance,
    deviationSeconds: target === null ? null : seconds - target,
    withinTolerance:
      target === null || tolerance === null
        ? null
        : Math.abs(seconds - target) <= tolerance,
  };
}
