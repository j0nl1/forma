export const blockedTextTags = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "textarea",
  "select",
  "option",
  "input",
  "iframe",
  "object",
  "embed",
  "canvas",
  "text-editor",
]);
export const leafTextTags = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "a",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "small",
  "mark",
  "q",
  "cite",
  "abbr",
  "label",
  "button",
  "li",
  "dt",
  "dd",
  "td",
  "th",
  "figcaption",
  "blockquote",
  "summary",
  "text",
  "tspan",
]);
export function textKey(selector, gap) {
  return `${selector}@${gap}`;
}
export function escapedText(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
export function validateTextEdits(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw new Error("Provide between 1 and 100 text edits.");
  const seen = new Set();
  return value.map((edit) => {
    if (
      !edit ||
      typeof edit !== "object" ||
      Array.isArray(edit) ||
      Object.keys(edit).some((key) => !["key", "text"].includes(key)) ||
      typeof edit.key !== "string" ||
      typeof edit.text !== "string" ||
      edit.text.includes("\0") ||
      !edit.text.isWellFormed() ||
      seen.has(edit.key)
    )
      throw new Error("Invalid or duplicate text edit.");
    seen.add(edit.key);
    return { key: edit.key, text: edit.text.replace(/\r\n?/g, "\n") };
  });
}
