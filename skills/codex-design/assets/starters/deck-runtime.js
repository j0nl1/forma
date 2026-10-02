import { DeckBuilds } from "./deck-builds.js";
import { slideLabel } from "./deck-labels.js";
import { DeckEditor } from "./deck-editor.js";
const interactive =
  'a[href],button,input,textarea,select,summary,label,video[controls],audio[controls],[role="button"],[onclick],[tabindex]:not([tabindex^="-"]),[contenteditable]:not([contenteditable="false" i])';
const template = `<style>
:host{display:block;height:100vh;background:#161c25;color:#fff;font:14px system-ui;--rail-width:180px}.layout{display:flex;height:calc(100% - 58px)}.rail{width:var(--rail-width);flex:none;overflow:auto;padding:10px;box-sizing:border-box}.rail button{display:block;width:100%;text-align:left;margin:6px 0}:host([data-fonts-pending]) .viewport,:host([data-fonts-pending]) .rail{opacity:0;pointer-events:none}.viewport{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;overflow:hidden}.art{position:relative;transform-origin:center;flex:none}slot{display:block}::slotted([data-deck-slide]){box-sizing:border-box;width:100%;height:100%;overflow:hidden;position:absolute;inset:0;visibility:hidden;opacity:0;pointer-events:none}::slotted([data-deck-active]){visibility:visible;opacity:1;pointer-events:auto}.toolbar{opacity:0;pointer-events:none;transition:opacity .2s;height:58px;display:flex;align-items:center;gap:9px;padding:0 16px;box-sizing:border-box;flex-wrap:wrap;position:relative;z-index:10}button{font:inherit;border:1px solid #687482;border-radius:6px;background:#252e3a;color:#fff;padding:7px 10px;cursor:pointer}button[aria-current="true"]{border-color:#8bacff;background:#344766}.rail button[data-skipped]{opacity:.45}.notes{position:absolute;right:16px;bottom:70px;max-width:420px;max-height:30vh;overflow:auto;background:#fff;color:#1c2836;padding:18px;border-radius:8px;white-space:pre-wrap;z-index:10}[hidden]{display:none!important}:host([no-rail]) .rail,:host([noscale]) .rail,:host([data-fullscreen]) .rail,:host([data-presenting]) .rail{display:none}:host([noscale]) .art{transform:none!important}:host([noscale]) .toolbar{display:none}:host([data-fullscreen]) .layout,:host([data-presenting]) .layout{height:100%}:host([data-fullscreen]) .toolbar,:host([data-presenting]) .toolbar{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);height:auto;flex-wrap:nowrap;background:#161c25e8;padding:8px;border-radius:12px;max-width:calc(100% - 32px);opacity:0;transition:opacity .2s;pointer-events:none}:host([data-chrome-visible]) .toolbar{opacity:1;pointer-events:auto}
@media(max-width:640px){.rail{display:none}.toolbar{height:auto;min-height:58px;padding:8px;gap:6px}.layout{height:calc(100% - var(--toolbar-height,58px))}.toolbar button{font-size:12px;padding:5px 7px}}
@media print{:host{display:block;height:auto;background:#fff}.layout{display:block;height:auto}.rail,.toolbar,.notes{display:none!important}.viewport{display:block;overflow:visible}.art{transform:none!important;width:auto!important;height:auto!important}::slotted([data-deck-slide]){display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;break-after:page;width:var(--deck-w)!important;height:var(--deck-h)!important}::slotted([data-deck-skip]){display:none!important}::slotted([data-deck-last-visible]){break-after:auto}}
</style><div class="layout"><nav class="rail" aria-label="Slides"></nav><div class="viewport"><div class="art"><slot></slot></div></div></div><div class="toolbar"><button data-prev aria-label="Previous slide">←</button><output aria-label="Slide position"></output><button data-next aria-label="Next slide or build">→</button><button data-reset aria-label="Reset to first slide">Reset · R</button><button data-full aria-label="Enter fullscreen">Present · F</button><button data-notes>Notes</button><button data-remove>Remove slide</button><button data-restore aria-label="Restore slides or undo last edit" title="Restore the previous deck state">Undo</button><button data-print>Print / PDF</button></div><aside class="notes" hidden></aside>`;
export class DeckStage extends HTMLElement {
  static observedAttributes = [
    "noscale",
    "no-rail",
    "width",
    "height",
    "presenting",
  ];
  connectedCallback() {
    if (this.controller) return;
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
    const bind = (selector, handler) =>
      root.querySelector(selector).addEventListener("click", handler, options);
    bind("[data-prev]", () => this.prev("click"));
    bind("[data-next]", () => this.next("click"));
    bind("[data-reset]", () => this.goTo(0, "click"));
    bind("[data-full]", () => this.toggleFullscreen());
    bind("[data-print]", () => window.print());
    bind("[data-notes]", () => {
      root.querySelector(".notes").hidden =
        !root.querySelector(".notes").hidden;
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
        `${root.querySelector(".toolbar").offsetHeight}px`,
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
      options,
    );
    document.addEventListener(
      "fullscreenchange",
      () => this.syncFullscreen(),
      options,
    );
    window.addEventListener("beforeprint", () => this.preparePrint(), options);
    window.addEventListener("afterprint", () => this.restorePrint(), options);
    this.printQuery = matchMedia("print");
    this.printQuery.addEventListener(
      "change",
      (event) => (event.matches ? this.preparePrint() : this.restorePrint()),
      options,
    );
    window.addEventListener("mousemove", () => this.revealChrome(), options);
    const toolbar = root.querySelector(".toolbar");
    toolbar.addEventListener(
      "pointerenter",
      () => {
        this.chromeHover = true;
        this.revealChrome();
      },
      options,
    );
    toolbar.addEventListener(
      "pointerleave",
      () => {
        const pinned = this.chromeHover;
        this.chromeHover = false;
        if (pinned || this.hasAttribute("data-chrome-visible"))
          this.revealChrome();
      },
      options,
    );
    toolbar.addEventListener(
      "focusin",
      (event) => {
        // Mouse focus is already covered by hover; only keyboard focus pins idle chrome.
        try {
          if (!event.target.matches(":focus-visible")) return;
        } catch {}
        this.chromeFocus = true;
        this.revealChrome();
      },
      options,
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
      options,
    );
    this.addEventListener(
      "click",
      (event) => {
        if (
          matchMedia("(hover:hover) and (pointer:fine)").matches ||
          event.defaultPrevented
        )
          return;
        const path = event.composedPath(),
          view = root.querySelector(".viewport");
        if (
          !path.includes(view) ||
          path.some((node) => node.matches?.(interactive))
        )
          return;
        const bounds = view.getBoundingClientRect();
        event.preventDefault();
        if (event.clientX < bounds.left + bounds.width / 2) this.prev("tap");
        else this.next("tap");
      },
      options,
    );
    // A local event replaces host presentation-mode messages without changing fullscreen state.
    this.addEventListener(
      "codex-deck-presenting",
      (event) => this.setPresenting(event.detail?.presenting === true),
      options,
    );
    this.addEventListener(
      "codex-deck-go-to",
      (event) => {
        if (Number.isInteger(event.detail?.index))
          this.goTo(event.detail.index);
      },
      options,
    );
    root.querySelector("slot").addEventListener(
      "slotchange",
      () => {
        const before = this.slides,
          next = this.collect();
        if (
          before.length === next.length &&
          before.every((slide, index) => slide === next[index])
        )
          return;
        this.show(
          this.hashIndex() ?? Math.max(0, this.index),
          this.index >= 0,
          "mutation",
        );
        this.fit();
      },
      options,
    );
    if (!this.printStyle) {
      this.printStyle = document.createElement("style");
      this.printStyle.dataset.codexDeckRuntime = "";
      document.head.append(this.printStyle);
    }
    if (!document.getElementById("codex-deck-text-wrap")) {
      const style = document.createElement("style");
      style.id = "codex-deck-text-wrap";
      style.textContent =
        ":where(h1,h2,h3,h4,h5,h6){text-wrap:balance}:where(p,li,blockquote,figcaption){text-wrap:pretty}deck-stage [data-notes]{display:none}";
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
        new Promise((resolve) => setTimeout(resolve, 2000)),
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
      (node) => !["SCRIPT", "STYLE", "TEMPLATE"].includes(node.tagName),
    );
    this.slides.forEach((slide, index) => {
      slide.setAttribute("data-deck-slide", index);
      const label = slideLabel(slide);
      slide.setAttribute(
        "data-screen-label",
        `${String(index + 1).padStart(2, "0")} ${label}`,
      );
      slide.removeAttribute("data-deck-last-visible");
    });
    this.slides
      .filter((slide) => !slide.hasAttribute("data-deck-skip"))
      .at(-1)
      ?.setAttribute("data-deck-last-visible", "");
    return this.slides;
  }
  fit() {
    if (!this.width) return;
    const view = this.shadowRoot.querySelector(".viewport");
    this.scale = this.hasAttribute("noscale")
      ? 1
      : Math.min(
          view.clientWidth / this.width,
          view.clientHeight / this.height,
        );
    this.shadowRoot.querySelector(".art").style.transform =
      `scale(${this.scale})`;
  }
  hashIndex() {
    const match = /^#(\d+)$/.exec(location.hash);
    const index = match ? Number(match[1]) - 1 : -1;
    return index >= 0 && index < this.slides.length ? index : null;
  }
  show(index, complete = false, reason = "api") {
    if (!this.slides.length) return;
    const previousIndex = this.index,
      previousSlide = this.activeSlide ?? null;
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
      complete || (previousIndex >= 0 && index < previousIndex),
    );
    const visible = this.slides.filter(
      (node) => !node.hasAttribute("data-deck-skip"),
    );
    this.shadowRoot.querySelector("output").textContent =
      `${slide.hasAttribute("data-deck-skip") ? "–" : visible.indexOf(slide) + 1} / ${visible.length}`;
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
            reason,
          },
        }),
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
        document.getElementById("speaker-notes")?.textContent || "[]",
      );
    } catch {}
    const slide = this.slides[this.index];
    this.shadowRoot.querySelector(".notes").textContent =
      slide?.getAttribute("data-speaker-notes") ??
      slide?.querySelector("[data-notes]")?.textContent ??
      (Array.isArray(fallback) && typeof fallback[this.index] === "string"
        ? fallback[this.index]
        : "No speaker notes for this slide.");
  }
  onKey(event) {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event
        .composedPath()
        .some(
          (node) =>
            node.isContentEditable || node.matches?.("input,textarea,select"),
        )
    )
      return;
    const key = event.key;
    if (
      [" ", "Spacebar"].includes(key) &&
      event.composedPath().some((node) => node.matches?.("button"))
    )
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
    if (
      source !== "pointer" &&
      (this.hasAttribute("data-presenting") ||
        this.hasAttribute("data-fullscreen"))
    )
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
      this.shadowRoot.querySelector("output").textContent +=
        " · Fullscreen unavailable";
    }
  }
  syncFullscreen() {
    const full = !!document.fullscreenElement;
    if (this.hasAttribute("data-fullscreen") !== full) this.resetChrome();
    this.toggleAttribute("data-fullscreen", full);
    this.shadowRoot
      .querySelector("[data-full]")
      .setAttribute(
        "aria-label",
        full ? "Exit fullscreen" : "Enter fullscreen",
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
    this.slides.forEach((slide, index) =>
      slide.toggleAttribute("data-deck-active", index === this.index),
    );
    if (this.slides[this.index])
      this.buildPlayer.arrive(this.slides[this.index], true);
  }
  rail() {
    this.editor?.reconcile();
  }
}
if (!customElements.get("deck-stage"))
  customElements.define("deck-stage", DeckStage);
