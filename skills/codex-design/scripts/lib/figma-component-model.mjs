import { nodeId } from "./figma.mjs";

const sizes = {
  xsmall: "xs",
  small: "sm",
  base: "base",
  medium: "md",
  large: "lg",
  xlarge: "xl",
  xxlarge: "2xl",
};
const reserved = new Set([
  "default",
  "new",
  "class",
  "function",
  "return",
  "delete",
  "import",
  "export",
  "var",
  "let",
  "const",
  "switch",
  "case",
  "null",
  "true",
  "false",
  "constructor",
  "prototype",
  "__proto__",
]);
export function identifier(value, pascal = false) {
  const words =
    String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(/[A-Za-z0-9]+/g) ?? [];
  let result = words
    .map((part, index) =>
      index || pascal
        ? part[0].toUpperCase() + part.slice(1)
        : part[0].toLowerCase() + part.slice(1),
    )
    .join("")
    .slice(0, 80);
  if (!/^[A-Za-z]/.test(result))
    result = (pascal ? "Component" : "prop") + result;
  if (reserved.has(result)) result += "Value";
  return result || (pascal ? "Component" : "prop");
}
export function componentEntries(doc) {
  const children = new Set(
    [...doc.nodes.values()]
      .filter((n) => n.isStateGroup)
      .flatMap((n) => n.children.map(nodeIdOf)),
  );
  const nodes = [...doc.nodes.values()]
    .filter(
      (n) =>
        n.isStateGroup || (n.type === "SYMBOL" && !children.has(nodeIdOf(n))),
    )
    .sort((a, b) => Number(!!b.isStateGroup) - Number(!!a.isStateGroup));
  const names = new Set(["react"]);
  return nodes.map((node) => {
    const base = identifier(node.name, true);
    let name = base,
      counter = 2;
    while (names.has(name.toLowerCase())) name = base + counter++;
    names.add(name.toLowerCase());
    return { node, name };
  });
}
const nodeIdOf = (node) => nodeId(node.guid);
function attributes(name) {
  const out = new Map();
  for (const part of String(name ?? "").split(/,\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0) out.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return out;
}
function normalizedOptions(name, raw) {
  const isSize =
    /size|scale/i.test(name) ||
    (raw.length > 0 &&
      raw.filter((v) =>
        Object.hasOwn(
          sizes,
          v
            .replace(/\s*\([\d.]+\)$/, "")
            .toLowerCase()
            .replace(/[\s_-]+/g, ""),
        ),
      ).length /
        raw.length >
        0.5);
  const label = (value) => {
    const match = value.trim().match(/^(.*?)\s*\(\d+(?:\.\d+)?\)$/),
      text = match ? match[1].trim() : value.trim();
    const size =
      (isSize || match) && sizes[text.toLowerCase().replace(/[\s_-]+/g, "")];
    return (
      size || (/^[a-z][a-zA-Z0-9]*$/.test(text) ? text : text.toLowerCase())
    );
  };
  const booleans = raw.map((value) =>
    /^(true|yes)$/i.test(value.trim())
      ? true
      : /^(false|no)$/i.test(value.trim())
        ? false
        : label(value),
  );
  const boolean =
    booleans.length > 0 &&
    booleans.every((v) => typeof v === "boolean") &&
    new Set(booleans).size === 2;
  let values = boolean ? booleans : raw.map(label);
  if (new Set(values.map(String)).size < values.length) values = raw;
  const map = new Map(raw.map((value, i) => [value, values[i]]));
  return {
    values,
    canonical: (value) =>
      /^(true|yes)$/i.test(value.trim())
        ? true
        : /^(false|no)$/i.test(value.trim())
          ? false
          : label(value),
    normalize: (value) => (map.has(value) ? map.get(value) : label(value)),
  };
}
export function componentModel(node, warnings = []) {
  const warn = (message) => warnings.push(`${nodeIdOf(node)}: ${message}`);
  const definitions = (node.componentPropDefs ?? [])
    .filter((def) => !def.isDeleted && typeof def.name === "string" && def.type)
    .sort((a, b) =>
      String(a.sortPosition ?? "").localeCompare(String(b.sortPosition ?? "")),
    );
  const variants = node.isStateGroup
    ? (node.children ?? []).filter((n) => n.type === "SYMBOL")
    : [node];
  const orders = new Map();
  for (const order of node.stateGroupPropertyValueOrders ?? [])
    if (typeof order.property === "string")
      orders.set(order.property, [
        ...new Set((order.values ?? []).filter((v) => typeof v === "string")),
      ]);
  if (node.isStateGroup)
    for (const variant of variants)
      for (const [key, value] of attributes(variant.name)) {
        const values = orders.get(key) ?? [];
        if (!values.includes(value)) {
          const normalize = normalizedOptions(key, [
            ...values,
            value,
          ]).canonical;
          const alias = values.findIndex(
            (existing) => normalize(existing) === normalize(value),
          );
          if (alias >= 0) values[alias] = value;
          else values.push(value);
        }
        orders.set(key, values);
      }
  const options = new Map(
    [...orders].map(([key, values]) => [key, normalizedOptions(key, values)]),
  );
  const used = new Set(["className", "style", "children"]),
    props = [],
    byId = new Map();
  for (const def of definitions) {
    const base = identifier(def.name);
    let key = base,
      index = 2;
    while (used.has(key)) key = base + index++;
    used.add(key);
    let value, type;
    if (def.type === "VARIANT") {
      const values = options.get(def.name)?.values ?? [];
      value = values[0] ?? "";
      type = values.length
        ? values.map((v) => JSON.stringify(v)).join(" | ")
        : "string";
      if (values.length && values.every((v) => typeof v === "boolean"))
        type = "boolean";
    } else if (def.type === "BOOL") {
      value = def.initialValue?.boolValue === true;
      type = "boolean";
    } else if (def.type === "TEXT") {
      value = String(def.initialValue?.textValue?.characters ?? "");
      type = "string";
    } else if (def.type === "NUMBER") {
      value = Number.isFinite(def.initialValue?.floatValue)
        ? def.initialValue.floatValue
        : 0;
      type = "number";
      warn(`number property ${key} requires a supported node-field binding`);
    } else if (def.type === "INSTANCE_SWAP") {
      value = undefined;
      type = "React.ReactNode";
    } else {
      warn(`unsupported component property ${String(def.type)}`);
      continue;
    }
    const prop = { key, name: def.name, kind: def.type, type, value };
    props.push(prop);
    byId.set(nodeId(def.id), prop);
  }
  for (const variant of variants)
    for (const def of variant.componentPropDefs ?? []) {
      const parent = byId.get(nodeId(def.parentPropDefId));
      if (parent) byId.set(nodeId(def.id), parent);
    }
  const axes = props.filter((p) => p.kind === "VARIANT"),
    seen = new Set(),
    cases = [];
  for (const variant of variants) {
    const raw = attributes(variant.name),
      values = axes.map(
        (axis) =>
          options.get(axis.name)?.normalize(raw.get(axis.name) ?? "") ?? "",
      );
    const key = JSON.stringify(values);
    if (seen.has(key)) {
      warn(`variant key collision ${key}; later variant is unreachable`);
      continue;
    }
    seen.add(key);
    cases.push({ node: variant, values });
  }
  const initial =
    cases.find(
      (c) =>
        JSON.stringify(c.values) === JSON.stringify(axes.map((p) => p.value)),
    ) ?? cases[0];
  if (node.isStateGroup && !axes.length)
    warn("variant set has no declared axes; first symbol is the default");
  return { props, byId, axes, cases, initial, warn };
}
