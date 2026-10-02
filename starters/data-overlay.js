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

  // skills/studio-design/assets/starters/data-overlay-model.js
  function closestMetric(views, want) {
    return views.filter((view) => triple(view).metric === want.metric).reduce((best, view) => {
      const score = (v) => ["cohort", "window"].filter((key) => triple(v)[key] === want[key]).length;
      return !best || score(view) > score(best) ? view : best;
    }, null);
  }
  function formatNumber(value) {
    if (value == null) return "\u2013";
    const n = Number(value);
    if (!Number.isFinite(n)) return "Invalid";
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
    return String(Math.round(n));
  }
  function formatPercent(value) {
    if (value == null) return "\u2013";
    const n = Number(value);
    return Number.isFinite(n) ? `${(n * 100).toFixed(Math.abs(n) < 0.1 ? 1 : 0)}%` : "Invalid";
  }
  function parseColor(value) {
    if (typeof value !== "string") return null;
    const text = value.trim();
    const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(text);
    if (hex) {
      const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
      return [0, 2, 4].map(
        (offset) => parseInt(digits.slice(offset, offset + 2), 16)
      );
    }
    const rgb = /^rgba?\(([^)]+)\)$/i.exec(text);
    if (!rgb) return null;
    const raw = rgb[1].split(",");
    if (raw.some((part) => !part.trim())) return null;
    const parts = raw.map((v) => Number(v.trim()));
    return parts.length >= 3 && parts.length <= 4 && parts.every(Number.isFinite) ? parts.slice(0, 3).map((n) => Math.round(Math.max(0, Math.min(255, n)))) : null;
  }
  function buildRamp(spec = {}, values = []) {
    const numbers = values.filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
    let raw = Array.isArray(spec.colors) && spec.colors.length ? spec.colors : spec.hue ? ["#F6F4EF", spec.hue] : ["#F6F4EF", "#558A42"];
    if (raw.length === 1) raw = ["#F6F4EF", ...raw];
    let cols = raw.map(parseColor);
    if (cols.some((c) => !c))
      cols = [parseColor("#F6F4EF"), parseColor("#558A42")];
    const validDomain = Array.isArray(spec.domain) && spec.domain.length >= 2 && spec.domain.slice(0, 2).every((n) => n != null && Number.isFinite(Number(n)));
    const lo = validDomain ? Number(spec.domain[0]) : numbers.length ? Math.min(...numbers) : 0;
    const hi = validDomain ? Number(spec.domain[1]) : numbers.length ? Math.max(...numbers) : 1;
    const flat = lo === hi, distinct = [...new Set(numbers)].sort((a, b) => a - b);
    const base = Number(spec.baseline);
    const diverging = cols.length >= 3 && spec.baseline != null && !flat && base > lo && base < hi;
    const quantize = (t) => Number.isFinite(Number(spec.steps)) && spec.steps > 1 ? Math.round(clamp(t) * (spec.steps - 1)) / (spec.steps - 1) : clamp(t);
    const swatch = (t) => {
      const left = cols.length >= 3 ? t < 0.5 ? cols[0] : cols[1] : cols[0];
      const right = cols.length >= 3 ? t < 0.5 ? cols[1] : cols[2] : cols.at(-1);
      const position = cols.length >= 3 ? t < 0.5 ? t * 2 : (t - 0.5) * 2 : t;
      return rgbString(
        left.map((n, i) => Math.round(n + (right[i] - n) * position))
      );
    };
    return {
      lo,
      hi: flat ? lo + 1 : hi,
      flat,
      cols,
      flipped: spec.good === "low" && !diverging,
      swatch,
      color(value) {
        const n = Number(value);
        let t = flat ? 0.5 : diverging ? n <= base ? 0.5 * (n - lo) / (base - lo) : 0.5 + 0.5 * (n - base) / (hi - base) : spec.scale === "quantile" && distinct.length > 1 ? (distinct.findIndex((v) => v >= n) < 0 ? distinct.length - 1 : distinct.findIndex((v) => v >= n)) / (distinct.length - 1) : (n - lo) / (hi - lo);
        if (!diverging && spec.good === "low") t = 1 - t;
        return swatch(quantize(t));
      }
    };
  }
  function metaParts(meta) {
    if (!meta || typeof meta !== "object")
      return { text: "", range: false, about: false };
    const range = typeof meta.range === "string" ? meta.range.trim() : "";
    const about = typeof meta.about === "string" ? meta.about.trim() : "";
    const rangeOK = /^[\w ,.%+/&()'–—→:-]{1,64}$/.test(range);
    const aboutOK = /^[\w ,.%+/&()'–—→:;=-]{1,100}$/.test(about);
    const bits = rangeOK ? [range] : [];
    const n = Number(meta.n);
    const unit = meta.unit == null ? "rows" : typeof meta.unit === "string" && /^[A-Za-z][A-Za-z -]{0,31}$/.test(meta.unit) ? meta.unit : null;
    if ((typeof meta.n === "number" || typeof meta.n === "string" && meta.n.trim()) && Number.isFinite(n) && n >= 0 && unit)
      bits.push(
        `${n >= 1e4 ? formatNumber(n) : Math.round(n).toLocaleString("en-US")} ${unit}`
      );
    if (aboutOK) bits.push(about);
    return { text: bits.join(" \xB7 "), range: rangeOK, about: aboutOK };
  }
  function requestFor({ src, mode, active, want }) {
    const id = String(active?.id || "");
    if (mode === "refresh" && !/^[\w.-]{1,64}$/.test(id)) {
      mode = "missing";
      want ??= triple(active);
    }
    const cleanWant = want ? Object.fromEntries(
      fields.map((key) => [key, phraseOK(want[key]) ? want[key] : ""])
    ) : null;
    const file = typeof src === "string" && src.length <= 2048 && !/^(?:data|javascript|blob):/i.test(src) && !/[\x00-\x1f]/.test(src) ? src : "the overlay data file";
    const text = mode === "refresh" ? `Refresh view "${id}" in ${file}: re-run its recorded source query for the same population and window, re-anchored to today. Preserve the query definition and every other view. Write real values, basis, a new asOf and recomputed meta (date range, count with its exact unit, and a plain-language about). Derive finding from those values after computing them, then reload the overlay.` : `Add a view to ${file} answering ${cleanWant?.metric ? `metric "${cleanWant.metric}"` : "the current product question"}${cleanWant?.cohort ? ` for cohort "${cleanWant.cohort}"` : ""}${cleanWant?.window ? ` over "${cleanWant.window}"` : ""}. Query the real analytics source; never invent values. Record the precise source query, basis, asOf and meta (date range, count with its exact unit, and a plain-language about). Derive finding from the computed values, preserve every existing view, then reload the overlay.`;
    return {
      type: "data-overlay:fetch",
      src: file === "the overlay data file" ? "" : file,
      mode,
      view: /^[\w.-]{1,64}$/.test(id) ? id : "",
      want: cleanWant,
      text,
      fallbackPrompt: text
    };
  }
  var fields, elementsOf, phraseOK, attributeName, triple, exactView, formatter, rgbString, safeColor, clamp;
  var init_data_overlay_model = __esm({
    "skills/studio-design/assets/starters/data-overlay-model.js"() {
      fields = ["metric", "cohort", "window"];
      elementsOf = (view) => Array.isArray(view?.elements) ? view.elements.filter((element) => element && typeof element === "object") : [];
      phraseOK = (text) => typeof text === "string" && /^[\w ,.%+/&()'-]{1,64}$/.test(text);
      attributeName = (text) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(text || "") ? text : "data-metric-id";
      triple = (view = {}) => ({
        metric: String(view.sentence?.metric || view.label || view.id || ""),
        cohort: String(view.sentence?.cohort || ""),
        window: String(view.sentence?.window || "")
      });
      exactView = (views, want) => views.find((view) => fields.every((key) => triple(view)[key] === want[key]));
      formatter = (spec = {}) => typeof spec.fmt === "function" ? spec.fmt : spec.fmt === "n" ? formatNumber : formatPercent;
      rgbString = (channels) => `rgb(${channels.join(",")})`;
      safeColor = (value) => {
        const color = parseColor(value);
        return color && rgbString(color);
      };
      clamp = (n) => Math.max(0, Math.min(1, n));
    }
  });

  // skills/studio-design/assets/starters/data-overlay-geometry.js
  var data_overlay_geometry_exports = {};
  __export(data_overlay_geometry_exports, {
    cornerRad: () => cornerRad,
    cover: () => cover,
    linearOf: () => linearOf,
    measureRects: () => measureRects,
    mulLin: () => mulLin,
    ownLinear: () => ownLinear,
    quadOffset: () => quadOffset,
    radiusOf: () => radiusOf
  });
  function cornerRad(value) {
    if (typeof value !== "string") return null;
    const parts = value.trim().split(/\s+/);
    return parts.length >= 1 && parts.length <= 2 && parts.every((p) => /^\d*\.?\d+(?:px|%)$/.test(p)) ? [parts[0], parts[1] ?? parts[0]] : null;
  }
  function radiusOf(style) {
    const corners = [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius
    ].map(cornerRad);
    if (corners.some((c) => !c)) return null;
    const x = corners.map((c) => c[0]).join(" "), y = corners.map((c) => c[1]).join(" ");
    return x === y ? x : `${x} / ${y}`;
  }
  function linearOf(transform) {
    if (!transform || transform === "none") return null;
    const match = /^matrix(3d)?\(([^)]+)\)$/.exec(transform);
    if (!match) return false;
    const values = match[2].split(",").map(Number);
    if (values.some((v) => !Number.isFinite(v))) return false;
    let result;
    if (match[1]) {
      if (values.length !== 16 || [2, 3, 6, 7, 8, 9, 11, 14].some((i) => values[i] !== 0) || values[10] !== 1 || values[15] !== 1)
        return false;
      result = [values[0], values[1], values[4], values[5]];
    } else {
      if (values.length !== 6) return false;
      result = values.slice(0, 4);
    }
    return result.every((v, i) => v === [1, 0, 0, 1][i]) ? null : result;
  }
  function mulLin(a, b) {
    const result = [];
    for (let column = 0; column < 2; column++)
      for (let row = 0; row < 2; row++)
        result.push(a[row] * b[column * 2] + a[row + 2] * b[column * 2 + 1]);
    return result;
  }
  function ownLinear(style) {
    if (style.zoom && !["normal", "1"].includes(style.zoom) && parseFloat(style.zoom) !== 1)
      return false;
    let result = linearOf(style.transform);
    if (result === false) return false;
    if (style.scale && style.scale !== "none") {
      const scale = style.scale.trim().split(/\s+/).map(Number);
      if (!scale.length || scale.length > 3 || scale.some((n) => !Number.isFinite(n)) || scale.length === 3 && scale[2] !== 1)
        return false;
      const matrix = [scale[0], 0, 0, scale[1] ?? scale[0]];
      result = result ? mulLin(matrix, result) : matrix;
    }
    if (style.rotate && style.rotate !== "none") {
      const rotation = /^(?:z\s+)?(-?[\d.]+(?:e[+-]?\d+)?)(deg|rad|grad|turn)$/i.exec(
        style.rotate.trim()
      );
      if (!rotation) return false;
      const radians = Number(rotation[1]) * { deg: Math.PI / 180, rad: 1, grad: Math.PI / 200, turn: 2 * Math.PI }[rotation[2].toLowerCase()];
      if (!Number.isFinite(radians)) return false;
      const matrix = [
        Math.cos(radians),
        Math.sin(radians),
        -Math.sin(radians),
        Math.cos(radians)
      ];
      result = result ? mulLin(matrix, result) : matrix;
    }
    return result;
  }
  function quadOffset(matrix, width, height) {
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height]
    ].map(([x, y]) => [
      matrix[0] * x + matrix[2] * y,
      matrix[1] * x + matrix[3] * y
    ]);
    return {
      ox: Math.min(...corners.map((p) => p[0])),
      oy: Math.min(...corners.map((p) => p[1]))
    };
  }
  function measureRects(host, stage, idAttr) {
    const stageRect = stage.getBoundingClientRect(), result = /* @__PURE__ */ new Map(), linear = /* @__PURE__ */ new Map();
    function accumulated(element) {
      if (!element || element === host) return null;
      if (linear.has(element)) return linear.get(element);
      const own = ownLinear(getComputedStyle(element)), parent = accumulated(element.parentElement);
      const matrix = own === false || parent === false ? false : own && parent ? mulLin(parent, own) : own || parent;
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
        box.top + box.height / 2
      );
      const occluded = !!(top && top !== host && top !== element && !top.contains(element) && !element.contains(top) && host.contains(top));
      const matrix = accumulated(element), width = element.offsetWidth, height = element.offsetHeight;
      const tf = matrix && width > 0 && height > 0 ? {
        a: matrix[0],
        b: matrix[1],
        c: matrix[2],
        d: matrix[3],
        w: width,
        h: height,
        ...quadOffset(matrix, width, height)
      } : null;
      const rect = {
        id,
        element,
        x: box.left - stageRect.left - stage.clientLeft,
        y: box.top - stageRect.top - stage.clientTop,
        w: box.width,
        h: box.height,
        occluded,
        rad: radiusOf(getComputedStyle(element)),
        tf
      };
      if (!result.has(id) || result.get(id).occluded && !occluded)
        result.set(id, rect);
    }
    return { rects: [...result.values()], skipped };
  }
  function cover(element, rect) {
    const { tf } = rect;
    Object.assign(element.style, {
      left: `${rect.x - (tf?.ox || 0)}px`,
      top: `${rect.y - (tf?.oy || 0)}px`,
      width: `${tf?.w ?? rect.w}px`,
      height: `${tf?.h ?? rect.h}px`,
      transform: tf ? `matrix(${tf.a},${tf.b},${tf.c},${tf.d},0,0)` : "",
      transformOrigin: "0 0",
      borderRadius: rect.rad || ""
    });
  }
  var init_data_overlay_geometry = __esm({
    "skills/studio-design/assets/starters/data-overlay-geometry.js"() {
    }
  });

  // skills/studio-design/assets/starters/data-overlay-layout.js
  function layoutCallouts(items, width, height, avoid = []) {
    const placed = [], output = /* @__PURE__ */ Object.create(null);
    const sorted = [...items].sort(
      (a, b) => a.ay - b.ay || a.ax - b.ax || a.order - b.order
    );
    const position = (item, x, y) => ({
      x: Math.max(8, Math.min(x, width - item.cw - 8)),
      y: Math.max(4, Math.min(y, height - item.ch - 4)),
      w: item.cw,
      h: item.ch
    });
    const obstacles = (item) => [
      ...items.filter((it) => it.id !== item.id).map((it) => ({ x: it.ax, y: it.ay, w: it.aw, h: it.ah })),
      ...avoid
    ];
    const blocked = (rect) => placed.find((p) => intersects(rect, p, 8));
    const covers = (rect, item) => obstacles(item).some((p) => intersects(rect, p));
    const damage = (rect, item) => obstacles(item).reduce(
      (sum, p) => sum + Math.max(
        0,
        Math.min(rect.x + rect.w, p.x + p.w) - Math.max(rect.x, p.x)
      ) * Math.max(
        0,
        Math.min(rect.y + rect.h, p.y + p.h) - Math.max(rect.y, p.y)
      ) / Math.max(1, p.w * p.h),
      0
    );
    const save = (item, rect) => {
      output[item.id] = { x: rect.x, y: rect.y };
      placed.push(rect);
    };
    for (const item of sorted.filter((it) => it.fixed))
      save(
        item,
        position(
          item,
          item.ax + (item.dx || 0),
          item.place === "above" ? item.ay - item.gap - item.ch : item.ay + item.ah + item.gap
        )
      );
    for (const item of sorted.filter((it) => !it.fixed)) {
      const candidates = [
        [item.ax, item.ay + item.ah + item.gap],
        [item.ax, item.ay - item.gap - item.ch],
        [item.ax + item.aw + 10, item.ay],
        [item.ax - item.cw - 10, item.ay]
      ].map(([x, y]) => position(item, x, y));
      const walk = (clean) => {
        let y = item.ay + item.ah + item.gap;
        for (let attempt = 0; attempt < 24; attempt++) {
          const rect = position(item, item.ax, y), conflict = blocked(rect);
          if (!conflict && (!clean || !covers(rect, item))) return rect;
          if (rect.y >= height - item.ch - 4) return null;
          y = (conflict ? conflict.y + conflict.h : rect.y + rect.h) + 8;
        }
        return null;
      };
      let chosen = candidates.find((rect) => !blocked(rect) && !covers(rect, item)) || walk(true);
      if (!chosen) {
        const candidate = walk(false), pool = [...candidates, ...candidate ? [candidate] : []].filter(
          (rect) => !blocked(rect)
        );
        chosen = pool.reduce(
          (best, rect) => !best || damage(rect, item) < damage(best, item) - 1e-9 ? rect : best,
          null
        );
      }
      save(item, chosen || candidates[0]);
    }
    return output;
  }
  function layoutTags(records, stageWidth) {
    const placed = [];
    for (const record of [...records].sort(
      (a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x
    )) {
      const { rect, node: node2 } = record, w = node2.offsetWidth || 44, h = node2.offsetHeight || 14;
      const x = Math.max(
        0,
        Math.min(stageWidth - w, rect.x + rect.w / 2 - w / 2)
      );
      let y;
      for (let lane = 0; lane < 8; lane++) {
        y = rect.y < 60 ? rect.y + rect.h + 4 + lane * (h + 4) : rect.y - h - 4 - lane * (h + 4);
        if (lane === 7 || !placed.some((p) => intersects({ x, y, w, h }, p)))
          break;
      }
      Object.assign(node2.style, { left: `${x}px`, top: `${y}px` });
      placed.push({ x, y, w, h });
    }
  }
  var intersects;
  var init_data_overlay_layout = __esm({
    "skills/studio-design/assets/starters/data-overlay-layout.js"() {
      intersects = (a, b, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
    }
  });

  // skills/studio-design/assets/starters/data-overlay-dom.js
  var node;
  var init_data_overlay_dom = __esm({
    "skills/studio-design/assets/starters/data-overlay-dom.js"() {
      node = (tag, className, text) => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text != null) element.textContent = String(text);
        return element;
      };
    }
  });

  // skills/studio-design/assets/starters/data-overlay-controls.js
  var suggestions, OverlayControls;
  var init_data_overlay_controls = __esm({
    "skills/studio-design/assets/starters/data-overlay-controls.js"() {
      init_data_overlay_model();
      init_data_overlay_dom();
      suggestions = {
        metric: ["bounce rate"],
        cohort: ["new users only", "returning users"],
        window: ["last 7 days", "weekends only"]
      };
      OverlayControls = class {
        constructor(host) {
          this.host = host;
        }
        renderSentence() {
          this.closeMenu();
          this.host.sentence.replaceChildren();
          if (this.host.getAttribute("controls") !== "on" || !this.host.enabled())
            return;
          const active = this.host.active(), busy = this.host.getAttribute("data-state") === "loading";
          if (!active) {
            this.host.sentence.append(document.createTextNode("No data views yet."));
            this.host.sentence.append(this.askButton(busy));
            return;
          }
          const current = this.host.want || triple(active);
          this.host.sentence.append(document.createTextNode("Showing "));
          for (const field of fields) {
            if (field !== "metric" && !this.host.options(field).length) continue;
            if (field !== "metric")
              this.host.sentence.append(
                document.createTextNode(field === "cohort" ? " for " : " over ")
              );
            const token = node("button", "dv-tok", current[field] || "\u2014");
            token.type = "button";
            token.dataset.tok = field;
            token.setAttribute("aria-label", `${field}: ${current[field] || "none"}`);
            token.setAttribute("aria-haspopup", "listbox");
            token.setAttribute("aria-expanded", "false");
            token.append(node("span", "dv-tcar", "\u25BE"));
            token.addEventListener("click", () => {
              if (this.host.menuToken === token) this.closeMenu();
              else this.openMenu(field, token);
            });
            token.addEventListener("keydown", (event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                if (this.host.menuToken === token)
                  this.host.menu.querySelector(".dv-mi,input")?.focus();
                else this.openMenu(field, token, true);
              } else if (["Enter", " "].includes(event.key)) {
                event.preventDefault();
                if (this.host.menuToken === token) this.closeMenu(true);
                else this.openMenu(field, token, true);
              }
            });
            this.host.sentence.append(token);
          }
          this.host.sentence.append(document.createTextNode("."));
          if (busy || this.host.want || active.refreshable)
            this.host.sentence.append(this.askButton(busy));
        }
        askButton(busy) {
          const button = node(
            "button",
            "dv-ask",
            busy ? "Draft ready \u2014 awaiting data" : "Ask Codex to fetch metrics"
          );
          button.type = "button";
          button.toggleAttribute("data-busy", busy);
          button.addEventListener("click", () => {
            if (this.host.getAttribute("data-state") === "loading") {
              this.host.stopWaiting();
              this.host.timedOut = false;
              this.host.rest();
              this.renderSentence();
              return;
            }
            this.ask(
              this.host.want || !this.host.data.length ? "missing" : "refresh"
            );
          });
          return button;
        }
        openMenu(field, token, focus = false) {
          this.closeMenu();
          const menu = node("div", "dv-menu");
          menu.setAttribute("role", "listbox");
          menu.setAttribute("aria-label", `Choose ${field}`);
          const current = (this.host.want || triple(this.host.active() || {}))[field];
          for (const value of this.host.options(field)) {
            const option = node(
              "button",
              `dv-mi${value === current ? " dv-cur" : ""}`,
              value || "\u2014"
            );
            option.type = "button";
            option.setAttribute("role", "option");
            option.setAttribute("aria-selected", String(value === current));
            option.dataset.value = value;
            option.addEventListener("click", () => {
              this.closeMenu();
              this.host.pick(field, value);
              this.focusToken(field);
            });
            menu.append(option);
          }
          if (this.host.options(field).length) menu.append(node("div", "dv-mdiv"));
          const row = node("div", "dv-min"), input = node("input", "dv-minp"), go = node("button", "dv-mgo", "ask");
          input.type = "text";
          input.maxLength = 64;
          input.spellcheck = false;
          input.setAttribute("aria-label", `ask for a different ${field}`);
          input.placeholder = field === "window" ? "try another range\u2026" : field === "metric" ? "try a different metric\u2026" : "try a different cut\u2026";
          go.type = "button";
          go.hidden = true;
          const submit = () => {
            const typed = input.value.replace(/[‘’‛]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().slice(0, 64);
            if (!typed) return;
            const authored = this.host.options(field).find((value) => value.toLowerCase() === typed.toLowerCase());
            if (authored) {
              this.closeMenu();
              this.host.pick(field, authored);
              this.focusToken(field);
              return;
            }
            if (!phraseOK(typed)) {
              input.setAttribute("aria-invalid", "true");
              input.focus();
              return;
            }
            this.host.want = {
              ...this.host.want || triple(this.host.active() || {}),
              [field]: typed
            };
            this.closeMenu();
            this.ask("missing");
            this.focusToken(field);
          };
          input.addEventListener("input", () => {
            input.removeAttribute("aria-invalid");
            go.hidden = !input.value.trim();
            row.toggleAttribute("data-filled", !go.hidden);
          });
          input.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
              event.preventDefault();
              submit();
            }
          });
          go.addEventListener("click", submit);
          row.append(input, go);
          menu.append(row);
          this.host.shadowRoot.append(menu);
          this.host.menu = menu;
          this.host.menuToken = token;
          token.setAttribute("aria-expanded", "true");
          this.positionMenu();
          menu.addEventListener("keydown", (event) => {
            if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const items = [...menu.querySelectorAll(".dv-mi,input")], index = items.indexOf(event.target);
            items[Math.max(
              0,
              Math.min(
                items.length - 1,
                index + (event.key === "ArrowDown" ? 1 : -1)
              )
            )]?.focus();
          });
          this.host.outside = (event) => {
            if (!event.composedPath().includes(menu) && !event.composedPath().includes(token))
              this.closeMenu();
          };
          document.addEventListener("click", this.host.outside, true);
          this.rotatePlaceholder(input, field);
          if (focus) menu.querySelector(".dv-mi,input")?.focus();
        }
        positionMenu() {
          if (!this.host.menu || !this.host.menuToken) return;
          const box = this.host.menuToken.getBoundingClientRect();
          Object.assign(this.host.menu.style, {
            left: `${Math.max(8, Math.min(box.left - 8, innerWidth - this.host.menu.offsetWidth - 8))}px`,
            top: `${Math.max(8, Math.min(box.bottom + 8, innerHeight - this.host.menu.offsetHeight - 8))}px`,
            maxHeight: `${Math.max(80, innerHeight - 16)}px`
          });
        }
        focusToken(field) {
          this.host.sentence.querySelector(`[data-tok="${field}"]`)?.focus({ preventScroll: true });
        }
        rotatePlaceholder(input, field) {
          const authored = Array.isArray(this.host.suggest?.[field]) && this.host.suggest[field].length ? this.host.suggest[field] : suggestions[field];
          const options = this.host.options(field).map((v) => v.toLowerCase());
          const list = authored.filter(
            (s) => typeof s === "string" && s && !options.includes(s.toLowerCase())
          );
          if (!list.length) return;
          input.placeholder = list[0];
          if (list.length === 1) return;
          let index = 0;
          this.host.placeholderTimer = setInterval(() => {
            if (input.value) return;
            input.classList.add("dv-phfade");
            this.host.placeholderFade = setTimeout(() => {
              if (input.value) {
                input.classList.remove("dv-phfade");
                return;
              }
              input.placeholder = list[++index % list.length];
              input.classList.remove("dv-phfade");
            }, 360);
          }, 3200);
        }
        closeMenu(focus = false) {
          clearInterval(this.host.placeholderTimer);
          clearTimeout(this.host.placeholderFade);
          document.removeEventListener("click", this.host.outside, true);
          this.host.menu?.remove();
          if (this.host.menuToken) {
            this.host.menuToken.setAttribute("aria-expanded", "false");
            if (focus && this.host.menuToken.isConnected)
              this.host.menuToken.focus({ preventScroll: true });
          }
          this.host.menu = null;
          this.host.menuToken = null;
        }
        async ask(mode) {
          const request = requestFor({
            src: this.host.getAttribute("src") || "",
            mode,
            active: this.host.active(),
            want: this.host.want
          });
          if (request.mode === "missing" && !this.host.want && request.want)
            this.host.want = request.want;
          this.host.timedOut = false;
          this.host.state("loading");
          clearTimeout(this.host.waitTimer);
          this.host.waitTimer = setTimeout(() => {
            if (this.host.getAttribute("data-state") === "loading") {
              this.host.timedOut = true;
              this.host.state("stale");
              this.renderSentence();
            }
          }, 9e4);
          this.host.render();
          this.showDraft(request);
          this.host.dispatchEvent(
            new CustomEvent("data-overlay:fetch", {
              detail: request,
              bubbles: true,
              composed: true
            })
          );
          try {
            if (typeof this.host.onRequest === "function") {
              await this.host.onRequest(request);
              this.host.draftStatus.textContent = "Draft delivered for review. Send it in Codex when ready.";
            } else {
              await navigator.clipboard.writeText(request.text);
              this.host.draftStatus.textContent = "Copied. Paste into Codex, review and send.";
            }
          } catch {
            this.host.draftStatus.textContent = "Copy the draft below, then paste it into Codex to review and send.";
          }
          return request;
        }
        showDraft(request) {
          this.host.draft.hidden = false;
          this.host.draft.replaceChildren(node("strong", null, "Request fresh data"));
          this.host.draftText = node("textarea");
          this.host.draftText.readOnly = true;
          this.host.draftText.value = request.text;
          this.host.draftText.setAttribute("aria-label", "Metric request text");
          this.host.draftStatus = node("p");
          this.host.draftStatus.setAttribute("role", "status");
          const copy = node("button", null, "Copy request"), close = node("button", null, "Hide draft");
          copy.type = close.type = "button";
          copy.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(this.host.draftText.value);
              this.host.draftStatus.textContent = "Copied. Paste into Codex, review and send.";
            } catch {
              this.host.draftText.select();
              this.host.draftStatus.textContent = "Select and copy the draft, then review and send it in Codex.";
            }
          });
          close.addEventListener("click", () => {
            this.host.draft.hidden = true;
          });
          this.host.draft.append(
            this.host.draftText,
            this.host.draftStatus,
            copy,
            document.createTextNode(" "),
            close
          );
        }
      };
    }
  });

  // skills/studio-design/assets/starters/data-overlay-paint.js
  var NS, OverlayPainter;
  var init_data_overlay_paint = __esm({
    "skills/studio-design/assets/starters/data-overlay-paint.js"() {
      init_data_overlay_model();
      init_data_overlay_geometry();
      init_data_overlay_layout();
      init_data_overlay_dom();
      NS = "http://www.w3.org/2000/svg";
      OverlayPainter = class {
        constructor(host) {
          this.host = host;
        }
        values(view) {
          return elementsOf(view).filter((e) => e && Object.hasOwn(e, "value")).map((e) => e.value);
        }
        hasDeltas(view) {
          return !!view.deltaBasis && elementsOf(view).some((e) => e.delta != null);
        }
        renderLegend() {
          this.host.legend.replaceChildren();
          const view = this.host.active();
          if (!view) return;
          const values = this.values(view), spec = view.spectrum || {}, fmt = formatter(spec), ramp = buildRamp(spec, values);
          if (view.legend && view.spectrum && values.length) {
            const name = node("span", "dv-li");
            name.append(node("b", null, spec.name || view.label || ""));
            this.host.legend.append(name);
            const keys = node("span", "dv-li");
            const count = spec.steps > 1 ? Math.min(Math.ceil(spec.steps), 7) : 4;
            for (let i = 0; i < count; i++) {
              const swatch = node("span", "dv-lsw");
              swatch.style.background = ramp.swatch(
                ramp.flipped ? 1 - i / (count - 1) : i / (count - 1)
              );
              keys.append(swatch);
            }
            keys.append(
              document.createTextNode(
                ramp.flat ? fmt(ramp.lo) : `${fmt(ramp.lo)} \u2192 ${fmt(ramp.hi)}`
              )
            );
            this.host.legend.append(keys);
            if (values.some((v) => v == null)) {
              const empty = node("span", "dv-li", " measured, found nothing");
              const swatch = node("span", "dv-lsw");
              swatch.style.background = "repeating-linear-gradient(45deg,#14120d2e 0 3px,transparent 3px 6px)";
              empty.prepend(swatch);
              this.host.legend.append(empty);
            }
          }
          const meta = this.host.getAttribute("controls") === "on" ? this.host.metaInfo || {} : {}, bits = [];
          if (values.length && !view.basis) {
            const warning = node("span", "dv-basis warn", "basis not stated");
            this.host.legend.append(warning);
          } else if (view.basis && !meta.about) bits.push(String(view.basis));
          if (this.hasDeltas(view)) bits.push(`\u0394 vs ${view.deltaBasis}`);
          const date = view.asOf ? new Date(
            String(view.asOf).includes("T") ? view.asOf : `${view.asOf}T00:00:00`
          ) : null;
          if (date && !Number.isNaN(+date) && (values.length || view.basis) && !meta.range)
            bits.push(
              `as of ${date.toLocaleDateString(void 0, { month: "short", day: "numeric" })}`
            );
          if (bits.length)
            this.host.legend.append(node("span", "dv-li dv-basis", bits.join(" \xB7 ")));
        }
        renderLayer() {
          this.host.layer.replaceChildren();
          const view = this.host.active();
          if (!view) {
            if (this.host.getAttribute("src"))
              this.host.layer.append(
                node(
                  "div",
                  "dv-empty",
                  this.host.loadError || `No data views at ${this.host.getAttribute("src")}`
                )
              );
            this.fade();
            return;
          }
          const byId = new Map(this.host.rects.map((r) => [r.id, r])), elements = elementsOf(view), spec = view.spectrum || {}, ramp = buildRamp(spec, this.values(view)), fmt = formatter(spec), hue = safeColor(spec.hue) || ramp.swatch(1), tags = [], cards = [], taken = new Set(
            elements.filter((e) => e?.callout?.pin != null).map((e) => String(e.callout.pin))
          );
          let nextPin = 1;
          elements.forEach((entry, order) => {
            if (!entry || entry.id == null) return;
            const callout = entry.callout;
            let pin;
            if (callout) {
              if (callout.pin != null) pin = callout.pin;
              else {
                while (taken.has(String(nextPin))) nextPin++;
                pin = nextPin;
                taken.add(String(nextPin++));
              }
            }
            const rect = byId.get(String(entry.id));
            if (!rect || rect.occluded) return;
            if (Object.hasOwn(entry, "value")) {
              const valid = entry.value != null && Number.isFinite(Number(entry.value)), color = valid ? safeColor(entry.color) || ramp.color(entry.value) : null;
              const box = node("div", "dv-box");
              box.dataset.id = String(entry.id);
              cover(box, rect);
              const wash = node("span", `dv-wash${color ? "" : " nil"}`);
              if (color) wash.style.background = color;
              box.append(wash);
              this.host.layer.append(box);
              const tag = node("span", "dv-tag", fmt(entry.value));
              tag.dataset.for = String(entry.id);
              tag.style.background = color ? safeColor(entry.color) || hue : "transparent";
              if (!color) {
                tag.style.border = "1px dashed #14120d4d";
                tag.style.color = "var(--text-tertiary,#777168)";
              }
              if (this.hasDeltas(view) && entry.delta != null && valid) {
                const delta = Number(entry.delta) || 0;
                tag.append(
                  node(
                    "span",
                    "dv-d",
                    `${delta > 0 ? "\u25B2" : delta < 0 ? "\u25BC" : "="}${delta ? fmt(Math.abs(delta)) : ""}`
                  )
                );
              }
              this.host.layer.append(tag);
              tags.push({ rect, node: tag });
            } else if (!callout) {
              const spotlight = node("span", "dv-spot");
              spotlight.dataset.id = String(entry.id);
              cover(spotlight, rect);
              spotlight.style.borderColor = hue;
              this.host.layer.append(spotlight);
            }
            if (callout) {
              const badge = node("span", "dv-pin", pin);
              badge.dataset.for = String(entry.id);
              Object.assign(badge.style, {
                left: `${rect.x - (rect.tf?.ox || 0) - 6}px`,
                top: `${rect.y - (rect.tf?.oy || 0) - 6}px`,
                background: hue
              });
              this.host.layer.append(badge);
              const card = node("span", "dv-co");
              card.dataset.for = String(entry.id);
              card.style.visibility = "hidden";
              const head = node("span", "dv-coh"), inline = node("span", "dv-pin inl", pin);
              inline.style.background = hue;
              head.append(inline, document.createTextNode(callout.head || ""));
              card.append(head);
              if (callout.body) card.append(node("span", "dv-cob", callout.body));
              this.host.layer.append(card);
              cards.push({
                id: String(entry.id),
                order,
                ax: rect.x,
                ay: rect.y,
                aw: rect.w,
                ah: rect.h,
                cw: card.offsetWidth || 222,
                ch: card.offsetHeight || 80,
                gap: 10 + (this.values(view).length ? 18 : 0) + (Number(callout.dy) || 0),
                dx: Number(callout.dx) || 0,
                place: callout.place || "",
                fixed: !!callout.place || callout.dx != null || callout.dy != null,
                node: card
              });
            }
          });
          const width = this.host.stage.clientWidth || 4096, height = this.host.stage.clientHeight || 4096;
          layoutTags(tags, width);
          const avoid = elements.flatMap((e) => {
            const r = e && byId.get(String(e.id));
            if (!r || r.occluded) return [];
            const pad = Object.hasOwn(e, "value") ? 20 : 0;
            return [{ x: r.x, y: r.y - (r.y < 60 ? 0 : pad), w: r.w, h: r.h + pad }];
          });
          const positions = layoutCallouts(cards, width, height, avoid), leaders = document.createElementNS(NS, "svg");
          leaders.classList.add("dv-coleads");
          leaders.setAttribute("width", width);
          leaders.setAttribute("height", height);
          for (const card of cards) {
            const p = positions[card.id];
            Object.assign(card.node.style, {
              left: `${p.x}px`,
              top: `${p.y}px`,
              visibility: ""
            });
            const ax = card.ax + card.aw / 2, ay = card.ay + card.ah / 2, cx = p.x + card.cw / 2, cy = p.y + card.ch / 2, vertical = Math.abs(cy - ay) >= Math.abs(cx - ax);
            const line = document.createElementNS(NS, "line");
            line.classList.add("dv-colead");
            line.dataset.for = card.id;
            const endpoints = vertical ? [
              ax,
              cy > ay ? card.ay + card.ah : card.ay,
              cx,
              cy > ay ? p.y : p.y + card.ch
            ] : [
              cx > ax ? card.ax + card.aw : card.ax,
              ay,
              cx > ax ? p.x : p.x + card.cw,
              cy
            ];
            ["x1", "y1", "x2", "y2"].forEach(
              (key, i) => line.setAttribute(key, endpoints[i])
            );
            leaders.append(line);
          }
          if (cards.length) this.host.layer.append(leaders);
          this.host.layer.removeAttribute("data-iso");
          this.host.isolated = null;
          this.fade();
        }
        restoreFade() {
          for (const [element, old] of this.host.faded) {
            if (old.value)
              element.style.setProperty("opacity", old.value, old.priority);
            else element.style.removeProperty("opacity");
          }
          this.host.faded.clear();
        }
        fade() {
          const view = this.host.active(), previous = this.host.faded, next = /* @__PURE__ */ new Map();
          if (view) {
            const dim = view.dim != null && Number.isFinite(Number(view.dim)) ? Math.max(0, Math.min(1, Number(view.dim))) : 0.25;
            if (dim < 1) {
              const ids = new Set(elementsOf(view).map((e) => String(e.id))), all = [...this.host.querySelectorAll(`[${this.host.idAttribute()}]`)];
              const subjects = all.filter(
                (e) => ids.has(e.getAttribute(this.host.idAttribute()))
              ), fading = [];
              for (const element of all) {
                const id = element.getAttribute(this.host.idAttribute());
                if (!id || ids.has(id) || subjects.some((subject) => element.contains(subject)) || element.parentElement?.closest("data-overlay") !== this.host || fading.some((parent) => parent.contains(element)))
                  continue;
                if (!previous.has(element) && Number(getComputedStyle(element).opacity) <= dim) {
                  fading.push(element);
                  continue;
                }
                fading.push(element);
                next.set(
                  element,
                  previous.get(element) || {
                    value: element.style.getPropertyValue("opacity"),
                    priority: element.style.getPropertyPriority("opacity")
                  }
                );
                if (parseFloat(element.style.opacity) !== dim)
                  element.style.setProperty("opacity", String(dim));
              }
            }
          }
          for (const [element, old] of previous)
            if (!next.has(element)) {
              if (old.value)
                element.style.setProperty("opacity", old.value, old.priority);
              else element.style.removeProperty("opacity");
            }
          this.host.faded = next;
        }
        isolate(event) {
          const box = this.host.stage.getBoundingClientRect(), x = event ? event.clientX - box.left - this.host.stage.clientLeft : 0, y = event ? event.clientY - box.top - this.host.stage.clientTop : 0;
          const matches = event ? this.host.rects.filter(
            (r) => !r.occluded && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
          ).sort((a, b) => a.w * a.h - b.w * b.h) : [];
          const id = matches[0]?.id || null;
          if (id === this.host.isolated) return;
          this.host.isolated = id;
          let hot = false;
          for (const element of this.host.layer.querySelectorAll(
            ".dv-co,.dv-colead"
          )) {
            const match = element.dataset.for === id;
            element.toggleAttribute("data-hot", match);
            hot ||= match;
          }
          this.host.layer.toggleAttribute("data-iso", hot);
        }
      };
    }
  });

  // skills/studio-design/assets/starters/data-overlay-style.js
  var overlayStyle;
  var init_data_overlay_style = __esm({
    "skills/studio-design/assets/starters/data-overlay-style.js"() {
      overlayStyle = `
:host{display:block}
:host([controls=on]:not([data-passthrough])){padding:18px 20px;font-family:var(--font-ui,system-ui,sans-serif);color:var(--text-primary,currentColor)}
*{box-sizing:border-box}
.dv-sent{display:none;font:420 19px/1.55 var(--font-display,Georgia,serif);margin:0 0 14px;color:var(--text-secondary,currentColor)}
:host([controls=on]) .dv-sent{display:block}
.dv-tok{display:inline-block;position:relative;cursor:pointer;color:var(--text-primary,currentColor);border-bottom:1.5px dotted var(--border-strong,#bcb7ad);padding:0 2px 1px;font:inherit;background:none;border-top:0;border-left:0;border-right:0}
.dv-tok:focus-visible{outline:2px solid var(--accent-primary,#D97757);outline-offset:2px}
.dv-tcar{font-size:10px;margin-left:3px}
.dv-menu{position:fixed;min-width:232px;max-width:calc(100vw - 16px);background:var(--bg-surface,#fdfbf6);color:var(--text-primary,#28251f);border:1px solid #d6d1c7;border-radius:12px;padding:6px;z-index:130;box-shadow:0 12px 36px #14120d29;font:420 16.5px/1.45 var(--font-display,Georgia,serif);overflow:auto}
.dv-mi{display:block;border:0;text-align:left;width:100%;padding:7px 12px;border-radius:8px;background:none;color:inherit;font:inherit;cursor:pointer}
.dv-mi:hover,.dv-mi:focus{background:#d9775717;outline:none}.dv-cur{font-weight:600}
.dv-mdiv{border-top:1px solid #ddd7cc;margin:6px 10px}
.dv-min{position:relative;padding:4px 6px 3px}.dv-minp{width:100%;border:1px solid #ddd7cc;border-radius:8px;background:#14120d08;color:inherit;padding:6px 10px;font:inherit;font-size:15.5px;outline:none}
.dv-minp:focus{border-color:var(--accent-primary,#D97757)}.dv-minp[aria-invalid]{border-color:#b3261e}.dv-minp::placeholder{color:#777168;opacity:1;transition:opacity .35s}.dv-phfade::placeholder{opacity:0}
.dv-mgo{position:absolute;right:12px;top:50%;transform:translateY(-50%);border:0;border-radius:6px;background:var(--accent-primary,#D97757);color:#fff;font:400 11.5px var(--font-ui,system-ui);padding:3px 9px;cursor:pointer}.dv-mgo[hidden]{display:none}.dv-min[data-filled] .dv-minp{padding-right:48px}
.dv-ask{border:0;border-radius:8px;background:var(--accent-primary,#D97757);color:#fff;font:400 12.5px var(--font-ui,system-ui);padding:6px 11px;margin-left:8px;cursor:pointer}.dv-ask[data-busy]{background:#77716824;color:var(--text-secondary,currentColor)}
.dv-meta{display:none;font:400 11.5px/1.4 var(--font-ui,system-ui);color:var(--text-tertiary,currentColor);margin:-8px 0 14px}
:host([controls=on]) .dv-meta:not(:empty){display:block}
.dv-finding{font:420 16.5px/1.5 var(--font-display,Georgia,serif);color:var(--text-primary,currentColor);margin:0;padding:0 2px 12px}.dv-finding:empty{display:none}
.dv-stage{position:relative}
:host([controls=on]) .dv-stage{background:var(--bg-surface,#fff);border:1px solid var(--border-subtle,#ddd7cc);border-radius:14px;box-shadow:var(--shadow-sm,0 1px 3px #14120d0f);overflow:hidden}
.dv-layer{position:absolute;inset:0;pointer-events:none;z-index:100}
@keyframes overlay-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
:host([data-state=loading]) .dv-layer{background:linear-gradient(90deg,#14120d05,#14120d12,#14120d05);background-size:200% 100%;animation:overlay-shimmer 1.4s linear infinite}
:host([data-state=stale]) .dv-layer{opacity:.6;background:repeating-linear-gradient(45deg,#14120d0a 0 6px,transparent 6px 12px)}
.dv-box{position:absolute;border-radius:6px}.dv-wash{position:absolute;inset:-1px;border-radius:inherit;mix-blend-mode:multiply;opacity:.85}.dv-wash.nil{background:repeating-linear-gradient(45deg,#14120d1a 0 4px,transparent 4px 8px);outline:1px dashed #14120d40;mix-blend-mode:normal}
.dv-tag{position:absolute;min-width:28px;padding:2px 5px;border-radius:5px;color:#fff;font:700 9.5px/1 var(--font-ui,system-ui);font-variant-numeric:tabular-nums;text-align:center;box-shadow:0 1px 3px #0003;white-space:nowrap}.dv-d{margin-left:4px;font-weight:600;opacity:.85}
.dv-spot{position:absolute;border:1.5px solid;border-radius:7px}
.dv-co{position:absolute;width:222px;max-width:calc(100% - 16px);padding:9px 11px;background:var(--bg-surface,#fff);border-radius:10px;box-shadow:0 4px 16px #14120d29;z-index:103;pointer-events:auto;overflow-wrap:anywhere}
.dv-coh{display:block;font:550 12px/1.3 var(--font-ui,system-ui);color:var(--text-primary,#28251f);margin-bottom:3px}.dv-cob{display:block;font:400 11px/1.4 var(--font-ui,system-ui);color:var(--text-tertiary,#777168)}
.dv-pin{position:absolute;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#558a42;color:#fff;font:600 10px/18px var(--font-ui,system-ui);text-align:center;box-shadow:0 1px 3px #0003;z-index:110}.dv-pin.inl{position:static;display:inline-block;margin-right:6px;box-shadow:none}
.dv-coleads{position:absolute;inset:0;pointer-events:none;z-index:102;max-width:100%}.dv-colead{stroke:#14120d73;stroke-width:1;opacity:.6}
.dv-co,.dv-colead{transition:opacity .12s}.dv-layer[data-iso] .dv-co:not([data-hot]),.dv-layer[data-iso] .dv-colead:not([data-hot]){opacity:0}
.dv-legend{display:flex;align-items:center;flex-wrap:wrap;gap:10px 18px;padding:10px 2px 0;font:400 11.5px/1.4 var(--font-ui,system-ui);color:var(--text-secondary,currentColor)}.dv-legend:empty{display:none}.dv-li{display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap}.dv-lsw{width:13px;height:13px;border-radius:3px;display:inline-block}.dv-basis.warn{color:#a26c17}
.dv-empty{position:absolute;inset:0;display:grid;place-items:center;padding:20px;font:500 13px/1.4 var(--font-ui,system-ui);color:var(--text-tertiary,currentColor);text-align:center}
.dv-draft{padding:14px 0;font:400 12px/1.5 var(--font-ui,system-ui)}.dv-draft[hidden]{display:none}.dv-draft textarea{display:block;width:100%;min-height:100px;margin:8px 0;padding:8px;font:inherit;color:inherit;background:var(--bg-surface,#fff);border:1px solid #ccc;border-radius:6px}.dv-draft button{font:inherit;cursor:pointer}.dv-draft p{margin:5px 0}
:host([data-passthrough]) .dv-stage{display:contents}:host([data-passthrough]) .dv-sent,:host([data-passthrough]) .dv-meta,:host([data-passthrough]) .dv-finding,:host([data-passthrough]) .dv-legend,:host([data-passthrough]) .dv-layer,:host([data-passthrough]) .dv-draft{display:none}
@media(prefers-reduced-motion:reduce){:host([data-state=loading]) .dv-layer{animation:none}.dv-co,.dv-colead,.dv-minp::placeholder{transition:none}}
`;
    }
  });

  // skills/studio-design/assets/starters/data-overlay-runtime.js
  var data_overlay_runtime_exports = {};
  __export(data_overlay_runtime_exports, {
    DataOverlay: () => DataOverlay
  });
  var DataOverlay;
  var init_data_overlay_runtime = __esm({
    "skills/studio-design/assets/starters/data-overlay-runtime.js"() {
      init_data_overlay_model();
      init_data_overlay_geometry();
      init_data_overlay_layout();
      init_data_overlay_dom();
      init_data_overlay_controls();
      init_data_overlay_paint();
      init_data_overlay_style();
      DataOverlay = class extends HTMLElement {
        static observedAttributes = ["src", "id-attr", "controls"];
        static layoutCallouts = layoutCallouts;
        static geom = data_overlay_geometry_exports;
        constructor() {
          super();
          this.attachShadow({ mode: "open" });
          const style = node("style");
          style.textContent = overlayStyle;
          this.sentence = node("div", "dv-sent");
          this.sentence.part = "sentence";
          this.meta = node("div", "dv-meta");
          this.meta.part = "meta";
          this.finding = node("p", "dv-finding");
          this.finding.part = "finding";
          this.stage = node("div", "dv-stage");
          this.stage.part = "stage";
          this.layer = node("div", "dv-layer");
          this.stage.append(node("slot"), this.layer);
          this.legend = node("div", "dv-legend");
          this.legend.part = "legend";
          this.draft = node("section", "dv-draft");
          this.draft.hidden = true;
          this.draft.setAttribute("aria-label", "Metric request draft");
          this.shadowRoot.append(
            style,
            this.sentence,
            this.meta,
            this.finding,
            this.stage,
            this.legend,
            this.draft
          );
          this.data = [];
          this.rects = [];
          this.faded = /* @__PURE__ */ new Map();
          this.activeId = "";
          this.generation = 0;
          this.controls = new OverlayControls(this);
          this.painter = new OverlayPainter(this);
          this.stage.addEventListener("pointermove", (event) => this.isolate(event));
          this.stage.addEventListener("pointerleave", () => this.isolate(null));
          this.addEventListener("overlay:reload", () => this.load());
          this.shadowRoot.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && this.menu) {
              event.preventDefault();
              this.closeMenu(true);
            }
          });
        }
        get views() {
          return this.data;
        }
        get view() {
          return this.active()?.id || "";
        }
        set view(id) {
          this.activeId = String(id ?? "");
          this.want = null;
          this.stopWaiting();
          this.render();
        }
        active() {
          if (!this.enabled()) return null;
          return this.data.find((view) => view.id === this.activeId) || this.data[0] || null;
        }
        enabled() {
          return !!this.getAttribute("src") || !!this.imperative;
        }
        setViews(data) {
          this.imperative = true;
          this.accept(data);
          this.measure();
          return this;
        }
        accept(data) {
          this.data = (Array.isArray(data) ? data : Array.isArray(data?.views) ? data.views : []).filter((view) => view && typeof view === "object");
          this.suggest = !Array.isArray(data) && data?.suggest && typeof data.suggest === "object" ? data.suggest : null;
          if (this.want) {
            const answer = exactView(this.data, this.want);
            if (answer) {
              this.activeId = answer.id;
              this.want = null;
              this.stopWaiting();
            }
          } else this.stopWaiting();
          this.loadError = "";
          this.render();
        }
        connectedCallback() {
          this.lifecycle = new AbortController();
          const signal = this.lifecycle.signal;
          window.addEventListener(
            "resize",
            () => {
              this.measure();
              this.positionMenu();
            },
            { signal }
          );
          document.addEventListener(
            "scroll",
            () => {
              this.measure();
              this.positionMenu();
            },
            { capture: true, passive: true, signal }
          );
          window.addEventListener(
            "message",
            (event) => {
              if (event.data?.type === "overlay:reload" && event.origin === location.origin && (event.source === window || event.source === window.parent))
                this.load();
            },
            { signal }
          );
          this.observer = new MutationObserver(() => {
            this.observeSizes();
            this.measure();
          });
          this.observe();
          this.resize = new ResizeObserver(() => this.measure());
          this.resize.observe(this.stage);
          this.sized = /* @__PURE__ */ new Set();
          this.observeSizes();
          this.stage.querySelector("slot").addEventListener("slotchange", () => this.measure(), { signal });
          let count = 0;
          this.burst = setInterval(() => {
            this.measure();
            if (++count >= 13) clearInterval(this.burst);
          }, 120);
          this.load();
          this.render();
          this.measure();
        }
        disconnectedCallback() {
          this.lifecycle?.abort();
          this.observer?.disconnect();
          this.resize?.disconnect();
          clearInterval(this.burst);
          cancelAnimationFrame(this.frame);
          clearTimeout(this.trailing);
          clearTimeout(this.waitTimer);
          this.state(this.want ? "stale" : "");
          this.frame = 0;
          this.closeMenu();
          this.restoreFade();
          this.loadController?.abort();
          this.script?.remove();
          this.generation++;
        }
        attributeChangedCallback(name, oldValue, newValue) {
          if (oldValue === newValue || !this.isConnected) return;
          if (name === "src") {
            this.stopWaiting();
            this.want = null;
            this.load();
          } else if (name === "id-attr") {
            this.observe();
            this.observeSizes();
            this.measure();
          } else {
            this.render();
            this.measure();
          }
        }
        idAttribute() {
          return attributeName(this.getAttribute("id-attr"));
        }
        observe() {
          this.observer?.disconnect();
          this.observer?.observe(this, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["style", "class", "hidden", this.idAttribute()]
          });
        }
        observeSizes() {
          if (!this.resize) return;
          const next = new Set(this.querySelectorAll(`[${this.idAttribute()}]`));
          for (const old of this.sized || [])
            if (!next.has(old)) this.resize.unobserve(old);
          for (const element of next)
            if (!this.sized?.has(element)) this.resize.observe(element);
          this.sized = next;
        }
        measure() {
          if (!this.isConnected) return this;
          if (!this.frame)
            this.frame = requestAnimationFrame(() => {
              this.frame = 0;
              this.measureNow();
            });
          clearTimeout(this.trailing);
          let retries = 0;
          const trail = () => {
            if (!this.isConnected) return;
            const skipped = this.measureNow();
            if (skipped && retries++ < 3) this.trailing = setTimeout(trail, 80);
          };
          this.trailing = setTimeout(trail, 80);
          return this;
        }
        measureNow() {
          if (!this.isConnected) return 0;
          const measured = measureRects(
            this,
            this.stage,
            this.idAttribute()
          );
          const signature = JSON.stringify(
            measured.rects.map(({ element, ...rect }) => rect)
          );
          if (signature !== this.geometrySignature) {
            this.geometrySignature = signature;
            this.rects = measured.rects;
            this.renderLayer();
          } else this.fade();
          const animating = this.getAnimations({ subtree: true }).some(
            (animation) => animation.playState === "running" && this.contains(animation.effect?.target)
          );
          if (animating && !this.frame)
            this.frame = requestAnimationFrame(() => {
              this.frame = 0;
              this.measureNow();
            });
          return measured.skipped;
        }
        async load() {
          if (!this.isConnected) return;
          const source = this.getAttribute("src"), generation = ++this.generation;
          this.loadController?.abort();
          this.script?.remove();
          if (!source) {
            this.loadError = "";
            this.render();
            this.measure();
            return;
          }
          let url;
          try {
            url = new URL(source, document.baseURI);
          } catch {
            this.loadError = "Invalid overlay data URL";
            this.render();
            return;
          }
          if (!["http:", "https:", "file:", "data:"].includes(url.protocol)) {
            this.loadError = "Unsupported overlay data URL";
            this.render();
            return;
          }
          const finish = (data, error = "") => {
            if (generation !== this.generation || !this.isConnected) return;
            if (data != null) this.accept(data);
            this.loadError = error;
            this.render();
            this.measure();
          };
          if (/\.json(?:[?#]|$)/i.test(source) || /^data:application\/json[;,]/i.test(source)) {
            this.loadController = new AbortController();
            try {
              const response = await fetch(url, {
                cache: "no-store",
                signal: this.loadController.signal
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              finish(await response.json());
            } catch (error) {
              if (error.name !== "AbortError")
                finish(null, "Overlay data could not be loaded");
            }
            return;
          }
          const previous = window.__overlays;
          window.__overlays = void 0;
          const script = document.createElement("script");
          if (url.protocol !== "data:")
            url.searchParams.set("overlay-reload", String(Date.now()));
          script.src = url.href;
          this.script = script;
          script.onload = () => finish(window.__overlays || null);
          script.onerror = () => {
            if (generation === this.generation && window.__overlays === void 0)
              window.__overlays = previous;
            finish(
              previous || null,
              previous ? "" : "Overlay data could not be loaded"
            );
          };
          document.head.append(script);
        }
        state(value) {
          if (value) this.setAttribute("data-state", value);
          else this.removeAttribute("data-state");
        }
        stopWaiting() {
          clearTimeout(this.waitTimer);
          this.timedOut = false;
          this.state("");
        }
        rest() {
          if (this.getAttribute("data-state") === "loading") return;
          if (this.want) this.state("stale");
          else if (this.enabled() && !this.data.length) this.state("empty");
          else if (!this.timedOut) this.state("");
        }
        pick(field, value) {
          const want = {
            ...this.want || triple(this.active() || {}),
            [field]: value
          };
          const found = exactView(this.data, want) || field === "metric" && closestMetric(this.data, want);
          this.stopWaiting();
          this.timedOut = false;
          if (found) {
            this.activeId = found.id;
            this.want = null;
          } else this.want = want;
          this.render();
          this.measure();
        }
        options(field) {
          const all = [...new Set(this.data.map((view) => triple(view)[field]))];
          return all.some(Boolean) ? all.filter(Boolean).concat(all.includes("") ? [""] : []) : [];
        }
        render() {
          const enabled = this.enabled();
          this.toggleAttribute("data-passthrough", !enabled);
          this.rest();
          this.renderSentence();
          const active = this.active();
          this.metaInfo = metaParts(active?.meta);
          this.meta.textContent = this.metaInfo.text;
          this.finding.textContent = active?.finding || "";
          this.renderLegend();
          this.renderLayer();
        }
        renderSentence() {
          this.controls.renderSentence();
        }
        positionMenu() {
          this.controls.positionMenu();
        }
        closeMenu(focus) {
          this.controls.closeMenu(focus);
        }
        ask(mode) {
          return this.controls.ask(mode);
        }
        renderLegend() {
          this.painter.renderLegend();
        }
        renderLayer() {
          this.painter.renderLayer();
        }
        fade() {
          this.painter.fade();
        }
        restoreFade() {
          this.painter.restoreFade();
        }
        isolate(event) {
          this.painter.isolate(event);
        }
      };
      if (!customElements.get("data-overlay"))
        customElements.define("data-overlay", DataOverlay);
      window.DataOverlay = customElements.get("data-overlay");
    }
  });

  // skills/studio-design/assets/starters/data-overlay.js
  window.CodexOverlayReady = Promise.resolve().then(() => (init_data_overlay_runtime(), data_overlay_runtime_exports));
})();
