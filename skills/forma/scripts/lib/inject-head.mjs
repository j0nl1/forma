import { parse } from "parse5";
export function injectHead(source, markup) {
  const tree = parse(source, { sourceCodeLocationInfo: true }),
    html = tree.childNodes.find((node) => node.tagName === "html");
  const head = html?.childNodes.find((node) => node.tagName === "head"),
    body = html?.childNodes.find((node) => node.tagName === "body"),
    doctype = tree.childNodes.find((node) => node.nodeName === "#documentType");
  const offset =
    head?.sourceCodeLocation?.startTag?.endOffset ??
    body?.sourceCodeLocation?.startTag?.startOffset ??
    html?.sourceCodeLocation?.startTag?.endOffset ??
    doctype?.sourceCodeLocation?.endOffset ??
    0;
  return source.slice(0, offset) + markup + source.slice(offset);
}
