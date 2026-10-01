// Independently written painter with the reference's public painting contract.
// SPDX-License-Identifier: MIT
// Public pigment/operation API data: Copyright (c) 2026 Jim Liu (Baoyu).
// RGB values are pigment transmittance: overlapping washes multiply, while
// reserve restores the seeded paper. Geometry is prepared once per operation.
(() => {
  if (window.CodexWatercolorKit) return;
  const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
  const weights = {
    wash: 3,
    gradedWash: 3,
    glaze: 1.5,
    ink: 2,
    hatch: 2,
    splatter: 1.2,
    dryStroke: 1.5,
    reserve: 0.6,
    caption: 0.8,
  };
  // Named pigment values are part of the inspected authoring contract.
  const pigments = {
    ultramarine: [0.3, 0.36, 0.78],
    cobalt: [0.34, 0.48, 0.8],
    cerulean: [0.38, 0.62, 0.82],
    indigo: [0.2, 0.24, 0.42],
    navy: [0.26, 0.3, 0.48],
    night: [0.14, 0.16, 0.3],
    burnt_sienna: [0.72, 0.42, 0.24],
    sienna: [0.72, 0.42, 0.24],
    raw_umber: [0.52, 0.42, 0.32],
    umber: [0.45, 0.36, 0.28],
    yellow_ochre: [0.9, 0.74, 0.36],
    ochre: [0.9, 0.74, 0.36],
    quin_rose: [0.86, 0.36, 0.55],
    quin_gold: [0.93, 0.72, 0.3],
    perylene_green: [0.3, 0.42, 0.32],
    sap_green: [0.55, 0.7, 0.3],
    olive: [0.58, 0.66, 0.36],
    neutral_tint: [0.42, 0.4, 0.46],
    paynes_grey: [0.36, 0.4, 0.48],
    grey: [0.62, 0.62, 0.64],
    sepia: [0.45, 0.36, 0.28],
    ink: [0.3, 0.27, 0.28],
    pencil: [0.45, 0.43, 0.43],
    aqua: [0.66, 0.81, 0.85],
    mint: [0.74, 0.87, 0.76],
    sage: [0.74, 0.84, 0.7],
    butter: [0.97, 0.89, 0.64],
    straw: [0.94, 0.86, 0.64],
    rose: [0.93, 0.74, 0.76],
    dusty_rose: [0.92, 0.74, 0.74],
    lavender: [0.78, 0.74, 0.88],
    sky: [0.66, 0.78, 0.9],
    teal: [0.45, 0.7, 0.74],
    tan: [0.8, 0.64, 0.46],
    fawn: [0.86, 0.72, 0.55],
    rust: [0.8, 0.46, 0.28],
    salmon: [0.93, 0.55, 0.45],
    cream: [0.96, 0.94, 0.88],
    moss: [0.52, 0.62, 0.4],
    shadow_violet: [0.6, 0.55, 0.74],
    warm_dark: [0.3, 0.24, 0.22],
  };
  function pigment(value) {
    if (
      Array.isArray(value) &&
      value.length === 3 &&
      value.every(Number.isFinite)
    )
      return value.map((n) => clamp(n));
    if (Object.hasOwn(pigments, value)) return [...pigments[value]];
    if (
      typeof value === "string" &&
      /^#[\da-f]{3}([\da-f]{3})?$/i.test(value)
    ) {
      const hex =
        value.length === 4
          ? value
              .slice(1)
              .split("")
              .map((c) => c + c)
              .join("")
          : value.slice(1);
      return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    }
    throw new Error(`Unknown pigment: ${value}`);
  }
  function random(seed = 7) {
    let state = ((Number(seed) | 0) + 0x9e3779b9) >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      const mixed = Math.imul(state ^ (state >>> 15), state | 1);
      const folded =
        (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)) ^ mixed;
      return ((folded ^ (folded >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(x, y, seed) {
    let value =
      Math.imul(x, 374761393) ^
      Math.imul(y, 668265263) ^
      Math.imul(seed, 1442695041);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, y, seed) {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const fx = x - ix,
      fy = y - iy;
    const a = fx * fx * (3 - 2 * fx),
      b = fy * fy * (3 - 2 * fy);
    const top = hash(ix, iy, seed) * (1 - a) + hash(ix + 1, iy, seed) * a;
    const bottom =
      hash(ix, iy + 1, seed) * (1 - a) + hash(ix + 1, iy + 1, seed) * a;
    return top * (1 - b) + bottom * b;
  }
  function canvas(width, height) {
    const value = document.createElement("canvas");
    value.width = width;
    value.height = height;
    return value;
  }
  function shapePath(context, shape) {
    if (!Array.isArray(shape))
      throw new Error("A shape must be a tagged array");
    const [kind, ...args] = shape;
    if (kind === "union") {
      for (const child of args[0]) shapePath(context, child);
    } else if (kind === "rect") context.rect(...args);
    else if (kind === "ellipse") {
      const [x, y, rx, ry = rx, rotation = 0] = args,
        angle = (rotation * Math.PI) / 180;
      context.moveTo(x + rx * Math.cos(angle), y + rx * Math.sin(angle));
      context.ellipse(x, y, rx, ry, angle, 0, 2 * Math.PI);
    } else if (kind === "poly") {
      args[0].forEach(([x, y], i) =>
        i ? context.lineTo(x, y) : context.moveTo(x, y),
      );
      context.closePath();
    } else if (kind === "path") {
      if (typeof args[0] !== "function")
        throw new Error("Path shapes require a Canvas2D drawing function");
      args[0](context);
    } else if (kind === "blob") {
      const [x, y, rx, ry = rx, options = {}] = args;
      const rng = random(options.seed ?? 1),
        phases = Array.from({ length: 4 }, () => rng() * Math.PI * 2);
      const angle = ((options.rot ?? 0) * Math.PI) / 180,
        wobble = options.wobble ?? 0.18;
      const points = Array.from({ length: 96 }, (_, i) => {
        const t = (i * Math.PI) / 48;
        const radius =
          1 +
          phases.reduce(
            (sum, phase, k) =>
              sum + (Math.sin(t * (k + 2) + phase) * wobble) / ((k + 2) * 2),
            0,
          );
        const px = rx * radius * Math.cos(t),
          py = ry * radius * Math.sin(t);
        return [
          x + px * Math.cos(angle) - py * Math.sin(angle),
          y + px * Math.sin(angle) + py * Math.cos(angle),
        ];
      });
      context.moveTo(
        (points.at(-1)[0] + points[0][0]) / 2,
        (points.at(-1)[1] + points[0][1]) / 2,
      );
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        context.quadraticCurveTo(...a, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      }
      context.closePath();
    } else throw new Error(`Unknown shape kind: ${kind}`);
  }
  // Exact separable squared-distance transform. An envelope of parabolas
  // replaces a quadratic nearest-pixel search; no reference implementation is used.
  function distance(mask, width, height, inside) {
    const result = new Float32Array(width * height),
      n = Math.max(width, height);
    const input = new Float64Array(n),
      output = new Float64Array(n),
      sites = new Int32Array(n),
      limits = new Float64Array(n + 1);
    const line = (length) => {
      let count = 0;
      sites[0] = 0;
      limits[0] = -Infinity;
      limits[1] = Infinity;
      for (let next = 1; next < length; next++) {
        let intersection;
        while (true) {
          const previous = sites[count];
          intersection =
            (input[next] +
              next * next -
              input[previous] -
              previous * previous) /
            (2 * (next - previous));
          if (intersection > limits[count] || count === 0) break;
          count--;
        }
        sites[++count] = next;
        limits[count] = intersection;
        limits[count + 1] = Infinity;
      }
      count = 0;
      for (let x = 0; x < length; x++) {
        while (limits[count + 1] < x) count++;
        output[x] = (x - sites[count]) ** 2 + input[sites[count]];
      }
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++)
        input[x] = mask[y * width + x] > 127 === inside ? 0 : 1e12;
      line(width);
      for (let x = 0; x < width; x++) result[y * width + x] = output[x];
    }
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) input[y] = result[y * width + x];
      line(height);
      for (let y = 0; y < height; y++)
        result[y * width + x] = Math.sqrt(output[y]);
    }
    return result;
  }
  function blur(values, width, height, radius) {
    radius = Math.max(0, Math.round(radius));
    if (!radius) return values;
    let current = values;
    for (let pass = 0; pass < 2; pass++) {
      const horizontal = new Float32Array(values.length),
        vertical = new Float32Array(values.length);
      for (let y = 0; y < height; y++) {
        let sum = 0;
        for (let i = -radius; i <= radius; i++)
          sum += current[y * width + clamp(i, 0, width - 1)];
        for (let x = 0; x < width; x++) {
          horizontal[y * width + x] = sum / (radius * 2 + 1);
          sum +=
            current[y * width + clamp(x + radius + 1, 0, width - 1)] -
            current[y * width + clamp(x - radius, 0, width - 1)];
        }
      }
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let i = -radius; i <= radius; i++)
          sum += horizontal[clamp(i, 0, height - 1) * width + x];
        for (let y = 0; y < height; y++) {
          vertical[y * width + x] = sum / (radius * 2 + 1);
          sum +=
            horizontal[clamp(y + radius + 1, 0, height - 1) * width + x] -
            horizontal[clamp(y - radius, 0, height - 1) * width + x];
        }
      }
      current = vertical;
    }
    return current;
  }
  function ramp(stops, position, gamma = 1) {
    if (!Array.isArray(stops) || !stops.length)
      throw new Error("A ramp requires numeric stops");
    let i = 1;
    while (i < stops.length && position > stops[i][0]) i++;
    if (i === stops.length) return stops.at(-1)[1];
    if (!i || stops.length === 1 || position <= stops[0][0]) return stops[0][1];
    const [a, left] = stops[i - 1],
      [b, right] = stops[i],
      u = clamp((position - a) / (b - a || 1));
    if (Array.isArray(left))
      return left.map(
        (v, channel) =>
          ((1 - u) * v ** (1 / gamma) + u * right[channel] ** (1 / gamma)) **
          gamma,
      );
    return left * (1 - u) + right * u;
  }

  function paper(width, height, options = {}) {
    width = Math.round(width);
    height = Math.round(height);
    if (
      width < 1 ||
      height < 1 ||
      !Number.isFinite(width * height) ||
      width * height > 12000000
    )
      throw new Error("Paper must contain between 1 and 12 million pixels");
    const scale = options.scale ?? 1,
      seed = options.seed ?? 7;
    if (!Number.isFinite(scale) || scale <= 0)
      throw new Error("Paper scale must be positive");
    const output = canvas(width, height),
      context = output.getContext("2d"),
      maskCanvas = canvas(width, height),
      maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    const count = width * height,
      pristine = new Float32Array(count * 3),
      tooth = new Float32Array(count);
    const cream = pigment(options.cream ?? [0.968, 0.952, 0.905]),
      grain = options.grain ?? 1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        tooth[i] =
          hash(x, y, seed) * 0.32 +
          noise(x / (6 * scale), y / (6 * scale), seed + 11) * 0.48 +
          noise(x / (90 * scale), y / (90 * scale), seed + 23) * 0.2;
        const warmth =
          noise(x / (200 * scale), y / (200 * scale), seed + 99) - 0.5;
        const light = 1 + grain * 0.03 * (tooth[i] - 0.5);
        for (let channel = 0; channel < 3; channel++)
          pristine[i * 3 + channel] = clamp(
            (cream[channel] +
              (channel === 0 ? 0.01 : channel === 2 ? -0.014 : 0) * warmth) *
              light,
          );
      }
    const pixels = pristine.slice(),
      ops = [];
    const blankMask = () => {
      maskContext.reset();
      maskContext.scale(scale, scale);
      maskContext.fillStyle = "white";
      maskContext.strokeStyle = "white";
    };
    function readMask(padding = 0) {
      const rgba = maskContext.getImageData(0, 0, width, height).data;
      let left = width,
        top = height,
        right = -1,
        bottom = -1;
      for (let i = 0; i < count; i++)
        if (rgba[i * 4 + 3]) {
          const x = i % width,
            y = Math.floor(i / width);
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      if (right < 0) return null;
      const pad = Math.ceil(padding * scale);
      left = Math.max(0, left - pad);
      top = Math.max(0, top - pad);
      right = Math.min(width - 1, right + pad);
      bottom = Math.min(height - 1, bottom + pad);
      const w = right - left + 1,
        h = bottom - top + 1,
        alpha = new Uint8Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          alpha[y * w + x] = rgba[((top + y) * width + left + x) * 4 + 3];
      return { x: left, y: top, w, h, alpha };
    }
    const shapeMask = (shape, padding = 0) => {
      blankMask();
      maskContext.beginPath();
      shapePath(maskContext, shape);
      maskContext.fill();
      return readMask(padding);
    };
    function washField(shape, configuration) {
      const o = {
        load: 1,
        deckle: 3,
        feather: 1.5,
        edgePool: 0.9,
        edgeWidth: 4,
        granulation: 0.18,
        mottle: 0.35,
        seed: 0,
        ...configuration,
      };
      let region = shapeMask(shape, o.deckle * 3 + o.feather * 3 + 8);
      if (!region) return null;
      let toInside = distance(region.alpha, region.w, region.h, true),
        toOutside = distance(region.alpha, region.w, region.h, false);
      if (o.deckle > 0) {
        const warped = region.alpha.slice();
        for (let y = 0; y < region.h; y++)
          for (let x = 0; x < region.w; x++) {
            const i = y * region.w + x;
            const drift =
              (noise(
                (x + region.x) / (40 * scale),
                (y + region.y) / (40 * scale),
                seed + o.seed + 777,
              ) -
                0.5) *
              2 *
              o.deckle *
              scale;
            warped[i] = toOutside[i] - toInside[i] + drift > 0 ? 255 : 0;
          }
        toInside = distance(warped, region.w, region.h, true);
        toOutside = distance(warped, region.w, region.h, false);
      }
      const density = new Float32Array(region.w * region.h);
      for (let y = 0; y < region.h; y++)
        for (let x = 0; x < region.w; x++) {
          const i = y * region.w + x,
            sx = (region.x + x) / scale,
            sy = (region.y + y) / scale;
          const signed = (toOutside[i] - toInside[i]) / scale;
          const coverage =
            o.feather > 0
              ? clamp(0.5 + signed / (2 * o.feather))
              : signed >= 0
                ? 1
                : 0;
          if (!coverage) continue;
          const cloud =
            noise(sx / 110, sy / 110, seed + o.seed + 501) * 0.65 +
            noise(sx / 45, sy / 45, seed + o.seed + 603) * 0.35;
          let amount =
            o.load *
            (1 +
              o.edgePool *
                Math.exp(-Math.max(0, signed) / Math.max(o.edgeWidth, 0.001)) *
                (0.35 + 1.3 * cloud));
          amount *=
            1 +
            o.granulation *
              (0.5 - tooth[(region.y + y) * width + region.x + x]) *
              2;
          amount *= 1 + o.mottle * 1.4 * (cloud - 0.5);
          for (const [cx, cy, radius] of o.blooms ?? []) {
            const r = Math.max(radius, 0.001),
              d =
                Math.hypot(sx - cx, sy - cy) +
                (noise(sx / 40, sy / 40, seed + o.seed + 999) - 0.5) * r * 0.55;
            amount =
              amount * (1 - 0.75 * clamp(1 - d / r)) +
              o.load * 0.9 * Math.exp(-(((d - r) / (r * 0.1)) ** 2) / 2);
          }
          density[i] = Math.max(
            0,
            amount * coverage * (o.weight ? o.weight(sx, sy) : 1),
          );
        }
      return { ...region, density };
    }
    function pathsMask(paths, configuration = {}, progress = 1, clipShape) {
      const o = {
        width: 1.6,
        wobble: 0.9,
        lost: 0.3,
        load: 1.3,
        taper: 0.35,
        seed: 31,
        grain: 0.5,
        ...configuration,
      };
      blankMask();
      if (clipShape) {
        maskContext.beginPath();
        shapePath(maskContext, clipShape);
        maskContext.clip();
      }
      maskContext.lineCap = "round";
      maskContext.globalCompositeOperation = "lighten";
      if (!paths.length) return null;
      if (typeof paths[0][0] === "number") paths = [paths];
      const rng = random(o.seed);
      for (const points of paths) {
        if (points.length < 2) continue;
        const lengths = points
          .slice(1)
          .map((b, i) => Math.hypot(b[0] - points[i][0], b[1] - points[i][1]));
        const total = lengths.reduce((a, b) => a + b, 0),
          phase = rng() * Math.PI * 2;
        let distanceAlong = 0;
        for (let j = 0; j < lengths.length; j++) {
          const start = points[j],
            end = points[j + 1],
            segments = Math.max(1, Math.ceil(lengths[j] / 3));
          const normal = [
            -(end[1] - start[1]) / (lengths[j] || 1),
            (end[0] - start[0]) / (lengths[j] || 1),
          ];
          for (let s = 0; s < segments; s++) {
            const from = distanceAlong + (lengths[j] * s) / segments,
              to = distanceAlong + (lengths[j] * (s + 1)) / segments;
            if (from >= progress * total) break;
            const visibleEnd = Math.min(to, progress * total),
              middle = (from + visibleEnd) / 2;
            const visibility = clamp(
              (0.5 +
                0.5 * Math.sin(middle / 18 + phase) +
                0.25 * Math.sin(middle / 45 + phase) +
                0.15 -
                o.lost) /
                0.3,
            );
            if (!visibility) continue;
            const displaced = (d) => {
              const fraction = lengths[j]
                ? (d - distanceAlong) / lengths[j]
                : 0;
              const wobble =
                o.wobble *
                (0.7 * Math.sin(d / 22 + phase) +
                  0.5 * Math.sin(d / 9 + phase));
              return [
                start[0] + (end[0] - start[0]) * fraction + normal[0] * wobble,
                start[1] + (end[1] - start[1]) * fraction + normal[1] * wobble,
              ];
            };
            const taper = clamp(
              Math.min(middle, total - middle) /
                Math.max(total * o.taper * 0.5, 0.001) +
                0.25,
            );
            maskContext.strokeStyle = `rgba(255,255,255,${visibility})`;
            maskContext.lineWidth = Math.max(0.6 / scale, o.width * taper);
            maskContext.beginPath();
            maskContext.moveTo(...displaced(from));
            maskContext.lineTo(...displaced(visibleEnd));
            maskContext.stroke();
          }
          distanceAlong += lengths[j];
        }
      }
      const region = readMask();
      if (!region) return null;
      const density = Float32Array.from(
        region.alpha,
        (a, i) =>
          (a / 255) *
          o.load *
          (1 -
            o.grain +
            o.grain *
              tooth[
                (region.y + Math.floor(i / region.w)) * width +
                  region.x +
                  (i % region.w)
              ] *
              1.6),
      );
      return { ...region, density };
    }
    function prepare(op, progress = 1) {
      const [shape, color, configuration = {}] = op.a;
      if (["wash", "glaze"].includes(op.k)) {
        const o =
          op.k === "glaze"
            ? {
                load: 0.4,
                edgePool: 0,
                deckle: 1,
                feather: 3,
                granulation: 0.2,
                mottle: 0.15,
                ...configuration,
              }
            : configuration;
        const region = washField(shape, o);
        return region && { ...region, color: pigment(color) };
      }
      if (op.k === "gradedWash") {
        const stops = Array.isArray(color) && Array.isArray(color[0]);
        const o = stops ? (op.a[2] ?? {}) : (op.a[3] ?? {});
        const region = washField(shape, o);
        if (!region) return null;
        const gradient = stops
          ? color.map(([position, value]) => [position, pigment(value)])
          : null;
        const a = stops ? null : pigment(color),
          b = stops ? null : pigment(op.a[2]);
        return {
          ...region,
          colorAt: (x, y) => {
            const position =
              o.axis === "x"
                ? x / Math.max(region.w - 1, 1)
                : y / Math.max(region.h - 1, 1);
            const value = stops
              ? ramp(gradient, position, o.gamma ?? 1.9)
              : a.map((channel, i) => {
                  const front =
                    (position -
                      (o.front ?? 0.5) +
                      0.3 * (noise(x / 45, y / 45, (o.seed ?? 0) + 17) - 0.5)) /
                    Math.max(o.soft ?? 0.18, 0.0001);
                  const blend = 1 / (1 + Math.exp(-front));
                  return channel ** (1 - blend) * b[i] ** blend;
                });
            return { value, weight: o.profile ? ramp(o.profile, position) : 1 };
          },
        };
      }
      if (op.k === "reserve") {
        const o = color ?? {},
          region = shapeMask(shape, (o.feather ?? 2) * 3 + 4);
        if (!region) return null;
        return {
          ...region,
          density: blur(
            Float32Array.from(region.alpha, (a) => a / 255),
            region.w,
            region.h,
            (o.feather ?? 2) * scale,
          ),
          alpha: o.alpha ?? 1,
          reserve: true,
        };
      }
      if (op.k === "ink") {
        const region = pathsMask(shape, color, progress);
        return (
          region && {
            ...region,
            color: pigment(color?.color ?? "ink"),
            geometric: true,
          }
        );
      }
      if (op.k === "hatch") {
        const o = color ?? {},
          region = shapeMask(shape);
        if (!region) return null;
        const angle = ((o.angle ?? -55) * Math.PI) / 180,
          dx = Math.cos(angle),
          dy = Math.sin(angle);
        const cx = (region.x + region.w / 2) / scale,
          cy = (region.y + region.h / 2) / scale,
          reach = Math.hypot(region.w, region.h) / scale;
        const rng = random(o.seed ?? 5),
          lines = [];
        for (
          let offset = -reach;
          offset < reach;
          offset += Math.max(0.25, o.spacing ?? 7) * (0.8 + rng() * 0.5)
        ) {
          const x = cx - dy * offset,
            y = cy + dx * offset;
          lines.push([
            [x - dx * reach, y - dy * reach],
            [x + dx * reach, y + dy * reach],
          ]);
        }
        const fields = pathsMask(
          lines,
          { width: 1.1, wobble: 0.5, lost: 0.25, load: 1, ...o },
          progress,
          shape,
        );
        return (
          fields && {
            ...fields,
            color: pigment(o.color ?? "ink"),
            geometric: true,
          }
        );
      }
      if (op.k === "splatter") {
        const [x, y, radius, hue, o = {}] = op.a,
          rng = random(o.seed ?? 11),
          size = o.size ?? [1.2, 4.5];
        const drops = Array.from({ length: o.n ?? 30 }, () => {
          const angle = rng() * Math.PI * 2,
            r = Math.sqrt(rng()) * radius;
          return [
            "ellipse",
            x + Math.cos(angle) * r,
            y + Math.sin(angle) * r,
            size[0] + rng() * (size[1] - size[0]),
          ];
        });
        const region = washField(["union", drops], {
          load: 1.2,
          deckle: 0,
          feather: 0.7,
          edgePool: 0.9,
          edgeWidth: 1.2,
          granulation: 0.3,
          mottle: 0.2,
          ...o,
        });
        return region && { ...region, color: pigment(hue) };
      }
      if (op.k === "dryStroke") {
        const o = configuration,
          points = shape;
        if (points.length < 2) return null;
        blankMask();
        maskContext.lineWidth = o.width ?? 6;
        maskContext.lineCap = "round";
        maskContext.lineJoin = "round";
        maskContext.beginPath();
        points.forEach(([x, y], i) =>
          i ? maskContext.lineTo(x, y) : maskContext.moveTo(x, y),
        );
        maskContext.stroke();
        const region = readMask();
        if (!region) return null;
        const density = Float32Array.from(region.alpha, (a, i) => {
          const x = region.x + (i % region.w),
            y = region.y + Math.floor(i / region.w),
            bias = o.toothBias ?? 0.6;
          const catchAmount = clamp(
            (tooth[y * width + x] - bias) / (1 - bias + 0.000001),
          );
          const taper = clamp(
            Math.min(
              Math.hypot(x / scale - points[0][0], y / scale - points[0][1]),
              Math.hypot(
                x / scale - points.at(-1)[0],
                y / scale - points.at(-1)[1],
              ),
            ) /
              ((o.width ?? 6) * 4) +
              0.1,
          );
          return (
            (a / 255) *
            (o.load ?? 1.1) *
            taper *
            (0.12 + 2.4 * Math.sqrt(catchAmount))
          );
        });
        return { ...region, density, color: pigment(color) };
      }
      if (op.k === "caption") {
        const o = color ?? {},
          size = o.size ?? Math.round((width / scale) * 0.013),
          spacing = o.spacing ?? size * 0.55;
        blankMask();
        maskContext.font = `${o.italic ? "italic " : ""}${size}px ${o.font ?? "Georgia, serif"}`;
        const characters = [...String(shape)],
          total =
            characters.reduce(
              (sum, letter) => sum + maskContext.measureText(letter).width,
              0,
            ) +
            Math.max(0, characters.length - 1) * spacing;
        let x = (o.x ?? width / scale / 2) - total / 2;
        maskContext.textBaseline = "middle";
        for (const character of characters) {
          maskContext.fillText(
            character,
            x,
            o.y ?? height / scale - size * 2.2,
          );
          x += maskContext.measureText(character).width + spacing;
        }
        const region = readMask();
        return (
          region && {
            ...region,
            density: Float32Array.from(
              region.alpha,
              (a) => (a / 255) * (o.load ?? 1.1),
            ),
            color: pigment(o.color ?? "sepia"),
          }
        );
      }
      throw new Error(`Unknown paint operation: ${op.k}`);
    }
    function field(op, progress) {
      if (op.k === "ink" || op.k === "hatch") return prepare(op, progress);
      if (!Object.hasOwn(op, "prepared")) op.prepared = prepare(op);
      return op.prepared;
    }
    function apply(target, op, progress, white = false) {
      const region = field(op, progress);
      if (!region || progress <= 0) return region;
      for (let y = 0; y < region.h; y++)
        for (let x = 0; x < region.w; x++) {
          const local = y * region.w + x,
            global = ((region.y + y) * width + region.x + x) * 3;
          const amount =
            region.density[local] * (region.geometric ? 1 : progress);
          if (region.reserve) {
            if (white) continue;
            const alpha = clamp(amount * region.alpha);
            for (let channel = 0; channel < 3; channel++)
              target[global + channel] =
                target[global + channel] * (1 - alpha) +
                pristine[global + channel] * alpha;
          } else {
            const gradient = region.colorAt?.(x, y),
              hue = gradient?.value ?? region.color,
              weight = gradient?.weight ?? 1;
            for (let channel = 0; channel < 3; channel++)
              target[global + channel] *=
                Math.max(hue[channel], 0.001) ** Math.max(0, amount * weight);
          }
        }
      return region;
    }
    function render() {
      const image = context.createImageData(width, height);
      for (let i = 0; i < count; i++) {
        for (let channel = 0; channel < 3; channel++)
          image.data[i * 4 + channel] = Math.round(
            clamp(pixels[i * 3 + channel]) * 255,
          );
        image.data[i * 4 + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      return output;
    }
    function resetSheet() {
      pixels.set(pristine);
      return api;
    }
    function timeline() {
      let total = 0;
      return { cum: ops.map((op) => (total += weights[op.k])), total };
    }
    function renderUpTo(index, progress = 0) {
      resetSheet();
      index = clamp(index, 0, ops.length);
      for (let i = 0; i < index; i++) apply(pixels, ops[i], 1);
      if (index < ops.length && progress > 0)
        apply(pixels, ops[index], clamp(progress));
      render();
      return api;
    }
    function seek(progress) {
      const times = timeline(),
        time = clamp(Number(progress) || 0) * times.total;
      let index = 0;
      while (index < ops.length && times.cum[index] <= time) index++;
      const start = index ? times.cum[index - 1] : 0;
      return renderUpTo(
        index,
        index < ops.length ? (time - start) / (times.cum[index] - start) : 0,
      );
    }
    function layer(index, progress = 1) {
      const op = ops[index];
      if (!op) throw new Error("No paint operation at that index");
      const whole = field(op, 1);
      if (!whole) return null;
      const region = field(op, clamp(progress)),
        isolated = new Float32Array(count * 3).fill(1);
      apply(isolated, op, clamp(progress), true);
      const imageCanvas = canvas(whole.w, whole.h),
        imageContext = imageCanvas.getContext("2d"),
        image = imageContext.createImageData(whole.w, whole.h);
      for (let y = 0; y < whole.h; y++)
        for (let x = 0; x < whole.w; x++) {
          const pixel = (whole.y + y) * width + whole.x + x,
            local = (y * whole.w + x) * 4;
          for (let channel = 0; channel < 3; channel++)
            image.data[local + channel] = Math.round(
              (op.k === "reserve"
                ? pristine[pixel * 3 + channel]
                : isolated[pixel * 3 + channel]) * 255,
            );
          if (op.k === "reserve")
            image.data[local + 3] = region
              ? Math.round(
                  clamp(
                    region.density[y * region.w + x] * region.alpha * progress,
                  ) * 255,
                )
              : 0;
          else image.data[local + 3] = 255;
        }
      imageContext.putImageData(image, 0, 0);
      return {
        canvas: imageCanvas,
        kind: op.k,
        x: whole.x / width,
        y: whole.y / height,
        w: whole.w / width,
        h: whole.h / height,
      };
    }
    const api = {
      canvas: output,
      width,
      height,
      scale,
      tooth,
      rng: random(seed),
      ops,
      render,
      resetSheet,
      timeline,
      seek,
      renderUpTo,
      layer,
      pigment,
    };
    for (const kind of Object.keys(weights))
      api[kind] = (...args) => {
        const op = { k: kind, a: args };
        ops.push(op);
        if (!options.defer) apply(pixels, op, 1);
        return api;
      };
    render();
    return api;
  }

  const sheets = new WeakMap(),
    sets = new WeakMap();
  function sheetOptions(options = {}) {
    const width = Number(options.width ?? 900),
      height = Number(options.height ?? 1200),
      requested = Number(options.scale ?? 1);
    if (
      !(width > 0 && height > 0 && requested > 0) ||
      !Number.isFinite(width * height * requested)
    )
      throw new Error("Invalid painting dimensions or scale");
    return {
      ...options,
      width,
      height,
      scale: Math.min(requested, Math.sqrt(11000000 / (width * height))),
    };
  }
  function build(painting, options) {
    if (typeof painting !== "function")
      throw new Error("A synchronous painting function is required");
    const sheet = paper(
      options.width * options.scale,
      options.height * options.scale,
      { seed: options.seed, scale: options.scale, defer: true },
    );
    const result = painting(sheet);
    if (result?.then) throw new Error("Painting functions must be synchronous");
    return sheet;
  }
  function cached(cache, painting, key, create) {
    if (typeof painting !== "function")
      throw new Error("A painting function is required");
    let entries = cache.get(painting);
    if (!entries) {
      entries = new Map();
      cache.set(painting, entries);
    }
    if (!entries.has(key)) {
      entries.set(key, create());
      if (entries.size > 2) entries.delete(entries.keys().next().value);
    }
    return entries.get(key);
  }
  function frame(painting, options = {}) {
    const o = sheetOptions(options),
      key = JSON.stringify([o.width, o.height, o.scale, o.seed]);
    const sheet = cached(sheets, painting, key, () => build(painting, o));
    sheet.seek(o.at ?? 1);
    return sheet.canvas.toDataURL(o.type ?? "image/png", o.quality);
  }
  async function bake(painting, options = {}, onFrame) {
    const o = sheetOptions(options),
      steps = Math.max(1, Math.round(o.steps ?? 36)),
      sheet = build(painting, o),
      frames = [];
    if (!Number.isFinite(steps)) throw new Error("Bake steps must be finite");
    for (let i = 0; i <= steps; i++) {
      sheet.seek(i / steps);
      const image = sheet.canvas.toDataURL(
        o.type ?? "image/jpeg",
        o.quality ?? 0.88,
      );
      frames.push(image);
      onFrame?.(i, steps, image);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return frames;
  }
  function layers(painting, options = {}) {
    const o = sheetOptions(options),
      key = JSON.stringify([o.width, o.height, o.scale, o.seed, o.quality]);
    return cached(sets, painting, key, () => {
      const sheet = build(painting, o),
        metadata = new Map(),
        images = new Map(),
        partials = new Map();
      sheet.resetSheet();
      const paperImage = sheet.render().toDataURL("image/png"),
        times = sheet.timeline();
      const format = o.quality === 1 ? "image/png" : "image/webp";
      const encode = (image) => image.toDataURL(format, o.quality ?? 0.92);
      const ensure = (i) => {
        if (!metadata.has(i)) {
          const value = sheet.layer(i, 1);
          metadata.set(
            i,
            value
              ? {
                  kind: value.kind,
                  box: { x: value.x, y: value.y, w: value.w, h: value.h },
                }
              : { kind: sheet.ops[i]?.k, box: null },
          );
          images.set(i + ":1", value ? encode(value.canvas) : null);
        }
        return metadata.get(i);
      };
      let warming;
      const api = {
        width: o.width,
        height: o.height,
        count: sheet.ops.length,
        paper: paperImage,
        kind: (i) => ensure(i).kind,
        box: (i) => ensure(i).box,
        span: (i) => ({
          from: (i ? times.cum[i - 1] : 0) / (times.total || 1),
          to: times.cum[i] / (times.total || 1),
        }),
        src: (i, progress = 1) => {
          ensure(i);
          const at = clamp(Math.round(progress * 48) / 48),
            key = `${i}:${at}`;
          if (!images.has(key)) {
            const image = at > 0 ? sheet.layer(i, at) : null;
            images.set(key, image ? encode(image.canvas) : null);
            if (at > 0 && at < 1) {
              const recent = partials.get(i) ?? [];
              recent.push(key);
              if (recent.length > 8) images.delete(recent.shift());
              partials.set(i, recent);
            }
          }
          return images.get(key);
        },
        warm: () =>
          (warming ??= (async () => {
            for (let i = 0; i < sheet.ops.length; i++) {
              ensure(i);
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          })()),
      };
      return api;
    });
  }
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2);
  const inverseEase = (t) =>
    t < 0.5 ? Math.sqrt(t / 2) : 1 - Math.sqrt((1 - t) / 2);
  class WatercolorElement extends HTMLElement {
    static observedAttributes = ["width", "height", "seed", "controls"];
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._progress = 0;
    }
    connectedCallback() {
      if (this._painting && !this._sheet) this.setup();
    }
    disconnectedCallback() {
      this.pause();
    }
    attributeChangedCallback() {
      if (this._sheet) this.setup();
    }
    get painting() {
      return this._painting;
    }
    set painting(value) {
      this._painting = value;
      this.setup();
    }
    get progress() {
      return this._progress;
    }
    setup() {
      this.pause();
      if (!this._painting) return;
      const o = sheetOptions({
        width: this.getAttribute("width") ?? 900,
        height: this.getAttribute("height") ?? 1200,
        seed: this.hasAttribute("seed") ? +this.getAttribute("seed") : 7,
        scale: Math.min(devicePixelRatio || 1, 1.5),
      });
      this._sheet = build(this._painting, o);
      this.shadowRoot.innerHTML =
        "<style>:host{display:block;position:relative}canvas{display:block;width:100%;height:auto}button{position:absolute;right:10px;bottom:10px;border:1px solid #ccc3b5;background:#fff9;color:#635b4e;border-radius:999px;padding:6px 14px;font:12px system-ui;cursor:pointer}button[hidden]{display:none}</style>";
      this.shadowRoot.append(this._sheet.canvas);
      if (this.hasAttribute("controls")) {
        const button = document.createElement("button");
        button.textContent = "Paint again";
        button.hidden = true;
        button.onclick = () => this.play(0);
        this.shadowRoot.append(button);
      }
      this.seek(0);
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) this.seek(1);
      else if (this.getAttribute("autoplay") !== "false") this.play(0);
    }
    seek(progress) {
      this._progress = clamp(Number(progress) || 0);
      this._sheet?.seek(this._progress);
      const button = this.shadowRoot.querySelector("button");
      if (button) button.hidden = this._progress < 1;
    }
    pause() {
      cancelAnimationFrame(this._request);
      clearTimeout(this._loop);
    }
    play(from) {
      if (!this._sheet) return;
      this.pause();
      if (from !== undefined) this.seek(from);
      const duration =
        Math.max(0.001, Number(this.getAttribute("duration") ?? 12)) * 1000;
      const start =
        performance.now() -
        inverseEase(this.progress >= 1 ? 0 : this.progress) * duration;
      const tick = (now) => {
        if (!this.isConnected) return;
        const at = clamp((now - start) / duration);
        this.seek(ease(at));
        if (at < 1) this._request = requestAnimationFrame(tick);
        else {
          this.dispatchEvent(new CustomEvent("watercolor-done"));
          if (this.hasAttribute("loop"))
            this._loop = setTimeout(() => this.play(0), 1200);
        }
      };
      this._request = requestAnimationFrame(tick);
    }
  }
  window.CodexWatercolorKit = { paper, frame, bake, layers, pigment };
  if (!window.WatercolorKit) window.WatercolorKit = window.CodexWatercolorKit;
  if (!customElements.get("watercolor-kit"))
    customElements.define("watercolor-kit", WatercolorElement);
})();
