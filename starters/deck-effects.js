// Public build attributes are interpreted as data; no authored source is evaluated here.
export const effects = Object.fromEntries([
  ...[
    "fade",
    "fly",
    "wipe",
    "float",
    "split",
    "bounce",
    "zoom",
    "wheel",
    "random-bars",
    "blinds",
    "checkerboard",
    "dissolve",
    "box",
    "circle",
    "diamond",
    "plus",
    "strips",
    "wedge",
  ].flatMap((family) =>
    ["in", "out"].map((direction) => [
      `${family}-${direction}`,
      {
        family,
        kind: direction === "in" ? "entrance" : "exit",
        duration:
          family === "float"
            ? 1000
            : ["bounce", "wheel"].includes(family)
              ? 2000
              : 500,
      },
    ]),
  ),
  ...["appear", "disappear"].map((name) => [
    name,
    {
      family: name,
      kind: name === "appear" ? "entrance" : "exit",
      duration: 1,
    },
  ]),
  ...["spin", "grow", "shrink", "pulse", "teeter", "path"].map((name) => [
    name,
    {
      family: name,
      kind: name === "path" ? "path" : "emphasis",
      duration: name === "pulse" ? 500 : name === "teeter" ? 1000 : 2000,
    },
  ]),
]);
const bound = (n, min, max) => Math.min(max, Math.max(min, n));
export function parsePath(input) {
  const tokens =
    String(input ?? "").match(
      /[A-Za-z]+|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi,
    ) ?? [];
  let cursor = 0,
    points = [[0, 0]];
  const read = (count) => {
    const values = tokens.slice(cursor, cursor + count).map(Number);
    cursor += count;
    return values.length === count && values.every(Number.isFinite)
      ? values
      : null;
  };
  if (tokens[0]?.toUpperCase() === "M") {
    cursor++;
    const start = read(2);
    if (!start) return null;
    points = [start];
  }
  while (cursor < tokens.length && points.length < 32) {
    const command = tokens[cursor++].toUpperCase();
    if (command === "L") {
      const point = read(2);
      if (!point) break;
      points.push(point);
    } else if (command === "C") {
      const values = read(6);
      if (!values) break;
      const controls = [
        points.at(-1),
        values.slice(0, 2),
        values.slice(2, 4),
        values.slice(4, 6),
      ];
      for (let sample = 1; sample <= 16 && points.length < 32; sample++) {
        let row = controls,
          t = sample / 16;
        while (row.length > 1)
          row = row
            .slice(1)
            .map((point, index) =>
              point.map(
                (value, axis) => row[index][axis] * (1 - t) + value * t,
              ),
            );
        points.push(row[0]);
      }
    } else break;
  }
  if (points.length < 2) return null;
  const origin = points[0];
  return points.map((point) =>
    point.map((value, axis) => value - origin[axis]),
  );
}
export function parseEffect(attributes) {
  const get = (name) =>
    attributes.getAttribute
      ? attributes.getAttribute(name)
      : (attributes[name] ?? null);
  const read = (primary, alias) =>
    get(`data-anim-${primary}`) ?? get(`data-${alias ?? primary}`);
  const number = (value, fallback) =>
    Number.isFinite(parseFloat(value)) ? parseFloat(value) : fallback;
  const effect = (get("data-anim") ?? "").trim(),
    spec = effects[effect];
  if (!spec) return null;
  let direction = (read("dir", "direction") ?? "").trim();
  direction = { up: "top", down: "bottom" }[direction] ?? direction;
  const allowed = ["split", "random-bars", "blinds", "checkerboard"].includes(
    spec.family,
  )
    ? ["horizontal", "vertical"]
    : ["box", "circle", "diamond", "plus"].includes(spec.family)
      ? ["in", "out"]
      : spec.family === "strips"
        ? ["down-right", "down-left", "up-right", "up-left"]
        : spec.family === "float"
          ? ["top", "bottom"]
          : ["left", "right", "top", "bottom"];
  const fallback = ["split", "random-bars", "blinds", "checkerboard"].includes(
    spec.family,
  )
    ? spec.family === "split"
      ? "vertical"
      : "horizontal"
    : ["box", "circle", "diamond", "plus"].includes(spec.family)
      ? spec.kind === "exit"
        ? "out"
        : "in"
      : spec.family === "strips"
        ? "down-right"
        : "bottom";
  if (!allowed.includes(direction)) direction = fallback;
  const timing = (name, fallback) => {
    const milliseconds = get(`data-anim-${name}`);
    return milliseconds !== null
      ? number(milliseconds, fallback)
      : get(`data-${name}`) !== null
        ? number(get(`data-${name}`), fallback / 1000) * 1000
        : fallback;
  };
  const trigger = (read("trigger") ?? "").trim();
  const reverse = read("auto-reverse"),
    instant = spec.duration === 1;
  const model = {
    ...spec,
    effect,
    direction,
    delay: bound(timing("delay", 0), 0, 60000),
    duration: instant ? 1 : bound(timing("duration", spec.duration), 1, 60000),
    order: number(read("order"), 0),
    repeat: instant
      ? 1
      : bound(Math.floor(number(read("repeat"), 1)) || 1, 1, 100),
    autoReverse:
      ["spin", "grow", "shrink", "path"].includes(effect) &&
      reverse !== null &&
      /^(true|1)?$/i.test(reverse.trim()),
    rotate: bound(
      number(read("rotate"), effect === "teeter" ? 5 : 360),
      -3600,
      3600,
    ),
    scale: bound(
      number(
        read("scale"),
        effect === "shrink" ? 0.67 : effect === "pulse" ? 1.05 : 1.5,
      ),
      0.1,
      5,
    ),
    trigger: ["click", "with"].includes(trigger) ? trigger : "after",
  };
  if (effect === "path") {
    model.path = parsePath(read("path"));
    if (!model.path) return null;
  }
  if (["spin", "teeter"].includes(effect) && model.rotate === 0) return null;
  if (["grow", "shrink", "pulse"].includes(effect) && model.scale === 1)
    return null;
  return model;
}
export function buildSteps(entries) {
  const steps = [{ items: [], duration: 0 }];
  let previousStart = 0;
  for (const entry of [...entries].sort(
    (a, b) => a.order - b.order || a.documentIndex - b.documentIndex,
  )) {
    if (entry.trigger === "click") {
      steps.push({ items: [], duration: 0 });
      previousStart = 0;
    }
    const step = steps.at(-1),
      start =
        (entry.trigger === "with"
          ? previousStart
          : entry.trigger === "click"
            ? 0
            : step.duration) + entry.delay;
    step.items.push({ entry, start });
    previousStart = start;
    step.duration = Math.max(
      step.duration,
      start + entry.duration * entry.repeat * (entry.autoReverse ? 2 : 1),
    );
  }
  return steps;
}
export function maskVariant(entry) {
  const { family, direction } = entry;
  if (["wheel", "wedge", "dissolve"].includes(family)) return family;
  if (["split", "random-bars", "blinds", "checkerboard"].includes(family))
    return `${family}-${direction}`;
  if (
    ["circle", "plus"].includes(family) ||
    (["box", "diamond"].includes(family) && direction === "in")
  )
    return `${family}-${direction}`;
  if (family === "strips") return `strips-${direction}`;
  return null;
}
export function effectFrames(entry, geometry, masks = true) {
  const { family, kind, direction, opacity = 1 } = entry;
  const visible = { visibility: "visible" },
    hidden = { visibility: "hidden" };
  const pair = (from, to) => (kind === "exit" ? [to, from] : [from, to]);
  if (family === "appear" || family === "disappear")
    return pair(hidden, visible);
  if (family === "fade")
    return pair({ ...hidden, opacity: 0 }, { ...visible, opacity });
  if (family === "fly" || family === "float") {
    const delta =
      family === "float"
        ? [0, geometry.height * (direction === "top" ? -0.1 : 0.1)]
        : geometry.fly(direction);
    const from = { ...hidden, translate: `${delta[0]}px ${delta[1]}px` },
      to = { ...visible, translate: "0px 0px" };
    if (family === "float") {
      from.opacity = 0;
      to.opacity = opacity;
    }
    return pair(from, to);
  }
  if (family === "zoom")
    return pair(
      { ...hidden, scale: "0.1", opacity: 0 },
      { ...visible, scale: "1", opacity },
    );
  if (family === "wipe") {
    const edge = {
      left: "inset(0 100% 0 0)",
      right: "inset(0 0 0 100%)",
      top: "inset(0 0 100% 0)",
      bottom: "inset(100% 0 0 0)",
    }[direction];
    return pair(
      { ...hidden, clipPath: edge },
      { ...visible, clipPath: "inset(0 0 0 0)" },
    );
  }
  if (["box", "diamond"].includes(family) && direction === "out") {
    const from =
      family === "box"
        ? "inset(50% 50% 50% 50%)"
        : "polygon(50% 50%,50% 50%,50% 50%,50% 50%)";
    const to =
      family === "box"
        ? "inset(0 0 0 0)"
        : "polygon(50% -50%,150% 50%,50% 150%,-50% 50%)";
    return pair({ ...hidden, clipPath: from }, { ...visible, clipPath: to });
  }
  if (maskVariant(entry))
    return masks
      ? pair(
          { ...hidden, "--codex-deck-progress": 0 },
          { ...visible, "--codex-deck-progress": 1 },
        )
      : pair({ ...hidden, opacity: 0 }, { ...visible, opacity });
  if (family === "bounce") {
    const trajectory =
      kind === "entrance"
        ? [
            [0, -0.25, -0.33333],
            [0.36, -0.085, 0],
            [0.55, -0.053, -0.11111],
            [0.73, -0.021, 0],
            [0.82, -0.014, -0.037],
            [0.91, -0.0075, 0],
            [0.955, -0.004, -0.0123],
            [1, 0, 0],
          ]
        : [
            [0, 0, 0],
            [0.045, 0.004, -0.0123],
            [0.09, 0.0075, 0],
            [0.185, 0.014, -0.037],
            [0.28, 0.021, 0],
            [0.46, 0.053, -0.111],
            [0.64, 0.085, 0],
            [1, 0.25, 1.1],
          ];
    const frames = trajectory.map(([offset, x, y], index) => ({
      offset,
      translate: `${Math.round(x * geometry.width)}px ${Math.round(y * geometry.height)}px`,
      opacity: kind === "entrance" && index === 0 ? 0 : opacity,
      visibility: kind === "entrance" && index === 0 ? "hidden" : "visible",
      easing:
        (index % 2 === 0) === (kind === "entrance") ? "ease-in" : "ease-out",
    }));
    if (kind === "exit") {
      Object.assign(frames.at(-1), { opacity: 0, visibility: "hidden" });
      frames.at(-2).easing = "ease-in";
      frames.splice(-1, 0, { offset: 0.8, opacity });
    }
    return frames;
  }
  if (family === "spin")
    return [{ rotate: "0deg" }, { rotate: `${entry.rotate}deg` }];
  if (["grow", "shrink"].includes(family))
    return [{ scale: "1" }, { scale: String(entry.scale) }];
  if (family === "pulse")
    return [
      { offset: 0, scale: "1", opacity },
      { offset: 0.2, opacity: opacity * 0.5 },
      { offset: 0.5, scale: String(entry.scale) },
      { offset: 0.8, opacity: opacity * 0.5 },
      { offset: 1, scale: "1", opacity },
    ];
  if (family === "teeter")
    return [
      [0, 0],
      [0.1, 1],
      [0.2, 1],
      [0.4, -1],
      [0.6, 1],
      [0.8, -1],
      [1, 0],
    ].map(([offset, amount]) => ({
      offset,
      rotate: `${amount * entry.rotate}deg`,
    }));
  if (family === "path")
    return entry.path.map(([x, y]) => ({ translate: `${x}px ${y}px` }));
  return [{}, {}];
}
export function effectOptions(entry, start, instant = false) {
  return {
    duration: entry.duration,
    delay: instant ? 0 : start,
    iterations: entry.repeat * (entry.autoReverse ? 2 : 1),
    direction: entry.autoReverse ? "alternate" : "normal",
    fill: "both",
    easing: [
      "appear",
      "disappear",
      "fade",
      "fly",
      "float",
      "zoom",
      "spin",
      "grow",
      "shrink",
    ].includes(entry.family)
      ? "ease"
      : "linear",
  };
}
