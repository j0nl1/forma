// Shared data-only validation for local slide editing and source writes.
export function validateDeckOperation(input, count) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid deck operation");
  const shapes = {
    move: ["from", "to"],
    remove: ["indices"],
    duplicate: ["index", "ids", "storageKeys"],
    skip: ["index", "value"],
    undo: [],
  };
  const fields = Object.hasOwn(shapes, input.type) ? shapes[input.type] : null;
  if (
    !fields ||
    Object.keys(input).some((key) => !["type", ...fields].includes(key))
  )
    throw new Error("Unknown deck operation or option");
  const index = (value) => {
    if (!Number.isInteger(value) || value < 0 || value >= count)
      throw new Error("Slide index is out of range");
    return value;
  };
  const result = { type: input.type };
  if (input.type === "move")
    Object.assign(result, { from: index(input.from), to: index(input.to) });
  if (input.type === "remove") {
    if (!Array.isArray(input.indices))
      throw new Error("Choose slides to delete");
    result.indices = [...new Set(input.indices.map(index))].sort(
      (a, b) => a - b,
    );
    if (!result.indices.length || result.indices.length >= count)
      throw new Error("At least one slide must stay in the deck");
  }
  if (["duplicate", "skip"].includes(input.type))
    result.index = index(input.index);
  if (input.type === "skip") {
    if (typeof input.value !== "boolean")
      throw new Error("Skip must be a boolean");
    result.value = input.value;
  }
  if (input.type === "duplicate") {
    for (const field of ["ids", "storageKeys"]) {
      const values = input[field] ?? {};
      if (
        !values ||
        typeof values !== "object" ||
        Array.isArray(values) ||
        Object.keys(values).length > 1000
      )
        throw new Error("Invalid duplicate state keys");
      const entries = Object.entries(values);
      if (
        entries.some(
          ([key, value]) =>
            !key ||
            key.length > 256 ||
            typeof value !== "string" ||
            !/^[A-Za-z][\w-]{0,63}$/.test(value),
        ) ||
        new Set(entries.map(([, value]) => value)).size !== entries.length
      )
        throw new Error("Duplicate keys must be unique safe identifiers");
      result[field] = Object.fromEntries(entries);
    }
  }
  return result;
}
export function moveDeckItems(items, from, to) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
export function editDeckNotes(notes, operation) {
  const next = [...notes];
  if (operation.type === "move")
    return moveDeckItems(next, operation.from, operation.to);
  if (operation.type === "remove")
    return next.filter((_, index) => !operation.indices.includes(index));
  if (operation.type === "duplicate")
    next.splice(operation.index + 1, 0, next[operation.index] ?? "");
  return next;
}
