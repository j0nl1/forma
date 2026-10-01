export const legacyKey = (key) => `codex-design-image:${key}`;
export function readLegacy(key) {
  try {
    const value = JSON.parse(localStorage.getItem(legacyKey(key)) || "null");
    if (
      !value ||
      typeof value.src !== "string" ||
      (value.src && !/^data:image\//i.test(value.src))
    )
      return null;
    return {
      u: value.src || undefined,
      s: Number.isFinite(value.s) ? value.s : 1,
      x: Number.isFinite(value.panX) ? value.panX : 0,
      y: Number.isFinite(value.panY) ? value.panY : 0,
      alt: typeof value.alt === "string" ? value.alt : "",
      ...(value.panX === undefined
        ? {
            position: {
              x: Number.isFinite(value.x) ? value.x : 50,
              y: Number.isFinite(value.y) ? value.y : 50,
            },
          }
        : {}),
    };
  } catch {
    return null;
  }
}
export function saveLegacy(key, value, position) {
  try {
    localStorage.setItem(
      legacyKey(key),
      JSON.stringify({
        src: value.u || "",
        alt: value.alt || "",
        x: position.x,
        y: position.y,
        s: value.s,
        panX: value.x,
        panY: value.y,
      }),
    );
    return "Saved in this browser.";
  } catch {
    return "Storage unavailable; changes remain in this page.";
  }
}
export function cloneLegacy(from, to) {
  try {
    const value = localStorage.getItem(legacyKey(from));
    if (value) localStorage.setItem(legacyKey(to), value);
  } catch {}
}
