import { modalGeometry } from "./file-window-model.js";
import { modalStyle, modalContentsStyle } from "./file-window-style.js";
export class FileModal {
  constructor(owner) {
    this.owner = owner;
  }
  open() {
    if (this.dialog || this.owner.state === "unavailable") return;
    const owner = this.owner,
      dialog = document.createElement("dialog");
    dialog.className = "codex-file-modal";
    dialog.setAttribute("aria-label", owner.label);
    dialog.dataset.codexWheelPassthrough = "";
    const outer = document.createElement("style");
    outer.textContent = modalStyle;
    const content = document.createElement("div"),
      root = content.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${modalContentsStyle}${modalStyle.replaceAll(".codex-file-modal ", "")}</style><div class="fw-caption"><span class="fw-label"></span><span class="fw-actions"><button class="fw-action" hidden></button><button class="fw-close" aria-label="Close">×</button></span></div><div class="fw-crop" tabindex="0" aria-label="File preview scroll region" data-codex-wheel-passthrough><div class="fw-page"><div class="fw-view"></div><div class="fw-fence"></div></div></div>`;
    dialog.append(outer, content);
    this.dialog = dialog;
    this.root = root;
    this.crop = root.querySelector(".fw-crop");
    this.page = root.querySelector(".fw-page");
    this.view = root.querySelector(".fw-view");
    this.controller = new AbortController();
    const on = (target, type, listener, options = {}) =>
      target.addEventListener(type, listener, {
        ...options,
        signal: this.controller.signal,
      });
    this.returnFocus = document.activeElement;
    while (this.returnFocus?.shadowRoot?.activeElement)
      this.returnFocus = this.returnFocus.shadowRoot.activeElement;
    const style = getComputedStyle(owner);
    for (const name of style)
      if (name.startsWith("--fw-"))
        dialog.style.setProperty(name, style.getPropertyValue(name));
    if (owner.closest('[data-theme="dark"]')) dialog.dataset.theme = "dark";
    on(root.querySelector(".fw-close"), "click", () => this.close());
    on(root.querySelector(".fw-action"), "click", () =>
      owner.emit("action", { file: owner.file }),
    );
    on(dialog, "cancel", (event) => {
      event.preventDefault();
      this.close();
    });
    on(dialog, "click", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        this.close();
    });
    on(dialog, "close", () => this.close());
    on(this.crop, "scroll", () => this.sync(), { passive: true });
    on(this.crop, "wheel", (event) => event.stopPropagation(), {
      passive: true,
    });
    on(window, "resize", () => this.fit());
    document.documentElement.append(dialog);
    try {
      dialog.showModal();
    } catch {
      this.scrim = document.createElement("div");
      this.scrim.style.cssText =
        "position:fixed;inset:0;background:#0f0c086b;backdrop-filter:blur(3px);z-index:2147482999";
      document.documentElement.insertBefore(this.scrim, dialog);
      on(this.scrim, "click", () => this.close());
      dialog.open = true;
      Object.assign(dialog.style, {
        inset: "50% auto auto 50%",
        transform: "translate(-50%,-50%)",
        zIndex: "2147483000",
      });
      on(document, "keydown", (event) => {
        if (event.key === "Escape") this.close();
        if (event.key === "Tab") {
          const targets = [
            ...root.querySelectorAll(
              "button:not([hidden]):not(:disabled),[tabindex='0']",
            ),
          ];
          const index = targets.indexOf(root.activeElement);
          const next =
            targets[
              (index + (event.shiftKey ? targets.length - 1 : 1)) %
                targets.length
            ];
          event.preventDefault();
          next?.focus();
        }
      });
    }
    this.update();
    if (owner.frame) this.mount();
    else this.view.append(owner.placeholder());
    this.fit();
    root.querySelector(".fw-close").focus();
  }
  update() {
    if (!this.dialog) return;
    this.dialog.setAttribute("aria-label", this.owner.label);
    this.root.querySelector(".fw-label").textContent = this.owner.label;
    const action = this.root.querySelector(".fw-action");
    action.textContent = this.owner.getAttribute("action-label") || "";
    action.hidden = !action.textContent;
    action.disabled = this.owner.state !== "ready";
  }
  mount() {
    if (!this.dialog) return;
    this.observer?.disconnect();
    this.documentHeight = 0;
    this.initialScroll = false;
    const frame = this.owner.createFrame();
    frame.addEventListener(
      "load",
      () => {
        if (
          this.frame !== frame ||
          !this.dialog ||
          frame.contentDocument?.URL === "about:blank"
        )
          return;
        frame.dataset.ready = "";
        try {
          const doc = frame.contentDocument,
            Observer = frame.contentWindow.ResizeObserver;
          this.observer = new Observer(() => this.measure());
          if (doc.documentElement) this.observer.observe(doc.documentElement);
          if (doc.body) this.observer.observe(doc.body);
        } catch {}
        this.measure();
        this.sync();
      },
      { signal: this.controller.signal },
    );
    this.frame = frame;
    frame.src = this.owner.frameUrl();
    this.view.replaceChildren(frame);
    this.fit();
  }
  measure() {
    if (!this.frame || !this.dialog) return;
    try {
      const doc = this.frame.contentDocument,
        html = doc.documentElement;
      const height = Math.max(
        html.getBoundingClientRect().height,
        doc.body?.getBoundingClientRect().height || 0,
        html.scrollHeight > html.clientHeight ? html.scrollHeight : 0,
      );
      if (height > 0 && Math.abs(height - (this.documentHeight || 0)) > 1) {
        this.documentHeight = height;
        this.fit();
      }
    } catch {}
  }
  fit() {
    if (!this.dialog) return;
    const geometry = this.owner.geometry,
      layout = modalGeometry(
        geometry,
        innerWidth,
        innerHeight,
        this.documentHeight,
      );
    this.scale = layout.scale;
    Object.assign(this.crop.style, {
      width: `${layout.width}px`,
      height: `${layout.height}px`,
    });
    Object.assign(this.page.style, {
      width: `${layout.pageWidth}px`,
      height: `${layout.pageHeight}px`,
    });
    const scrollbar = this.crop.offsetWidth - this.crop.clientWidth;
    if (scrollbar > 0)
      this.crop.style.width = `${Math.min(layout.maxWidth, layout.width + scrollbar)}px`;
    const height = this.crop.clientHeight || layout.height;
    this.view.style.height = `${height}px`;
    if (this.frame)
      Object.assign(this.frame.style, {
        width: `${geometry.documentWidth}px`,
        height: `${Math.ceil(height / layout.scale)}px`,
        transform: `scale(${layout.scale})`,
      });
    if (this.documentHeight && !this.initialScroll) {
      this.initialScroll = true;
      this.crop.scrollLeft = geometry.x * layout.scale;
      this.crop.scrollTop = geometry.y * layout.scale;
    }
    this.sync();
  }
  sync() {
    try {
      this.frame?.contentWindow.scrollTo(0, this.crop.scrollTop / this.scale);
    } catch {}
  }
  reload() {
    if (this.frame) this.frame.src = this.owner.frameUrl();
  }
  close() {
    if (!this.dialog) return;
    const dialog = this.dialog;
    this.dialog = null;
    this.controller.abort();
    this.observer?.disconnect();
    if (dialog.open) dialog.close();
    dialog.remove();
    this.scrim?.remove();
    this.scrim = null;
    this.frame =
      this.root =
      this.crop =
      this.page =
      this.view =
      this.observer =
        null;
    if (this.owner.isConnected && this.owner.state !== "unavailable") {
      const target = this.returnFocus?.isConnected
        ? this.returnFocus
        : this.owner;
      target.focus({ preventScroll: true });
    }
  }
}
