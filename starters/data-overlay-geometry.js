export function cornerRad(value) {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(/\s+/);
  return parts.length >= 1 &&
    parts.length <= 2 &&
    parts.every((p) => /^\d*\.?\d+(?:px|%)$/.test(p))
    ? [parts[0], parts[1] ?? parts[0]]
    : null;
}
export function radiusOf(style) {
  const corners = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ].map(cornerRad);
  if (corners.some((c) => !c)) return null;
  const x = corners.map((c) => c[0]).join(" "),
    y = corners.map((c) => c[1]).join(" ");
  return x === y ? x : `${x} / ${y}`;
}
export function linearOf(transform) {
  if (!transform || transform === "none") return null;
  const match = /^matrix(3d)?\(([^)]+)\)$/.exec(transform);
  if (!match) return false;
  const values = match[2].split(",").map(Number);
  if (values.some((v) => !Number.isFinite(v))) return false;
  let result;
  if (match[1]) {
    if (
      values.length !== 16 ||
      [2, 3, 6, 7, 8, 9, 11, 14].some((i) => values[i] !== 0) ||
      values[10] !== 1 ||
      values[15] !== 1
    )
      return false;
    result = [values[0], values[1], values[4], values[5]];
  } else {
    if (values.length !== 6) return false;
    result = values.slice(0, 4);
  }
  return result.every((v, i) => v === [1, 0, 0, 1][i]) ? null : result;
}
export function mulLin(a, b) {
  const result = [];
  for (let column = 0; column < 2; column++)
    for (let row = 0; row < 2; row++)
      result.push(a[row] * b[column * 2] + a[row + 2] * b[column * 2 + 1]);
  return result;
}
export function ownLinear(style) {
  if (
    style.zoom &&
    !["normal", "1"].includes(style.zoom) &&
    parseFloat(style.zoom) !== 1
  )
    return false;
  let result = linearOf(style.transform);
  if (result === false) return false;
  if (style.scale && style.scale !== "none") {
    const scale = style.scale.trim().split(/\s+/).map(Number);
    if (
      !scale.length ||
      scale.length > 3 ||
      scale.some((n) => !Number.isFinite(n)) ||
      (scale.length === 3 && scale[2] !== 1)
    )
      return false;
    const matrix = [scale[0], 0, 0, scale[1] ?? scale[0]];
    result = result ? mulLin(matrix, result) : matrix;
  }
  if (style.rotate && style.rotate !== "none") {
    const rotation =
      /^(?:z\s+)?(-?[\d.]+(?:e[+-]?\d+)?)(deg|rad|grad|turn)$/i.exec(
        style.rotate.trim(),
      );
    if (!rotation) return false;
    const radians =
      Number(rotation[1]) *
      { deg: Math.PI / 180, rad: 1, grad: Math.PI / 200, turn: 2 * Math.PI }[
        rotation[2].toLowerCase()
      ];
    if (!Number.isFinite(radians)) return false;
    const matrix = [
      Math.cos(radians),
      Math.sin(radians),
      -Math.sin(radians),
      Math.cos(radians),
    ];
    result = result ? mulLin(matrix, result) : matrix;
  }
  return result;
}
export function quadOffset(matrix, width, height) {
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].map(([x, y]) => [
    matrix[0] * x + matrix[2] * y,
    matrix[1] * x + matrix[3] * y,
  ]);
  return {
    ox: Math.min(...corners.map((p) => p[0])),
    oy: Math.min(...corners.map((p) => p[1])),
  };
}
export function measureRects(host, stage, idAttr) {
  const stageRect = stage.getBoundingClientRect(),
    result = new Map(),
    linear = new Map();
  function accumulated(element) {
    if (!element || element === host) return null;
    if (linear.has(element)) return linear.get(element);
    const own = ownLinear(getComputedStyle(element)),
      parent = accumulated(element.parentElement);
    const matrix =
      own === false || parent === false
        ? false
        : own && parent
          ? mulLin(parent, own)
          : own || parent;
    linear.set(element, matrix);
    return matrix;
  }
  let skipped = 0;
  for (const element of host.querySelectorAll(`[${idAttr}]`)) {
    const id = element.getAttribute(idAttr);
    if (!id) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) {
      skipped++;
      continue;
    }
    const top = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    const occluded = !!(
      top &&
      top !== host &&
      top !== element &&
      !top.contains(element) &&
      !element.contains(top) &&
      host.contains(top)
    );
    const matrix = accumulated(element),
      width = element.offsetWidth,
      height = element.offsetHeight;
    const tf =
      matrix && width > 0 && height > 0
        ? {
            a: matrix[0],
            b: matrix[1],
            c: matrix[2],
            d: matrix[3],
            w: width,
            h: height,
            ...quadOffset(matrix, width, height),
          }
        : null;
    const rect = {
      id,
      element,
      x: box.left - stageRect.left - stage.clientLeft,
      y: box.top - stageRect.top - stage.clientTop,
      w: box.width,
      h: box.height,
      occluded,
      rad: radiusOf(getComputedStyle(element)),
      tf,
    };
    if (!result.has(id) || (result.get(id).occluded && !occluded))
      result.set(id, rect);
  }
  return { rects: [...result.values()], skipped };
}
export function cover(element, rect) {
  const { tf } = rect;
  Object.assign(element.style, {
    left: `${rect.x - (tf?.ox || 0)}px`,
    top: `${rect.y - (tf?.oy || 0)}px`,
    width: `${tf?.w ?? rect.w}px`,
    height: `${tf?.h ?? rect.h}px`,
    transform: tf ? `matrix(${tf.a},${tf.b},${tf.c},${tf.d},0,0)` : "",
    transformOrigin: "0 0",
    borderRadius: rect.rad || "",
  });
}
