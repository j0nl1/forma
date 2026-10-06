import { applyGridChildLayout, applyGridLayout } from "./figma-grid.mjs";

const axis = (node) =>
  ["HORIZONTAL", "VERTICAL"].includes(node?.stackMode) ? node.stackMode : null;
const finite = (value, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const rotated = (node) =>
  Math.abs(finite(node?.transform?.m01)) > 0.00001 ||
  Math.abs(finite(node?.transform?.m10)) > 0.00001;
const ignored = new Set([
  "VARIABLE",
  "VARIABLE_SET",
  "STYLE",
  "VARIABLE_OVERRIDE",
  "STICKY",
  "WIDGET",
  "SLICE",
]);
const children = (node) =>
  (Array.isArray(node.children) ? node.children : []).filter(
    (child) =>
      !ignored.has(child.type) &&
      !child.internalOnly &&
      child.visible !== false &&
      child.stackPositioning !== "ABSOLUTE",
  );
function padding(node) {
  return [
    node.stackPaddingTop ?? node.stackVerticalPadding ?? 0,
    node.stackPaddingRight ?? node.stackHorizontalPadding ?? 0,
    node.stackPaddingBottom ?? node.stackVerticalPadding ?? 0,
    node.stackPaddingLeft ?? node.stackHorizontalPadding ?? 0,
  ].map((value) => finite(value));
}
function fillsCounter(child, parent) {
  if (child.stackPositioning === "ABSOLUTE") return false;
  const horizontal = axis(parent) === "HORIZONTAL",
    [top, right, bottom, left] = padding(parent);
  const size = finite(horizontal ? child.size?.y : child.size?.x),
    available = finite(horizontal ? parent.size?.y : parent.size?.x);
  return (
    size > 0 &&
    available > 0 &&
    Math.abs(available - (horizontal ? top + bottom : left + right) - size) <=
      2.5
  );
}
export function axisHugsContent(node, direction) {
  const flow = children(node);
  if (
    !axis(node) ||
    node.stackWrap === "WRAP" ||
    flow.some(rotated) ||
    !flow.length ||
    (direction === "primary" &&
      flow.some((child) => finite(child.stackChildPrimaryGrow) > 0))
  )
    return false;
  const horizontal = axis(node) === "HORIZONTAL",
    alongX = direction === "primary" ? horizontal : !horizontal;
  const eligible =
    direction === "primary"
      ? flow
      : flow.filter(
          (child) =>
            child.stackChildAlignSelf !== "STRETCH" &&
            !fillsCounter(child, node),
        );
  if (!eligible.length) return false;
  const [top, right, bottom, left] = padding(node),
    size = node.size?.[alongX ? "x" : "y"];
  if (typeof size !== "number" || !Number.isFinite(size)) return false;
  const sizes = eligible.map((child) =>
    finite(child.size?.[alongX ? "x" : "y"]),
  );
  const content =
    direction === "primary"
      ? sizes.reduce((a, b) => a + b, 0) +
        finite(node.stackSpacing) * (flow.length - 1)
      : Math.max(...sizes);
  return (
    Math.abs(size - content - (alongX ? left + right : top + bottom)) <= 2.5
  );
}
export function counterStretches(child, parent, parentStretched = false) {
  if (!axis(parent) || child.stackPositioning === "ABSOLUTE") return false;
  if (child.stackChildAlignSelf === "STRETCH") return true;
  if (child.stackChildAlignSelf != null) return false;
  const hugs =
    parent.stackCounterSizing != null
      ? parent.stackCounterSizing !== "FIXED"
      : axisHugsContent(parent, "counter");
  return !(!parentStretched && hugs) && fillsCounter(child, parent);
}
export function layoutChildrenStretched(
  node,
  parent,
  { isRoot = false, parentStretched = false } = {},
) {
  return (
    isRoot ||
    (!!parent &&
      axis(node) &&
      axis(node) === axis(parent) &&
      counterStretches(node, parent, parentStretched)) ||
    false
  );
}
export function applyNodeLayout(
  style,
  node,
  { parent, isRoot = false, warnings = [], parentStretched = false } = {},
) {
  const id = node.guid
    ? `${node.guid.sessionID}:${node.guid.localID}`
    : (node.name ?? "node");
  const warn = (message) => warnings.push(`${id}: ${message}`);
  for (const [field, prefix] of [
    ["minSize", "min"],
    ["maxSize", "max"],
  ]) {
    const size = node[field]?.value;
    for (const [dimension, key] of [
      ["Width", "x"],
      ["Height", "y"],
    ]) {
      if (size?.[key] == null || size[key] === 0) continue;
      if (
        typeof size[key] !== "number" ||
        !Number.isFinite(size[key]) ||
        size[key] < 0
      )
        warn(`invalid ${field} ${key}; visual review required`);
      else style[prefix + dimension] = `${size[key]}px`;
    }
  }
  const direction = axis(node),
    parentAxis = axis(parent),
    flowing = parentAxis && node.stackPositioning !== "ABSOLUTE";
  if (parent?.stackMode === "GRID")
    applyGridChildLayout(style, node, parent, warn);
  if (flowing) {
    if (rotated(node))
      warn("rotated auto-layout child retains absolute saved geometry");
    else {
      style.position = "relative";
      delete style.left;
      delete style.top;
      if (style.transform && node.transform) {
        style.transform = `matrix(${finite(node.transform.m00, 1)},0,0,${finite(node.transform.m11, 1)},0,0)`;
        delete style.transformOrigin;
      }
      if (finite(node.stackChildPrimaryGrow) > 0) {
        style.flexGrow = "1";
        delete style[parentAxis === "HORIZONTAL" ? "width" : "height"];
      } else style.flexShrink = "0";
      if (counterStretches(node, parent, parentStretched)) {
        style.alignSelf = "stretch";
        delete style[parentAxis === "HORIZONTAL" ? "height" : "width"];
      }
      if (
        node.type === "TEXT" &&
        (node.textAutoResize == null ||
          ["HEIGHT", "WIDTH_AND_HEIGHT"].includes(node.textAutoResize))
      ) {
        delete style.height;
        if (node.textAutoResize !== "HEIGHT") delete style.width;
      }
    }
  }
  if (
    isRoot &&
    node.type === "TEXT" &&
    (node.textAutoResize == null ||
      ["HEIGHT", "WIDTH_AND_HEIGHT"].includes(node.textAutoResize))
  ) {
    delete style.height;
    if (node.textAutoResize !== "HEIGHT") delete style.width;
  }
  if (node.stackMode === "GRID") applyGridLayout(style, node, warn);
  if (direction) {
    const horizontal = direction === "HORIZONTAL";
    style.display = "flex";
    style.flexDirection = horizontal ? "row" : "column";
    const align = {
      MIN: "flex-start",
      MAX: "flex-end",
      CENTER: "center",
      SPACE_BETWEEN: "space-between",
      SPACE_EVENLY: "space-between",
      BASELINE: "baseline",
    };
    for (const [field, key, fallback] of [
      ["stackPrimaryAlignItems", "justifyContent", "flex-start"],
      ["stackCounterAlignItems", "alignItems", "flex-start"],
    ]) {
      const input = node[field];
      if (input != null && !align[input])
        warn(`unsupported ${field} ${String(input)}; start alignment fallback`);
      style[key] = align[input] ?? fallback;
    }
    const spaced = ["SPACE_BETWEEN", "SPACE_EVENLY"].includes(
      node.stackPrimaryAlignItems,
    );
    let gap = spaced ? 0 : finite(node.stackSpacing);
    if (node.stackWrap === "WRAP") {
      style.flexWrap = "wrap";
      if (node.stackCounterSpacing != null) {
        if (
          typeof node.stackCounterSpacing === "number" &&
          Number.isFinite(node.stackCounterSpacing)
        ) {
          // The source React generator uses this row/column order for both stack axes.
          if (node.stackCounterSpacing !== finite(node.stackSpacing))
            gap = [node.stackCounterSpacing, finite(node.stackSpacing)];
        } else style.alignContent = "space-between";
      }
    }
    if (Array.isArray(gap)) {
      if (gap.some((value) => value < 0))
        warn(
          "negative auto-layout gap uses zero fallback; visual review required",
        );
      style.gap = gap.map((value) => `${Math.max(0, value)}px`).join(" ");
    } else if (gap) {
      if (gap < 0)
        warn(
          "negative auto-layout gap uses zero fallback; visual review required",
        );
      style.gap = `${Math.max(0, gap)}px`;
    }
    const pads = padding(node);
    if (pads.some((value) => value < 0))
      warn("negative auto-layout padding needs visual review");
    if (pads.some(Boolean))
      style.padding = pads.map((value) => `${Math.max(0, value)}px`).join(" ");
    const flow = children(node);
    if (flow.length) {
      const clear = (key) => {
        if (isRoot && key === "width") style.width = "fit-content";
        else delete style[key];
      };
      const hugs = (field, side) =>
        node[field] != null
          ? node[field] !== "FIXED"
          : axisHugsContent(node, side);
      if (
        hugs("stackPrimarySizing", "primary") &&
        !(spaced && node.stackPrimarySizing == null)
      )
        clear(horizontal ? "width" : "height");
      if (hugs("stackCounterSizing", "counter"))
        clear(horizontal ? "height" : "width");
    }
  }
  for (const key of [
    "horizontalConstraint",
    "verticalConstraint",
    "constraints",
  ])
    if (node[key] != null)
      warn(
        `${key} retains saved geometry; anchor constraints need resolution and visual review`,
      );
  return style;
}
