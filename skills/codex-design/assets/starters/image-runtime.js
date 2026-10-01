import { imageStore } from "./image-store.js";
import { imageStyle } from "./image-style.js";
import { IMAGE_TYPES, framing } from "./image-model.js";
import { unsplash, renderCredit } from "./image-credit.js";
import { encodeImage } from "./image-media.js";
import { ImageReframe } from "./image-reframe.js";
import {
  readLegacy,
  saveLegacy,
  cloneLegacy,
  legacyKey,
} from "./image-legacy.js";
export class ImageSlot extends HTMLElement {
  static observedAttributes = [
    "id",
    "storage-key",
    "shape",
    "radius",
    "mask",
    "fit",
    "placeholder",
    "src",
    "alt",
    "credit",
    "credit-href",
    "editable",
  ];
  static cloneSlot(from, isFree) {
    return imageStore.clone(from, isFree);
  }
  static cloneStorageKey(from, to) {
    cloneLegacy(from, to);
  }
  constructor() {
    super();
    const root =
      this.shadowRoot || this.attachShadow({ mode: "open", clonable: true });
    root.innerHTML = `<style>${imageStyle}</style><div class="frame" part="frame"><img class="photo" part="image" draggable="false" hidden><div class="empty" part="empty" role="button" tabindex="0"><span class="symbol" aria-hidden="true">▧</span><span class="caption"></span><span class="browse">or browse files</span></div><div class="attribution" part="attribution-error" hidden>This photo needs attribution</div><div class="ring" part="ring"></div><div class="loading" part="loading" aria-label="Loading image" hidden></div></div><span class="credit" part="credit" hidden></span><div class="toolbar" popover="manual" data-codex-edit-transparent><button class="replace" title="Replace image">Replace</button><button class="edit" title="Reframe image">Edit</button><button class="clear" title="Reset image">Reset image</button></div><div class="spill" popover="manual" hidden data-codex-edit-transparent><img class="ghost" draggable="false" alt=""><span class="handle" role="button" tabindex="0" aria-label="Resize image northwest" data-c="nw"></span><span class="handle" role="button" tabindex="0" aria-label="Resize image northeast" data-c="ne"></span><span class="handle" role="button" tabindex="0" aria-label="Resize image southwest" data-c="sw"></span><span class="handle" role="button" tabindex="0" aria-label="Resize image southeast" data-c="se"></span></div><input class="file" type="file" aria-label="Choose local image" hidden><form class="legacy" hidden><label>Alt text <input class="alt" data-alt></label><label>Horizontal crop <input class="crop-x" data-x type="range" min="0" max="100" value="50"></label><label>Vertical crop <input class="crop-y" data-y type="range" min="0" max="100" value="50"></label></form><p class="status" role="status"><span class="message"></span><button class="download" hidden>Download image state</button><button class="retained" hidden>Download retained draft</button></p>`;
    this.ui = Object.fromEntries(
      [
        "frame",
        "photo",
        "empty",
        "caption",
        "browse",
        "attribution",
        "ring",
        "loading",
        "credit",
        "toolbar",
        "replace",
        "edit",
        "clear",
        "spill",
        "ghost",
        "file",
        "legacy",
        "alt",
        "crop-x",
        "crop-y",
        "status",
        "message",
        "download",
        "retained",
      ].map((name) => [name, root.querySelector(`.${name}`)]),
    );
    this.store = imageStore;
    for (const name of [
      "toolbar",
      "credit",
      "status",
      "legacy",
      "spill",
      "loading",
      "file",
    ])
      this.ui[name].setAttribute("data-codex-chrome", "");
    this.crop = new ImageReframe(this);
    this.view = { s: 1, x: 0, y: 0 };
    this.generation = 0;
    this.dragDepth = 0;
    this.connected = false;
    this._value = { src: "", alt: "", x: 50, y: 50 };
    const on = (target, event, fn) => target.addEventListener(event, fn);
    on(this.ui.empty, "click", () => this.openFilePicker());
    on(this.ui.empty, "keydown", (event) => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        this.openFilePicker();
      }
    });
    on(this.ui.replace, "click", () => {
      if (!this.editable) return;
      this.crop.exit(true);
      const event = new CustomEvent("image-slot:pick", {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: { id: this.id || null },
      });
      if (this.dispatchEvent(event)) this.openFilePicker();
    });
    on(this.ui.edit, "click", () =>
      this.crop.controller ? this.crop.exit(true) : this.crop.enter(),
    );
    on(this.ui.clear, "click", () => this.clear());
    on(this.ui.download, "click", () => this.store.download());
    on(this.ui.retained, "click", () => this.store.download(true));
    on(this.ui.file, "change", () => {
      const file = this.ui.file.files?.[0];
      if (file) void this.ingest(file);
      this.ui.file.value = "";
    });
    on(this, "dblclick", (event) => {
      if (!this.editable || !this.filled) return;
      event.preventDefault();
      this.crop.controller ? this.crop.exit(true) : this.crop.enter();
    });
    for (const type of ["click", "dblclick"])
      on(this.ui.credit, type, (event) => event.stopPropagation());
    on(this.ui.photo, "load", () => this.finishLoad());
    on(this.ui.photo, "error", () => this.finishLoad(true));
    on(this.ui.legacy, "submit", (event) => event.preventDefault());
    on(this.ui.alt, "input", () =>
      this.setRecord(
        {
          ...this.record(),
          ...this.view,
          alt: this.ui.alt.value,
        },
        true,
      ),
    );
    for (const axis of ["x", "y"])
      on(this.ui[`crop-${axis}`], "input", () => {
        const geometry = this.geometry();
        if (geometry)
          this.view[axis] =
            ((50 - Number(this.ui[`crop-${axis}`].value)) *
              geometry[axis === "x" ? "mx" : "my"]) /
            50;
        this.saveView();
      });
  }
  get legacy() {
    return this.hasAttribute("storage-key");
  }
  get editable() {
    return (
      !new URL(location.href).searchParams.has("capture") &&
      (this.legacy ||
        this.getAttribute("editable") === "session" ||
        this.store.source ||
        !!this.store.endpoint)
    );
  }
  get filled() {
    return this.hasAttribute("data-filled");
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = { ...this._value, ...value };
  }
  record() {
    return this.legacy
      ? this.legacyState || {}
      : this.id
        ? this.store.get(this.id) || {}
        : this.local || {};
  }
  connectedCallback() {
    if (this.connected) return;
    this.connected = true;
    if (this.getAttribute("editable") === "session") this.store.enableSession();
    this.controller = new AbortController();
    const on = (target, type, fn, options = {}) =>
      target.addEventListener(type, fn, {
        ...options,
        signal: this.controller.signal,
      });
    for (const type of ["dragenter", "dragover", "dragleave", "drop"])
      on(this, type, (event) => this.drag(event));
    on(window, "beforeprint", () => this.crop.exit(true));
    this.unsubscribe = this.store.subscribe(() => this.render());
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(this.ui.frame);
    this.reloadStoredImage();
    this.store.ready.then(() => {
      if (this.connected) this.render();
    });
  }
  disconnectedCallback() {
    this.crop.exit(false);
    this.controller?.abort();
    this.observer?.disconnect();
    this.unsubscribe?.();
    this.connected = false;
    this.generation++;
    this.encoding = false;
  }
  attributeChangedCallback(name, before, after) {
    if (before === after) return;
    if (name === "editable" && after === "session") this.store.enableSession();
    if (name === "src") {
      this.generation++;
      this.encoding = false;
      this.error = "";
    }
    if (name === "id" || name === "storage-key") {
      this.crop?.exit(false);
      this.local = null;
      this.legacyState = readLegacy(this.getAttribute("storage-key"));
    }
    if (this.connected) this.render();
  }
  reloadStoredImage() {
    if (this.legacy)
      this.legacyState = readLegacy(this.getAttribute("storage-key"));
    this.render();
  }
  updateImage() {
    if (!this.legacy) return this.render();
    const value = this._value;
    this.legacyState = {
      u: value.src || undefined,
      alt: value.alt,
      s: this.view.s,
      x: this.view.x,
      y: this.view.y,
    };
    this.persistLegacy();
    this.render();
  }
  openFilePicker() {
    if (!this.editable) return;
    this.crop.exit(true);
    this.ui.file.click();
  }
  async ingest(file) {
    if (!this.editable) return false;
    const generation = ++this.generation;
    this.error = "";
    this.encoding = true;
    this.encodingSwap = this.filled;
    this.render();
    try {
      const url = await encodeImage(
        file,
        this.ui.frame.clientWidth,
        this.legacy,
      );
      if (generation !== this.generation) return false;
      this.crop.exit(false);
      this.encoding = false;
      this.setRecord({
        u: url,
        s: 1,
        x: 0,
        y: 0,
        alt: this.record().alt ?? this.getAttribute("alt") ?? "",
      });
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.encoding = false;
      this.error = error.message.includes("Choose")
        ? error.message
        : "Could not read that image. The previous image is retained.";
      this.render();
      return false;
    }
  }
  clear() {
    if (!this.editable) return;
    this.generation++;
    this.encoding = false;
    this.crop.exit(false);
    this.error = "";
    if (this.legacy) {
      this.legacyState = null;
      try {
        localStorage.removeItem(legacyKey(this.getAttribute("storage-key")));
      } catch {}
      this.notice = "Image reset.";
    } else if (this.id)
      this.store.set(
        this.id,
        null,
        this.getAttribute("editable") === "session",
      );
    else this.local = null;
    this.render();
  }
  setRecord(value, preservePosition = false) {
    this.notice = "";
    if (this.legacy) {
      this.legacyState = { ...value };
      if (!preservePosition) delete this.legacyState.position;
      this.persistLegacy();
    } else if (this.id)
      this.store.set(
        this.id,
        value,
        this.getAttribute("editable") === "session",
      );
    else {
      this.local = { ...value };
      this.notice = "Session only — use a unique id to retain the image.";
    }
    this.render();
  }
  persistLegacy() {
    this.notice = saveLegacy(
      this.getAttribute("storage-key"),
      this.legacyState,
      this.position(),
    );
  }
  position() {
    const geometry = this.geometry();
    return {
      x: geometry?.mx ? 50 - (this.view.x / geometry.mx) * 50 : 50,
      y: geometry?.my ? 50 - (this.view.y / geometry.my) * 50 : 50,
    };
  }
  saveView() {
    const previous = this.record();
    this.setRecord({
      ...previous,
      s: this.view.s,
      x: this.view.x,
      y: this.view.y,
    });
  }
  geometry() {
    return framing(
      this.ui.photo.naturalWidth,
      this.ui.photo.naturalHeight,
      this.ui.frame.clientWidth,
      this.ui.frame.clientHeight,
      this.getAttribute("fit") === "contain" ? "contain" : "cover",
      this.view,
    );
  }
  applyView() {
    const geometry = this.geometry();
    if (!geometry) return;
    this.view = { s: geometry.s, x: geometry.x, y: geometry.y };
    Object.assign(this.ui.photo.style, {
      width: `${(geometry.width / geometry.fw) * 100}%`,
      height: `${(geometry.height / geometry.fh) * 100}%`,
      left: `${50 + geometry.x}%`,
      top: `${50 + geometry.y}%`,
      objectFit: "",
    });
    if (this.crop.controller) this.crop.position(geometry);
  }
  finishLoad(failed = false) {
    this.loading = false;
    if (failed) this.error = "Could not load this image.";
    this.render();
    this.resolveLoad?.();
    this.resolveLoad = null;
  }
  render() {
    if (!this.ui) return;
    const ui = this.ui,
      record = this.record(),
      source = record.u || this.getAttribute("src") || "",
      credit = (this.getAttribute("credit") || "").trim();
    const blocked = !!(
      source &&
      !record.u &&
      unsplash(source, document.baseURI) &&
      !credit
    );
    this.toggleAttribute("data-attribution-error", blocked);
    this.toggleAttribute("data-editable", this.editable);
    this.toggleAttribute("data-filled", !!source && !blocked);
    const mask = this.getAttribute("mask") || "",
      shape = (this.getAttribute("shape") || "rounded").toLowerCase(),
      rawRadius = parseFloat(this.getAttribute("radius")),
      radius =
        shape === "circle"
          ? "50%"
          : shape === "pill"
            ? "9999px"
            : shape === "rounded"
              ? `${Number.isFinite(rawRadius) ? Math.max(0, rawRadius) : 12}px`
              : "0";
    ui.frame.style.borderRadius = mask ? "" : radius;
    ui.frame.style.clipPath = mask;
    ui.ring.style.borderRadius = mask ? "" : radius;
    ui.ring.hidden = !!mask;
    ui.caption.textContent =
      this.getAttribute("placeholder") || "Drop an image";
    ui.browse.hidden = !this.editable;
    ui.empty.tabIndex = this.editable ? 0 : -1;
    ui.empty.setAttribute("aria-disabled", String(!this.editable));
    ui.file.accept = [
      ...IMAGE_TYPES,
      ...(this.legacy ? ["image/gif"] : []),
    ].join(",");
    ui.file.hidden = !this.legacy;
    ui.legacy.hidden = !this.legacy;
    for (const name of ["replace", "edit", "clear"])
      ui[name].disabled = !this.editable || (name === "edit" && !this.filled);
    if (source && !blocked) {
      if (ui.photo.getAttribute("src") !== source) {
        this.swapNeeded = !!ui.photo.getAttribute("src") || !!this.hadSource;
        this.hadSource = true;
        this.loading = true;
        this.resolveLoad?.();
        this.loadPromise = new Promise((resolve) => {
          this.resolveLoad = resolve;
        });
        ui.photo.setAttribute("src", source);
        ui.ghost.setAttribute("src", source);
      }
      ui.photo.hidden = false;
      ui.empty.hidden = true;
      ui.attribution.hidden = true;
      ui.photo.alt = record.alt ?? this.getAttribute("alt") ?? "";
      if (!this.crop.controller)
        this.view = { s: record.s ?? 1, x: record.x ?? 0, y: record.y ?? 0 };
      if (record.position && !this.crop.controller) {
        const geometry = this.geometry();
        if (geometry) {
          this.view.x = ((50 - record.position.x) * geometry.mx) / 50;
          this.view.y = ((50 - record.position.y) * geometry.my) / 50;
        }
      }
      Object.assign(
        ui.photo.style,
        this.geometry()
          ? {}
          : {
              width: "100%",
              height: "100%",
              left: "50%",
              top: "50%",
              objectFit:
                this.getAttribute("fit") === "contain" ? "contain" : "cover",
            },
      );
      this.applyView();
    } else {
      this.loading = false;
      if (!source) {
        this.hadSource = false;
        this.swapNeeded = false;
      }
      this.resolveLoad?.();
      this.resolveLoad = null;
      ui.photo.hidden = true;
      ui.photo.removeAttribute("src");
      ui.ghost.removeAttribute("src");
      ui.empty.hidden = blocked;
      ui.attribution.hidden = !blocked;
    }
    const swapping = !!(
      (this.loading && this.swapNeeded) ||
      (this.encoding && this.encodingSwap)
    );
    this.toggleAttribute("data-swapping", swapping);
    ui.loading.hidden = !swapping;
    const showCredit = !!source && !record.u && !!credit && !blocked;
    ui.credit.hidden = !showCredit;
    if (showCredit)
      renderCredit(ui.credit, credit, this.getAttribute("credit-href"));
    this.toggleAttribute("data-credit", showCredit);
    const position = this.position();
    this._value = {
      src: source,
      alt: ui.photo.alt || this.getAttribute("alt") || "",
      x: position.x,
      y: position.y,
    };
    ui.alt.value = this._value.alt;
    ui["crop-x"].value = position.x;
    ui["crop-y"].value = position.y;
    const error =
      this.error ||
      (!this.legacy ? this.store.error || this.store.warning : "");
    ui.status.dataset.error = String(!!error);
    ui.status.setAttribute(
      "part",
      !error &&
        !this.notice &&
        !this.store.retained &&
        !this.store.sessionStatus &&
        !this.store.saving &&
        !this.store.source &&
        this.getAttribute("editable") === "session"
        ? "status status-session"
        : "status",
    );
    ui.message.textContent =
      error ||
      this.notice ||
      (!this.legacy
        ? this.store.saving
          ? "Saving image state…"
          : this.store.source
            ? ""
            : this.getAttribute("editable") === "session"
              ? this.store.sessionStatus ||
                "Session preview — source image state is not saved."
              : ""
        : "");
    ui.download.hidden = !this.store.error || this.legacy;
    ui.retained.hidden = !this.store.retained || this.legacy;
    if (this.store.retained && !error && !this.legacy)
      ui.message.textContent =
        "A previous image draft is available for review.";
    ui.status.hidden =
      !ui.message.textContent && ui.download.hidden && ui.retained.hidden;
  }
  drag(event) {
    if (!this.editable) return;
    if (["dragenter", "dragover"].includes(event.type)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      if (event.type === "dragenter") this.dragDepth++;
      this.setAttribute("data-over", "");
    }
    if (event.type === "dragleave") {
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (!this.dragDepth) this.removeAttribute("data-over");
    }
    if (event.type === "drop") {
      event.preventDefault();
      event.stopPropagation();
      this.dragDepth = 0;
      this.removeAttribute("data-over");
      const file = event.dataTransfer?.files?.[0];
      if (file) void this.ingest(file);
    }
  }
  async settled() {
    await this.store.ready;
    await this.loadPromise;
    return !this.loading && !this.encoding;
  }
  async prepareCapture() {
    this.crop.exit(true);
    await this.store.settled();
    await this.settled();
  }
}
if (!customElements.get("image-slot"))
  customElements.define("image-slot", ImageSlot);
export { imageStore };
