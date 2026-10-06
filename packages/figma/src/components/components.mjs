import path from "node:path";
import { write } from "../../../core/src/lib/files.mjs";
import { nodeId } from "../decode/document.mjs";
import { componentRegistry } from "./instances.mjs";
import { componentBody } from "./jsx.mjs";

export async function emitComponents(doc, output, warnings = [], selection) {
  const registry = componentRegistry(doc, warnings),
    entries = registry.entries;
  const selected = selection
    ? entries.filter(
        (entry) =>
          registry.byId.get(selection) === entry ||
          entry.node.name === selection ||
          entry.name === selection,
      )
    : entries;
  if (selection && selected.length !== 1)
    throw new Error(
      selected.length
        ? "Ambiguous component selection; use a node id"
        : "No matching component",
    );
  const components = [],
    queue = [...selected],
    emitted = new Set();
  for (let index = 0; index < queue.length; index++) {
    const entry = queue[index];
    if (emitted.has(entry)) continue;
    emitted.add(entry);
    const { node, name } = entry,
      deps = new Set(),
      context = { registry, deps, entry };
    const model = registry.models.get(entry),
      cases = model.axes.length
        ? model.cases
        : model.initial
          ? [model.initial]
          : [];
    const defaults = Object.fromEntries(
      model.props
        .filter((prop) => prop.value !== undefined)
        .map((prop) => [prop.key, prop.value]),
    );
    const init = model.props
      .filter((prop) => prop.value !== undefined)
      .map(
        (prop) =>
          `${JSON.stringify(prop.key)}:input.${prop.key} ?? ${JSON.stringify(prop.value)}`,
      )
      .join(",");
    const key = `JSON.stringify([${model.axes.map((prop) => `props.${prop.key}`).join(",")}])`;
    const bodies = cases
      .map(
        (item) =>
          `case ${JSON.stringify(JSON.stringify(item.values))}: return (${componentBody(doc, item.node, model, warnings, context)});`,
      )
      .join("\n");
    const fallback = model.initial
      ? componentBody(doc, model.initial.node, model, warnings, context)
      : "null";
    for (const dependency of deps)
      if (!emitted.has(dependency)) queue.push(dependency);
    const imports = [...deps]
      .filter((dep) => dep !== entry)
      .map((dep) => `import {${dep.name}} from './${dep.name}.jsx';`)
      .join("\n");
    const source = `import React, {useId} from 'react';\n${imports}\n// Figma node: ${nodeId(node.guid)}. Generated independently from decoded design data.\nexport function ${name}(input = {}) {\n const scope = useId().replace(/:/g, '') + '-';\n const props = {...input, ${init}};\n switch (${key}) {\n ${bodies}\n default: return (${fallback});\n }\n}\nexport default ${name};\n`;
    const declaration = `import * as React from 'react';\nexport interface ${name}Props {\n className?: string;\n style?: React.CSSProperties;\n${[
      ...model.props,
      ...model.synthProps,
    ]
      .map(
        (prop) =>
          `${
            prop.value === undefined && prop.fallback === undefined
              ? ""
              : " /** @default " +
                JSON.stringify(prop.value ?? prop.fallback)
                  .replaceAll("*/", "* /")
                  .replace(/[\r\n]/g, " ") +
                " */\n"
          } ${prop.key}?: ${prop.type};`,
      )
      .join(
        "\n",
      )}\n}\nexport declare const ${name}: React.FC<${name}Props>;\nexport default ${name};\n`;
    const sourcePath = `components/${name}.jsx`;
    await write(path.join(output, sourcePath), source);
    await write(path.join(output, `components/${name}.d.ts`), declaration);
    components.push({
      name,
      sourcePath,
      kind: "component",
      props: defaults,
      figmaNode: nodeId(node.guid),
      dependencies: [...deps]
        .filter((dep) => dep !== entry)
        .map((dep) => dep.name),
      requested: selected.includes(entry),
      variants: cases.map((item) => ({
        node: nodeId(item.node.guid),
        props: Object.fromEntries(
          model.axes.map((axis, i) => [axis.key, item.values[i]]),
        ),
      })),
    });
  }
  return components;
}
