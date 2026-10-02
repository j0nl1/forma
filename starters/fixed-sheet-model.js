import { length, pixels } from "./document-model.js";
export const sheetOwners =
  "doc-page,design-canvas,deck-stage,motion-stage,three-d-stage,three-stage,chart-stage,social-frames,file-window,ios-shell,chrome-shell,post-card,instagram-story,x-shell,instagram-shell,tiktok-shell,facebook-shell,linkedin-shell,pinterest-shell,reddit-shell,youtube-shell";
export const sheetChrome =
  "script,style,link,meta,template,[hidden],[data-doc-controls],[data-codex-chrome],text-editor";
function absolute(value, element, seen = new Set()) {
  const direct = pixels(length(value));
  if (Number.isFinite(direct)) return direct;
  const variable = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value.trim());
  if (!variable || seen.has(variable[1])) return NaN;
  seen.add(variable[1]);
  return absolute(
    getComputedStyle(element).getPropertyValue(variable[1]),
    element,
    seen,
  );
}
function rules(sheets, visit, seen = new Set(), includeInactive = false) {
  for (const sheet of sheets) {
    if (
      !sheet ||
      seen.has(sheet) ||
      sheet.ownerNode?.hasAttribute("data-codex-injected") ||
      sheet.disabled
    )
      continue;
    seen.add(sheet);
    if (
      !includeInactive &&
      sheet.media?.mediaText &&
      !matchMedia(sheet.media.mediaText).matches
    )
      continue;
    let list;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    walk(list);
  }
  function walk(list) {
    for (const rule of list) {
      if (rule.type === CSSRule.IMPORT_RULE)
        rules([rule.styleSheet], visit, seen, includeInactive);
      else if (rule.type === CSSRule.MEDIA_RULE) {
        if (includeInactive || matchMedia(rule.conditionText).matches)
          walk(rule.cssRules);
      } else if (rule.type === CSSRule.SUPPORTS_RULE) {
        if (CSS.supports(rule.conditionText)) walk(rule.cssRules);
      } else {
        visit(rule);
        if (rule.cssRules) walk(rule.cssRules);
      }
    }
  }
}
function fixedWidth(element) {
  const used = parseFloat(getComputedStyle(element).width);
  const matches = (value) => {
    const px = absolute(value, element);
    return px > 0 && Math.abs(px - used) < 0.1;
  };
  if (matches(element.style.width)) return true;
  if (["svg", "canvas", "img", "table"].includes(element.localName)) {
    const attribute = element.getAttribute("width") || "";
    if (
      matches(/^\d+(?:\.\d+)?$/.test(attribute) ? `${attribute}px` : attribute)
    )
      return true;
  }
  let found = false;
  rules(document.styleSheets, (rule) => {
    try {
      if (
        rule.selectorText &&
        element.matches(rule.selectorText) &&
        matches(rule.style.width)
      )
        found = true;
    } catch {
      /* Unsupported selectors cannot establish a fixed sheet. */
    }
  });
  return found;
}
export function authoredPageRule() {
  let found = false;
  rules(
    document.styleSheets,
    (rule) => {
      if (
        rule.type === CSSRule.PAGE_RULE &&
        (rule.style.size || rule.style.margin)
      )
        found = true;
    },
    new Set(),
    true,
  );
  return found;
}
export function findFixedSheet() {
  if (
    document.querySelector(sheetOwners) ||
    document.querySelector(
      'meta[name="design_doc_mode"][content="canvas"],meta[name="codex-fixed-sheet"][content="off"]',
    ) ||
    window.codexTimeline ||
    window.__animStage
  )
    return { reason: "owned", root: null };
  const visible = [...document.body.children].filter(
    (node) =>
      !node.matches(sheetChrome) && getComputedStyle(node).display !== "none",
  );
  const marked = visible.filter((node) =>
    node.hasAttribute("data-fixed-sheet"),
  );
  const root =
    marked.length === 1 ? marked[0] : visible.length === 1 ? visible[0] : null;
  if (root && fixedWidth(root)) return { reason: "fixed", root };
  if (!marked.length && fixedWidth(document.body))
    return { reason: "fixed", root: document.body };
  return { reason: visible.length > 1 ? "ambiguous" : "fluid", root: null };
}
export function sheetBox(element) {
  const style = getComputedStyle(element);
  const extra = (names) =>
    names.reduce((sum, name) => sum + (parseFloat(style[name]) || 0), 0);
  const borderBox = style.boxSizing === "border-box";
  const width =
    parseFloat(style.width) +
    (borderBox
      ? 0
      : extra([
          "paddingLeft",
          "paddingRight",
          "borderLeftWidth",
          "borderRightWidth",
        ]));
  const height =
    parseFloat(style.height) +
    (borderBox
      ? 0
      : extra([
          "paddingTop",
          "paddingBottom",
          "borderTopWidth",
          "borderBottomWidth",
        ]));
  const zoom = Number(style.zoom) || 1;
  return width > 0 && height > 0 && [width, height, zoom].every(Number.isFinite)
    ? { width, height, zoom }
    : null;
}
