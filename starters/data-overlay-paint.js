import {
  buildRamp,
  formatter,
  safeColor,
  elementsOf,
} from "./data-overlay-model.js";
import * as geometry from "./data-overlay-geometry.js";
import { layoutCallouts, layoutTags } from "./data-overlay-layout.js";
import { node } from "./data-overlay-dom.js";
const NS = "http://www.w3.org/2000/svg";
export class OverlayPainter {
  constructor(host) {
    this.host = host;
  }
  values(view) {
    return elementsOf(view)
      .filter((e) => e && Object.hasOwn(e, "value"))
      .map((e) => e.value);
  }
  hasDeltas(view) {
    return !!view.deltaBasis && elementsOf(view).some((e) => e.delta != null);
  }
  renderLegend() {
    this.host.legend.replaceChildren();
    const view = this.host.active();
    if (!view) return;
    const values = this.values(view),
      spec = view.spectrum || {},
      fmt = formatter(spec),
      ramp = buildRamp(spec, values);
    if (view.legend && view.spectrum && values.length) {
      const name = node("span", "dv-li");
      name.append(node("b", null, spec.name || view.label || ""));
      this.host.legend.append(name);
      const keys = node("span", "dv-li");
      const count = spec.steps > 1 ? Math.min(Math.ceil(spec.steps), 7) : 4;
      for (let i = 0; i < count; i++) {
        const swatch = node("span", "dv-lsw");
        swatch.style.background = ramp.swatch(
          ramp.flipped ? 1 - i / (count - 1) : i / (count - 1),
        );
        keys.append(swatch);
      }
      keys.append(
        document.createTextNode(
          ramp.flat ? fmt(ramp.lo) : `${fmt(ramp.lo)} → ${fmt(ramp.hi)}`,
        ),
      );
      this.host.legend.append(keys);
      if (values.some((v) => v == null)) {
        const empty = node("span", "dv-li", " measured, found nothing");
        const swatch = node("span", "dv-lsw");
        swatch.style.background =
          "repeating-linear-gradient(45deg,#14120d2e 0 3px,transparent 3px 6px)";
        empty.prepend(swatch);
        this.host.legend.append(empty);
      }
    }
    const meta =
        this.host.getAttribute("controls") === "on"
          ? this.host.metaInfo || {}
          : {},
      bits = [];
    if (values.length && !view.basis) {
      const warning = node("span", "dv-basis warn", "basis not stated");
      this.host.legend.append(warning);
    } else if (view.basis && !meta.about) bits.push(String(view.basis));
    if (this.hasDeltas(view)) bits.push(`Δ vs ${view.deltaBasis}`);
    const date = view.asOf
      ? new Date(
          String(view.asOf).includes("T") ? view.asOf : `${view.asOf}T00:00:00`,
        )
      : null;
    if (
      date &&
      !Number.isNaN(+date) &&
      (values.length || view.basis) &&
      !meta.range
    )
      bits.push(
        `as of ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      );
    if (bits.length)
      this.host.legend.append(node("span", "dv-li dv-basis", bits.join(" · ")));
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
            this.host.loadError ||
              `No data views at ${this.host.getAttribute("src")}`,
          ),
        );
      this.fade();
      return;
    }
    const byId = new Map(this.host.rects.map((r) => [r.id, r])),
      elements = elementsOf(view),
      spec = view.spectrum || {},
      ramp = buildRamp(spec, this.values(view)),
      fmt = formatter(spec),
      hue = safeColor(spec.hue) || ramp.swatch(1),
      tags = [],
      cards = [],
      taken = new Set(
        elements
          .filter((e) => e?.callout?.pin != null)
          .map((e) => String(e.callout.pin)),
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
        const valid =
            entry.value != null && Number.isFinite(Number(entry.value)),
          color = valid
            ? safeColor(entry.color) || ramp.color(entry.value)
            : null;
        const box = node("div", "dv-box");
        box.dataset.id = String(entry.id);
        geometry.cover(box, rect);
        const wash = node("span", `dv-wash${color ? "" : " nil"}`);
        if (color) wash.style.background = color;
        box.append(wash);
        this.host.layer.append(box);
        const tag = node("span", "dv-tag", fmt(entry.value));
        tag.dataset.for = String(entry.id);
        tag.style.background = color
          ? safeColor(entry.color) || hue
          : "transparent";
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
              `${delta > 0 ? "▲" : delta < 0 ? "▼" : "="}${delta ? fmt(Math.abs(delta)) : ""}`,
            ),
          );
        }
        this.host.layer.append(tag);
        tags.push({ rect, node: tag });
      } else if (!callout) {
        const spotlight = node("span", "dv-spot");
        spotlight.dataset.id = String(entry.id);
        geometry.cover(spotlight, rect);
        spotlight.style.borderColor = hue;
        this.host.layer.append(spotlight);
      }
      if (callout) {
        const badge = node("span", "dv-pin", pin);
        badge.dataset.for = String(entry.id);
        Object.assign(badge.style, {
          left: `${rect.x - (rect.tf?.ox || 0) - 6}px`,
          top: `${rect.y - (rect.tf?.oy || 0) - 6}px`,
          background: hue,
        });
        this.host.layer.append(badge);
        const card = node("span", "dv-co");
        card.dataset.for = String(entry.id);
        card.style.visibility = "hidden";
        const head = node("span", "dv-coh"),
          inline = node("span", "dv-pin inl", pin);
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
          gap:
            10 +
            (this.values(view).length ? 18 : 0) +
            (Number(callout.dy) || 0),
          dx: Number(callout.dx) || 0,
          place: callout.place || "",
          fixed: !!callout.place || callout.dx != null || callout.dy != null,
          node: card,
        });
      }
    });
    const width = this.host.stage.clientWidth || 4096,
      height = this.host.stage.clientHeight || 4096;
    layoutTags(tags, width);
    const avoid = elements.flatMap((e) => {
      const r = e && byId.get(String(e.id));
      if (!r || r.occluded) return [];
      const pad = Object.hasOwn(e, "value") ? 20 : 0;
      return [{ x: r.x, y: r.y - (r.y < 60 ? 0 : pad), w: r.w, h: r.h + pad }];
    });
    const positions = layoutCallouts(cards, width, height, avoid),
      leaders = document.createElementNS(NS, "svg");
    leaders.classList.add("dv-coleads");
    leaders.setAttribute("width", width);
    leaders.setAttribute("height", height);
    for (const card of cards) {
      const p = positions[card.id];
      Object.assign(card.node.style, {
        left: `${p.x}px`,
        top: `${p.y}px`,
        visibility: "",
      });
      const ax = card.ax + card.aw / 2,
        ay = card.ay + card.ah / 2,
        cx = p.x + card.cw / 2,
        cy = p.y + card.ch / 2,
        vertical = Math.abs(cy - ay) >= Math.abs(cx - ax);
      const line = document.createElementNS(NS, "line");
      line.classList.add("dv-colead");
      line.dataset.for = card.id;
      const endpoints = vertical
        ? [
            ax,
            cy > ay ? card.ay + card.ah : card.ay,
            cx,
            cy > ay ? p.y : p.y + card.ch,
          ]
        : [
            cx > ax ? card.ax + card.aw : card.ax,
            ay,
            cx > ax ? p.x : p.x + card.cw,
            cy,
          ];
      ["x1", "y1", "x2", "y2"].forEach((key, i) =>
        line.setAttribute(key, endpoints[i]),
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
    const view = this.host.active(),
      previous = this.host.faded,
      next = new Map();
    if (view) {
      const dim =
        view.dim != null && Number.isFinite(Number(view.dim))
          ? Math.max(0, Math.min(1, Number(view.dim)))
          : 0.25;
      if (dim < 1) {
        const ids = new Set(elementsOf(view).map((e) => String(e.id))),
          all = [...this.host.querySelectorAll(`[${this.host.idAttribute()}]`)];
        const subjects = all.filter((e) =>
            ids.has(e.getAttribute(this.host.idAttribute())),
          ),
          fading = [];
        for (const element of all) {
          const id = element.getAttribute(this.host.idAttribute());
          if (
            !id ||
            ids.has(id) ||
            subjects.some((subject) => element.contains(subject)) ||
            element.parentElement?.closest("data-overlay") !== this.host ||
            fading.some((parent) => parent.contains(element))
          )
            continue;
          if (
            !previous.has(element) &&
            Number(getComputedStyle(element).opacity) <= dim
          ) {
            fading.push(element);
            continue;
          }
          fading.push(element);
          next.set(
            element,
            previous.get(element) || {
              value: element.style.getPropertyValue("opacity"),
              priority: element.style.getPropertyPriority("opacity"),
            },
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
    const box = this.host.stage.getBoundingClientRect(),
      x = event ? event.clientX - box.left - this.host.stage.clientLeft : 0,
      y = event ? event.clientY - box.top - this.host.stage.clientTop : 0;
    const matches = event
      ? this.host.rects
          .filter(
            (r) =>
              !r.occluded &&
              x >= r.x &&
              x < r.x + r.w &&
              y >= r.y &&
              y < r.y + r.h,
          )
          .sort((a, b) => a.w * a.h - b.w * b.h)
      : [];
    const id = matches[0]?.id || null;
    if (id === this.host.isolated) return;
    this.host.isolated = id;
    let hot = false;
    for (const element of this.host.layer.querySelectorAll(
      ".dv-co,.dv-colead",
    )) {
      const match = element.dataset.for === id;
      element.toggleAttribute("data-hot", match);
      hot ||= match;
    }
    this.host.layer.toggleAttribute("data-iso", hot);
  }
}
