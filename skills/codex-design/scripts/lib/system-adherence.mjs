import path from "node:path";

const runtimeNames = new Set([
  "React",
  "ReactDOM",
  "createRoot",
  "hydrateRoot",
  "Components",
  "default",
]);
export function adherencePolicy(model, namespace) {
  const components = model.spec.components
    .filter(
      (component) =>
        component.kind !== "constant" &&
        component.contract &&
        (component.contract.props.length ||
          component.contract.alternatives?.some(
            (alternative) => alternative.props.length,
          )),
    )
    .map((component) => {
      const props = new Map();
      for (const property of [
        ...component.contract.props,
        ...(component.contract.alternatives ?? []).flatMap(
          (alternative) => alternative.props,
        ),
      ]) {
        const previous = props.get(property.name);
        props.set(property.name, {
          ...property,
          ...(previous?.values && property.values
            ? { values: [...new Set([...previous.values, ...property.values])] }
            : {}),
        });
        if (previous && (!previous.values || !property.values))
          delete props.get(property.name).values;
      }
      return {
        name: component.name,
        sourcePath: component.sourcePath ?? model.spec.entry ?? null,
        sourceExport: component.export ?? component.name,
        props: [...props.values()],
        signatures: component.contract.signatures ?? [],
        alternatives: component.contract.alternatives ?? [],
        openProps: component.contract.openProps ?? false,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    schemaVersion: 1,
    slug: model.spec.slug,
    namespace,
    sourceNamespaces:
      model.authoring?.sourceNamespaces ?? model.spec.sourceNamespaces ?? [],
    severity: "warning",
    alwaysAllowedProps: ["key", "ref", "className", "style", "children"],
    sourceDirectories: [
      ...new Set(
        [
          ...(model.sourceFiles ?? []).filter(
            (file) =>
              /\.(?:jsx|tsx|js|ts)$/.test(file) && !file.endsWith(".d.ts"),
          ),
          ...model.spec.components.map(
            (component) => component.sourcePath ?? model.spec.entry ?? ".",
          ),
        ].map((file) => path.dirname(file)),
      ),
    ]
      .filter((directory) => directory !== ".")
      .sort(),
    publicEntries: ["_ds_entry.js", "index.js"],
    components,
    tokens: Object.keys(model.tokens).sort(),
    tokenKinds: Object.fromEntries(
      model.tokenDetails.map((token) => [token.name, token.kind]),
    ),
    fontFamilies: [...new Set(model.fonts.map((font) => font.family))],
  };
}
export function publicSystemEntry(spec, namespace) {
  const names = spec.components
    .map((component) => component.name)
    .filter((name) => !runtimeNames.has(name));
  return `import "./_ds_bundle.js";\nconst system=window.CodexDesignSystems[${JSON.stringify(spec.slug)}];\nwindow[${JSON.stringify(namespace)}]=system;\nexport const {React,ReactDOM,createRoot,hydrateRoot,Components}=system;\n${names.map((name, index) => `const component${index}=Components[${JSON.stringify(name)}];\nexport {component${index} as ${name}};`).join("\n")}\nexport default system;\n`;
}
