import {
  fileGeometry,
  fileUrl,
  fileName,
  sameFilePath,
} from "./file-window-model.js";
import { cardStyle } from "./file-window-style.js";
import { sketch } from "./file-window-sketch.js";
import { FileModal } from "./file-window-modal.js";
const registry = new Set();
let router = null;
export class FileWindow extends HTMLElement {
  static observedAttributes = [
    "file",
    "label",
    "width",
    "height",
    "window-x",
    "window-y",
    "window-width",
    "document-width",
    "action-label",
    "lazy",
    "no-expand",
    "expect",
  ];
  static routeUpdates() {
    if (window.CodexFileUpdate === router && router) return;
    const previous = window.CodexFileUpdate;
    const next = (name, kind, content, streaming, viewportKey, path) => {
      if (typeof previous === "function")
        previous(name, kind, content, streaming, viewportKey, path);
      if (router !== next) return;
      for (const view of registry)
        view.fileUpdate(name, kind, content, streaming, viewportKey, path);
    };
    router = next;
    window.CodexFileUpdate = router;
    if (!FileWindow.eventWired) {
      window.addEventListener("codex:file-update", (event) => {
        const data = event.detail;
        if (data && typeof data.name === "string")
          window.CodexFileUpdate(
            data.name,
            data.kind,
            data.content,
            !!data.streaming,
            data.viewportKey,
            data.path,
          );
      });
      FileWindow.eventWired = true;
    }
  }
  constructor() {
    super();
    const root =
      this.shadowRoot || this.attachShadow({ mode: "open", clonable: true });
    root.innerHTML = `<style>${cardStyle}</style><div class="fw-crop" part="crop"></div><div class="fw-caption"><span class="fw-label"></span><button class="fw-expand" aria-label="Expand">↗</button></div>`;
    this.crop = root.querySelector(".fw-crop");
    this.caption = root.querySelector(".fw-label");
    this.expand = root.querySelector(".fw-expand");
    this.modal = new FileModal(this);
    this.nonce = 1;
    this._state = "loading";
    this.generation = 0;
    this.expand.addEventListener("click", (event) => {
      event.stopPropagation();
      this.modal.open();
    });
    this.addEventListener("click", () => this.pick());
    this.addEventListener("keydown", (event) => {
      if (event.target === this && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        this.pick();
      }
    });
  }
  get state() {
    return this._state;
  }
  get file() {
    return this.getAttribute("file") || "";
  }
  get label() {
    return this.getAttribute("label") || fileName(this.file, document.baseURI);
  }
  connectedCallback() {
    this.connection = new AbortController();
    registry.add(this);
    FileWindow.routeUpdates();
    this.setState(this.state);
    document.addEventListener(
      "visibilitychange",
      () => {
        if (!document.hidden) void this.checkFile();
      },
      { signal: this.connection.signal },
    );
    this.watch = setInterval(() => void this.checkFile(), 5000);
    this.near = !this.hasAttribute("lazy");
    if (!this.near) {
      this.intersection = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.near = true;
            this.intersection.disconnect();
            if (this.key && !this.frame) this.mountFrame();
          }
        },
        { rootMargin: "300px" },
      );
      this.intersection.observe(this);
    }
    this.configure();
    if (this.frame) this.bindFrame(this.frame);
    if (this.pending) this.armPatience();
    void this.checkFile();
  }
  disconnectedCallback() {
    registry.delete(this);
    this.generation++;
    this.connection?.abort();
    this.request?.abort();
    clearInterval(this.watch);
    clearTimeout(this.patience);
    clearTimeout(this.reveal);
    this.intersection?.disconnect();
    this.modal.close();
    this.checking = null;
  }
  attributeChangedCallback(name, before, after) {
    if (before === after || !this.isConnected || !this.crop) return;
    if (name === "file") {
      this.generation++;
      this.request?.abort();
      this.checking = null;
      this.frame = null;
      this.key = null;
      this.pending = false;
      this.misses = 0;
      clearTimeout(this.patience);
      this.modal.close();
      this.setState("loading");
      this.crop.replaceChildren(this.placeholder());
    }
    this.configure();
    if (name === "lazy" && !this.hasAttribute("lazy")) {
      this.near = true;
      this.intersection?.disconnect();
      if (this.key && !this.frame) this.mountFrame();
    }
    if (!this.frame && this.state === "loading" && name !== "action-label")
      this.crop.replaceChildren(this.placeholder());
    if (name === "file" || name === "expect") void this.checkFile();
  }
  configure() {
    this.geometry = fileGeometry(this);
    this.style.width = `${this.geometry.width}px`;
    this.crop.style.height = `${this.geometry.height}px`;
    this.setAttribute("role", "button");
    this.tabIndex = this.state === "unavailable" ? -1 : 0;
    this.caption.textContent = this.label;
    this.expand.hidden =
      this.hasAttribute("no-expand") || this.state === "unavailable";
    if (!this.crop.firstChild) this.crop.append(this.placeholder());
    if (this.frame) this.layoutFrame(this.frame);
    this.modal.update();
    this.modal.fit();
  }
  emit(type, detail) {
    this.dispatchEvent(
      new CustomEvent(`file-window:${type}`, {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  }
  pick() {
    if (this.state !== "unavailable") this.emit("pick", { file: this.file });
  }
  setState(state) {
    if (this._state === state && this.dataset.state === state) return;
    this._state = state;
    this.dataset.state = state;
    this.setAttribute("aria-disabled", String(state === "unavailable"));
    this.tabIndex = state === "unavailable" ? -1 : 0;
    this.expand.hidden =
      state === "unavailable" || this.hasAttribute("no-expand");
    this.emit("state", state);
    this.modal.update();
  }
  placeholder() {
    const geometry = this.geometry || fileGeometry(this);
    if (this.hasAttribute("expect"))
      return sketch(
        `${this.file}|${this.label}`,
        geometry.width,
        geometry.height,
      );
    const skeleton = document.createElement("div");
    skeleton.className = "fw-skeleton";
    for (const style of [
      "height:9px;width:44%",
      "height:22px;width:72%",
      "flex:1",
    ]) {
      const part = document.createElement("span");
      part.style.cssText = style;
      skeleton.append(part);
    }
    return skeleton;
  }
  frameUrl() {
    const url = fileUrl(this.file, document.baseURI);
    url.searchParams.set("fwv", String(this.nonce));
    return url.href;
  }
  createFrame() {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.setAttribute(
      "allow",
      "camera 'none'; microphone 'none'; geolocation 'none'; fullscreen 'none'",
    );
    frame.referrerPolicy = "no-referrer";
    frame.title = this.label;
    frame.inert = true;
    frame.tabIndex = -1;
    frame.setAttribute("scrolling", "no");
    return frame;
  }
  layoutFrame(frame) {
    Object.assign(frame.style, {
      width: `${this.geometry.documentWidth}px`,
      height: `${this.geometry.frameHeight}px`,
      transform: this.geometry.transform,
    });
  }
  mountFrame() {
    if (!this.isConnected || !this.near || this.frame || !this.key) return;
    this.pending = false;
    clearTimeout(this.patience);
    this.setState("loading");
    const frame = this.createFrame(),
      fence = document.createElement("div");
    fence.className = "fw-fence";
    this.layoutFrame(frame);
    if (this.hasAttribute("lazy")) frame.loading = "lazy";
    this.bindFrame(frame);
    this.frame = frame;
    frame.src = this.frameUrl();
    this.crop.replaceChildren(frame, fence);
    this.reveal = setTimeout(() => {
      if (this.frame === frame) frame.dataset.ready = "";
    }, 4000);
    if (this.modal.dialog) this.modal.mount();
  }
  bindFrame(frame) {
    const generation = this.generation;
    frame.addEventListener(
      "load",
      () => {
        if (
          this.frame !== frame ||
          generation !== this.generation ||
          !this.isConnected ||
          frame.contentDocument?.URL === "about:blank"
        )
          return;
        clearTimeout(this.reveal);
        frame.dataset.ready = "";
        frame.dataset.loaded = "";
        this.setState("ready");
      },
      { signal: this.connection.signal },
    );
  }
  armPatience() {
    if (!this.pending || !this.isConnected) return;
    clearTimeout(this.patience);
    this.patience = setTimeout(() => {
      if (this.pending && !this.frame) this.gone();
    }, 120000);
  }
  gone() {
    this.pending = false;
    clearTimeout(this.patience);
    clearTimeout(this.reveal);
    this.frame = null;
    this.key = null;
    this.misses = 0;
    const card = document.createElement("div");
    card.className = "fw-gone";
    const title = document.createElement("span"),
      path = document.createElement("span");
    title.textContent = "File not found";
    path.textContent = this.file;
    card.append(title, path);
    this.crop.replaceChildren(card);
    this.modal.close();
    this.setState("unavailable");
  }
  async probe(signal) {
    try {
      const url = fileUrl(this.file, document.baseURI);
      const key = (response) =>
        response.headers.get("etag") ||
        response.headers.get("last-modified") ||
        response.headers.get("content-length");
      const response = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
        signal,
      });
      await response.body?.cancel();
      if (response.ok && key(response)) return key(response);
      if (!response.ok && ![405, 501].includes(response.status)) return null;
      const fallback = await fetch(url, { cache: "no-store", signal });
      if (!fallback.ok) {
        await fallback.body?.cancel();
        return null;
      }
      const version = key(fallback);
      if (version) {
        await fallback.body?.cancel();
        return version;
      }
      return `size:${(await fallback.blob()).size}`;
    } catch {
      return null;
    }
  }
  async checkFile() {
    if (!this.isConnected) return;
    if (this.checking) return this.checking;
    const generation = this.generation,
      request = new AbortController();
    this.request = request;
    const work = (async () => {
      const key = await this.probe(request.signal);
      if (
        !this.isConnected ||
        request.signal.aborted ||
        generation !== this.generation
      )
        return;
      if (key === null) {
        if (this.frame) {
          if (++this.misses >= 2) this.gone();
          return;
        }
        if (this.state === "unavailable") return;
        if (this.hasAttribute("expect")) {
          if (!this.pending) {
            this.pending = true;
            this.armPatience();
          }
        } else this.gone();
        return;
      }
      this.misses = 0;
      this.pending = false;
      clearTimeout(this.patience);
      const previous = this.key;
      this.key = key;
      if (!this.frame) {
        if (this.state === "unavailable") {
          this.nonce++;
          this.setState("loading");
          this.crop.replaceChildren(this.placeholder());
        }
        this.mountFrame();
      } else if (previous && previous !== key) this.reload();
    })();
    this.checking = work;
    try {
      await work;
    } finally {
      if (this.checking === work) this.checking = null;
    }
  }
  reload() {
    this.nonce++;
    if (this.frame) {
      this.frame.removeAttribute("data-ready");
      this.frame.removeAttribute("data-loaded");
      this.frame.src = this.frameUrl();
    }
    this.modal.reload();
  }
  async prepareCapture() {
    await this.checkFile();
    if (this.key && !this.frame) {
      this.near = true;
      this.mountFrame();
    }
    const frame = this.frame;
    if (!frame) return;
    if (!frame.hasAttribute("data-loaded"))
      await new Promise((resolve, reject) => {
        const loaded = () => {
          if (frame.contentDocument?.URL === "about:blank") return;
          clearTimeout(timeout);
          frame.removeEventListener("load", loaded);
          resolve();
        };
        const timeout = setTimeout(() => {
          frame.removeEventListener("load", loaded);
          reject(new Error(`File preview did not load: ${this.file}`));
        }, 8000);
        frame.addEventListener("load", loaded);
      });
    const doc = frame.contentDocument;
    if (!doc) return;
    await doc.fonts.ready;
    await Promise.all(
      [...doc.images]
        .filter((image) => image.getAttribute("src"))
        .map((image) => image.decode()),
    );
  }
  fileUpdate(name, kind, content, streaming, viewportKey, path) {
    if (this.pending && streaming && content) this.armPatience();
    const base =
      document.querySelector('meta[name="codex-file-base"]')?.content || "/";
    if (
      name !== fileName(this.file, document.baseURI) ||
      !sameFilePath(this.file, path, document.baseURI, base)
    )
      return;
    let delivered = false;
    for (const frame of [this.frame, this.modal.frame]) {
      try {
        const receiver = frame?.contentWindow?.CodexFileUpdate;
        if (typeof receiver === "function") {
          receiver(name, kind, content, streaming, viewportKey, path);
          delivered = true;
        }
      } catch {}
    }
    if (delivered) return;
    if (!this.frame) {
      const now = Date.now();
      if (!streaming || !this.pushProbeAt || now - this.pushProbeAt > 500) {
        this.pushProbeAt = now;
        void this.checkFile();
      }
    } else if (!streaming) void this.checkFile();
  }
}
if (!customElements.get("file-window"))
  customElements.define("file-window", FileWindow);
window.FileWindow = customElements.get("file-window");
