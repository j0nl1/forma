import { resolveTokens } from "./system-css-values.mjs";

const namedColors = new Set([
  "transparent",
  "currentcolor",
  "black",
  "white",
  "red",
  "green",
  "blue",
  "gray",
  "grey",
  "rebeccapurple",
]);
const colorFunction =
  /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color|color-mix|light-dark)\(/i;
export function tokenKind(value) {
  const text = value.trim();
  const color =
    /#[0-9a-f]{3,8}\b/i.test(text) ||
    colorFunction.test(text) ||
    namedColors.has(text.toLowerCase());
  const length =
    /(?:^|[\s,(])-?\d*\.?\d+(?:px|rem|em|vh|vw|vmin|vmax|pt|cm|mm|in|ch|ex)\b/i.test(
      text,
    );
  if (color && length) return "shadow";
  if (color) return "color";
  if (length || /^-?\d*\.?\d+%$/.test(text)) return "spacing";
  return "other";
}
export function tokenMetadata(declarations) {
  const tokens = Object.fromEntries(
    declarations.map((entry) => [entry.name, entry.value]),
  );
  const resolution = resolveTokens(tokens),
    unclassified = [],
    tokenKinds = {};
  const tokenDetails = declarations.map((entry) => {
    const resolvedValue = resolution.resolve(entry.value, [entry.name]);
    const kind = entry.annotation ?? tokenKind(resolvedValue);
    if (kind === "other" && !entry.annotation) unclassified.push(entry.name);
    tokenKinds[kind] = (tokenKinds[kind] ?? 0) + 1;
    return { ...entry, kind, resolvedValue };
  });
  return {
    tokens,
    tokenDetails,
    tokenKinds,
    unclassified: [...new Set(unclassified)],
    issues: resolution.issues,
  };
}
