import { nodeId } from "../decode/document.mjs";
import { componentEntries, componentModel } from "./model.mjs";
import { instanceSymbolId } from "../render/instances.mjs";
import { planSynthesis } from "./synthesis.mjs";

export function componentRegistry(doc, warnings) {
  const entries = componentEntries(doc),
    byId = new Map(),
    models = new Map();
  for (const entry of entries) {
    const model = componentModel(entry.node, warnings);
    model.synthPlans = new Map();
    model.synthProps = [];
    model.synthTextSlots = new Map();
    model.synthIconSlots = new Map();
    for (const item of model.cases) {
      const plan = planSynthesis(item.node, model);
      model.synthPlans.set(nodeId(item.node.guid), plan);
      for (const [id, value] of plan.text)
        if (!model.synthTextSlots.has(id)) model.synthTextSlots.set(id, value);
      for (const [id, value] of plan.icon)
        if (!model.synthIconSlots.has(id)) model.synthIconSlots.set(id, value);
    }
    models.set(entry, model);
    byId.set(nodeId(entry.node.guid), entry);
    if (entry.node.isStateGroup)
      for (const variant of entry.node.children ?? [])
        if (variant.type === "SYMBOL") byId.set(nodeId(variant.guid), entry);
  }
  const variantProps = (id) => {
    const entry = byId.get(id),
      model = models.get(entry),
      item = model?.cases.find((item) => nodeId(item.node.guid) === id);
    return item
      ? Object.fromEntries(
          model.axes.map((axis, i) => [axis.key, item.values[i]]),
        )
      : {};
  };
  const graph = new Map(entries.map((entry) => [entry, new Set()]));
  for (const entry of entries) {
    const visit = (node) => {
      if (node.type === "INSTANCE") {
        const target = byId.get(instanceSymbolId(node));
        if (target) graph.get(entry).add(target);
        for (const override of [
          ...(node.symbolData?.symbolOverrides ?? []),
          ...(node.derivedSymbolData ?? []),
        ]) {
          const swap = byId.get(nodeId(override.overriddenSymbolID));
          if (swap) graph.get(entry).add(swap);
        }
        for (const assignment of node.componentPropAssignments ?? []) {
          const swap = byId.get(nodeId(assignment.value?.guidValue));
          if (swap) graph.get(entry).add(swap);
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(entry.node);
  }
  const cyclicEdge = (from, to) => {
    const queue = [to],
      seen = new Set();
    while (queue.length) {
      const current = queue.pop();
      if (current === from) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...(graph.get(current) ?? []));
    }
    return false;
  };
  return { entries, byId, models, variantProps, cyclicEdge };
}
function assignmentValue(value, prop) {
  if (value?.textValue?.characters != null)
    return prop.kind === "VARIANT"
      ? (prop.normalize?.(value.textValue.characters) ??
          value.textValue.characters)
      : String(value.textValue.characters);
  if (value?.boolValue != null)
    return prop.kind === "VARIANT"
      ? (prop.normalize?.(value.boolValue) ?? value.boolValue)
      : value.boolValue === true;
  if (Number.isFinite(value?.floatValue))
    return prop.kind === "VARIANT"
      ? (prop.normalize?.(String(value.floatValue)) ?? String(value.floatValue))
      : value.floatValue;
  return undefined;
}
export function instancePlan(doc, node, registry, warnings) {
  const symbol = instanceSymbolId(node),
    entry = registry.byId.get(symbol),
    props = new Map(),
    deps = new Set();
  const warn = (message) => warnings.push(`${nodeId(node.guid)}: ${message}`);
  if (!entry) return { symbol, external: true, props, deps };
  const model = registry.models.get(entry);
  deps.add(entry);
  for (const assignment of node.componentPropAssignments ?? []) {
    const prop = model.byId.get(nodeId(assignment.defID));
    if (!prop) {
      warn("unresolved instance property assignment");
      continue;
    }
    if (props.has(prop.key)) continue;
    if (prop.kind === "INSTANCE_SWAP" && assignment.value?.guidValue) {
      const id = nodeId(assignment.value.guidValue),
        swap = registry.byId.get(id);
      if (swap) {
        deps.add(swap);
        props.set(prop.key, { swap, values: registry.variantProps(id) });
      } else warn(`external instance swap ${id} needs supplied React content`);
    } else {
      const value = assignmentValue(assignment.value, prop);
      if (value !== undefined) props.set(prop.key, { value });
    }
  }
  for (const [key, value] of Object.entries(registry.variantProps(symbol)))
    if (!props.has(key)) props.set(key, { value });
  const overrides = [
    ...(node.symbolData?.symbolOverrides ?? []),
    ...(node.derivedSymbolData ?? []),
  ];
  let baked = false;
  for (const override of overrides) {
    const path = override.guidPath?.guids ?? [],
      fields = Object.keys(override).filter((key) => key !== "guidPath");
    if (!fields.length) continue;
    if (path.length !== 1) {
      baked = true;
      continue;
    }
    const target = doc.nodes.get(nodeId(path[0]));
    for (const field of fields) {
      const mapped = {
        textData: "TEXT_DATA",
        visible: "VISIBLE",
        overriddenSymbolID: "OVERRIDDEN_SYMBOL_ID",
      }[field];
      const ref = target?.componentPropRefs?.find(
        (ref) => !ref.isDeleted && ref.componentPropNodeField === mapped,
      );
      const prop = ref && model.byId.get(nodeId(ref.defID));
      const synthText = model.synthTextSlots.get(nodeId(path[0]));
      const synthIcon = model.synthIconSlots.get(nodeId(path[0]));
      if (
        !prop &&
        field === "textData" &&
        synthText !== undefined &&
        typeof override.textData?.characters === "string"
      ) {
        const key = `text${synthText + 1}`;
        if (!props.has(key))
          props.set(key, { value: override.textData.characters });
        continue;
      }
      if (!prop && field === "overriddenSymbolID" && synthIcon) {
        const id = nodeId(override.overriddenSymbolID),
          swap = registry.byId.get(id);
        if (swap) {
          deps.add(swap);
          const symbol = doc.nodes.get(id),
            w = symbol?.size?.x,
            h = symbol?.size?.y;
          let style = { width: "100%", height: "100%" };
          if (w > 0 && h > 0) {
            const sx = synthIcon.w / w,
              sy = synthIcon.h / h;
            if (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01)
              style = ["HORIZONTAL", "VERTICAL"].includes(symbol.stackMode)
                ? { width: synthIcon.w, height: synthIcon.h }
                : { transform: `scale(${sx},${sy})`, transformOrigin: "0 0" };
          }
          const key = `icon${synthIcon.i + 1}`;
          if (!props.has(key))
            props.set(key, { swap, values: registry.variantProps(id), style });
        } else baked = true;
        continue;
      }
      if (prop && props.has(prop.key)) continue;
      if (
        prop?.kind === "TEXT" &&
        field === "textData" &&
        typeof override.textData?.characters === "string"
      )
        props.set(prop.key, { value: override.textData.characters });
      else if (prop?.kind === "BOOL" && field === "visible")
        props.set(prop.key, { value: override.visible !== false });
      else if (
        prop?.kind === "INSTANCE_SWAP" &&
        field === "overriddenSymbolID"
      ) {
        const id = nodeId(override.overriddenSymbolID),
          swap = registry.byId.get(id);
        if (swap) {
          deps.add(swap);
          props.set(prop.key, { swap, values: registry.variantProps(id) });
        } else baked = true;
      } else baked = true;
    }
  }
  if (baked) warn("complex instance overrides baked into editable JSX");
  return { symbol, entry, props, deps, baked };
}
const placement = new Set([
  "position",
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "transform",
  "transformOrigin",
  "flexGrow",
  "flexShrink",
  "alignSelf",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "gridRow",
  "gridColumn",
  "justifySelf",
]);
export function instanceJsx(
  doc,
  node,
  style,
  registry,
  deps,
  warnings,
  { slot, isRoot = false, current, parent } = {},
) {
  const plan = instancePlan(doc, node, registry, warnings);
  if (plan.baked) return null;
  if (current && plan.entry && registry.cyclicEdge(current, plan.entry)) {
    warnings.push(
      `${nodeId(node.guid)}: recursive component instance baked with bounded resolution`,
    );
    return null;
  }
  const attributes = [];
  for (const [key, value] of plan.props) {
    if (value.swap) {
      deps.add(value.swap);
      attributes.push(
        `${key}={<${value.swap.name} ${Object.entries(value.values)
          .map(([name, value]) => `${name}={${JSON.stringify(value)}}`)
          .join(
            " ",
          )}${value.style ? ` style={${JSON.stringify(value.style)}}` : ""}/>}`,
      );
    } else attributes.push(`${key}={${JSON.stringify(value.value)}}`);
  }
  const outer = Object.fromEntries(
    Object.entries(style).filter(([key]) => placement.has(key)),
  );
  if (parent?.stackMode) {
    if (style.flexGrow != null)
      outer[parent.stackMode === "VERTICAL" ? "height" : "width"] = "auto";
    if (style.alignSelf === "stretch")
      outer[parent.stackMode === "VERTICAL" ? "width" : "height"] = "auto";
  }
  const outerStyle = JSON.stringify(outer).replace(
    /}$/,
    isRoot ? ",...props.style}" : "}",
  );
  const identity = `data-figma-id={${JSON.stringify(nodeId(node.guid))}}`;
  const className = isRoot ? " className={props.className}" : "";
  if (plan.external) {
    warnings.push(
      `${nodeId(node.guid)}: external component ${plan.symbol ?? "?"} needs supplied React content`,
    );
    return `<div ${identity}${className} style={${outerStyle}} data-external={${JSON.stringify(plan.symbol ?? "?")}}>${slot ? `{props.${slot.key}}` : ""}</div>`;
  }
  for (const dep of plan.deps) deps.add(dep);
  const symbol = doc.nodes.get(plan.symbol),
    w = symbol?.size?.x,
    h = symbol?.size?.y;
  const width = parseFloat(style.width),
    height = parseFloat(style.height);
  const canScale =
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    w > 0 &&
    h > 0 &&
    !["HORIZONTAL", "VERTICAL", "GRID"].includes(symbol?.stackMode) &&
    !style.width?.includes?.("%") &&
    !style.height?.includes?.("%");
  const scaled =
    canScale &&
    (Math.abs(width / w - 1) > 0.01 || Math.abs(height / h - 1) > 0.01);
  const childStyle = scaled
    ? { transform: `scale(${width / w},${height / h})`, transformOrigin: "0 0" }
    : {};
  const body = `<${plan.entry.name} ${attributes.join(" ")}${scaled ? ` style={${JSON.stringify(childStyle)}}` : ""}/>`;
  if (slot || scaled)
    return `<div ${identity}${className} style={${outerStyle}}>${slot ? `{props.${slot.key} ?? (${body})}` : body}</div>`;
  return `<${plan.entry.name} ${attributes.join(" ")} style={${outerStyle}}${className}/>`;
}
