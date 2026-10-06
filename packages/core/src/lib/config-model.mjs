import path from "node:path";

export const kinds = ["speech", "image", "video", "transcription", "ocr"];
const methods = ["harness", "local", "provider", "supplied"];
const presets = [
  "podcast",
  "explanation",
  "video-narration",
  "tutorial",
  "summary",
];
const own = (object, key) => Object.hasOwn(object, key);

function object(value, keys, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error(`${label} must be a table/object`);
  for (const key of Object.keys(value))
    if (!keys.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
}
function text(value, label) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 512 ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw new Error(`${label} must be a nonempty, bounded string`);
}
function locale(value) {
  text(value, "language");
  try {
    new Intl.Locale(value);
  } catch {
    throw new Error("language must be a BCP 47 locale");
  }
}
function choice(value, choices, label) {
  if (!choices.includes(value)) throw new Error(`Unsupported ${label}`);
}

export function validatePreferences(value, { partial = false } = {}) {
  object(
    value,
    ["schema_version", "output", "defaults", "audio", "generation"],
    "preferences",
  );
  if ((!partial || own(value, "schema_version")) && value.schema_version !== 1)
    throw new Error("Expected schema_version = 1");
  if (own(value, "output")) {
    object(value.output, ["directory"], "output");
    if (own(value.output, "directory")) {
      text(value.output.directory, "output.directory");
      if (
        /^[a-z][a-z\d+.-]*:\/\//i.test(value.output.directory) ||
        /^(~|\$)/.test(value.output.directory)
      )
        throw new Error(
          "output.directory must be a literal filesystem path, without variable or home expansion",
        );
    }
  }
  if (own(value, "defaults")) {
    object(value.defaults, ["language"], "defaults");
    if (own(value.defaults, "language")) locale(value.defaults.language);
  }
  if (own(value, "audio")) {
    object(value.audio, ["preset"], "audio");
    if (own(value.audio, "preset"))
      choice(value.audio.preset, presets, "audio.preset");
  }
  if (own(value, "generation")) {
    object(value.generation, kinds, "generation");
    for (const [kind, profile] of Object.entries(value.generation)) {
      object(
        profile,
        kind === "speech"
          ? ["method", "capability", "model", "voices"]
          : ["method", "capability", "model"],
        `generation.${kind}`,
      );
      if (own(profile, "method"))
        choice(profile.method, methods, "generation method");
      for (const key of ["capability", "model"])
        if (own(profile, key)) text(profile[key], key);
      if (own(profile, "voices")) {
        const voices = profile.voices;
        object(
          voices,
          Object.keys(voices ?? {}).filter(
            (key) =>
              /^[a-z][a-z\d_-]{0,63}$/.test(key) &&
              !["constructor", "prototype", "__proto__"].includes(key),
          ),
          "voices",
        );
        if (Object.keys(voices).length > 16)
          throw new Error("At most 16 voice roles are supported");
        for (const voice of Object.values(voices)) text(voice, "voice");
      }
      if (
        profile.method === "supplied" &&
        Object.keys(profile).some((key) => key !== "method")
      )
        throw new Error(
          "Supplied media cannot select a generation capability, model or voice",
        );
    }
  }
  return value;
}

export function validateCapabilities(value) {
  object(value, ["schemaVersion", "capabilities"], "capability snapshot");
  if (
    value.schemaVersion !== 1 ||
    !Array.isArray(value.capabilities) ||
    value.capabilities.length > 128
  )
    throw new Error("Expected a bounded schemaVersion 1 capability snapshot");
  const identities = new Set();
  for (const capability of value.capabilities) {
    object(
      capability,
      ["id", "kind", "method", "languages", "voices", "models"],
      "capability",
    );
    text(capability.id, "capability id");
    choice(capability.kind, kinds, "capability kind");
    choice(
      capability.method,
      methods.filter((method) => method !== "supplied"),
      "capability method",
    );
    const identity = `${capability.kind}:${capability.id}`;
    if (identities.has(identity))
      throw new Error("Duplicate capability identity");
    identities.add(identity);
    for (const key of ["languages", "voices", "models"])
      if (own(capability, key)) {
        if (!Array.isArray(capability[key]) || capability[key].length > 256)
          throw new Error(`Expected a bounded ${key} catalog`);
        for (const item of capability[key])
          key === "languages" ? locale(item) : text(item, key);
        if (new Set(capability[key]).size !== capability[key].length)
          throw new Error(`Duplicate ${key} catalog entry`);
      }
  }
  return value;
}

export function mergePreferences(project, request) {
  const result = { schema_version: 1 };
  for (const section of ["output", "defaults", "audio"])
    if (project[section] || request[section])
      result[section] = { ...project[section], ...request[section] };
  if (project.generation || request.generation) {
    result.generation = {};
    for (const kind of kinds) {
      const saved = project.generation?.[kind];
      const explicit = request.generation?.[kind];
      if (!saved && !explicit) continue;
      // Model and voice identifiers belong to the selected backend.
      const changed =
        explicit &&
        ["method", "capability"].some(
          (key) => own(explicit, key) && explicit[key] !== saved?.[key],
        );
      const base = changed ? {} : saved;
      result.generation[kind] = { ...base, ...explicit };
      if (!changed && (saved?.voices || explicit?.voices))
        result.generation[kind].voices = {
          ...saved?.voices,
          ...explicit?.voices,
        };
    }
  }
  return validatePreferences(result);
}

function supportsLanguage(catalog, requested) {
  const wanted = new Intl.Locale(requested).baseName.toLowerCase();
  return catalog.some((item) => {
    const supported = new Intl.Locale(item).baseName.toLowerCase();
    return (
      supported === wanted ||
      (supported === new Intl.Locale(item).language.toLowerCase() &&
        wanted.split("-")[0] === supported)
    );
  });
}

export function resolvePreferences(
  projectRoot,
  project,
  request = {},
  snapshot,
  needs = [],
) {
  validatePreferences(project);
  validatePreferences(request, { partial: true });
  if (snapshot !== undefined) validateCapabilities(snapshot);
  if (!Array.isArray(needs) || new Set(needs).size !== needs.length)
    throw new Error("needs must contain unique capability kinds");
  for (const kind of needs) choice(kind, kinds, "required capability");
  const preferences = mergePreferences(project, request);
  const decisions = [];
  const decision = (code, kind, detail) =>
    decisions.push({ code, ...(kind ? { kind } : {}), ...detail });
  const directory = preferences.output?.directory ?? "designs";
  if (!preferences.output?.directory)
    decision("output_unspecified", null, { suggestedDirectory: "designs" });
  if (
    needs.some((kind) => ["speech", "transcription"].includes(kind)) &&
    !preferences.defaults?.language
  )
    decision("language_unspecified", null, {});
  const generation = {};
  for (const kind of needs) {
    const profile = preferences.generation?.[kind];
    const candidates = snapshot?.capabilities.filter(
      (capability) =>
        capability.kind === kind &&
        (!profile?.method || capability.method === profile.method),
    );
    const report = {
      status: "needs_input",
      candidates: candidates?.map((capability) => capability.id) ?? [],
    };
    generation[kind] = report;
    if (profile?.method === "supplied") {
      report.status = "supplied";
      decision("verify_supplied_media", kind, {});
      continue;
    }
    if (!profile?.method || !profile?.capability) {
      decision("select_capability", kind, { candidates: report.candidates });
      continue;
    }
    if (snapshot === undefined) {
      report.status = "unchecked";
      decision("inspect_session_capabilities", kind, {});
      continue;
    }
    const selected = candidates.find(
      (capability) => capability.id === profile.capability,
    );
    if (!selected) {
      decision("selected_capability_unavailable", kind, {
        selected: profile.capability,
        candidates: report.candidates,
      });
      continue;
    }
    report.status = "ready";
    const verify = (code, detail = {}) => {
      report.status = "needs_input";
      decision(code, kind, detail);
    };
    if (
      preferences.defaults?.language &&
      ["speech", "transcription"].includes(kind)
    ) {
      if (!selected.languages) verify("verify_language_support");
      else if (
        !supportsLanguage(selected.languages, preferences.defaults.language)
      )
        verify("language_unsupported", {
          language: preferences.defaults.language,
        });
    } else if (["speech", "transcription"].includes(kind))
      report.status = "needs_input";
    if (profile.model) {
      if (!selected.models)
        verify("verify_model_support", { model: profile.model });
      else if (!selected.models.includes(profile.model))
        verify("model_unsupported", { model: profile.model });
    }
    if (kind === "speech") {
      const voices = Object.values(profile.voices ?? {});
      if (!voices.length) verify("select_voices");
      else if (!selected.voices) verify("verify_voice_support");
      else
        for (const voice of new Set(voices))
          if (!selected.voices.includes(voice))
            verify("voice_unsupported", { voice });
    }
  }
  return {
    preferences,
    outputDirectory: path.resolve(projectRoot, directory),
    generation,
    decisions,
  };
}
