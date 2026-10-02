(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // skills/studio-design/assets/starters/deck-effects.js
  function parsePath(input) {
    const tokens = String(input ?? "").match(
      /[A-Za-z]+|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi
    ) ?? [];
    let cursor = 0, points = [[0, 0]];
    const read = (count) => {
      const values = tokens.slice(cursor, cursor + count).map(Number);
      cursor += count;
      return values.length === count && values.every(Number.isFinite) ? values : null;
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
          values.slice(4, 6)
        ];
        for (let sample = 1; sample <= 16 && points.length < 32; sample++) {
          let row = controls, t = sample / 16;
          while (row.length > 1)
            row = row.slice(1).map(
              (point, index) => point.map(
                (value, axis) => row[index][axis] * (1 - t) + value * t
              )
            );
          points.push(row[0]);
        }
      } else break;
    }
    if (points.length < 2) return null;
    const origin = points[0];
    return points.map(
      (point) => point.map((value, axis) => value - origin[axis])
    );
  }
  function parseEffect(attributes) {
    const get = (name) => attributes.getAttribute ? attributes.getAttribute(name) : attributes[name] ?? null;
    const read = (primary, alias) => get(`data-anim-${primary}`) ?? get(`data-${alias ?? primary}`);
    const number = (value, fallback2) => Number.isFinite(parseFloat(value)) ? parseFloat(value) : fallback2;
    const effect = (get("data-anim") ?? "").trim(), spec = effects[effect];
    if (!spec) return null;
    let direction = (read("dir", "direction") ?? "").trim();
    direction = { up: "top", down: "bottom" }[direction] ?? direction;
    const allowed = ["split", "random-bars", "blinds", "checkerboard"].includes(
      spec.family
    ) ? ["horizontal", "vertical"] : ["box", "circle", "diamond", "plus"].includes(spec.family) ? ["in", "out"] : spec.family === "strips" ? ["down-right", "down-left", "up-right", "up-left"] : spec.family === "float" ? ["top", "bottom"] : ["left", "right", "top", "bottom"];
    const fallback = ["split", "random-bars", "blinds", "checkerboard"].includes(
      spec.family
    ) ? spec.family === "split" ? "vertical" : "horizontal" : ["box", "circle", "diamond", "plus"].includes(spec.family) ? spec.kind === "exit" ? "out" : "in" : spec.family === "strips" ? "down-right" : "bottom";
    if (!allowed.includes(direction)) direction = fallback;
    const timing = (name, fallback2) => {
      const milliseconds = get(`data-anim-${name}`);
      return milliseconds !== null ? number(milliseconds, fallback2) : get(`data-${name}`) !== null ? number(get(`data-${name}`), fallback2 / 1e3) * 1e3 : fallback2;
    };
    const trigger = (read("trigger") ?? "").trim();
    const reverse = read("auto-reverse"), instant = spec.duration === 1;
    const model = {
      ...spec,
      effect,
      direction,
      delay: bound(timing("delay", 0), 0, 6e4),
      duration: instant ? 1 : bound(timing("duration", spec.duration), 1, 6e4),
      order: number(read("order"), 0),
      repeat: instant ? 1 : bound(Math.floor(number(read("repeat"), 1)) || 1, 1, 100),
      autoReverse: ["spin", "grow", "shrink", "path"].includes(effect) && reverse !== null && /^(true|1)?$/i.test(reverse.trim()),
      rotate: bound(
        number(read("rotate"), effect === "teeter" ? 5 : 360),
        -3600,
        3600
      ),
      scale: bound(
        number(
          read("scale"),
          effect === "shrink" ? 0.67 : effect === "pulse" ? 1.05 : 1.5
        ),
        0.1,
        5
      ),
      trigger: ["click", "with"].includes(trigger) ? trigger : "after"
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
  function buildSteps(entries) {
    const steps = [{ items: [], duration: 0 }];
    let previousStart = 0;
    for (const entry of [...entries].sort(
      (a, b) => a.order - b.order || a.documentIndex - b.documentIndex
    )) {
      if (entry.trigger === "click") {
        steps.push({ items: [], duration: 0 });
        previousStart = 0;
      }
      const step = steps.at(-1), start = (entry.trigger === "with" ? previousStart : entry.trigger === "click" ? 0 : step.duration) + entry.delay;
      step.items.push({ entry, start });
      previousStart = start;
      step.duration = Math.max(
        step.duration,
        start + entry.duration * entry.repeat * (entry.autoReverse ? 2 : 1)
      );
    }
    return steps;
  }
  function maskVariant(entry) {
    const { family, direction } = entry;
    if (["wheel", "wedge", "dissolve"].includes(family)) return family;
    if (["split", "random-bars", "blinds", "checkerboard"].includes(family))
      return `${family}-${direction}`;
    if (["circle", "plus"].includes(family) || ["box", "diamond"].includes(family) && direction === "in")
      return `${family}-${direction}`;
    if (family === "strips") return `strips-${direction}`;
    return null;
  }
  function effectFrames(entry, geometry, masks = true) {
    const { family, kind, direction, opacity = 1 } = entry;
    const visible = { visibility: "visible" }, hidden = { visibility: "hidden" };
    const pair = (from, to) => kind === "exit" ? [to, from] : [from, to];
    if (family === "appear" || family === "disappear")
      return pair(hidden, visible);
    if (family === "fade")
      return pair({ ...hidden, opacity: 0 }, { ...visible, opacity });
    if (family === "fly" || family === "float") {
      const delta = family === "float" ? [0, geometry.height * (direction === "top" ? -0.1 : 0.1)] : geometry.fly(direction);
      const from = { ...hidden, translate: `${delta[0]}px ${delta[1]}px` }, to = { ...visible, translate: "0px 0px" };
      if (family === "float") {
        from.opacity = 0;
        to.opacity = opacity;
      }
      return pair(from, to);
    }
    if (family === "zoom")
      return pair(
        { ...hidden, scale: "0.1", opacity: 0 },
        { ...visible, scale: "1", opacity }
      );
    if (family === "wipe") {
      const edge = {
        left: "inset(0 100% 0 0)",
        right: "inset(0 0 0 100%)",
        top: "inset(0 0 100% 0)",
        bottom: "inset(100% 0 0 0)"
      }[direction];
      return pair(
        { ...hidden, clipPath: edge },
        { ...visible, clipPath: "inset(0 0 0 0)" }
      );
    }
    if (["box", "diamond"].includes(family) && direction === "out") {
      const from = family === "box" ? "inset(50% 50% 50% 50%)" : "polygon(50% 50%,50% 50%,50% 50%,50% 50%)";
      const to = family === "box" ? "inset(0 0 0 0)" : "polygon(50% -50%,150% 50%,50% 150%,-50% 50%)";
      return pair({ ...hidden, clipPath: from }, { ...visible, clipPath: to });
    }
    if (maskVariant(entry))
      return masks ? pair(
        { ...hidden, "--codex-deck-progress": 0 },
        { ...visible, "--codex-deck-progress": 1 }
      ) : pair({ ...hidden, opacity: 0 }, { ...visible, opacity });
    if (family === "bounce") {
      const trajectory = kind === "entrance" ? [
        [0, -0.25, -0.33333],
        [0.36, -0.085, 0],
        [0.55, -0.053, -0.11111],
        [0.73, -0.021, 0],
        [0.82, -0.014, -0.037],
        [0.91, -75e-4, 0],
        [0.955, -4e-3, -0.0123],
        [1, 0, 0]
      ] : [
        [0, 0, 0],
        [0.045, 4e-3, -0.0123],
        [0.09, 75e-4, 0],
        [0.185, 0.014, -0.037],
        [0.28, 0.021, 0],
        [0.46, 0.053, -0.111],
        [0.64, 0.085, 0],
        [1, 0.25, 1.1]
      ];
      const frames = trajectory.map(([offset, x, y], index) => ({
        offset,
        translate: `${Math.round(x * geometry.width)}px ${Math.round(y * geometry.height)}px`,
        opacity: kind === "entrance" && index === 0 ? 0 : opacity,
        visibility: kind === "entrance" && index === 0 ? "hidden" : "visible",
        easing: index % 2 === 0 === (kind === "entrance") ? "ease-in" : "ease-out"
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
        { offset: 1, scale: "1", opacity }
      ];
    if (family === "teeter")
      return [
        [0, 0],
        [0.1, 1],
        [0.2, 1],
        [0.4, -1],
        [0.6, 1],
        [0.8, -1],
        [1, 0]
      ].map(([offset, amount]) => ({
        offset,
        rotate: `${amount * entry.rotate}deg`
      }));
    if (family === "path")
      return entry.path.map(([x, y]) => ({ translate: `${x}px ${y}px` }));
    return [{}, {}];
  }
  function effectOptions(entry, start, instant = false) {
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
        "shrink"
      ].includes(entry.family) ? "ease" : "linear"
    };
  }
  var effects, bound;
  var init_deck_effects = __esm({
    "skills/studio-design/assets/starters/deck-effects.js"() {
      effects = Object.fromEntries([
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
          "wedge"
        ].flatMap(
          (family) => ["in", "out"].map((direction) => [
            `${family}-${direction}`,
            {
              family,
              kind: direction === "in" ? "entrance" : "exit",
              duration: family === "float" ? 1e3 : ["bounce", "wheel"].includes(family) ? 2e3 : 500
            }
          ])
        ),
        ...["appear", "disappear"].map((name) => [
          name,
          {
            family: name,
            kind: name === "appear" ? "entrance" : "exit",
            duration: 1
          }
        ]),
        ...["spin", "grow", "shrink", "pulse", "teeter", "path"].map((name) => [
          name,
          {
            family: name,
            kind: name === "path" ? "path" : "emphasis",
            duration: name === "pulse" ? 500 : name === "teeter" ? 1e3 : 2e3
          }
        ])
      ]);
      bound = (n, min, max) => Math.min(max, Math.max(min, n));
    }
  });

  // skills/studio-design/assets/starters/deck-masks.js
  function maskStyles(variant) {
    let image, size, position;
    const axis = variant.endsWith("vertical") ? 90 : 180;
    if (variant === "wheel")
      image = `conic-gradient(${black} 0deg ${fraction("1turn")}, ${clear} ${fraction("1turn")} 1turn)`;
    else if (variant === "wedge") {
      const near = fraction("180deg"), far = `calc(360deg - ${progress} * 180deg)`;
      image = `conic-gradient(${black} 0deg ${near},${clear} ${near} ${far},${black} ${far} 360deg)`;
    } else if (variant.startsWith("split-")) {
      const near = fraction("50%"), far = `calc(100% - ${progress} * 50%)`;
      image = layer(
        axis,
        `${black} 0 ${near},${clear} ${near} ${far},${black} ${far} 100%`
      );
    } else if (variant.startsWith("blinds-")) {
      const stop = fraction("12px");
      image = layer(axis, `${black} 0 ${stop},${clear} ${stop} 12px`, true);
    } else if (variant.startsWith("random-bars-")) {
      image = [
        [0, 4, 0.5],
        [4, 5, 0],
        [9, 4, 0.75],
        [13, 4, 0.25]
      ].map(([start, width, delay]) => {
        const end = `calc(${start}px + clamp(0, (${progress} - ${delay}) * 4, 1) * ${width}px)`;
        return layer(
          axis,
          `${clear} 0 ${start}px,${black} ${start}px ${end},${clear} ${end} 17px`,
          true
        );
      }).join(",");
    } else if (variant === "box-in" || variant === "diamond-in")
      image = (variant === "box-in" ? [0, 90, 180, 270] : [45, 135, 225, 315]).map(
        (angle) => layer(
          angle,
          `${black} 0 ${fraction("50%")},${clear} ${fraction("50%")}`
        )
      ).join(",");
    else if (variant.startsWith("circle-")) {
      const stop = variant === "circle-in" ? `calc((1 - ${progress}) * 100%)` : fraction("100%");
      image = `radial-gradient(circle farthest-corner at 50% 50%,${variant === "circle-in" ? clear : black} 0 ${stop},${variant === "circle-in" ? black : clear} ${stop})`;
    } else if (variant === "plus-out") {
      const near = `calc(50% - ${progress} * 50%)`, far = `calc(50% + ${progress} * 50%)`;
      image = [90, 180].map(
        (angle) => layer(
          angle,
          `${clear} 0 ${near},${black} ${near} ${far},${clear} ${far}`
        )
      ).join(",");
    } else if (variant === "plus-in") {
      const near = fraction("50%"), far = `calc(100% - ${progress} * 50%)`;
      image = [
        [270, near, near],
        [0, far, near],
        [90, far, far],
        [180, near, far]
      ].map(
        ([angle, x, y]) => `conic-gradient(from ${angle}deg at ${x} ${y},${black} 0 90deg,${clear} 90deg 360deg)`
      ).join(",");
    } else if (variant.startsWith("strips-")) {
      const angle = {
        "strips-down-right": 135,
        "strips-down-left": 225,
        "strips-up-right": 45,
        "strips-up-left": 315
      }[variant];
      image = layer(
        angle,
        `${black} 0 ${fraction("100%")},${clear} ${fraction("100%")}`
      );
    } else if (variant.startsWith("checkerboard-")) {
      const stops = [
        fraction("100%"),
        `calc(clamp(0, (${progress} - 0.15) / 0.85, 1) * 100%)`
      ];
      image = stops.map(
        (stop, index) => `conic-gradient(from 270deg at ${axis === 90 ? `${(index + 1) * 12}px ${stop}` : `${stop} ${(index + 1) * 12}px`},${black} 0 90deg,${clear} 90deg 360deg)`
      ).join(",");
      size = axis === 90 ? "24px 100%,24px 100%" : "100% 24px,100% 24px";
    } else if (variant === "dissolve") {
      const radii = [
        fraction("8px"),
        `calc(clamp(0, (${progress} - .25) * 1.4, 1) * 10px)`
      ];
      image = radii.map(
        (r) => `radial-gradient(circle at 50% 50%,${black} 0 ${r},${clear} ${r})`
      ).join(",");
      size = "11px 11px,14px 14px";
      position = "0 0,4px 7px";
    }
    return { image, size, position };
  }
  function installMaskRules() {
    if (document.getElementById("codex-deck-effects"))
      return document.getElementById("codex-deck-effects").dataset.masks === "true";
    let supported = false;
    try {
      if (CSS.registerProperty) {
        CSS.registerProperty({
          name: "--codex-deck-progress",
          syntax: "<number>",
          inherits: false,
          initialValue: "0"
        });
        supported = true;
      }
    } catch (error) {
      supported = error.name === "InvalidModificationError";
    }
    const variants = [
      "wheel",
      "wedge",
      "dissolve",
      ...["split", "blinds", "random-bars", "checkerboard"].flatMap(
        (name) => ["horizontal", "vertical"].map((axis) => `${name}-${axis}`)
      ),
      ...["box", "diamond"].map((name) => `${name}-in`),
      ...["circle", "plus"].flatMap(
        (name) => ["in", "out"].map((dir) => `${name}-${dir}`)
      ),
      ...["down-right", "down-left", "up-right", "up-left"].map(
        (dir) => `strips-${dir}`
      )
    ];
    const rule = (variant) => {
      const { image, size, position } = maskStyles(variant);
      return `deck-stage:not([noscale]) [data-deck-anim-mask="${variant}"]{mask-image:${image};-webkit-mask-image:${image};${size ? `mask-size:${size};-webkit-mask-size:${size};` : ""}${position ? `mask-position:${position};-webkit-mask-position:${position};` : ""}}`;
    };
    const style = document.createElement("style");
    style.id = "codex-deck-effects";
    style.dataset.masks = String(supported);
    style.textContent = `@media screen{deck-stage:not([noscale]) [data-deck-anim-hidden]{visibility:hidden!important;opacity:0!important}${supported ? variants.map(rule).join("\n") : ""}}`;
    document.head.append(style);
    return supported;
  }
  var progress, fraction, layer, black, clear;
  var init_deck_masks = __esm({
    "skills/studio-design/assets/starters/deck-masks.js"() {
      progress = "var(--codex-deck-progress)";
      fraction = (size) => `calc(${progress} * ${size})`;
      layer = (angle, stops, repeating = false) => `${repeating ? "repeating-" : ""}linear-gradient(${angle}deg, ${stops})`;
      black = "#000";
      clear = "transparent";
    }
  });

  // skills/studio-design/assets/starters/deck-builds.js
  var markHidden, DeckBuilds;
  var init_deck_builds = __esm({
    "skills/studio-design/assets/starters/deck-builds.js"() {
      init_deck_effects();
      init_deck_masks();
      markHidden = (element, hidden) => {
        element.toggleAttribute("data-deck-anim-hidden", hidden);
        element.toggleAttribute("data-build-hidden", hidden);
      };
      DeckBuilds = class {
        constructor(deck) {
          this.deck = deck;
          this.masks = installMaskRules();
          this.state = null;
        }
        get enabled() {
          return !this.deck.hasAttribute("noscale") && !new URLSearchParams(location.search).has("_snthumb") && !new URLSearchParams(location.search).has("deck-thumbnail") && !this.deck.printing;
        }
        get remaining() {
          return this.state ? this.state.steps.length - 1 - this.state.played : 0;
        }
        inspect(slide) {
          return [...slide.querySelectorAll("[data-anim]")].flatMap(
            (element, documentIndex) => {
              const entry = parseEffect(element);
              if (!entry) return [];
              const canvas = this.deck.shadowRoot.querySelector(".art").getBoundingClientRect(), rect = element.getBoundingClientRect();
              const scale = canvas.width / this.deck.width || 1;
              entry.geometry = {
                width: this.deck.width,
                height: this.deck.height,
                fly: (direction) => {
                  const distance = {
                    left: [-Math.max(0, rect.right - canvas.left), 0],
                    right: [Math.max(0, canvas.right - rect.left), 0],
                    top: [0, -Math.max(0, rect.bottom - canvas.top)],
                    bottom: [0, Math.max(0, canvas.bottom - rect.top)]
                  }[direction];
                  return distance.map((n) => n / scale);
                }
              };
              const opacity = Number.parseFloat(getComputedStyle(element).opacity);
              return [
                {
                  ...entry,
                  element,
                  documentIndex,
                  opacity: Number.isFinite(opacity) ? opacity : 1
                }
              ];
            }
          );
        }
        arrive(slide, complete = false) {
          if (!this.enabled) {
            this.clear();
            return;
          }
          if (this.state?.slide === slide && !complete) return;
          this.clear();
          const entries = this.inspect(slide);
          if (!entries.length) return;
          const steps = buildSteps(entries);
          const state = {
            slide,
            entries,
            steps,
            played: complete ? steps.length - 1 : 0,
            animations: []
          };
          this.state = state;
          for (const entry of entries)
            if (entry.kind === "entrance") markHidden(entry.element, true);
          if (complete) for (const step of steps) this.play(step, true);
          else this.play(steps[0]);
        }
        play(step, instant = false) {
          const state = this.state;
          instant ||= matchMedia("(prefers-reduced-motion: reduce)").matches;
          for (const { entry, start } of step.items) {
            if (entry.kind === "entrance") markHidden(entry.element, false);
            const variant = this.masks && maskVariant(entry);
            if (variant) entry.element.setAttribute("data-deck-anim-mask", variant);
            const frames = effectFrames(entry, entry.geometry, this.masks), options = effectOptions(entry, start, instant);
            const animation = entry.element.animate(frames, options);
            state.animations.push({ entry, animation, start });
            if (instant) animation.finish();
            if (entry.kind === "exit") {
              if (instant) markHidden(entry.element, true);
              animation.finished.then(
                () => {
                  if (this.state === state) markHidden(entry.element, true);
                },
                () => {
                }
              );
            }
          }
        }
        next() {
          if (!this.enabled || !this.remaining) return false;
          const state = this.state;
          state.played++;
          this.play(state.steps[state.played]);
          this.deck.dispatchEvent(
            new CustomEvent("deckstep", {
              bubbles: true,
              composed: true,
              detail: {
                index: this.deck.index,
                step: state.played,
                totalSteps: state.steps.length - 1
              }
            })
          );
          return true;
        }
        clear() {
          const state = this.state;
          this.state = null;
          if (!state) return;
          for (const { animation } of state.animations) animation.cancel();
          for (const entry of state.entries) {
            markHidden(entry.element, false);
            entry.element.removeAttribute("data-deck-anim-mask");
          }
        }
      };
    }
  });

  // skills/studio-design/assets/starters/deck-labels.js
  function slideLabel(slide) {
    const explicit = slide.getAttribute("data-label");
    if (explicit) return explicit;
    const prior = slide.getAttribute("data-screen-label");
    if (prior) return prior.replace(/^\s*\d+\s*/, "").trim() || prior;
    const heading = slide.querySelector("h1,h2,h3,[data-title]");
    return heading?.textContent?.trim().slice(0, 40) || "Slide";
  }
  var init_deck_labels = __esm({
    "skills/studio-design/assets/starters/deck-labels.js"() {
    }
  });

  // skills/studio-design/assets/starters/deck-thumbnails.js
  function cleanDeckCopy(root) {
    for (const node of [root, ...root.querySelectorAll("*")]) {
      for (const attribute of [...node.attributes])
        if (runtimeAttribute(attribute.name) && !(node === root && attribute.name === "data-screen-label"))
          node.removeAttribute(attribute.name);
    }
    return root;
  }
  function staticCopy(node) {
    if (node.nodeType === Node.TEXT_NODE)
      return document.createTextNode(node.data);
    if (node.nodeType !== Node.ELEMENT_NODE || node.matches("script,dialog,[popover],.page-foot"))
      return null;
    const custom = node.localName.includes("-");
    let copy;
    if (node.matches("canvas")) {
      copy = document.createElement("img");
      try {
        copy.src = node.toDataURL();
      } catch {
      }
      copy.width = node.width;
      copy.height = node.height;
    } else if (node.matches("video") && node.poster) {
      copy = document.createElement("img");
      copy.src = node.poster;
    } else
      copy = custom ? document.createElement("div") : document.createElementNS(node.namespaceURI, node.localName);
    for (const attribute of node.attributes) {
      if (attribute.name === "id" || /^on/i.test(attribute.name) || runtimeAttribute(attribute.name) || node.matches("canvas,video") && ["src", "srcset", "sizes"].includes(attribute.name))
        continue;
      if (node.matches("iframe,audio,object,embed,video") && ["src", "srcdoc", "data", "autoplay"].includes(attribute.name))
        continue;
      copy.setAttribute(attribute.name, attribute.value);
    }
    if (custom) copy.dataset.deckStaticTag = node.localName;
    if (node.matches("canvas,video") && copy.localName === "img") {
      if (node.clientWidth) copy.style.width = `${node.clientWidth}px`;
      if (node.clientHeight) copy.style.height = `${node.clientHeight}px`;
      copy.style.objectFit = "cover";
    }
    if (copy.localName === "img") {
      copy.loading = "lazy";
      copy.decoding = "async";
    }
    if (!node.matches("iframe,audio,object,embed,video,canvas")) {
      for (const child of node.childNodes) {
        const content = staticCopy(child);
        if (content) copy.append(content);
      }
    }
    if (node.shadowRoot && custom) {
      const shadow = copy.attachShadow({ mode: "open" });
      shadow.adoptedStyleSheets = [...node.shadowRoot.adoptedStyleSheets];
      for (const child of node.shadowRoot.childNodes) {
        const content = staticCopy(child);
        if (content) shadow.append(content);
      }
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}input,button{pointer-events:none}";
      shadow.append(style);
    }
    if (node.matches("input,textarea,select")) {
      if ("value" in copy) copy.value = node.value;
      if ("checked" in copy) copy.checked = node.checked;
    }
    return copy;
  }
  function cssRules(rules) {
    return [...rules].map((rule) => {
      if (rule.selectorText)
        return `${selector(rule.selectorText)}{${rule.style.cssText}}`;
      if (rule.cssRules)
        return `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${cssRules(rule.cssRules)}}`;
      return rule.cssText;
    }).join("\n");
  }
  var runtimeAttribute, selector, DeckThumbnails;
  var init_deck_thumbnails = __esm({
    "skills/studio-design/assets/starters/deck-thumbnails.js"() {
      init_deck_labels();
      runtimeAttribute = (name) => [
        "data-deck-slide",
        "data-screen-label",
        "data-deck-active",
        "data-slide-hidden",
        "data-build-hidden",
        "data-deck-anim-hidden",
        "data-deck-anim-mask",
        "data-deck-last-visible"
      ].includes(name);
      selector = (value) => value.replace(/:root((?:\[[^\]]*\]|[.#][\w-]+)+)/g, ":host($1)").replace(/:root\b/g, ":host").replace(/(^|[\s,>+~(])html((?:\[[^\]]*\]|[.#][\w-]+)+)/g, "$1:host($2)").replace(/(^|[\s,>+~(])html\b/g, "$1:host").replace(/(^|[\s,>+~(])body\b/g, "$1[data-deck-static-body]").replace(
        /(^|[\s,>+~(])([a-z][\w]*-[\w-]+)(?=[\s,.#:[>+~)]|$)/gi,
        '$1[data-deck-static-tag="$2"]'
      );
      DeckThumbnails = class {
        constructor(deck, rail, onSelect) {
          this.deck = deck;
          this.rail = rail;
          this.entries = /* @__PURE__ */ new Map();
          this.onSelect = onSelect;
          this.sheet = new CSSStyleSheet();
          this.visibility = new IntersectionObserver(
            (items) => {
              for (const item of items)
                if (item.isIntersecting) this.materialize(item.target.deckEntry);
            },
            { root: rail, rootMargin: "300px" }
          );
          this.resize = new ResizeObserver(() => this.scale());
          this.resize.observe(rail);
          this.refreshStyles();
          this.observer = new MutationObserver((changes) => {
            this.dirty ??= /* @__PURE__ */ new Set();
            const dirty = this.dirty;
            for (const change of changes) {
              if (change.type === "attributes" && runtimeAttribute(change.attributeName))
                continue;
              if (change.type === "attributes" && change.target === deck && [
                "data-fonts-pending",
                "data-chrome-visible",
                "data-fullscreen",
                "data-presenting"
              ].includes(change.attributeName))
                continue;
              let target = change.target;
              while (target?.getRootNode()?.host && !deck.contains(target))
                target = target.getRootNode().host;
              const slide = deck.slides.find(
                (node) => node === target || node.contains(target)
              );
              if (slide) dirty.add(slide);
              else this.stylesDirty = true;
            }
            if (!dirty.size && !this.stylesDirty) return;
            cancelAnimationFrame(this.refreshFrame);
            this.refreshFrame = requestAnimationFrame(() => {
              if (this.stylesDirty) this.refreshStyles();
              this.stylesDirty = false;
              for (const slide of dirty) {
                const entry = this.entries.get(slide);
                if (entry?.host) {
                  entry.host.remove();
                  entry.host = null;
                  this.materialize(entry);
                }
              }
              dirty.clear();
              this.sync();
            });
          });
          this.observer.observe(deck, {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true
          });
          this.observer.observe(document.head, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true
          });
          this.observer.observe(document.documentElement, { attributes: true });
          this.observer.observe(document.body, { attributes: true });
          document.fonts.ready.then(() => {
            if (deck.isConnected) this.refreshStyles();
          });
        }
        refreshStyles() {
          const css = [...document.styleSheets].map((sheet) => {
            try {
              return cssRules(sheet.cssRules);
            } catch {
              return "";
            }
          }).join("\n");
          this.variables = new Set(css.match(/--[\w-]+/g) ?? []);
          this.sheet.replaceSync(
            css + "\n*,*::before,*::after{animation:none!important;transition:none!important}[data-deck-static-root]{position:absolute!important;inset:0!important;width:var(--thumb-w)!important;height:var(--thumb-h)!important;box-sizing:border-box!important;opacity:1!important;visibility:visible!important;pointer-events:none!important;overflow:hidden!important;transform-origin:0 0!important;counter-increment:none!important}"
          );
          for (const entry of this.entries.values()) this.mirror(entry);
        }
        mirror(entry) {
          if (!entry.host) return;
          for (const [element, source] of [
            [entry.body, document.body],
            [entry.context, this.deck]
          ]) {
            if (!element) continue;
            for (const attribute of [...element.attributes])
              if (!["data-deck-static-body", "data-deck-static-tag"].includes(
                attribute.name
              ))
                element.removeAttribute(attribute.name);
            for (const attribute of source.attributes)
              if (!["id", "style"].includes(attribute.name) && !/^on/i.test(attribute.name) && !runtimeAttribute(attribute.name))
                element.setAttribute(attribute.name, attribute.value);
          }
          for (const attribute of [...entry.host.attributes])
            if (attribute.name === "class" || attribute.name === "lang" || attribute.name.startsWith("data-"))
              entry.host.removeAttribute(attribute.name);
          for (const attribute of document.documentElement.attributes)
            if (attribute.name === "class" || attribute.name === "lang" || attribute.name.startsWith("data-"))
              entry.host.setAttribute(attribute.name, attribute.value);
          const computed = getComputedStyle(this.deck);
          for (const name of this.variables)
            entry.host.style.setProperty(name, computed.getPropertyValue(name));
          entry.host.style.setProperty("--thumb-w", `${this.deck.width}px`);
          entry.host.style.setProperty("--thumb-h", `${this.deck.height}px`);
        }
        reconcile() {
          const positions = new Map(
            [...this.entries].map(([slide, entry]) => [
              slide,
              entry.thumb.getBoundingClientRect().top
            ])
          );
          for (const [slide, entry] of this.entries)
            if (!this.deck.slides.includes(slide)) {
              this.visibility.unobserve(entry.frame);
              entry.thumb.remove();
              this.entries.delete(slide);
            }
          this.deck.slides.forEach((slide, index) => {
            let entry = this.entries.get(slide);
            if (!entry) {
              const thumb = document.createElement("div");
              thumb.className = "thumb";
              thumb.tabIndex = 0;
              thumb.setAttribute("role", "option");
              const number = document.createElement("span");
              number.className = "num";
              const frame = document.createElement("div");
              frame.className = "frame";
              thumb.append(number, frame);
              entry = { slide, thumb, number, frame, index, host: null };
              frame.deckEntry = entry;
              this.entries.set(slide, entry);
              this.onSelect(entry);
              this.visibility.observe(frame);
            }
            entry.index = index;
            if (this.rail.children[index] !== entry.thumb)
              this.rail.insertBefore(entry.thumb, this.rail.children[index] ?? null);
            const offset = positions.get(slide) - entry.thumb.getBoundingClientRect().top;
            if (Number.isFinite(offset) && Math.abs(offset) > 1 && !matchMedia("(prefers-reduced-motion:reduce)").matches && !entry.thumb.hasAttribute("data-dragging"))
              entry.thumb.animate(
                [
                  { transform: `translateY(${offset}px)` },
                  { transform: "translateY(0)" }
                ],
                { duration: 180, easing: "cubic-bezier(.2,.7,.3,1)" }
              );
          });
          this.sync();
          this.scale();
        }
        materialize(entry) {
          if (!entry || entry.host) return;
          const host = document.createElement("div");
          host.inert = true;
          host.className = "thumb-host";
          const shadow = host.attachShadow({ mode: "open" });
          shadow.adoptedStyleSheets = [this.sheet];
          const body = document.createElement("div");
          body.dataset.deckStaticBody = "";
          for (const attribute of document.body.attributes)
            if (attribute.name !== "id" && !/^on/i.test(attribute.name))
              body.setAttribute(attribute.name, attribute.value);
          const context = document.createElement("div");
          context.dataset.deckStaticTag = "deck-stage";
          for (const attribute of this.deck.attributes)
            if (!["id", "style"].includes(attribute.name))
              context.setAttribute(attribute.name, attribute.value);
          const watchShadows = (node) => {
            if (node.shadowRoot) {
              this.observer.observe(node.shadowRoot, {
                attributes: true,
                childList: true,
                subtree: true,
                characterData: true
              });
              for (const child of node.shadowRoot.querySelectorAll("*"))
                if (child.shadowRoot) watchShadows(child);
            }
            for (const child of node.querySelectorAll("*"))
              if (child.shadowRoot) watchShadows(child);
          };
          watchShadows(entry.slide);
          const clone = staticCopy(entry.slide);
          clone.dataset.deckStaticRoot = "";
          context.append(clone);
          body.append(context);
          shadow.append(body);
          entry.frame.replaceChildren(host);
          entry.host = host;
          entry.body = body;
          entry.context = context;
          entry.clone = clone;
          this.mirror(entry);
          this.scaleEntry(entry);
          this.visibility.unobserve(entry.frame);
        }
        scaleEntry(entry) {
          entry.frame.style.aspectRatio = `${this.deck.width}/${this.deck.height}`;
          if (entry.clone)
            entry.clone.style.transform = `scale(${entry.frame.clientWidth / this.deck.width})`;
        }
        scale() {
          for (const entry of this.entries.values()) this.scaleEntry(entry);
        }
        sync() {
          let number = 0;
          for (const slide of this.deck.slides) {
            const entry = this.entries.get(slide);
            if (!entry) continue;
            const skipped = entry.slide.hasAttribute("data-deck-skip");
            entry.number.textContent = skipped ? "" : String(++number);
            entry.thumb.toggleAttribute("data-skipped", skipped);
            entry.thumb.setAttribute(
              "aria-current",
              String(entry.index === this.deck.index)
            );
            const selected = this.deck.editor?.selection.has(entry.slide) ?? false;
            entry.thumb.toggleAttribute("data-selected", selected);
            entry.thumb.setAttribute(
              "aria-selected",
              String(
                selected || !this.deck.editor?.selection.size && entry.index === this.deck.index
              )
            );
            entry.thumb.setAttribute(
              "aria-label",
              `${skipped ? "Skipped slide" : "Slide " + entry.number.textContent}: ${slideLabel(entry.slide)}`
            );
          }
        }
        dispose() {
          this.observer.disconnect();
          this.visibility.disconnect();
          this.resize.disconnect();
          cancelAnimationFrame(this.refreshFrame);
        }
      };
    }
  });

  // skills/studio-design/assets/starters/deck-operations.js
  function validateDeckOperation(input, count) {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error("Invalid deck operation");
    const shapes = {
      move: ["from", "to"],
      remove: ["indices"],
      duplicate: ["index", "ids", "storageKeys"],
      skip: ["index", "value"],
      undo: []
    };
    const fields = Object.hasOwn(shapes, input.type) ? shapes[input.type] : null;
    if (!fields || Object.keys(input).some((key) => !["type", ...fields].includes(key)))
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
        (a, b) => a - b
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
        if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length > 1e3)
          throw new Error("Invalid duplicate state keys");
        const entries = Object.entries(values);
        if (entries.some(
          ([key, value]) => !key || key.length > 256 || typeof value !== "string" || !/^[A-Za-z][\w-]{0,63}$/.test(value)
        ) || new Set(entries.map(([, value]) => value)).size !== entries.length)
          throw new Error("Duplicate keys must be unique safe identifiers");
        result[field] = Object.fromEntries(entries);
      }
    }
    return result;
  }
  function moveDeckItems(items, from, to) {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  }
  function editDeckNotes(notes, operation) {
    const next = [...notes];
    if (operation.type === "move")
      return moveDeckItems(next, operation.from, operation.to);
    if (operation.type === "remove")
      return next.filter((_, index) => !operation.indices.includes(index));
    if (operation.type === "duplicate")
      next.splice(operation.index + 1, 0, next[operation.index] ?? "");
    return next;
  }
  var init_deck_operations = __esm({
    "skills/studio-design/assets/starters/deck-operations.js"() {
    }
  });

  // skills/studio-design/assets/starters/deck-editor.js
  var styles, fresh, DeckEditor;
  var init_deck_editor = __esm({
    "skills/studio-design/assets/starters/deck-editor.js"() {
      init_deck_thumbnails();
      init_deck_operations();
      styles = `
.layout{height:calc(100% - var(--toolbar-height,58px))}.toolbar{height:auto;min-height:58px}.rail{overflow-y:auto;overscroll-behavior:contain}.rail[data-user-hidden]{display:none}.thumb{display:flex;gap:8px;margin:10px 0;align-items:flex-start;cursor:pointer;outline:none;position:relative}.num{width:20px;flex:none;text-align:right;padding-top:5px;color:#a5afbf;font-size:12px}.frame{flex:1;min-width:0;border:2px solid #4c5564;border-radius:5px;position:relative;overflow:hidden;background:white}.frame>div{position:absolute;inset:0}.thumb[aria-current=true] .frame,.thumb[data-selected] .frame{border-color:#8bacff}.thumb:focus-visible .frame{outline:2px solid white;outline-offset:2px}.thumb[data-skipped]{opacity:.4}.thumb[data-dragging]{opacity:.5;pointer-events:none}.thumb[data-drop=before]::before,.thumb[data-drop=after]::after{content:"";position:absolute;left:25px;right:0;height:3px;background:#8bacff}.thumb[data-drop=before]::before{top:-5px}.thumb[data-drop=after]::after{bottom:-5px}.rail-resize{width:6px;flex:none;cursor:col-resize;touch-action:none}.rail-resize:hover,.rail-resize[data-dragging]{background:#8bacff66}:host([no-rail]) .rail-resize,:host([noscale]) .rail-resize,:host([data-fullscreen]) .rail-resize,:host([data-presenting]) .rail-resize,.rail[data-user-hidden]+.rail-resize{display:none}.deck-menu{position:fixed;z-index:1000;background:#252e3a;border:1px solid #687482;padding:5px;border-radius:8px;min-width:175px;box-shadow:0 8px 28px #0006}.deck-menu button{display:block;width:100%;text-align:left;border:0}.deck-menu button:hover{background:#344766}.deck-menu button:disabled{opacity:.4;cursor:default}.deck-confirm{background:#252e3a;color:white;border:1px solid #687482;border-radius:12px;padding:24px;max-width:calc(100vw - 64px)}.deck-confirm::backdrop{background:#0009}.deck-confirm footer{display:flex;gap:12px;justify-content:flex-end}.deck-confirm .danger{background:#a1273c}.deck-status{font-size:11px;color:#b7c1cf;max-width:220px}:host([data-fullscreen]) .deck-status,:host([data-presenting]) .deck-status{display:none}@media(max-width:640px){.rail-resize{display:none}.deck-status{max-width:140px}}@media print{.layout{height:auto}.rail-resize,.deck-menu,.deck-confirm,.deck-status{display:none!important}}`;
      fresh = (prefix) => `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      DeckEditor = class {
        constructor(deck) {
          this.deck = deck;
          this.root = deck.shadowRoot;
          this.selection = /* @__PURE__ */ new Set();
          this.history = [];
          this.busy = false;
          this.stale = false;
          this.controller = new AbortController();
          const options = { signal: this.controller.signal };
          const style = document.createElement("style");
          style.textContent = styles;
          this.root.append(style);
          this.style = style;
          this.rail = this.root.querySelector(".rail");
          this.rail.replaceChildren();
          this.rail.setAttribute("role", "listbox");
          this.rail.setAttribute("aria-multiselectable", "true");
          this.resize = document.createElement("div");
          this.resize.className = "rail-resize";
          this.resize.tabIndex = 0;
          this.resize.setAttribute("role", "separator");
          this.resize.setAttribute("aria-label", "Resize slide rail");
          this.resize.setAttribute("aria-orientation", "vertical");
          this.rail.after(this.resize);
          this.status = document.createElement("span");
          this.status.className = "deck-status";
          this.status.setAttribute("role", "status");
          this.status.setAttribute("aria-label", "Deck editor status");
          this.root.querySelector(".toolbar").append(this.status);
          this.menu = document.createElement("div");
          this.menu.className = "deck-menu";
          this.menu.setAttribute("role", "menu");
          this.menu.hidden = true;
          this.root.append(this.menu);
          this.dialog = document.createElement("dialog");
          this.dialog.className = "deck-confirm";
          this.dialog.setAttribute("aria-labelledby", "deck-delete-title");
          this.dialog.innerHTML = '<h2 id="deck-delete-title"></h2><p>These slides will be removed from the deck.</p><footer><button data-cancel>Cancel</button><button class="danger">Delete</button></footer>';
          this.root.append(this.dialog);
          this.dialog.querySelector("[data-cancel]").addEventListener("click", () => this.closeConfirm(), options);
          this.dialog.querySelector(".danger").addEventListener(
            "click",
            async () => {
              const slides = this.confirmSlides ?? [];
              const indices = slides.map((slide) => this.deck.slides.indexOf(slide));
              if (indices.some((index) => index < 0)) {
                this.notice("The selected slides changed; select them again");
                this.closeConfirm();
                return;
              }
              this.dialog.close();
              await this.run({ type: "remove", indices });
              this.focusCurrent();
            },
            options
          );
          this.dialog.addEventListener(
            "cancel",
            () => queueMicrotask(() => this.focusCurrent()),
            options
          );
          document.addEventListener(
            "pointerdown",
            (event) => {
              if (!event.composedPath().includes(this.menu)) this.menu.hidden = true;
            },
            options
          );
          document.addEventListener(
            "keydown",
            (event) => {
              if (event.key === "Escape") {
                if (!this.menu.hidden || this.selection.size) {
                  event.preventDefault();
                  event.stopPropagation();
                }
                this.menu.hidden = true;
                this.clearSelection();
              }
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey && event.composedPath().includes(deck) && !event.composedPath().some(
                (node) => node.isContentEditable || node.matches?.("input,textarea,select")
              )) {
                event.preventDefault();
                this.undo();
              }
            },
            { ...options, capture: true }
          );
          this.storageKey = `codex-design-deck-rail:${location.pathname}:${deck.id || [...document.querySelectorAll("deck-stage")].indexOf(deck)}`;
          try {
            const preferences = JSON.parse(localStorage.getItem(this.storageKey));
            this.setWidth(preferences?.width ?? 188);
            this.rail.toggleAttribute(
              "data-user-hidden",
              preferences?.hidden === true
            );
          } catch {
            this.setWidth(188);
          }
          this.resize.addEventListener(
            "pointerdown",
            (event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              this.resize.setPointerCapture(event.pointerId);
              this.resize.setAttribute("data-dragging", "");
              this.dragWidth = { x: event.clientX, width: this.railWidth };
            },
            options
          );
          this.resize.addEventListener(
            "pointermove",
            (event) => {
              if (this.dragWidth)
                this.setWidth(
                  this.dragWidth.width + event.clientX - this.dragWidth.x
                );
            },
            options
          );
          for (const name of ["pointerup", "pointercancel"])
            this.resize.addEventListener(
              name,
              () => {
                this.dragWidth = null;
                this.resize.removeAttribute("data-dragging");
                this.savePreferences();
              },
              options
            );
          this.resize.addEventListener(
            "keydown",
            (event) => {
              if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                this.setWidth(
                  this.railWidth + (event.key === "ArrowRight" ? 10 : -10)
                );
                this.savePreferences();
              }
            },
            options
          );
          deck.addEventListener(
            "codex-deck-updating",
            (event) => {
              this.updating = event.detail?.updating === true;
            },
            options
          );
          this.thumbnails = new DeckThumbnails(
            deck,
            this.rail,
            (entry) => this.bindEntry(entry)
          );
          this.sourceReady = this.connectSource();
        }
        notice(message) {
          this.status.textContent = message;
        }
        setWidth(value) {
          this.railWidth = Math.max(
            120,
            Math.min(360, Math.round(Number(value) || 188))
          );
          this.deck.style.setProperty("--rail-width", `${this.railWidth}px`);
          this.resize.setAttribute("aria-valuenow", this.railWidth);
          this.resize.setAttribute("aria-valuemin", "120");
          this.resize.setAttribute("aria-valuemax", "360");
          this.deck.fit();
          this.thumbnails?.scale();
        }
        savePreferences() {
          try {
            localStorage.setItem(
              this.storageKey,
              JSON.stringify({
                width: this.railWidth,
                hidden: this.rail.hasAttribute("data-user-hidden")
              })
            );
          } catch {
          }
        }
        toggleRail() {
          this.rail.toggleAttribute("data-user-hidden");
          this.savePreferences();
          this.deck.fit();
        }
        clearSelection() {
          this.selection.clear();
          this.anchor = this.deck.slides[this.deck.index];
          this.thumbnails?.sync();
        }
        reconcile() {
          for (const slide of this.selection)
            if (!this.deck.slides.includes(slide)) this.selection.delete(slide);
          this.thumbnails.reconcile();
        }
        selected(fallback = this.deck.index) {
          const selected = this.deck.slides.filter(
            (slide) => this.selection.has(slide)
          );
          return selected.length ? selected : [this.deck.slides[fallback]].filter(Boolean);
        }
        bindEntry(entry) {
          const options = { signal: this.controller.signal }, thumb = entry.thumb;
          thumb.addEventListener(
            "click",
            (event) => {
              thumb.focus({ preventScroll: true });
              if (event.shiftKey) {
                const anchor = Math.max(
                  0,
                  this.deck.slides.indexOf(
                    this.anchor ?? this.deck.slides[this.deck.index]
                  )
                );
                this.selection = new Set(
                  this.deck.slides.slice(
                    Math.min(anchor, entry.index),
                    Math.max(anchor, entry.index) + 1
                  )
                );
              } else if (event.ctrlKey || event.metaKey) {
                if (!this.selection.size && entry.index !== this.deck.index)
                  this.selection.add(this.deck.slides[this.deck.index]);
                if (this.selection.has(entry.slide))
                  this.selection.delete(entry.slide);
                else {
                  this.selection.add(entry.slide);
                  this.anchor = entry.slide;
                }
              } else {
                this.clearSelection();
                this.anchor = entry.slide;
                this.deck.goTo(entry.index, "click");
              }
              this.thumbnails.sync();
            },
            options
          );
          thumb.addEventListener(
            "keydown",
            (event) => {
              if (event.altKey || event.ctrlKey || event.metaKey) return;
              if (["ArrowUp", "ArrowDown"].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                this.clearSelection();
                this.deck.goTo(
                  Math.max(
                    0,
                    Math.min(
                      this.deck.length - 1,
                      entry.index + (event.key === "ArrowDown" ? 1 : -1)
                    )
                  ),
                  "keyboard"
                );
                this.focusCurrent();
              } else if (["Delete", "Backspace"].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                this.confirm(this.selected(entry.index));
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                thumb.click();
              } else if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") {
                event.preventDefault();
                const bounds = thumb.getBoundingClientRect();
                this.openMenu(entry, bounds.right, bounds.top);
              }
            },
            options
          );
          thumb.addEventListener(
            "contextmenu",
            (event) => {
              event.preventDefault();
              this.openMenu(entry, event.clientX, event.clientY);
            },
            options
          );
          thumb.draggable = true;
          thumb.addEventListener(
            "dragstart",
            (event) => {
              if (this.busy || this.updating || this.stale) {
                event.preventDefault();
                return;
              }
              this.clearSelection();
              this.drag = { entry, y: event.clientY };
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(entry.index));
              const blank = document.createElement("canvas");
              blank.width = blank.height = 1;
              event.dataTransfer.setDragImage(blank, 0, 0);
              this.dragFrame = requestAnimationFrame(() => {
                if (this.drag?.entry === entry)
                  thumb.setAttribute("data-dragging", "");
              });
            },
            options
          );
          thumb.addEventListener(
            "drag",
            (event) => {
              if (this.drag?.entry === entry && event.clientY)
                thumb.style.transform = `translateY(${event.clientY - this.drag.y}px)`;
            },
            options
          );
          thumb.addEventListener("dragend", () => this.clearDrag(), options);
          thumb.addEventListener(
            "dragover",
            (event) => {
              if (!this.drag) return;
              event.preventDefault();
              this.clearDrop();
              event.dataTransfer.dropEffect = "move";
              thumb.dataset.drop = event.clientY < thumb.getBoundingClientRect().top + thumb.offsetHeight / 2 ? "before" : "after";
              const bounds = this.rail.getBoundingClientRect();
              if (event.clientY < bounds.top + 35) this.rail.scrollTop -= 15;
              else if (event.clientY > bounds.bottom - 35) this.rail.scrollTop += 15;
            },
            options
          );
          thumb.addEventListener(
            "drop",
            (event) => {
              if (!this.drag) return;
              event.preventDefault();
              const from = this.drag.entry.index;
              let to = entry.index + (event.clientY >= thumb.getBoundingClientRect().top + thumb.offsetHeight / 2 ? 1 : 0);
              if (from < to) to--;
              this.clearDrag();
              if (from !== to) this.run({ type: "move", from, to });
            },
            options
          );
        }
        clearDrop() {
          for (const entry of this.thumbnails.entries.values())
            entry.thumb.removeAttribute("data-drop");
        }
        clearDrag() {
          cancelAnimationFrame(this.dragFrame);
          if (this.drag) {
            this.drag.entry.thumb.style.transform = "";
            this.drag.entry.thumb.removeAttribute("data-dragging");
          }
          this.drag = null;
          this.clearDrop();
        }
        openMenu(entry, x, y) {
          if (this.selection.size && !this.selection.has(entry.slide)) {
            this.selection = /* @__PURE__ */ new Set([entry.slide]);
            this.anchor = entry.slide;
            this.thumbnails.sync();
          }
          const selected = this.selected(entry.index);
          this.menu.replaceChildren();
          const add = (text, action, disabled = false) => {
            const button = document.createElement("button");
            button.textContent = text;
            button.disabled = disabled || this.busy || this.stale;
            button.setAttribute("role", "menuitem");
            button.onclick = () => {
              this.menu.hidden = true;
              action();
            };
            this.menu.append(button);
          };
          if (selected.length <= 1) {
            add(
              entry.slide.hasAttribute("data-deck-skip") ? "Unskip slide" : "Skip slide",
              () => this.run({
                type: "skip",
                index: entry.index,
                value: !entry.slide.hasAttribute("data-deck-skip")
              })
            );
            add(
              "Move up",
              () => this.run({ type: "move", from: entry.index, to: entry.index - 1 }),
              entry.index === 0
            );
            add(
              "Move down",
              () => this.run({ type: "move", from: entry.index, to: entry.index + 1 }),
              entry.index === this.deck.length - 1
            );
            add("Duplicate slide", () => this.duplicate(entry.index));
          }
          add(
            selected.length > 1 ? `Delete ${selected.length} slides` : "Delete slide",
            () => this.confirm(selected),
            selected.length >= this.deck.length
          );
          this.menu.hidden = false;
          this.menu.style.left = `${x}px`;
          this.menu.style.top = `${y}px`;
          const bounds = this.menu.getBoundingClientRect();
          this.menu.style.left = `${Math.max(4, Math.min(x, innerWidth - bounds.width - 4))}px`;
          this.menu.style.top = `${Math.max(4, Math.min(y, innerHeight - bounds.height - 4))}px`;
          this.menu.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
        }
        confirm(slides) {
          if (this.busy || this.stale || this.updating) {
            this.notice("The deck is being updated; try again when it finishes");
            return;
          }
          if (slides.length >= this.deck.length) {
            this.notice("At least one slide must stay in the deck");
            return;
          }
          this.confirmSlides = [...slides];
          this.dialog.querySelector("h2").textContent = slides.length > 1 ? `Delete ${slides.length} slides?` : `Delete ${slides[0].hasAttribute("data-deck-skip") ? "skipped slide" : "slide " + (this.deck.slides.filter((slide) => !slide.hasAttribute("data-deck-skip")).indexOf(slides[0]) + 1)}?`;
          this.dialog.showModal();
          this.dialog.querySelector(".danger").focus();
        }
        closeConfirm() {
          this.dialog.close();
          this.confirmSlides = null;
          this.focusCurrent();
        }
        focusCurrent() {
          const active = this.root.activeElement;
          if (document.activeElement !== this.deck && ![document.body, null].includes(document.activeElement))
            return;
          if (active && !this.rail.contains(active) && !this.menu.contains(active) && !this.dialog.contains(active))
            return;
          const entry = this.thumbnails.entries.get(
            this.deck.slides[this.deck.index]
          );
          if (entry && this.rail.getBoundingClientRect().width) {
            entry.thumb.scrollIntoView({ block: "nearest" });
            entry.thumb.focus({ preventScroll: true });
          }
        }
        async connectSource() {
          const endpoint = document.querySelector(
            'meta[name="codex-deck-source"]'
          )?.content;
          if (!endpoint || document.querySelector("deck-stage") !== this.deck) {
            this.notice("Edits stay in this preview");
            return;
          }
          try {
            if (new URL(endpoint, location.href).origin !== location.origin)
              throw new Error("Deck source must use the preview origin");
            const response = await fetch(endpoint);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            if (data.count !== this.deck.length)
              throw new Error("Source slide count differs from the rendered deck");
            this.source = { endpoint, ...data };
            this.notice("Source editing connected");
          } catch (error) {
            this.stale = true;
            this.notice(error.message);
          }
        }
        async save(operation) {
          if (!this.source) return;
          const response = await fetch(this.source.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Codex-Deck-Token": this.source.token
            },
            body: JSON.stringify({
              version: this.source.version,
              count: this.deck.length,
              operation
            })
          });
          const data = await response.json();
          if (!response.ok) {
            if (response.status === 409) this.stale = true;
            throw new Error(data.error || "Deck save failed");
          }
          this.source = { ...this.source, ...data };
        }
        snapshot() {
          return {
            slides: [...this.deck.slides],
            skipped: this.deck.slides.map(
              (slide) => slide.hasAttribute("data-deck-skip")
            ),
            active: this.deck.slides[this.deck.index],
            notes: document.getElementById("speaker-notes")?.textContent
          };
        }
        restore(snapshot) {
          for (const slide of this.deck.slides)
            if (!snapshot.slides.includes(slide)) slide.remove();
          snapshot.slides.forEach((slide, index) => {
            slide.toggleAttribute("data-deck-skip", snapshot.skipped[index]);
            this.deck.append(slide);
          });
          const notes = document.getElementById("speaker-notes");
          if (notes && snapshot.notes !== void 0)
            notes.textContent = snapshot.notes;
          return snapshot.active;
        }
        async run(input, copy) {
          if (this.busy) return false;
          this.busy = true;
          try {
            await this.sourceReady;
            if (this.stale)
              throw new Error("Deck source changed; reload before editing");
            if (this.updating)
              throw new Error(
                "The deck is being updated; try again when it finishes"
              );
            const operation = validateDeckOperation(input, this.deck.length), snapshot = this.snapshot();
            if (operation.type === "move" && operation.from === operation.to)
              return false;
            await this.save(operation);
            this.deck.buildPlayer.clear();
            let active = snapshot.active;
            if (operation.type === "undo") {
              const last = this.history.pop();
              if (!last) {
                if (this.source) {
                  location.reload();
                  return true;
                }
                throw new Error("No deck edit to undo");
              }
              active = this.restore(last);
            } else {
              this.history.push(snapshot);
              if (this.history.length > 100) this.history.shift();
              if (operation.type === "move")
                for (const slide of moveDeckItems(
                  snapshot.slides,
                  operation.from,
                  operation.to
                ))
                  this.deck.append(slide);
              if (operation.type === "skip")
                snapshot.slides[operation.index].toggleAttribute(
                  "data-deck-skip",
                  operation.value
                );
              if (operation.type === "duplicate") {
                snapshot.slides[operation.index].after(copy);
                active = copy;
              }
              if (operation.type === "remove") {
                const deleted = new Set(
                  operation.indices.map((index) => snapshot.slides[index])
                );
                if (deleted.has(active))
                  active = snapshot.slides.slice(this.deck.index + 1).find((slide) => !deleted.has(slide)) ?? snapshot.slides.slice(0, this.deck.index).reverse().find((slide) => !deleted.has(slide));
                for (const slide of deleted) slide.remove();
              }
              const notes = document.getElementById("speaker-notes");
              if (notes && operation.type !== "skip")
                try {
                  const values = JSON.parse(notes.textContent);
                  if (Array.isArray(values) && values.every((value) => typeof value === "string")) {
                    while (values.length < snapshot.slides.length) values.push("");
                    notes.textContent = JSON.stringify(
                      editDeckNotes(values, operation)
                    );
                  }
                } catch {
                }
            }
            this.clearSelection();
            this.deck.collect();
            this.deck.show(
              Math.max(0, this.deck.slides.indexOf(active)),
              true,
              "mutation"
            );
            this.deck.fit();
            this.deck.dispatchEvent(
              new CustomEvent("codex-deck-edit", {
                detail: { operation, persisted: !!this.source },
                bubbles: true,
                composed: true
              })
            );
            this.notice(
              this.source ? "Saved to HTML source" : "Changed in this preview"
            );
            this.focusCurrent();
            return true;
          } catch (error) {
            this.notice(error.message);
            return false;
          } finally {
            this.busy = false;
          }
        }
        async duplicate(index) {
          if (this.busy || this.updating || this.stale) return;
          const original = this.deck.slides[index];
          if (!original) return;
          const copy = cleanDeckCopy(original.cloneNode(true)), ids = /* @__PURE__ */ Object.create(null), storageKeys = /* @__PURE__ */ Object.create(null), used = /* @__PURE__ */ new Set(), storageCopies = [];
          for (const node of [copy, ...copy.querySelectorAll("*")]) {
            if (node.id) {
              const old = node.id, component = customElements.get(node.localName);
              let next;
              const free = (value) => /^[A-Za-z][\w-]{0,63}$/.test(value) && !document.getElementById(value) && !used.has(value);
              try {
                if (node !== copy && typeof component?.cloneSlot === "function")
                  next = component.cloneSlot(old, free);
              } catch {
              }
              if (typeof next === "string" && free(next)) {
                node.id = next;
                ids[old] = next;
                used.add(next);
              } else node.removeAttribute("id");
            }
            const key = node.getAttribute("storage-key");
            if (key && typeof customElements.get(node.localName)?.cloneStorageKey === "function") {
              const next = storageKeys[key] ?? fresh("image");
              storageKeys[key] = next;
              node.setAttribute("storage-key", next);
              storageCopies.push({
                node,
                component: customElements.get(node.localName),
                from: key,
                to: next
              });
            }
          }
          const success = await this.run(
            { type: "duplicate", index, ids, storageKeys },
            copy
          );
          if (success)
            for (const { node, component, from, to } of storageCopies) {
              try {
                component.cloneStorageKey(from, to);
              } catch {
                this.notice(
                  "The slide was duplicated, but its stored component state could not be copied"
                );
              }
              node.reloadStoredImage?.();
            }
        }
        async undo() {
          await this.sourceReady;
          if (this.history.length || this.source?.undoDepth)
            return this.run({ type: "undo" });
          this.notice("No deck edit to undo");
        }
        dispose() {
          this.controller.abort();
          this.thumbnails.dispose();
          this.clearDrag();
          this.dialog.close();
          for (const node of [
            this.style,
            this.resize,
            this.status,
            this.menu,
            this.dialog
          ])
            node.remove();
        }
      };
    }
  });

  // skills/studio-design/assets/starters/deck-runtime.js
  var deck_runtime_exports = {};
  __export(deck_runtime_exports, {
    DeckStage: () => DeckStage
  });
  var interactive, template, DeckStage;
  var init_deck_runtime = __esm({
    "skills/studio-design/assets/starters/deck-runtime.js"() {
      init_deck_builds();
      init_deck_labels();
      init_deck_editor();
      interactive = 'a[href],button,input,textarea,select,summary,label,video[controls],audio[controls],[role="button"],[onclick],[tabindex]:not([tabindex^="-"]),[contenteditable]:not([contenteditable="false" i])';
      template = `<style>
:host{display:block;height:100vh;background:#161c25;color:#fff;font:14px system-ui;--rail-width:180px}.layout{display:flex;height:calc(100% - 58px)}.rail{width:var(--rail-width);flex:none;overflow:auto;padding:10px;box-sizing:border-box}.rail button{display:block;width:100%;text-align:left;margin:6px 0}:host([data-fonts-pending]) .viewport,:host([data-fonts-pending]) .rail{opacity:0;pointer-events:none}.viewport{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;overflow:hidden}.art{position:relative;transform-origin:center;flex:none}slot{display:block}::slotted([data-deck-slide]){box-sizing:border-box;width:100%;height:100%;overflow:hidden;position:absolute;inset:0;visibility:hidden;opacity:0;pointer-events:none}::slotted([data-deck-active]){visibility:visible;opacity:1;pointer-events:auto}.toolbar{opacity:0;pointer-events:none;transition:opacity .2s;height:58px;display:flex;align-items:center;gap:9px;padding:0 16px;box-sizing:border-box;flex-wrap:wrap;position:relative;z-index:10}button{font:inherit;border:1px solid #687482;border-radius:6px;background:#252e3a;color:#fff;padding:7px 10px;cursor:pointer}button[aria-current="true"]{border-color:#8bacff;background:#344766}.rail button[data-skipped]{opacity:.45}.notes{position:absolute;right:16px;bottom:70px;max-width:420px;max-height:30vh;overflow:auto;background:#fff;color:#1c2836;padding:18px;border-radius:8px;white-space:pre-wrap;z-index:10}[hidden]{display:none!important}:host([no-rail]) .rail,:host([noscale]) .rail,:host([data-fullscreen]) .rail,:host([data-presenting]) .rail{display:none}:host([noscale]) .art{transform:none!important}:host([noscale]) .toolbar{display:none}:host([data-fullscreen]) .layout,:host([data-presenting]) .layout{height:100%}:host([data-fullscreen]) .toolbar,:host([data-presenting]) .toolbar{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);height:auto;flex-wrap:nowrap;background:#161c25e8;padding:8px;border-radius:12px;max-width:calc(100% - 32px);opacity:0;transition:opacity .2s;pointer-events:none}:host([data-chrome-visible]) .toolbar{opacity:1;pointer-events:auto}
@media(max-width:640px){.rail{display:none}.toolbar{height:auto;min-height:58px;padding:8px;gap:6px}.layout{height:calc(100% - var(--toolbar-height,58px))}.toolbar button{font-size:12px;padding:5px 7px}}
@media print{:host{display:block;height:auto;background:#fff}.layout{display:block;height:auto}.rail,.toolbar,.notes{display:none!important}.viewport{display:block;overflow:visible}.art{transform:none!important;width:auto!important;height:auto!important}::slotted([data-deck-slide]){display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;break-after:page;width:var(--deck-w)!important;height:var(--deck-h)!important}::slotted([data-deck-skip]){display:none!important}::slotted([data-deck-last-visible]){break-after:auto}}
</style><div class="layout"><nav class="rail" aria-label="Slides"></nav><div class="viewport"><div class="art"><slot></slot></div></div></div><div class="toolbar"><button data-prev aria-label="Previous slide">\u2190</button><output aria-label="Slide position"></output><button data-next aria-label="Next slide or build">\u2192</button><button data-reset aria-label="Reset to first slide">Reset \xB7 R</button><button data-full aria-label="Enter fullscreen">Present \xB7 F</button><button data-notes>Notes</button><button data-remove>Remove slide</button><button data-restore aria-label="Restore slides or undo last edit" title="Restore the previous deck state">Undo</button><button data-print>Print / PDF</button></div><aside class="notes" hidden></aside>`;
      DeckStage = class extends HTMLElement {
        static observedAttributes = [
          "noscale",
          "no-rail",
          "width",
          "height",
          "presenting"
        ];
        connectedCallback() {
          if (this.controller) return;
          const query = new URLSearchParams(location.search);
          if (query.has("_snthumb") || query.has("deck-thumbnail"))
            this.setAttribute("no-rail", "");
          if (!this.shadowRoot)
            this.attachShadow({ mode: "open" }).innerHTML = template;
          this.controller = new AbortController();
          const options = { signal: this.controller.signal };
          this.setAttribute("data-fonts-pending", "");
          this.ready = false;
          this.index = this.index ?? -1;
          this.slides = [];
          this.printing = false;
          this.buildPlayer = new DeckBuilds(this);
          const root = this.shadowRoot;
          const bind = (selector2, handler) => root.querySelector(selector2).addEventListener("click", handler, options);
          bind("[data-prev]", () => this.prev("click"));
          bind("[data-next]", () => this.next("click"));
          bind("[data-reset]", () => this.goTo(0, "click"));
          bind("[data-full]", () => this.toggleFullscreen());
          bind("[data-print]", () => window.print());
          bind("[data-notes]", () => {
            root.querySelector(".notes").hidden = !root.querySelector(".notes").hidden;
            this.updateNotes();
          });
          this.editor = new DeckEditor(this);
          bind("[data-remove]", () => this.editor.confirm(this.editor.selected()));
          bind("[data-restore]", () => this.editor.undo());
          let extras = root.querySelector("[data-rail-toggle]");
          if (!extras) {
            extras = document.createElement("button");
            extras.dataset.railToggle = "";
            extras.textContent = "Slides";
            extras.setAttribute("aria-label", "Toggle slide rail");
            root.querySelector(".toolbar").append(extras);
          }
          bind("[data-rail-toggle]", () => this.editor.toggleRail());
          this.observer = new ResizeObserver(() => this.fit());
          this.observer.observe(root.querySelector(".viewport"));
          this.toolbarObserver = new ResizeObserver(() => {
            this.style.setProperty(
              "--toolbar-height",
              `${root.querySelector(".toolbar").offsetHeight}px`
            );
            this.fit();
          });
          this.toolbarObserver.observe(root.querySelector(".toolbar"));
          window.addEventListener("keydown", (event) => this.onKey(event), options);
          window.addEventListener(
            "hashchange",
            () => {
              const index = this.hashIndex();
              if (index !== null && index !== this.index) this.goTo(index, "hash");
            },
            options
          );
          document.addEventListener(
            "fullscreenchange",
            () => this.syncFullscreen(),
            options
          );
          window.addEventListener("beforeprint", () => this.preparePrint(), options);
          window.addEventListener("afterprint", () => this.restorePrint(), options);
          this.printQuery = matchMedia("print");
          this.printQuery.addEventListener(
            "change",
            (event) => event.matches ? this.preparePrint() : this.restorePrint(),
            options
          );
          window.addEventListener("mousemove", () => this.revealChrome(), options);
          const toolbar = root.querySelector(".toolbar");
          toolbar.addEventListener(
            "pointerenter",
            () => {
              this.chromeHover = true;
              this.revealChrome();
            },
            options
          );
          toolbar.addEventListener(
            "pointerleave",
            () => {
              const pinned = this.chromeHover;
              this.chromeHover = false;
              if (pinned || this.hasAttribute("data-chrome-visible"))
                this.revealChrome();
            },
            options
          );
          toolbar.addEventListener(
            "focusin",
            (event) => {
              try {
                if (!event.target.matches(":focus-visible")) return;
              } catch {
              }
              this.chromeFocus = true;
              this.revealChrome();
            },
            options
          );
          toolbar.addEventListener(
            "focusout",
            (event) => {
              if (event.relatedTarget && toolbar.contains(event.relatedTarget))
                return;
              const pinned = this.chromeFocus;
              this.chromeFocus = false;
              if (pinned || this.hasAttribute("data-chrome-visible"))
                this.revealChrome();
            },
            options
          );
          this.addEventListener(
            "click",
            (event) => {
              if (matchMedia("(hover:hover) and (pointer:fine)").matches || event.defaultPrevented)
                return;
              const path = event.composedPath(), view = root.querySelector(".viewport");
              if (!path.includes(view) || path.some((node) => node.matches?.(interactive)))
                return;
              const bounds = view.getBoundingClientRect();
              event.preventDefault();
              if (event.clientX < bounds.left + bounds.width / 2) this.prev("tap");
              else this.next("tap");
            },
            options
          );
          this.addEventListener(
            "codex-deck-presenting",
            (event) => this.setPresenting(event.detail?.presenting === true),
            options
          );
          this.addEventListener(
            "codex-deck-go-to",
            (event) => {
              if (Number.isInteger(event.detail?.index))
                this.goTo(event.detail.index);
            },
            options
          );
          root.querySelector("slot").addEventListener(
            "slotchange",
            () => {
              const before = this.slides, next = this.collect();
              if (before.length === next.length && before.every((slide, index) => slide === next[index]))
                return;
              this.show(
                this.hashIndex() ?? Math.max(0, this.index),
                this.index >= 0,
                "mutation"
              );
              this.fit();
            },
            options
          );
          if (!this.printStyle) {
            this.printStyle = document.createElement("style");
            this.printStyle.dataset.codexDeckRuntime = "";
            document.head.append(this.printStyle);
          }
          if (!document.getElementById("codex-deck-text-wrap")) {
            const style = document.createElement("style");
            style.id = "codex-deck-text-wrap";
            style.textContent = ":where(h1,h2,h3,h4,h5,h6){text-wrap:balance}:where(p,li,blockquote,figcaption){text-wrap:pretty}deck-stage [data-notes]{display:none}";
            document.head.append(style);
          }
          queueMicrotask(() => {
            if (!this.isConnected) return;
            this.configureSize();
            this.collect();
            this.fit();
            this.show(this.hashIndex() ?? 0, false, "init");
            this.syncFullscreen();
            const owner = this.controller;
            Promise.race([
              document.fonts.ready,
              new Promise((resolve) => setTimeout(resolve, 2e3))
            ]).then(() => {
              if (this.controller !== owner || !this.isConnected) return;
              this.removeAttribute("data-fonts-pending");
              this.fit();
              this.ready = true;
            });
          });
        }
        disconnectedCallback() {
          this.controller?.abort();
          this.controller = null;
          this.observer?.disconnect();
          this.toolbarObserver?.disconnect();
          this.buildPlayer?.clear();
          this.editor?.dispose();
          clearTimeout(this.chromeTimer);
          this.printStyle?.remove();
          this.printStyle = null;
        }
        attributeChangedCallback(name) {
          if (!this.controller) return;
          if (name === "presenting")
            this.setPresenting(this.hasAttribute("presenting"));
          else {
            this.configureSize();
            this.fit();
            if (name === "noscale") {
              this.buildPlayer.clear();
              if (this.slides[this.index])
                this.buildPlayer.arrive(this.slides[this.index], true);
            }
          }
        }
        configureSize() {
          const dimension = (name, fallback) => {
            const number = Number(this.getAttribute(name));
            return Number.isFinite(number) && number > 0 ? number : fallback;
          };
          this.width = dimension("width", 1920);
          this.height = dimension("height", 1080);
          const art = this.shadowRoot.querySelector(".art");
          art.style.width = `${this.width}px`;
          art.style.height = `${this.height}px`;
          this.style.setProperty("--deck-w", `${this.width}px`);
          this.style.setProperty("--deck-h", `${this.height}px`);
          if (this.printStyle)
            this.printStyle.textContent = `@media print{@page{size:${this.width}px ${this.height}px;margin:0}html,body{margin:0}deck-stage [data-anim]{mask-image:none!important;-webkit-mask-image:none!important}deck-stage [data-notes]{display:none!important}}`;
        }
        get designWidth() {
          return this.width;
        }
        get designHeight() {
          return this.height;
        }
        get length() {
          return this.slides.length;
        }
        get stepsRemaining() {
          return this.buildPlayer?.remaining ?? 0;
        }
        get step() {
          return this.buildPlayer?.state?.played ?? 0;
        }
        collect() {
          this.slides = [...this.children].filter(
            (node) => !["SCRIPT", "STYLE", "TEMPLATE"].includes(node.tagName)
          );
          this.slides.forEach((slide, index) => {
            slide.setAttribute("data-deck-slide", index);
            const label = slideLabel(slide);
            slide.setAttribute(
              "data-screen-label",
              `${String(index + 1).padStart(2, "0")} ${label}`
            );
            slide.removeAttribute("data-deck-last-visible");
          });
          this.slides.filter((slide) => !slide.hasAttribute("data-deck-skip")).at(-1)?.setAttribute("data-deck-last-visible", "");
          return this.slides;
        }
        fit() {
          if (!this.width) return;
          const view = this.shadowRoot.querySelector(".viewport");
          this.scale = this.hasAttribute("noscale") ? 1 : Math.min(
            view.clientWidth / this.width,
            view.clientHeight / this.height
          );
          this.shadowRoot.querySelector(".art").style.transform = `scale(${this.scale})`;
        }
        hashIndex() {
          const match = /^#(\d+)$/.exec(location.hash);
          const index = match ? Number(match[1]) - 1 : -1;
          return index >= 0 && index < this.slides.length ? index : null;
        }
        show(index, complete = false, reason = "api") {
          if (!this.slides.length) return;
          const previousIndex = this.index, previousSlide = this.activeSlide ?? null;
          index = Math.max(0, Math.min(this.slides.length - 1, Math.trunc(index)));
          if (!Number.isFinite(index)) return;
          const slide = this.slides[index];
          this.index = index;
          if (previousSlide !== slide) this.buildPlayer.clear();
          this.slides.forEach((node, i) => {
            node.toggleAttribute("data-slide-hidden", i !== index);
            node.toggleAttribute("data-deck-active", i === index);
          });
          this.activeSlide = slide;
          this.buildPlayer.arrive(
            slide,
            complete || previousIndex >= 0 && index < previousIndex
          );
          const visible = this.slides.filter(
            (node) => !node.hasAttribute("data-deck-skip")
          );
          this.shadowRoot.querySelector("output").textContent = `${slide.hasAttribute("data-deck-skip") ? "\u2013" : visible.indexOf(slide) + 1} / ${visible.length}`;
          history.replaceState(null, "", `#${index + 1}`);
          this.updateNotes();
          this.rail();
          if (previousSlide !== slide || reason === "init" || reason === "mutation")
            this.dispatchEvent(
              new CustomEvent("slidechange", {
                bubbles: true,
                composed: true,
                detail: {
                  index,
                  previousIndex,
                  total: this.slides.length,
                  slide,
                  previousSlide,
                  reason
                }
              })
            );
          if (reason !== "init") this.revealChrome("auto");
        }
        goTo(index, reason = "api") {
          if (!["click", "mutation"].includes(reason)) this.editor?.clearSelection();
          if (index !== this.index) this.show(index, false, reason);
          else if (this.slides.length) this.revealChrome("auto");
        }
        next(reason = "api") {
          this.editor?.clearSelection();
          if (this.buildPlayer.next()) return;
          this.advance(1, reason);
        }
        prev(reason = "api") {
          this.editor?.clearSelection();
          this.advance(-1, reason);
        }
        advance(direction, reason) {
          let index = this.index + direction;
          while (this.slides[index]?.hasAttribute("data-deck-skip"))
            index += direction;
          if (index >= 0 && index < this.slides.length)
            this.show(index, false, reason);
          else if (this.slides.length) this.revealChrome("auto");
        }
        updateNotes() {
          let fallback = [];
          try {
            fallback = JSON.parse(
              document.getElementById("speaker-notes")?.textContent || "[]"
            );
          } catch {
          }
          const slide = this.slides[this.index];
          this.shadowRoot.querySelector(".notes").textContent = slide?.getAttribute("data-speaker-notes") ?? slide?.querySelector("[data-notes]")?.textContent ?? (Array.isArray(fallback) && typeof fallback[this.index] === "string" ? fallback[this.index] : "No speaker notes for this slide.");
        }
        onKey(event) {
          if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.composedPath().some(
            (node) => node.isContentEditable || node.matches?.("input,textarea,select")
          ))
            return;
          const key = event.key;
          if ([" ", "Spacebar"].includes(key) && event.composedPath().some((node) => node.matches?.("button")))
            return;
          if (["ArrowRight", "ArrowDown", " ", "Spacebar", "PageDown"].includes(key))
            this.next("keyboard");
          else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(key))
            this.prev("keyboard");
          else if (["Home", "r", "R"].includes(key)) this.goTo(0, "keyboard");
          else if (key === "End") this.goTo(this.slides.length - 1, "keyboard");
          else if (/^[0-9]$/.test(key)) {
            const index = key === "0" ? 9 : Number(key) - 1;
            if (index < this.slides.length) this.goTo(index, "keyboard");
          } else if (key === "f" || key === "F") this.toggleFullscreen();
          else return;
          event.preventDefault();
          this.revealChrome("auto");
        }
        setPresenting(value) {
          if (this.hasAttribute("data-presenting") === value) return;
          this.resetChrome();
          this.toggleAttribute("data-presenting", value);
          this.fit();
        }
        resetChrome() {
          clearTimeout(this.chromeTimer);
          this.chromeTimer = null;
          this.chromeHover = false;
          this.chromeFocus = false;
          this.removeAttribute("data-chrome-visible");
        }
        revealChrome(source = "pointer") {
          if (source !== "pointer" && (this.hasAttribute("data-presenting") || this.hasAttribute("data-fullscreen")))
            return;
          this.setAttribute("data-chrome-visible", "");
          clearTimeout(this.chromeTimer);
          this.chromeTimer = setTimeout(() => {
            if (!this.chromeHover && !this.chromeFocus)
              this.removeAttribute("data-chrome-visible");
          }, 1800);
        }
        async toggleFullscreen() {
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
            this.syncFullscreen();
          } catch {
            this.shadowRoot.querySelector("output").textContent += " \xB7 Fullscreen unavailable";
          }
        }
        syncFullscreen() {
          const full = !!document.fullscreenElement;
          if (this.hasAttribute("data-fullscreen") !== full) this.resetChrome();
          this.toggleAttribute("data-fullscreen", full);
          this.shadowRoot.querySelector("[data-full]").setAttribute(
            "aria-label",
            full ? "Exit fullscreen" : "Enter fullscreen"
          );
          this.fit();
        }
        preparePrint() {
          if (this.printing) return;
          this.printing = true;
          this.buildPlayer.clear();
          this.slides.forEach((slide) => slide.setAttribute("data-deck-active", ""));
        }
        restorePrint() {
          if (!this.printing) return;
          this.printing = false;
          this.slides.forEach(
            (slide, index) => slide.toggleAttribute("data-deck-active", index === this.index)
          );
          if (this.slides[this.index])
            this.buildPlayer.arrive(this.slides[this.index], true);
        }
        rail() {
          this.editor?.reconcile();
        }
      };
      if (!customElements.get("deck-stage"))
        customElements.define("deck-stage", DeckStage);
    }
  });

  // skills/studio-design/assets/starters/deck.js
  window.CodexDeckReady = Promise.resolve().then(() => (init_deck_runtime(), deck_runtime_exports));
})();
