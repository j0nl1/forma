import { zoomAt, resizeCorner } from "./image-model.js";
let active = null;
export class ImageReframe {
  constructor(slot) {
    this.slot = slot;
  }
  enter() {
    const slot = this.slot;
    if (this.controller || !slot.editable || !slot.filled || !slot.geometry())
      return;
    active?.exit(true);
    active = this;
    this.controller = new AbortController();
    const on = (target, type, listener, options = {}) =>
      target.addEventListener(type, listener, {
        ...options,
        signal: this.controller.signal,
      });
    slot.setAttribute("data-reframe", "");
    slot.ui.spill.hidden = false;
    slot.ui.ghost.src = slot.ui.photo.src;
    try {
      slot.ui.spill.showPopover();
      slot.ui.toolbar.showPopover();
      slot.ui.toolbar.style.position = "fixed";
    } catch {
      this.fallback();
    }
    on(slot.ui.spill, "pointerdown", (event) => this.begin(event));
    on(
      slot.ui.spill,
      "wheel",
      (event) => {
        event.stopPropagation();
        this.wheel(event);
      },
      { passive: false },
    );
    on(slot, "wheel", (event) => this.wheel(event), { passive: false });
    on(
      document,
      "pointerdown",
      (event) => {
        if (
          !event.composedPath().includes(slot) &&
          !event.composedPath().includes(this.portal)
        )
          this.exit(true);
      },
      { capture: true },
    );
    on(document, "keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.exit(true);
        return;
      }
      if (
        !event.composedPath().includes(slot) &&
        !event.composedPath().includes(this.portal)
      )
        return;
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        slot.view.x +=
          event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight"
              ? step
              : 0;
        slot.view.y +=
          event.key === "ArrowUp"
            ? -step
            : event.key === "ArrowDown"
              ? step
              : 0;
        slot.applyView();
      } else if (["+", "=", "-"].includes(event.key)) {
        event.preventDefault();
        slot.view = zoomAt(slot.view, event.key === "-" ? 0.9 : 1.1, {
          x: 0,
          y: 0,
        });
        slot.applyView();
      }
    });
    on(window, "pagehide", () => {
      this.exit(true);
      slot.store.leaving = true;
      void slot.store.flush();
    });
    on(window, "resize", () => slot.applyView());
    on(document, "scroll", () => slot.applyView(), { capture: true });
    this.watch = () => {
      if (!this.controller) return;
      slot.applyView();
      this.frame = requestAnimationFrame(this.watch);
    };
    this.frame = requestAnimationFrame(this.watch);
    slot.applyView();
    this.signal(true);
  }
  fallback() {
    const slot = this.slot,
      portal = document.createElement("div");
    portal.dataset.codexImageEditor = "";
    Object.assign(portal.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "2147483000",
    });
    const root = portal.attachShadow({ mode: "open" }),
      style = document.createElement("style");
    style.textContent = slot.shadowRoot.querySelector("style").textContent;
    portal.setAttribute("data-reframe", "");
    root.append(style, slot.ui.spill, slot.ui.toolbar);
    document.body.append(portal);
    this.portal = portal;
    slot.ui.spill.style.pointerEvents = "auto";
    slot.ui.spill.style.display = "block";
    slot.ui.toolbar.style.position = "fixed";
    slot.ui.toolbar.style.transform = "translateX(-100%)";
    slot.ui.toolbar.style.zIndex = "2147482001";
  }
  begin(event) {
    if (event.button !== 0 || !this.controller) return;
    event.preventDefault();
    event.stopPropagation();
    this.endDrag?.();
    const slot = this.slot,
      rect = slot.ui.frame.getBoundingClientRect(),
      geometry = slot.geometry();
    if (!geometry) return;
    const corner = event.target.dataset.c,
      initial = { ...slot.view },
      width = (geometry.width * rect.width) / geometry.fw,
      height = (geometry.height * rect.height) / geometry.fh;
    const start = {
      corner,
      s: initial.s,
      width,
      height,
      fw: rect.width,
      fh: rect.height,
      cx: ((50 + initial.x) / 100) * rect.width,
      cy: ((50 + initial.y) / 100) * rect.height,
    };
    const move = (next) => {
      if (next.pointerId !== event.pointerId) return;
      slot.view = corner
        ? resizeCorner(start, {
            x: next.clientX - rect.left,
            y: next.clientY - rect.top,
          })
        : {
            ...initial,
            x: initial.x + ((next.clientX - event.clientX) / rect.width) * 100,
            y: initial.y + ((next.clientY - event.clientY) / rect.height) * 100,
          };
      slot.applyView();
    };
    const spill = slot.ui.spill;
    spill.setPointerCapture(event.pointerId);
    const end = (next) => {
      if (next && next.pointerId !== event.pointerId) return;
      try {
        spill.releasePointerCapture(event.pointerId);
      } catch {}
      spill.removeEventListener("pointermove", move);
      spill.removeEventListener("pointerup", end);
      spill.removeEventListener("pointercancel", end);
      this.endDrag = null;
    };
    this.endDrag = end;
    spill.addEventListener("pointermove", move);
    spill.addEventListener("pointerup", end);
    spill.addEventListener("pointercancel", end);
  }
  wheel(event) {
    if (!this.controller) return;
    event.preventDefault();
    const slot = this.slot,
      rect = slot.ui.frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const delta =
      event.deltaY *
      (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
    slot.view = zoomAt(slot.view, Math.exp(-delta * 0.0015), {
      x: ((event.clientX - rect.left) / rect.width) * 100 - 50,
      y: ((event.clientY - rect.top) / rect.height) * 100 - 50,
    });
    slot.applyView();
  }
  position(geometry) {
    const slot = this.slot,
      rect = slot.ui.frame.getBoundingClientRect();
    Object.assign(slot.ui.spill.style, {
      width: `${(geometry.width * rect.width) / geometry.fw}px`,
      height: `${(geometry.height * rect.height) / geometry.fh}px`,
      left: `${rect.left + ((50 + slot.view.x) / 100) * rect.width}px`,
      top: `${rect.top + ((50 + slot.view.y) / 100) * rect.height}px`,
    });
    Object.assign(slot.ui.toolbar.style, {
      left: `${rect.right - 8}px`,
      top: `${rect.top + 8}px`,
      right: "auto",
    });
  }
  exit(commit) {
    if (!this.controller) return;
    const slot = this.slot;
    this.endDrag?.();
    this.controller.abort();
    this.controller = null;
    cancelAnimationFrame(this.frame);
    try {
      slot.ui.toolbar.hidePopover();
      slot.ui.spill.hidePopover();
    } catch {}
    if (this.portal) {
      slot.shadowRoot.append(slot.ui.spill, slot.ui.toolbar);
      this.portal.remove();
      this.portal = null;
    }
    slot.ui.spill.hidden = true;
    slot.ui.spill.style.display = "";
    slot.ui.spill.style.pointerEvents = "";
    for (const key of [
      "left",
      "top",
      "right",
      "position",
      "transform",
      "zIndex",
    ])
      slot.ui.toolbar.style[key] = "";
    slot.removeAttribute("data-reframe");
    if (commit) slot.saveView();
    if (active === this) active = null;
    this.signal(false);
  }
  signal(active) {
    const slot = this.slot;
    (slot.isConnected ? slot : document).dispatchEvent(
      new CustomEvent("image-slot:reframe", {
        bubbles: true,
        composed: true,
        detail: { active, id: slot.id || null },
      }),
    );
  }
}
