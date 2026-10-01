import {
  attributeName,
  triple,
  exactView,
  closestMetric,
  metaParts,
} from "./data-overlay-model.js";
import * as geometry from "./data-overlay-geometry.js";
import { layoutCallouts } from "./data-overlay-layout.js";
import { node } from "./data-overlay-dom.js";
import { OverlayControls } from "./data-overlay-controls.js";
import { OverlayPainter } from "./data-overlay-paint.js";
import { overlayStyle } from "./data-overlay-style.js";

export class DataOverlay extends HTMLElement {
  static observedAttributes = ["src", "id-attr", "controls"];
  static layoutCallouts = layoutCallouts;
  static geom = geometry;
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
      this.draft,
    );
    this.data = [];
    this.rects = [];
    this.faded = new Map();
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
    return (
      this.data.find((view) => view.id === this.activeId) ||
      this.data[0] ||
      null
    );
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
    this.data = (
      Array.isArray(data) ? data : Array.isArray(data?.views) ? data.views : []
    ).filter((view) => view && typeof view === "object");
    this.suggest =
      !Array.isArray(data) && data?.suggest && typeof data.suggest === "object"
        ? data.suggest
        : null;
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
      { signal },
    );
    document.addEventListener(
      "scroll",
      () => {
        this.measure();
        this.positionMenu();
      },
      { capture: true, passive: true, signal },
    );
    window.addEventListener(
      "message",
      (event) => {
        if (
          event.data?.type === "overlay:reload" &&
          event.origin === location.origin &&
          (event.source === window || event.source === window.parent)
        )
          this.load();
      },
      { signal },
    );
    this.observer = new MutationObserver(() => {
      this.observeSizes();
      this.measure();
    });
    this.observe();
    this.resize = new ResizeObserver(() => this.measure());
    this.resize.observe(this.stage);
    this.sized = new Set();
    this.observeSizes();
    this.stage
      .querySelector("slot")
      .addEventListener("slotchange", () => this.measure(), { signal });
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
      attributeFilter: ["style", "class", "hidden", this.idAttribute()],
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
    const measured = geometry.measureRects(
      this,
      this.stage,
      this.idAttribute(),
    );
    const signature = JSON.stringify(
      measured.rects.map(({ element, ...rect }) => rect),
    );
    if (signature !== this.geometrySignature) {
      this.geometrySignature = signature;
      this.rects = measured.rects;
      this.renderLayer();
    } else this.fade();
    const animating = this.getAnimations({ subtree: true }).some(
      (animation) =>
        animation.playState === "running" &&
        this.contains(animation.effect?.target),
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
    const source = this.getAttribute("src"),
      generation = ++this.generation;
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
    if (
      /\.json(?:[?#]|$)/i.test(source) ||
      /^data:application\/json[;,]/i.test(source)
    ) {
      this.loadController = new AbortController();
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: this.loadController.signal,
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
    window.__overlays = undefined;
    const script = document.createElement("script");
    if (url.protocol !== "data:")
      url.searchParams.set("overlay-reload", String(Date.now()));
    script.src = url.href;
    this.script = script;
    script.onload = () => finish(window.__overlays || null);
    script.onerror = () => {
      if (generation === this.generation && window.__overlays === undefined)
        window.__overlays = previous;
      finish(
        previous || null,
        previous ? "" : "Overlay data could not be loaded",
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
      ...(this.want || triple(this.active() || {})),
      [field]: value,
    };
    const found =
      exactView(this.data, want) ||
      (field === "metric" && closestMetric(this.data, want));
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
    return all.some(Boolean)
      ? all.filter(Boolean).concat(all.includes("") ? [""] : [])
      : [];
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
}
if (!customElements.get("data-overlay"))
  customElements.define("data-overlay", DataOverlay);
window.DataOverlay = customElements.get("data-overlay");
