const guidKey = (value) =>
  value &&
  Number.isInteger(value.sessionID) &&
  Number.isInteger(value.localID) &&
  value.sessionID >= 0 &&
  value.localID >= 0
    ? `${value.sessionID}:${value.localID}`
    : undefined;

function orderedTracks(tracks, warn) {
  const entries = Array.isArray(tracks?.entries) ? tracks.entries : [];
  const ordered = [...entries].sort((a, b) => {
    const left = String(a?.position ?? "");
    const right = String(b?.position ?? "");
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const result = new Map();
  for (const track of ordered) {
    const key = guidKey(track?.id);
    if (!key) {
      warn("GRID track has an unresolved ID; track omitted");
      continue;
    }
    if (result.has(key)) {
      warn(`GRID duplicate track ${key}; first position retained`);
      continue;
    }
    result.set(key, result.size + 1);
  }
  return result;
}

function trackBound(bound, warn) {
  const value = bound?.value;
  if (
    value != null &&
    (typeof value !== "number" || !Number.isFinite(value) || value < 0)
  ) {
    warn("GRID invalid track sizing uses auto fallback");
    return "auto";
  }
  if (bound?.type === "FLEX") return `${value ?? 1}fr`;
  if (bound?.type != null && !["FIXED", "AUTO"].includes(bound.type))
    warn(
      `GRID unrecognized sizing ${String(bound.type)} uses source numeric/auto fallback`,
    );
  // Zero-valued non-fractional bounds are auto in the inspected source contract.
  return value ? `${value}px` : "auto";
}

export function gridTemplate(tracks, sizing, warn = () => {}) {
  const order = orderedTracks(tracks, warn);
  if (!order.size) return undefined;
  const sizes = new Map();
  for (const entry of Array.isArray(sizing?.entries) ? sizing.entries : []) {
    const key = guidKey(entry?.id);
    if (!key || !order.has(key)) {
      warn("GRID sizing references an unresolved track; sizing omitted");
      continue;
    }
    if (sizes.has(key))
      warn(`GRID duplicate sizing for ${key}; last value retained`);
    sizes.set(key, entry.trackSize);
  }
  return [...order.keys()]
    .map((key) => {
      const size = sizes.get(key);
      const min = trackBound(size?.minSizing, warn);
      const max = trackBound(size?.maxSizing, warn);
      if (min === max) return min;
      if (min.endsWith("fr"))
        warn(
          "GRID fractional minimum in minmax is rejected by CSS; visual review required",
        );
      return `minmax(${min}, ${max})`;
    })
    .join(" ");
}

function nonnegative(value, label, warn) {
  if (value == null) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    warn(`GRID invalid ${label} uses zero fallback; visual review required`);
    return 0;
  }
  return value;
}

export function applyGridLayout(style, node, warn = () => {}) {
  style.display = "grid";
  const rows = gridTemplate(node.gridRows, node.gridRowsSizing, warn);
  const columns = gridTemplate(node.gridColumns, node.gridColumnsSizing, warn);
  if (rows) style.gridTemplateRows = rows;
  if (columns) style.gridTemplateColumns = columns;
  if (!rows && !columns)
    warn(
      "GRID explicit tracks missing; saved geometry is the only sizing evidence for implicit tracks",
    );
  const rowGap = nonnegative(node.gridRowGap, "row gap", warn);
  const columnGap = nonnegative(node.gridColumnGap, "column gap", warn);
  if (rowGap || columnGap) style.gap = `${rowGap}px ${columnGap}px`;
  const pads = [
    node.stackPaddingTop ?? node.stackVerticalPadding,
    node.stackPaddingRight ?? node.stackHorizontalPadding,
    node.stackPaddingBottom ?? node.stackVerticalPadding,
    node.stackPaddingLeft ?? node.stackHorizontalPadding,
  ].map((value) => nonnegative(value, "padding", warn));
  if (pads.some(Boolean)) {
    style.padding = pads.map((value) => `${value}px`).join(" ");
    style.boxSizing = "border-box";
  }
  return style;
}

export function applyGridChildLayout(style, node, parent, warn = () => {}) {
  if (node.stackPositioning === "ABSOLUTE") return style;
  style.position = "relative";
  delete style.left;
  delete style.top;
  for (const [tracks, anchor, span, declaration] of [
    [parent.gridRows, node.gridRowAnchor, node.gridRowSpan, "gridRow"],
    [
      parent.gridColumns,
      node.gridColumnAnchor,
      node.gridColumnSpan,
      "gridColumn",
    ],
  ]) {
    const order = orderedTracks(tracks, warn);
    const index = order.get(guidKey(anchor));
    if (anchor != null && index == null)
      warn(
        `GRID ${declaration} anchor unresolved; implicit placement retained`,
      );
    if (index == null) continue;
    const count = span ?? 1;
    if (!Number.isInteger(count) || count < 1) {
      warn(`GRID invalid ${declaration} span uses one-track fallback`);
      style[declaration] = String(index);
    } else
      style[declaration] =
        count > 1 ? `${index} / span ${count}` : String(index);
  }
  const alignments = {
    MIN: "start",
    CENTER: "center",
    MAX: "end",
    STRETCH: "stretch",
  };
  for (const [input, declaration, dimension] of [
    [node.gridChildHorizontalAlign, "justifySelf", "width"],
    [node.gridChildVerticalAlign, "alignSelf", "height"],
  ]) {
    if (input == null) continue;
    if (!Object.hasOwn(alignments, input)) {
      warn(`GRID unrecognized ${declaration} alignment; default retained`);
      continue;
    }
    style[declaration] = alignments[input];
    if (input === "STRETCH") delete style[dimension];
  }
  return style;
}
