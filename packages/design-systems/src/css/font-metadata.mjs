import {
  cssQuoted,
  cssUnescape,
} from "../../../runtime/src/browser/shared/font-css.js";
import { splitCSS } from "./css-values.mjs";

const installedFamilies = new Set(
  "sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|cursive|fantasy|emoji|math|fangsong|-apple-system|blinkmacsystemfont|segoe ui|segoe ui web (west european)|segoe ui variable|segoe ui emoji|segoe ui symbol|apple color emoji|roboto|helvetica neue|helvetica|arial|consolas|courier new|courier|menlo|monaco|sf mono|georgia|times new roman|times|cambria|tahoma|verdana|segoe ui mono|liberation mono|noto sans|noto serif|inter".split(
    "|",
  ),
);
export function fontFamilies(value) {
  return splitCSS(value)
    .map((family) => cssQuoted(family)?.value ?? cssUnescape(family))
    .filter(Boolean);
}
export function fontMetadata(faces, tokenDetails) {
  const present = new Set(faces.map((face) => face.family.toLowerCase()));
  const missing = new Map();
  for (const token of tokenDetails) {
    if (
      token.kind !== "font" &&
      !(
        /^--fontFamily/i.test(token.name) ||
        /^--font-(?:family(?:-|$)|body$|heading$|display$|mono$)/i.test(
          token.name,
        )
      )
    )
      continue;
    for (const family of fontFamilies(token.resolvedValue)) {
      const key = family.toLowerCase();
      if (
        installedFamilies.has(key) ||
        present.has(key) ||
        /^(?:var\(|initial$|inherit$|unset$|revert|\$)/i.test(family)
      )
        continue;
      if (!missing.has(key))
        missing.set(key, {
          family,
          status: "no-face",
          tokens: [],
          path: token.definedIn,
        });
      const item = missing.get(key);
      if (!item.tokens.includes(token.name)) item.tokens.push(token.name);
    }
  }
  return { fonts: faces, brandFonts: [...missing.values()] };
}
