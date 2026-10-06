import { deriveScenes, authoredTime, clamp } from "./motion-model.js";

export class CompositionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CompositionError";
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new CompositionError(code, message);
};
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const idPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const maxBytes = 1048576;
const keys = (value, allowed, label) => {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    fail("INVALID_FIELD", `${label} contains unsupported fields`);
};
function jsonData(value, parents = new Set(), depth = 0) {
  if (depth > 40) fail("INVALID_JSON", "Clip JSON nesting exceeds 40 levels");
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    finite(value)
  )
    return;
  if (typeof value !== "object" || parents.has(value))
    fail("INVALID_JSON", "Clips must contain finite JSON data without cycles");
  const proto = Object.getPrototypeOf(value);
  if (
    Array.isArray(value)
      ? proto !== Array.prototype
      : proto !== Object.prototype && proto !== null
  )
    fail("INVALID_JSON", "Clip data must use plain JSON objects");
  parents.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    if (
      Array.isArray(value) &&
      (typeof key !== "string" ||
        !/^(0|[1-9]\d*)$/.test(key) ||
        Number(key) >= value.length)
    )
      fail("INVALID_JSON", "Clip JSON arrays cannot contain named properties");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      fail(
        "INVALID_JSON",
        "Clip data cannot contain accessors or hidden properties",
      );
    jsonData(descriptor.value, parents, depth + 1);
  }
  if (Array.isArray(value) && Object.keys(value).length !== value.length)
    fail(
      "INVALID_JSON",
      "Clip JSON arrays cannot contain holes or named properties",
    );
  parents.delete(value);
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function validateStart(start, label) {
  jsonData(start);
  if (finite(start) && start >= 0) return;
  keys(start, ["after", "offset"], label);
  if (
    typeof start.after !== "string" ||
    !idPattern.test(start.after) ||
    !finite(start.offset)
  )
    fail(
      "INVALID_START",
      `${label} must be nonnegative seconds or {after: clipId, offset: finite seconds}`,
    );
}

// JSON.parse accepts duplicate object keys. Reject that ambiguity as data,
// including escaped spellings of the same key, without evaluating anything.
function uniqueJsonKeys(source) {
  const tokens = /"(?:\\.|[^"\\])*"|[{}\[\]]/g;
  const stack = [];
  for (const match of source.matchAll(tokens)) {
    const token = match[0];
    if (token === "{" || token === "[")
      stack.push(token === "{" ? new Set() : null);
    else if (token === "}" || token === "]") stack.pop();
    else if (
      stack.at(-1) &&
      /^\s*:/.test(source.slice(match.index + token.length))
    ) {
      const key = JSON.parse(token),
        seen = stack.at(-1);
      if (seen.has(key))
        fail("DUPLICATE_FIELD", `Duplicate JSON field: ${key}`);
      seen.add(key);
    }
  }
}

// Data-only parsing is shared by browser authoring and exact source edits.
export function parseClipDocument(raw) {
  if (typeof raw === "string") {
    if (new TextEncoder().encode(raw).length > maxBytes)
      fail("DOCUMENT_TOO_LARGE", "Clip JSON exceeds 1 MiB");
    const source = raw;
    try {
      raw = JSON.parse(source);
    } catch {
      fail("INVALID_JSON", "Clip document must contain valid JSON");
    }
    uniqueJsonKeys(source);
  }
  jsonData(raw);
  const serialized = JSON.stringify(raw);
  if (new TextEncoder().encode(serialized).length > maxBytes)
    fail("DOCUMENT_TOO_LARGE", "Clip JSON exceeds 1 MiB");
  const document = JSON.parse(serialized);
  keys(document, ["schemaVersion", "clips"], "Clip document");
  if (document.schemaVersion !== 1)
    fail("SCHEMA_VERSION", "Clip schemaVersion must be 1");
  if (!Array.isArray(document.clips) || document.clips.length > 500)
    fail("CLIP_COUNT", "Use an array of at most 500 clips");
  const ids = new Set();
  for (const clip of document.clips) {
    keys(
      clip,
      [
        "id",
        "kind",
        "timeBasis",
        "start",
        "duration",
        "track",
        "params",
        "text",
        "media",
      ],
      "Clip",
    );
    if (typeof clip.id !== "string" || !idPattern.test(clip.id))
      fail(
        "INVALID_ID",
        "Clip IDs must start with a letter and contain at most 128 identifier characters",
      );
    if (ids.has(clip.id)) fail("DUPLICATE_ID", `Duplicate clip ID: ${clip.id}`);
    ids.add(clip.id);
    if (!["visual", "caption", "audio", "video"].includes(clip.kind))
      fail("INVALID_KIND", `Unsupported clip kind: ${clip.id}`);
    if (!["authored", "playback"].includes(clip.timeBasis))
      fail(
        "INVALID_TIME_BASIS",
        `Clip ${clip.id} needs authored or playback timeBasis`,
      );
    validateStart(clip.start, `Clip ${clip.id} start`);
    if (!finite(clip.duration) || clip.duration <= 0)
      fail(
        "INVALID_DURATION",
        `Clip ${clip.id} needs a finite positive duration`,
      );
    if (!Number.isInteger(clip.track) || clip.track < 0 || clip.track > 255)
      fail(
        "INVALID_TRACK",
        `Clip ${clip.id} track must be an integer from 0 to 255`,
      );
    if (
      clip.kind === "caption"
        ? typeof clip.text !== "string"
        : clip.text !== undefined
    )
      fail(
        "INVALID_CAPTION",
        `Only caption clips carry required text: ${clip.id}`,
      );
    if (["audio", "video"].includes(clip.kind)) {
      if (
        !object(clip.media) ||
        typeof clip.media.src !== "string" ||
        !clip.media.src.trim()
      )
        fail("INVALID_MEDIA", `Media clip ${clip.id} needs media.src`);
      keys(
        clip.media,
        [
          "src",
          "sourceStart",
          "sourceDuration",
          "playbackRate",
          "gain",
          "loop",
          "audio",
          "fadeIn",
          "fadeOut",
          "volumeEnvelope",
          "bus",
        ],
        `Clip ${clip.id} media`,
      );
      const media = clip.media,
        src = media.src;
      if (
        /[\\\u0000-\u001f]/.test(src) ||
        src !== src.trim() ||
        src.startsWith("/") ||
        (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(src) &&
          !src.startsWith("blob:") &&
          !/^data:(audio|video)\//i.test(src))
      )
        fail(
          "INVALID_MEDIA",
          `Clip ${clip.id} media.src must be a relative local, audio/video data, or blob source`,
        );
      for (const field of [
        "sourceStart",
        "sourceDuration",
        "playbackRate",
        "gain",
        "fadeIn",
        "fadeOut",
      ])
        if (
          media[field] !== undefined &&
          (!finite(media[field]) ||
            media[field] < 0 ||
            (["sourceDuration", "playbackRate"].includes(field) &&
              media[field] === 0) ||
            (["playbackRate", "gain"].includes(field) && media[field] > 16) ||
            (["fadeIn", "fadeOut"].includes(field) &&
              media[field] > clip.duration))
        )
          fail("INVALID_MEDIA", `Clip ${clip.id} has invalid media.${field}`);
      for (const field of ["loop", "audio"])
        if (media[field] !== undefined && typeof media[field] !== "boolean")
          fail(
            "INVALID_MEDIA",
            `Clip ${clip.id} media.${field} must be boolean`,
          );
      if (media.loop && media.sourceDuration === undefined)
        fail(
          "INVALID_MEDIA",
          `Looping clip ${clip.id} requires an explicit sourceDuration span`,
        );
      if (
        media.bus !== undefined &&
        (typeof media.bus !== "string" || !idPattern.test(media.bus))
      )
        fail(
          "INVALID_MEDIA",
          `Clip ${clip.id} media.bus must be a stable identifier`,
        );
      if (media.volumeEnvelope !== undefined) {
        if (
          !Array.isArray(media.volumeEnvelope) ||
          media.volumeEnvelope.length > 500
        )
          fail(
            "INVALID_MEDIA",
            `Clip ${clip.id} volumeEnvelope needs at most 500 points`,
          );
        let previous = -1;
        for (const point of media.volumeEnvelope) {
          keys(
            point,
            ["time", "value"],
            `Clip ${clip.id} volumeEnvelope point`,
          );
          if (
            !finite(point.time) ||
            point.time < 0 ||
            point.time > clip.duration ||
            point.time <= previous ||
            !finite(point.value) ||
            point.value < 0 ||
            point.value > 16
          )
            fail(
              "INVALID_MEDIA",
              `Clip ${clip.id} volumeEnvelope points need strictly increasing local times and values from 0 to 16`,
            );
          previous = point.time;
        }
      }
    } else if (clip.media !== undefined)
      fail(
        "INVALID_MEDIA",
        `Only audio and video clips carry media: ${clip.id}`,
      );
  }
  return freeze(document);
}

// This is the inverse of native authoredTime, including exact section edges.
export function playbackTime(derived, time) {
  if (!finite(time))
    fail("INVALID_TIME", "Authored time must be finite seconds");
  time = clamp(time, 0, derived.authoredTotal);
  const section =
    derived.sections.find((s) => time < s.authoredStart + s.natural) ??
    derived.sections.at(-1);
  return (
    section.start +
    clamp((time - section.authoredStart) / section.natural) * section.dur
  );
}
export function compileComposition({ scenes, clips }) {
  const derived = deriveScenes(scenes);
  if (
    !finite(derived.duration) ||
    !finite(derived.authoredTotal) ||
    derived.sections.some(
      (section) =>
        !finite(section.natural / section.dur) ||
        section.natural / section.dur <= 0,
    )
  )
    fail(
      "INVALID_SCENES",
      "Composition scene totals and time mapping rates must remain finite and positive",
    );
  const document = parseClipDocument(
    Array.isArray(clips) ? { schemaVersion: 1, clips } : clips,
  );
  const entries = new Map(document.clips.map((clip) => [clip.id, clip]));
  const resolved = new Map(),
    visiting = new Set();
  const resolve = (clip) => {
    if (resolved.has(clip.id)) return resolved.get(clip.id);
    if (visiting.has(clip.id))
      fail("REFERENCE_CYCLE", `Clip timing reference cycle at ${clip.id}`);
    visiting.add(clip.id);
    let start = clip.start;
    if (object(start)) {
      const target = entries.get(start.after);
      if (!target)
        fail(
          "MISSING_REFERENCE",
          `Clip ${clip.id} references missing clip ${start.after}`,
        );
      if (target.timeBasis !== clip.timeBasis)
        fail(
          "CROSS_TIME_BASIS",
          `Clip ${clip.id} references a different time basis; use an explicit numeric start`,
        );
      start = resolve(target).end + start.offset;
    }
    const total =
      clip.timeBasis === "authored" ? derived.authoredTotal : derived.duration;
    const precision = Number.EPSILON * 8 * Math.max(1, total, Math.abs(start));
    if (start < 0 && start >= -precision) start = 0;
    let end = start + clip.duration;
    if (end > total && end <= total + precision) end = total;
    if (
      !finite(start) ||
      start < 0 ||
      !finite(end) ||
      end <= start ||
      end > total
    )
      fail(
        "CLIP_OUT_OF_RANGE",
        `Clip ${clip.id} must fit within its ${clip.timeBasis} timeline (0..${total})`,
      );
    const windows = [];
    derived.sections.forEach((section, sectionIndex) => {
      const authored = clip.timeBasis === "authored";
      const sectionStart = authored ? section.authoredStart : section.start;
      const sectionEnd =
        sectionStart + (authored ? section.natural : section.dur);
      const from = Math.max(start, sectionStart),
        to = Math.min(end, sectionEnd);
      if (to <= from) return;
      const authoredStart = authored ? from : authoredTime(derived, from);
      const authoredEnd = authored ? to : authoredTime(derived, to);
      windows.push({
        sectionIndex,
        authoredStart,
        authoredEnd,
        playbackStart: authored ? playbackTime(derived, from) : from,
        playbackEnd: authored ? playbackTime(derived, to) : to,
        localStart: from - start,
        localEnd: to - start,
        rate: authored ? section.natural / section.dur : 1,
      });
    });
    const result = {
      ...clip,
      start,
      end,
      windows,
      playbackStart: windows[0].playbackStart,
      playbackEnd: windows.at(-1).playbackEnd,
      authoredStart: windows[0].authoredStart,
      authoredEnd: windows.at(-1).authoredEnd,
    };
    visiting.delete(clip.id);
    resolved.set(clip.id, result);
    return result;
  };
  return freeze({
    schemaVersion: 1,
    ...derived,
    clips: document.clips.map(resolve),
  });
}
export function clipFrame(plan, id, time) {
  if (!finite(time))
    fail("INVALID_TIME", "Playback time must be finite seconds");
  const clip = plan.clips.find((item) => item.id === id);
  if (!clip) fail("UNKNOWN_CLIP", `Unknown clip: ${id}`);
  const basisTime =
    clip.timeBasis === "authored" ? authoredTime(plan, time) : time;
  const localTime = basisTime - clip.start;
  const media = clip.media;
  let sourceTime;
  if (media) {
    const sourceLocal = Math.max(0, localTime) * (media.playbackRate ?? 1);
    sourceTime =
      (media.sourceStart ?? 0) +
      (media.sourceDuration === undefined
        ? sourceLocal
        : media.loop
          ? sourceLocal % media.sourceDuration
          : Math.min(sourceLocal, media.sourceDuration));
  }
  return freeze({
    id,
    timeBasis: clip.timeBasis,
    basisTime,
    localTime,
    progress: clamp(localTime / clip.duration),
    visible:
      time >= 0 &&
      time < plan.duration &&
      basisTime >= clip.start &&
      basisTime < clip.end,
    duration: clip.duration,
    start: clip.start,
    end: clip.end,
    ...(media ? { sourceTime } : {}),
  });
}
export function moveClip(raw, clipId, start) {
  const document = parseClipDocument(raw);
  validateStart(start, `Clip ${clipId} start`);
  if (!document.clips.some((clip) => clip.id === clipId))
    fail("UNKNOWN_CLIP", `Unknown clip: ${clipId}`);
  return parseClipDocument({
    schemaVersion: 1,
    clips: document.clips.map((clip) =>
      clip.id === clipId ? { ...clip, start } : clip,
    ),
  });
}
