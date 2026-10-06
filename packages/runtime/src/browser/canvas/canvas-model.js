// Source identities remain independent of editable display labels.
export function sectionState(source, saved = {}) {
  const ids = source.boards.map((board) => board.id);
  const srcKey = ids.join("\x1f");
  const known = new Set(ids);
  const order = [...new Set(saved.order ?? [])].filter((id) => known.has(id));
  order.push(...ids.filter((id) => !order.includes(id)));
  const hidden =
    saved.srcKey === srcKey
      ? (saved.hidden ?? []).filter((id) => known.has(id))
      : [];
  const labels = Object.fromEntries(
    Object.entries(saved.labels ?? {}).filter(([id]) => known.has(id)),
  );
  return {
    ...(saved.title !== undefined ? { title: saved.title } : {}),
    labels,
    order,
    hidden,
    srcKey,
  };
}
export function reconcileCanvas(source, state = { sections: {} }) {
  const sections = Object.create(null);
  const ids = new Set();
  for (const section of source) {
    if (!section.id || ids.has(section.id))
      throw new Error("Sections need unique, nonempty identities");
    ids.add(section.id);
    const boards = new Set();
    for (const board of section.boards) {
      if (!board.id || boards.has(board.id))
        throw new Error(
          `Artboards in ${section.id} need unique, nonempty identities`,
        );
      boards.add(board.id);
    }
    sections[section.id] = sectionState(section, state?.sections?.[section.id]);
  }
  return { sections };
}
export function visibleBoards(section, state) {
  const byId = new Map(section.boards.map((board) => [board.id, board]));
  return state.order
    .filter((id) => !state.hidden.includes(id))
    .map((id) => byId.get(id))
    .filter(Boolean);
}
export function navigateFocus(source, state, focus, axis, direction) {
  const sections = source.filter(
    (section) => visibleBoards(section, state.sections[section.id]).length,
  );
  if (!sections.length) return null;
  const si = Math.max(
    0,
    sections.findIndex((section) => section.id === focus?.section),
  );
  const section = sections[si];
  if (axis === "section") {
    const next = sections[(si + direction + sections.length) % sections.length];
    return {
      section: next.id,
      board: visibleBoards(next, state.sections[next.id])[0].id,
    };
  }
  const boards = visibleBoards(section, state.sections[section.id]);
  const bi = Math.max(
    0,
    boards.findIndex((board) => board.id === focus?.board),
  );
  return {
    section: section.id,
    board: boards[(bi + direction + boards.length) % boards.length].id,
  };
}
export function validateCanvasState(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "sections")
  )
    throw new Error("Canvas state must contain sections only");
  if (
    !value.sections ||
    typeof value.sections !== "object" ||
    Array.isArray(value.sections)
  )
    throw new Error("Canvas sections must be an object");
  const sections = Object.create(null);
  const strings = (values) =>
    Array.isArray(values) &&
    values.length <= 10000 &&
    values.every((s) => typeof s === "string" && s.length <= 4096);
  if (Object.keys(value.sections).length > 1000)
    throw new Error("Too many canvas sections");
  for (const [id, section] of Object.entries(value.sections)) {
    if (
      !id ||
      id.length > 4096 ||
      !section ||
      typeof section !== "object" ||
      Array.isArray(section) ||
      Object.keys(section).some(
        (key) =>
          !["title", "labels", "order", "hidden", "srcKey"].includes(key),
      )
    )
      throw new Error("Invalid canvas section");
    if (
      (section.title !== undefined &&
        (typeof section.title !== "string" || section.title.length > 4096)) ||
      (section.srcKey !== undefined &&
        (typeof section.srcKey !== "string" ||
          section.srcKey.length > 65536)) ||
      (section.order !== undefined && !strings(section.order)) ||
      (section.hidden !== undefined && !strings(section.hidden))
    )
      throw new Error("Invalid canvas section fields");
    if (
      section.labels !== undefined &&
      (!section.labels ||
        typeof section.labels !== "object" ||
        Array.isArray(section.labels) ||
        Object.entries(section.labels).some(
          ([key, label]) =>
            !key ||
            key.length > 4096 ||
            typeof label !== "string" ||
            label.length > 4096,
        ))
    )
      throw new Error("Invalid artboard labels");
    sections[id] = {
      ...(section.title !== undefined ? { title: section.title } : {}),
      ...(section.srcKey !== undefined ? { srcKey: section.srcKey } : {}),
      labels: { ...(section.labels ?? {}) },
      order: [...(section.order ?? [])],
      hidden: [...(section.hidden ?? [])],
    };
  }
  return { sections };
}
