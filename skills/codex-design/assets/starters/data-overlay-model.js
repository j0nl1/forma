export const fields = ["metric", "cohort", "window"];
export const elementsOf = (view) =>
  Array.isArray(view?.elements)
    ? view.elements.filter((element) => element && typeof element === "object")
    : [];
export const phraseOK = (text) =>
  typeof text === "string" && /^[\w ,.%+/&()'-]{1,64}$/.test(text);
export const attributeName = (text) =>
  /^[A-Za-z_][A-Za-z0-9_-]*$/.test(text || "") ? text : "data-metric-id";
export const triple = (view = {}) => ({
  metric: String(view.sentence?.metric || view.label || view.id || ""),
  cohort: String(view.sentence?.cohort || ""),
  window: String(view.sentence?.window || ""),
});
export const exactView = (views, want) =>
  views.find((view) => fields.every((key) => triple(view)[key] === want[key]));
export function closestMetric(views, want) {
  return views
    .filter((view) => triple(view).metric === want.metric)
    .reduce((best, view) => {
      const score = (v) =>
        ["cohort", "window"].filter((key) => triple(v)[key] === want[key])
          .length;
      return !best || score(view) > score(best) ? view : best;
    }, null);
}
export function formatNumber(value) {
  if (value == null) return "–";
  const n = Number(value);
  if (!Number.isFinite(n)) return "Invalid";
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
}
export function formatPercent(value) {
  if (value == null) return "–";
  const n = Number(value);
  return Number.isFinite(n)
    ? `${(n * 100).toFixed(Math.abs(n) < 0.1 ? 1 : 0)}%`
    : "Invalid";
}
export const formatter = (spec = {}) =>
  typeof spec.fmt === "function"
    ? spec.fmt
    : spec.fmt === "n"
      ? formatNumber
      : formatPercent;
export function parseColor(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(text);
  if (hex) {
    const digits =
      hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((offset) =>
      parseInt(digits.slice(offset, offset + 2), 16),
    );
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (!rgb) return null;
  const raw = rgb[1].split(",");
  if (raw.some((part) => !part.trim())) return null;
  const parts = raw.map((v) => Number(v.trim()));
  return parts.length >= 3 && parts.length <= 4 && parts.every(Number.isFinite)
    ? parts.slice(0, 3).map((n) => Math.round(Math.max(0, Math.min(255, n))))
    : null;
}
export const rgbString = (channels) => `rgb(${channels.join(",")})`;
export const safeColor = (value) => {
  const color = parseColor(value);
  return color && rgbString(color);
};
const clamp = (n) => Math.max(0, Math.min(1, n));
export function buildRamp(spec = {}, values = []) {
  const numbers = values
    .filter((v) => v != null && Number.isFinite(Number(v)))
    .map(Number);
  let raw =
    Array.isArray(spec.colors) && spec.colors.length
      ? spec.colors
      : spec.hue
        ? ["#F6F4EF", spec.hue]
        : ["#F6F4EF", "#558A42"];
  if (raw.length === 1) raw = ["#F6F4EF", ...raw];
  let cols = raw.map(parseColor);
  if (cols.some((c) => !c))
    cols = [parseColor("#F6F4EF"), parseColor("#558A42")];
  const validDomain =
    Array.isArray(spec.domain) &&
    spec.domain.length >= 2 &&
    spec.domain
      .slice(0, 2)
      .every((n) => n != null && Number.isFinite(Number(n)));
  const lo = validDomain
    ? Number(spec.domain[0])
    : numbers.length
      ? Math.min(...numbers)
      : 0;
  const hi = validDomain
    ? Number(spec.domain[1])
    : numbers.length
      ? Math.max(...numbers)
      : 1;
  const flat = lo === hi,
    distinct = [...new Set(numbers)].sort((a, b) => a - b);
  const base = Number(spec.baseline);
  const diverging =
    cols.length >= 3 &&
    spec.baseline != null &&
    !flat &&
    base > lo &&
    base < hi;
  const quantize = (t) =>
    Number.isFinite(Number(spec.steps)) && spec.steps > 1
      ? Math.round(clamp(t) * (spec.steps - 1)) / (spec.steps - 1)
      : clamp(t);
  const swatch = (t) => {
    const left = cols.length >= 3 ? (t < 0.5 ? cols[0] : cols[1]) : cols[0];
    const right =
      cols.length >= 3 ? (t < 0.5 ? cols[1] : cols[2]) : cols.at(-1);
    const position = cols.length >= 3 ? (t < 0.5 ? t * 2 : (t - 0.5) * 2) : t;
    return rgbString(
      left.map((n, i) => Math.round(n + (right[i] - n) * position)),
    );
  };
  return {
    lo,
    hi: flat ? lo + 1 : hi,
    flat,
    cols,
    flipped: spec.good === "low" && !diverging,
    swatch,
    color(value) {
      const n = Number(value);
      let t = flat
        ? 0.5
        : diverging
          ? n <= base
            ? (0.5 * (n - lo)) / (base - lo)
            : 0.5 + (0.5 * (n - base)) / (hi - base)
          : spec.scale === "quantile" && distinct.length > 1
            ? (distinct.findIndex((v) => v >= n) < 0
                ? distinct.length - 1
                : distinct.findIndex((v) => v >= n)) /
              (distinct.length - 1)
            : (n - lo) / (hi - lo);
      if (!diverging && spec.good === "low") t = 1 - t;
      return swatch(quantize(t));
    },
  };
}
export function metaParts(meta) {
  if (!meta || typeof meta !== "object")
    return { text: "", range: false, about: false };
  const range = typeof meta.range === "string" ? meta.range.trim() : "";
  const about = typeof meta.about === "string" ? meta.about.trim() : "";
  const rangeOK = /^[\w ,.%+/&()'–—→:-]{1,64}$/.test(range);
  const aboutOK = /^[\w ,.%+/&()'–—→:;=-]{1,100}$/.test(about);
  const bits = rangeOK ? [range] : [];
  const n = Number(meta.n);
  const unit =
    meta.unit == null
      ? "rows"
      : typeof meta.unit === "string" &&
          /^[A-Za-z][A-Za-z -]{0,31}$/.test(meta.unit)
        ? meta.unit
        : null;
  if (
    (typeof meta.n === "number" ||
      (typeof meta.n === "string" && meta.n.trim())) &&
    Number.isFinite(n) &&
    n >= 0 &&
    unit
  )
    bits.push(
      `${n >= 1e4 ? formatNumber(n) : Math.round(n).toLocaleString("en-US")} ${unit}`,
    );
  if (aboutOK) bits.push(about);
  return { text: bits.join(" · "), range: rangeOK, about: aboutOK };
}
export function requestFor({ src, mode, active, want }) {
  const id = String(active?.id || "");
  if (mode === "refresh" && !/^[\w.-]{1,64}$/.test(id)) {
    mode = "missing";
    want ??= triple(active);
  }
  const cleanWant = want
    ? Object.fromEntries(
        fields.map((key) => [key, phraseOK(want[key]) ? want[key] : ""]),
      )
    : null;
  const file =
    typeof src === "string" &&
    src.length <= 2048 &&
    !/^(?:data|javascript|blob):/i.test(src) &&
    !/[\x00-\x1f]/.test(src)
      ? src
      : "the overlay data file";
  const text =
    mode === "refresh"
      ? `Refresh view "${id}" in ${file}: re-run its recorded source query for the same population and window, re-anchored to today. Preserve the query definition and every other view. Write real values, basis, a new asOf and recomputed meta (date range, count with its exact unit, and a plain-language about). Derive finding from those values after computing them, then reload the overlay.`
      : `Add a view to ${file} answering ${cleanWant?.metric ? `metric "${cleanWant.metric}"` : "the current product question"}${cleanWant?.cohort ? ` for cohort "${cleanWant.cohort}"` : ""}${cleanWant?.window ? ` over "${cleanWant.window}"` : ""}. Query the real analytics source; never invent values. Record the precise source query, basis, asOf and meta (date range, count with its exact unit, and a plain-language about). Derive finding from the computed values, preserve every existing view, then reload the overlay.`;
  return {
    type: "data-overlay:fetch",
    src: file === "the overlay data file" ? "" : file,
    mode,
    view: /^[\w.-]{1,64}$/.test(id) ? id : "",
    want: cleanWant,
    text,
    fallbackPrompt: text,
  };
}
