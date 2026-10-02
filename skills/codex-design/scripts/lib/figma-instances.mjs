const emptyGuid = (guid) =>
  !guid || (guid.sessionID === 4294967295 && guid.localID === 4294967295);
const guidKey = (guid) => (guid ? `${guid.sessionID}:${guid.localID}` : null);
export function instanceSymbolId(node) {
  const symbol = emptyGuid(node.overriddenSymbolID)
    ? node.symbolData?.symbolID
    : node.overriddenSymbolID;
  return emptyGuid(symbol) ? null : guidKey(symbol);
}
const keyOf = (node) => guidKey(node.overrideKey ?? node.guid) ?? "?";
const rootFields = [
  "fillPaints",
  "strokePaints",
  "strokeWeight",
  "strokeAlign",
  "effects",
  "cornerRadius",
  "rectangleTopLeftCornerRadius",
  "rectangleTopRightCornerRadius",
  "rectangleBottomLeftCornerRadius",
  "rectangleBottomRightCornerRadius",
  "opacity",
  "blendMode",
];
function clone(value, depth = 0) {
  if (value == null || typeof value !== "object") return value;
  if (depth > 160) throw new Error("Instance data nesting limit exceeded");
  if (Array.isArray(value)) return value.map((item) => clone(item, depth + 1));
  const out = Object.create(null);
  for (const [key, item] of Object.entries(value))
    out[key] = clone(item, depth + 1);
  return out;
}
function entryFor(node, warn) {
  const overrides = new Map(),
    props = new Map();
  for (const list of [
    node.symbolData?.symbolOverrides,
    node.derivedSymbolData,
  ]) {
    if (list != null && !Array.isArray(list)) {
      warn("instance override list must be an array");
      continue;
    }
    for (const item of list ?? []) {
      const guids = item.guidPath?.guids ?? [];
      if (!Array.isArray(guids)) {
        warn("instance override guid path must be an array");
        continue;
      }
      const key = guids.map(guidKey).join("/");
      const fields = { ...overrides.get(key) };
      for (const [name, value] of Object.entries(item))
        if (name !== "guidPath" && name !== "children")
          Object.defineProperty(fields, name, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          });
      overrides.set(key, fields);
    }
  }
  const assignments = node.componentPropAssignments;
  if (assignments != null && !Array.isArray(assignments))
    warn("instance prop assignments must be an array");
  else
    for (const item of assignments ?? [])
      props.set(guidKey(item.defID), item.value);
  return { overrides, props, prefix: [] };
}
function fieldsAt(stack, path) {
  const out = Object.create(null);
  for (let index = stack.length - 1; index >= 0; index--) {
    const entry = stack[index],
      target = [...entry.prefix, ...path];
    if (!target.length) {
      Object.assign(out, entry.overrides.get(""));
      continue;
    }
    for (let start = 0; start < target.length; start++) {
      const match = entry.overrides.get(target.slice(start).join("/"));
      if (match) {
        Object.assign(out, match);
        break;
      }
    }
  }
  return out;
}
function assignedFields(node, stack, warn) {
  const refs = node.componentPropRefs;
  if (refs == null) return node;
  if (!Array.isArray(refs)) {
    warn("instance prop refs must be an array");
    return node;
  }
  let out = { ...node };
  for (let index = stack.length - 1; index >= 0; index--)
    for (const ref of refs) {
      const value = stack[index].props.get(guidKey(ref.defID));
      if (!value || typeof value !== "object") continue;
      const field = ref.componentPropNodeField;
      if (field === "VISIBLE" && value.boolValue !== undefined)
        out.visible = value.boolValue;
      else if (field === "TEXT_DATA" && value.textValue)
        out.textData = value.textValue;
      else if (field === "OVERRIDDEN_SYMBOL_ID" && value.guidValue)
        out.overriddenSymbolID = value.guidValue;
      else if (
        !["VISIBLE", "TEXT_DATA", "OVERRIDDEN_SYMBOL_ID"].includes(field)
      )
        warn(`unhandled instance prop reference field ${field}`);
    }
  return out;
}

// Expand local instance data without evaluating source or sharing mutable objects with it.
export function resolveInstance(
  doc,
  node,
  { warnings = [], expandAll = true, maxDepth = 4 } = {},
) {
  const warnFor = (current) => (message) =>
    warnings.push(`${guidKey(current.guid) ?? "?"}: ${message}`);
  const budget = { nodes: 100000 };
  function fallback(current, reason) {
    warnFor(current)(reason);
    return {
      ...current,
      type: "FRAME",
      symbolData: undefined,
      derivedSymbolData: undefined,
      children: [],
    };
  }
  function expand(current, inherited, depth, active) {
    const warn = warnFor(current),
      symbolId = instanceSymbolId(current);
    if (!current.symbolData) {
      warn("instance has no symbolData; local expansion unavailable");
      return null;
    }
    const symbol = doc.nodes.get(symbolId);
    if (!symbol) {
      warn(
        `instance symbol ${symbolId ?? "unknown"} not found; external or missing dependency`,
      );
      return null;
    }
    if (active.has(symbolId)) {
      warn(`instance symbol cycle at ${symbolId}; expansion stopped`);
      return null;
    }
    if (depth > maxDepth) {
      warn(`instance expansion depth exceeds ${maxDepth}; expansion stopped`);
      return null;
    }
    const activeSymbols = new Set(active);
    activeSymbols.add(symbolId);
    const stack = [...inherited, entryFor(current, warn)];
    function visit(child, path) {
      if (--budget.nodes < 0)
        throw new Error("Instance expansion node limit exceeded");
      const childPath = [...path, keyOf(child)],
        fields = fieldsAt(stack, childPath);
      let merged = assignedFields(
        { ...child, ...fields, children: child.children },
        stack,
        warnFor(child),
      );
      if (merged.type === "INSTANCE") {
        const deep = stack.some((entry) =>
          [...entry.overrides.keys()].some((key) =>
            key.startsWith(childPath.join("/") + "/"),
          ),
        );
        if (
          expandAll ||
          deep ||
          fields.componentPropAssignments !== undefined ||
          fields.fillPaints !== undefined ||
          fields.strokePaints !== undefined
        ) {
          if (!emptyGuid(merged.overriddenSymbolID)) {
            const swap = doc.nodes.get(guidKey(merged.overriddenSymbolID));
            for (const field of ["opacity", "blendMode"])
              if (merged[field] === undefined && swap?.[field] !== undefined)
                merged = { ...merged, [field]: swap[field] };
          }
          const nested = expand(
            merged,
            stack.map((entry) => ({
              ...entry,
              prefix: [...entry.prefix, ...childPath],
            })),
            depth + 1,
            activeSymbols,
          );
          if (nested) return nested;
          return fallback(
            merged,
            "nested instance retained as empty saved-layout fallback",
          );
        }
      }
      const children = Array.isArray(merged.children) ? merged.children : [];
      return {
        ...merged,
        children: children.map((grandchild) => visit(grandchild, childPath)),
      };
    }
    const rootOverride = {
      ...fieldsAt(stack, []),
      ...fieldsAt(stack, [keyOf(symbol)]),
    };
    const root = { ...symbol, ...rootOverride };
    for (const field of rootFields)
      if (current[field] !== undefined) root[field] = current[field];
    return {
      ...root,
      instanceSymbol: symbolId,
      guid: current.guid,
      type: "FRAME",
      transform: current.transform,
      size: current.size ?? symbol.size,
      stackPositioning: current.stackPositioning,
      stackChildAlignSelf: current.stackChildAlignSelf,
      stackChildPrimaryGrow: current.stackChildPrimaryGrow,
      gridRowAnchor: current.gridRowAnchor,
      gridColumnAnchor: current.gridColumnAnchor,
      gridRowSpan: current.gridRowSpan,
      gridColumnSpan: current.gridColumnSpan,
      gridChildHorizontalAlign: current.gridChildHorizontalAlign,
      gridChildVerticalAlign: current.gridChildVerticalAlign,
      visible: current.visible,
      componentPropRefs: undefined,
      symbolData: undefined,
      derivedSymbolData: undefined,
      children: (symbol.children ?? []).map((child) => visit(child, [])),
    };
  }
  try {
    const result = expand(node, [], 0, new Set());
    return result ? clone(result) : null;
  } catch (error) {
    warnFor(node)(`instance expansion failed: ${error.message}`);
    return null;
  }
}
