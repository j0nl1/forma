// JSON-only state: defaults and edits are data, never executable expressions.
export function tweakValues(input) {
  let nodes = 0;
  const copy = (value, depth) => {
    if (++nodes > 10000 || depth > 20)
      throw new Error("Tweak values are too large or deeply nested");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.length <= 32768) return value;
    if (Array.isArray(value)) return value.map((item) => copy(item, depth + 1));
    if (
      value &&
      typeof value === "object" &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
          if (!key || key.length > 256) throw new Error("Invalid tweak key");
          return [key, copy(item, depth + 1)];
        }),
      );
    throw new Error("Tweak values must contain finite JSON data");
  };
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Tweak defaults must be an object");
  return copy(input, 0);
}
export function mergeTweaks(previous, edits) {
  const next = tweakValues(edits);
  return tweakValues({ ...previous, ...next });
}
export function scrubNumber(initial, distance, step = 1, min, max) {
  step = Number.isFinite(step) && step > 0 ? step : 1;
  const decimals = Math.max(
    0,
    (String(step).split(".")[1]?.split("e")[0].length ?? 0) -
      Number(String(step).split("e")[1] ?? 0),
  );
  const value = Number(
    (Math.round((initial + distance * step) / step) * step).toFixed(
      Math.min(12, decimals),
    ),
  );
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
}
export function tweakOptions(options) {
  return options.map((option) =>
    option && typeof option === "object"
      ? option
      : { label: String(option), value: option },
  );
}
export function segmentedOptions(options) {
  const normalized = tweakOptions(options);
  return (
    normalized.length >= 2 &&
    normalized.length <= 3 &&
    normalized.every(
      (option) =>
        String(option.label).length <= (normalized.length === 2 ? 16 : 10),
    )
  );
}
