export const papers = Object.freeze({
  letter: ["8.5in", "11in"],
  a4: ["210mm", "297mm"],
  legal: ["8.5in", "14in"],
});
const units = {
  px: 1,
  in: 96,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  pt: 96 / 72,
  pc: 16,
};
export function length(value, fallback = null) {
  value = String(value ?? "").trim();
  return value === "0"
    ? "0px"
    : /^\d+(?:\.\d+)?(?:px|in|mm|cm|pt|pc)$/.test(value)
      ? value
      : fallback;
}
export function pixels(value) {
  const match = /^(\d+(?:\.\d+)?)(px|in|mm|cm|pt|pc)$/.exec(
    length(value) || "",
  );
  return match ? Number(match[1]) * units[match[2]] : NaN;
}
export function geometry(element, override = {}) {
  const paper =
    papers[
      override.paper || (element.getAttribute("size") || "").toLowerCase()
    ] || papers.letter;
  const landscape =
    (override.orientation || element.getAttribute("orientation") || "")
      .trim()
      .toLowerCase() === "landscape";
  const named = landscape ? [...paper].reverse() : [...paper];
  const width = length(element.getAttribute("width")),
    height = length(element.getAttribute("height"));
  const fixed = pixels(width) > 0 && pixels(height) > 0;
  const pageWidth = fixed || !override.paper ? width || named[0] : named[0];
  const pageHeight = fixed || !override.paper ? height || named[1] : named[1];
  const margin = length(element.getAttribute("margin"), "0.75in");
  const contentWidth = length(element.getAttribute("content-width")),
    contentHeight = length(element.getAttribute("content-height"));
  const fitScale = Math.min(
    (pixels(pageWidth) - 2 * pixels(margin)) / pixels(contentWidth),
    (pixels(pageHeight) - 2 * pixels(margin)) / pixels(contentHeight),
  );
  const fit =
    pixels(contentWidth) > 0 &&
    pixels(contentHeight) > 0 &&
    fitScale > 0 &&
    Number.isFinite(fitScale);
  return {
    pageWidth,
    pageHeight,
    margin,
    fixed,
    landscape,
    contentWidth,
    contentHeight,
    fitScale,
    fit,
  };
}
export function printOptions(options = {}) {
  const result = {};
  if (options.paper !== undefined) {
    const paper = String(options.paper).toLowerCase();
    if (!papers[paper]) throw new Error("Paper must be letter, a4 or legal.");
    result.paper = paper;
  }
  if (options.orientation !== undefined) {
    const orientation = String(options.orientation).toLowerCase();
    if (!["portrait", "landscape"].includes(orientation))
      throw new Error("Orientation must be portrait or landscape.");
    result.orientation = orientation;
  }
  return result;
}
