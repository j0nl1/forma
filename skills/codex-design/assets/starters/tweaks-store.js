import { tweakValues, mergeTweaks } from "./tweaks-model.js";
export function readTweakDefaults(fallback = {}) {
  const block = document.getElementById("codex-tweak-defaults");
  return block
    ? tweakValues(JSON.parse(block.textContent))
    : tweakValues(fallback);
}
const sourceOwner = Symbol.for("codex-design.tweak-source-owner");
export class TweakStore {
  constructor(
    defaults,
    { id = "default", storage = true, source = true } = {},
  ) {
    this.defaults = tweakValues(defaults);
    this.values = tweakValues(defaults);
    this.listeners = new Set();
    this.id = id;
    this.signature = JSON.stringify(this.defaults);
    this.key = `codex-design-tweaks:${location.pathname}:${id}`;
    this.storage = storage;
    this.pending = {};
    this.status = "Changes stay in this preview";
    if (storage)
      try {
        const saved = JSON.parse(localStorage.getItem(this.key));
        if (saved?.signature === this.signature)
          this.values = mergeTweaks(this.defaults, saved.values);
        this.status = "Saved in this browser";
      } catch {
        this.status = "Storage unavailable; changes stay in this preview";
      }
    const endpoint = document.querySelector(
      'meta[name="codex-tweaks-source"]',
    )?.content;
    if (source && endpoint && !window[sourceOwner]) {
      window[sourceOwner] = this;
      this.ready = this.connect(endpoint);
    } else this.ready = Promise.resolve();
    this.onPageHide = () => {
      this.keepalive = true;
      this.flush();
    };
    window.addEventListener("pagehide", this.onPageHide);
  }
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.values;
  notify(edits) {
    for (const listener of this.listeners) listener();
    if (edits)
      window.dispatchEvent(
        new CustomEvent("tweakchange", { detail: tweakValues(edits) }),
      );
    window.dispatchEvent(
      new CustomEvent("codex-tweaks-status", {
        detail: { id: this.id, status: this.status },
      }),
    );
  }
  persist() {
    if (!this.storage) return;
    try {
      localStorage.setItem(
        this.key,
        JSON.stringify({ signature: this.signature, values: this.values }),
      );
      if (!this.source && !this.failed) this.status = "Saved in this browser";
    } catch {
      if (!this.source && !this.failed)
        this.status = "Storage unavailable; changes stay in this preview";
    }
  }
  set = (keyOrEdits, value) => {
    const edits =
      typeof keyOrEdits === "object" && keyOrEdits !== null
        ? tweakValues(keyOrEdits)
        : tweakValues({ [keyOrEdits]: value });
    this.values = mergeTweaks(this.values, edits);
    this.pending = { ...this.pending, ...edits };
    this.persist();
    if (this.source && !this.failed) this.status = "Saving changes";
    this.notify(edits);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 150);
  };
  reset = () => {
    this.set(this.defaults);
  };
  async connect(endpoint) {
    try {
      if (new URL(endpoint, location.href).origin !== location.origin)
        throw new Error("Tweak source must use the preview origin");
      const response = await fetch(endpoint);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      this.source = { endpoint, version: data.version, token: data.token };
      this.defaults = mergeTweaks(this.defaults, data.values);
      this.signature = JSON.stringify(this.defaults);
      this.values = mergeTweaks(this.defaults, this.pending);
      this.persist();
      this.status = Object.keys(this.pending).length
        ? "Saving changes"
        : "Source editing connected";
      this.notify(this.values);
    } catch (error) {
      this.failed = true;
      this.status = `Not saved: ${error.message}`;
      this.notify();
    }
  }
  async flush() {
    clearTimeout(this.timer);
    await this.ready;
    if (this.saving) {
      await this.saving;
      if (Object.keys(this.pending).length) return this.flush();
      return;
    }
    if (this.failed || !this.source || !Object.keys(this.pending).length)
      return;
    const edits = this.pending;
    this.pending = {};
    this.saving = (async () => {
      try {
        const response = await fetch(this.source.endpoint, {
          method: "POST",
          keepalive: this.keepalive === true,
          headers: {
            "Content-Type": "application/json",
            "X-Codex-Tweaks-Token": this.source.token,
          },
          body: JSON.stringify({ version: this.source.version, edits }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Tweak save failed");
        this.source.version = data.version;
        this.status = Object.keys(this.pending).length
          ? "Saving changes"
          : "Saved to HTML source";
      } catch (error) {
        this.pending = { ...edits, ...this.pending };
        this.failed = true;
        this.status = `Not saved: ${error.message}`;
      }
      this.notify();
    })();
    await this.saving;
    this.saving = null;
    if (!this.failed && Object.keys(this.pending).length) return this.flush();
  }
  download(filename = "design-settings.json") {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(this.values, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  dispose() {
    window.removeEventListener("pagehide", this.onPageHide);
    clearTimeout(this.timer);
    this.listeners.clear();
    if (window[sourceOwner] === this) delete window[sourceOwner];
  }
}
