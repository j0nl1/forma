export const SYNTHESIS_LIMIT = 4;
const skipped = new Set([
  "VARIABLE",
  "VARIABLE_SET",
  "STYLE",
  "VARIABLE_OVERRIDE",
  "STICKY",
  "WIDGET",
  "SLICE",
]);
const vectors = new Set([
  "VECTOR",
  "BOOLEAN_OPERATION",
  "STAR",
  "LINE",
  "REGULAR_POLYGON",
]);
const iconFont =
  /font ?awesome|material (icons|symbols)|icomoon|glyphicons?|ionicons/i;
const idOf = (guid) => (guid ? `${guid.sessionID}:${guid.localID}` : null);
function binding(node, field, model) {
  for (const ref of node.componentPropRefs ?? []) {
    if (ref.isDeleted || ref.componentPropNodeField !== field) continue;
    const prop = model.byId?.get(idOf(ref.defID));
    if (prop) return prop;
  }
  return undefined;
}
export function planSynthesis(root, model = {}) {
  const declared = new Set((model.props ?? []).map((prop) => prop.key));
  const collides = (prefix) =>
    Array.from({ length: SYNTHESIS_LIMIT }, (_, i) => prefix + (i + 1)).some(
      (key) => declared.has(key),
    );
  const textEnabled = !collides("text"),
    iconEnabled = textEnabled && !collides("icon"),
    text = new Map(),
    icon = new Map();
  let textIndex = 0,
    iconIndex = 0;
  function register(map, node, value) {
    map.set(idOf(node.guid), value);
    if (node.overrideKey) map.set(idOf(node.overrideKey), value);
  }
  function visit(node) {
    if (!node || node.internalOnly || skipped.has(node.type)) return;
    if (
      (!textEnabled || textIndex >= SYNTHESIS_LIMIT) &&
      (!iconEnabled || iconIndex >= SYNTHESIS_LIMIT)
    )
      return;
    if (
      node.visible === false &&
      binding(node, "VISIBLE", model)?.kind !== "BOOL"
    )
      return;
    if (node.type === "INSTANCE") {
      const w = node.size?.x ?? 0,
        h = node.size?.y ?? 0;
      if (
        iconEnabled &&
        iconIndex < SYNTHESIS_LIMIT &&
        binding(node, "OVERRIDDEN_SYMBOL_ID", model)?.kind !==
          "INSTANCE_SWAP" &&
        Number.isFinite(w) &&
        Number.isFinite(h) &&
        w > 0 &&
        h > 0 &&
        w <= 72 &&
        h <= 72
      )
        register(icon, node, { i: iconIndex++, w, h });
      return;
    }
    if (node.type === "TEXT") {
      const styles = node.textData?.characterStyleIDs;
      const mixed =
        styles?.length > 0 && styles.some((value) => value !== styles[0]);
      const characters = node.textData?.characters;
      if (
        textEnabled &&
        textIndex < SYNTHESIS_LIMIT &&
        !iconFont.test(node.fontName?.family ?? "") &&
        !mixed &&
        binding(node, "TEXT_DATA", model)?.kind !== "TEXT" &&
        typeof characters === "string" &&
        characters.trim()
      )
        register(text, node, textIndex++);
      return;
    }
    if (vectors.has(node.type)) return;
    for (const child of node.children ?? []) visit(child);
  }
  visit(root);
  return { text, icon, textEnabled, iconEnabled };
}
