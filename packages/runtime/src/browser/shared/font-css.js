export function fontOrigins(value = []) {
  if (!Array.isArray(value))
    throw new Error("fontOrigins must be an array of HTTP(S) origins");
  return [
    ...new Set(
      value.map((origin) => {
        const url = new URL(origin);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        )
          throw new Error(
            "Font origins must contain only an HTTP(S) origin, without credentials, paths or queries",
          );
        return url.origin;
      }),
    ),
  ];
}

export function cssUnescape(value) {
  return value.replace(
    /\\(?:([0-9a-f]{1,6})(?:\r\n|\s)?|(\r\n|\r|\n|\f)|([^\r\n\f]))/gi,
    (_, hex, continuation, character) => {
      if (hex) {
        const point = parseInt(hex, 16);
        return point &&
          point <= 0x10ffff &&
          !(point >= 0xd800 && point <= 0xdfff)
          ? String.fromCodePoint(point)
          : "\ufffd";
      }
      return continuation ? "" : character;
    },
  );
}
export function cssString(value) {
  return (
    '"' +
    String(value).replace(/["\\\n\r\f]/g, (character) =>
      character === '"' || character === "\\"
        ? "\\" + character
        : "\\" + character.codePointAt(0).toString(16) + " ",
    ) +
    '"'
  );
}
const escapedEnd = (text, index) => {
  const match = text
    .slice(index)
    .match(/^\\(?:[0-9a-f]{1,6}(?:\r\n|\s)?|\r\n|.)/is);
  return index + (match?.[0].length ?? 1);
};
export function cssQuoted(text, index = 0) {
  const quote = text[index];
  if (quote !== '"' && quote !== "'") return null;
  let end = index + 1;
  while (end < text.length && text[end] !== quote)
    end = text[end] === "\\" ? escapedEnd(text, end) : end + 1;
  return end < text.length
    ? {
        value: cssUnescape(text.slice(index + 1, end)),
        start: index,
        end: end + 1,
      }
    : null;
}
export function cssURLs(text) {
  const found = [];
  for (let index = 0; index < text.length;) {
    if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 2;
      continue;
    }
    const string = cssQuoted(text, index);
    if (string) {
      index = string.end;
      continue;
    }
    const match = text.slice(index).match(/^url\(\s*/i);
    if (!match || (index && /[\w-]/.test(text[index - 1]))) {
      index++;
      continue;
    }
    const start = index;
    index += match[0].length;
    const quoted = cssQuoted(text, index);
    let value;
    if (quoted) {
      value = quoted.value;
      index = quoted.end;
    } else {
      const from = index;
      while (index < text.length && text[index] !== ")")
        index = text[index] === "\\" ? escapedEnd(text, index) : index + 1;
      value = cssUnescape(text.slice(from, index).trim());
    }
    while (/\s/.test(text[index] ?? "") && index < text.length) index++;
    if (text[index] === ")") {
      index++;
      found.push({ start, end: index, value });
    }
  }
  return found;
}
export async function rewriteCSSURLs(text, transform) {
  const urls = cssURLs(text);
  const values = await Promise.all(
    urls.map(async (item) => transform(item.value)),
  );
  for (let index = urls.length - 1; index >= 0; index--) {
    const item = urls[index];
    if (values[index] != null)
      text =
        text.slice(0, item.start) +
        "url(" +
        cssString(values[index]) +
        ")" +
        text.slice(item.end);
  }
  return text;
}
export function cssImport(params) {
  const start = params.search(/\S/);
  const source =
    cssQuoted(params, start) ??
    cssURLs(params).find((item) => item.start === start);
  if (!source)
    throw new Error(
      "A stylesheet import must begin with a quoted URL or url()",
    );
  let rest = params.slice(source.end).trim();
  const wrappers = [];
  for (const name of ["layer", "supports"]) {
    if (!new RegExp("^" + name + "(?=\\(|\\s|$)", "i").test(rest)) continue;
    let value = "";
    let end = name.length;
    if (rest[end] === "(") {
      let depth = 1,
        cursor = end + 1;
      const from = cursor;
      while (cursor < rest.length && depth) {
        const string = cssQuoted(rest, cursor);
        if (string) {
          cursor = string.end;
          continue;
        }
        if (rest[cursor] === "(") depth++;
        if (rest[cursor] === ")") depth--;
        cursor++;
      }
      if (depth) throw new Error("Unclosed stylesheet import condition");
      value = rest.slice(from, cursor - 1);
      end = cursor;
    }
    if (name === "layer") wrappers.push("@layer" + (value ? " " + value : ""));
    else
      wrappers.push(
        "@supports " +
          (/^(\(|not\s|selector\()/i.test(value) ? value : "(" + value + ")"),
      );
    rest = rest.slice(end).trim();
  }
  if (rest) wrappers.push("@media " + rest);
  return { ...source, wrappers };
}
