// File matrices map node coordinates into paint coordinates. Rendering uses the inverse.
export function inversePaintTransform(transform) {
  const t = Array.isArray(transform)
    ? {
        m00: transform[0]?.[0],
        m01: transform[0]?.[1],
        m02: transform[0]?.[2],
        m10: transform[1]?.[0],
        m11: transform[1]?.[1],
        m12: transform[1]?.[2],
      }
    : transform;
  if (!t || ![t.m00, t.m01, t.m02, t.m10, t.m11, t.m12].every(Number.isFinite))
    return null;
  const determinant = t.m00 * t.m11 - t.m01 * t.m10;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12)
    return null;
  const a = t.m11 / determinant,
    b = -t.m10 / determinant,
    c = -t.m01 / determinant,
    d = t.m00 / determinant;
  const inverse = {
    a,
    b,
    c,
    d,
    e: -a * t.m02 - c * t.m12,
    f: -b * t.m02 - d * t.m12,
  };
  return Object.values(inverse).every(Number.isFinite) ? inverse : null;
}
const point = (m, x, y, w, h) => [
  (m.a * x + m.c * y + m.e) * w,
  (m.b * x + m.d * y + m.f) * h,
];
export function gradientPaint(paint, { w, h, color, opacity, warn }) {
  const stops = paint.stops ?? paint.gradientStops;
  if (
    !Array.isArray(stops) ||
    stops.length < 2 ||
    stops.some((s) => !Number.isFinite(s?.position) || !s.color)
  ) {
    warn(`${paint.type} requires finite gradient stops`);
    return null;
  }
  const transform = paint.transform ?? paint.gradientTransform;
  const m = transform == null ? null : inversePaintTransform(transform);
  if (transform != null && !m) {
    warn(
      `${paint.type} has an invalid or singular transform; default gradient geometry`,
    );
  }
  const colors = stops.map((s) => ({
    position: s.position,
    color: color(s.color, opacity),
  }));
  if (paint.type === "GRADIENT_LINEAR") {
    const start = m ? point(m, 0, 0.5, w, h) : [0, 0],
      end = m ? point(m, 1, 0.5, w, h) : [0, h];
    const dx = end[0] - start[0],
      dy = end[1] - start[1],
      length = Math.hypot(dx, dy);
    if (!length || !w || !h) {
      warn("GRADIENT_LINEAR has degenerate geometry");
      return null;
    }
    const ux = dx / length,
      uy = dy / length,
      line = Math.abs(ux * w) + Math.abs(uy * h);
    const offset = (start[0] - w / 2) * ux + (start[1] - h / 2) * uy;
    const list = colors
      .map(
        (s) =>
          `${s.color} ${100 * (0.5 + (offset + s.position * length) / line)}%`,
      )
      .join(",");
    return {
      css: `linear-gradient(${(Math.atan2(dx, -dy) * 180) / Math.PI}deg,${list})`,
      start,
      end,
      stops: colors,
    };
  }
  const center = m ? point(m, 0.5, 0.5, w, h) : [w / 2, h / 2];
  const at = `${center[0]}px ${center[1]}px`;
  if (paint.type === "GRADIENT_ANGULAR") {
    const edge = m ? point(m, 1, 0.5, w, h) : [center[0], center[1] - h / 2];
    const angle =
      (Math.atan2(edge[1] - center[1], edge[0] - center[0]) * 180) / Math.PI +
      90;
    return {
      css: `conic-gradient(from ${angle}deg at ${at},${colors.map((s) => `${s.color} ${s.position * 360}deg`).join(",")})`,
    };
  }
  if (paint.type === "GRADIENT_DIAMOND")
    warn(
      "GRADIENT_DIAMOND uses a radial approximation; visual review required",
    );
  if (m && Math.abs(((m.a * m.b + m.c * m.d) * w * h) / 4) > 1)
    warn(
      `${paint.type} has rotated/skewed axes; radial approximation needs visual review`,
    );
  const rx = m ? Math.hypot((m.a * w) / 2, (m.c * w) / 2) : w / 2;
  const ry = m ? Math.hypot((m.b * h) / 2, (m.d * h) / 2) : h / 2;
  return {
    css: `radial-gradient(${rx}px ${ry}px at ${at},${colors.map((s) => `${s.color} ${100 * s.position}%`).join(",")})`,
  };
}
