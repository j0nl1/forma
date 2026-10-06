import {
  IMAGE_STATE_FILE,
  imageSlots,
  readableImageSlots,
  imageValue,
} from "./image-model.js";
export class ImageStore {
  constructor() {
    this.slots = Object.create(null);
    this.changes = new Map();
    this.listeners = new Set();
    this.loaded = false;
    this.source = false;
    this.error = "";
    this.saving = false;
    this.storageKey = `codex-design-images:${new URL(".", location.href).pathname}`;
    this.ready = this.load();
    window.addEventListener("pagehide", () => {
      this.checkpoint();
      this.leaving = true;
      void this.flush();
    });
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify() {
    for (const listener of this.listeners) listener();
  }
  async load() {
    try {
      const endpoint = document.querySelector(
        'meta[name="codex-images-source"]',
      )?.content;
      let initial;
      if (endpoint) {
        if (new URL(endpoint, location.href).origin !== location.origin)
          throw new Error("Image saving requires the local preview origin.");
        this.endpoint = endpoint;
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error("Could not load image source state.");
        const data = await response.json();
        this.version = data.version;
        this.token = data.token;
        initial = data.slots;
        this.source = true;
      } else {
        const embedded = document.getElementById("codex-image-state");
        if (embedded) initial = JSON.parse(embedded.textContent);
        else {
          const response = await fetch(
            new URL(IMAGE_STATE_FILE, document.baseURI),
          );
          initial = response.ok ? await response.json() : {};
        }
      }
      const read = readableImageSlots(initial || {}),
        incoming = read.slots;
      this.warning = read.errors.length
        ? "Some image state entries are invalid; valid images remain available."
        : "";
      for (const [id, edit] of this.changes) {
        if (edit.value === null) delete incoming[id];
        else
          incoming[id] = {
            ...edit.value,
            ...(!edit.value.u && incoming[id]?.u ? { u: incoming[id].u } : {}),
          };
        if (edit.value !== null) edit.value = incoming[id];
      }
      this.slots = incoming;
      if (
        this.sessionRequested ||
        document.querySelector('image-slot[editable="session"]')
      )
        this.hydrateSession();
      try {
        const retained = localStorage.getItem(this.storageKey + ":draft");
        this.retained = retained ? imageSlots(JSON.parse(retained)) : null;
      } catch {}
    } catch (error) {
      this.error = error.message;
    }
    this.loaded = true;
    this.notify();
    if (this.changes.size && !this.error) void this.flush();
    return this;
  }
  get(id) {
    return Object.hasOwn(this.slots, id) ? this.slots[id] : null;
  }
  enableSession() {
    this.sessionRequested = true;
    if (this.loaded && this.hydrateSession()) this.notify();
  }
  hydrateSession() {
    if (this.source || this.sessionHydrated) return false;
    this.sessionHydrated = true;
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) Object.assign(this.slots, imageSlots(JSON.parse(saved)));
      for (const [id, edit] of this.changes) {
        if (edit.value === null) delete this.slots[id];
        else this.slots[id] = edit.value;
      }
    } catch {}
    return true;
  }
  set(id, value, session = false) {
    if (!id) return;
    const previous = this.changes.get(id),
      next = value === null ? null : imageValue(value);
    if (next === null) delete this.slots[id];
    else this.slots[id] = next;
    this.changes.set(id, {
      id,
      value: next,
      revision: (previous?.revision || 0) + 1,
    });
    if (!this.source && session) {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.slots));
        this.sessionStatus = "Saved in this browser.";
      } catch {
        this.sessionStatus =
          "Storage unavailable; changes remain in this page.";
      }
      if (this.loaded) this.changes.delete(id);
    }
    this.checkpoint();
    this.notify();
    if (this.loaded && this.source && !this.error) void this.flush();
  }
  checkpoint() {
    try {
      if ((this.source || this.endpoint) && this.changes.size)
        localStorage.setItem(
          this.storageKey + ":draft",
          JSON.stringify(this.slots),
        );
      else if (this.source || this.endpoint)
        localStorage.removeItem(this.storageKey + ":draft");
    } catch {}
  }
  async flush() {
    if (!this.loaded) return this.ready;
    if (this.saving) return this.pending;
    if (!this.source || this.error || !this.changes.size) return false;
    const edits = [],
      encoder = new TextEncoder();
    let bytes = encoder.encode(
      JSON.stringify({ version: this.version, edits: [] }),
    ).length;
    for (const edit of this.changes.values()) {
      const size =
        encoder.encode(JSON.stringify({ id: edit.id, value: edit.value }))
          .length + 1;
      if (
        edits.length &&
        (edits.length === 100 || bytes + size > 30 * 1024 * 1024)
      )
        break;
      edits.push(edit);
      bytes += size;
    }
    this.saving = true;
    this.notify();
    this.pending = (async () => {
      try {
        const body = JSON.stringify({
          version: this.version,
          edits: edits.map(({ id, value }) => ({ id, value })),
        });
        const response = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Codex-Images-Token": this.token,
          },
          body,
          signal: AbortSignal.timeout(15000),
          keepalive:
            this.leaving === true &&
            new TextEncoder().encode(body).length < 60000,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Image save failed.");
        this.version = data.version;
        for (const edit of edits)
          if (this.changes.get(edit.id)?.revision === edit.revision)
            this.changes.delete(edit.id);
        const saved = readableImageSlots(data.slots).slots;
        for (const [id, edit] of this.changes)
          if (edit.value === null) delete saved[id];
          else saved[id] = edit.value;
        this.slots = saved;
        return true;
      } catch (error) {
        this.error =
          error.name === "TimeoutError"
            ? "Image save outcome is unknown. Download the current state and inspect the saved file."
            : error.message;
        return false;
      } finally {
        this.saving = false;
        this.checkpoint();
        this.notify();
        if (this.changes.size && !this.error)
          queueMicrotask(() => this.flush());
      }
    })();
    return this.pending;
  }
  async settled() {
    await this.ready;
    await this.flush();
    while (this.source && this.changes.size && !this.error) await this.flush();
    return !this.error;
  }
  clone(from, isFree) {
    if (!this.loaded || !from) return null;
    const value = this.get(from),
      stem = from.replace(/-\d+$/, "") || from;
    for (let n = 2; n < 100; n++) {
      const id = `${stem}-${n}`;
      if (id === from || (isFree && !isFree(id))) continue;
      const existing = this.get(id);
      if (existing) {
        if (value?.u && JSON.stringify(existing) === JSON.stringify(value))
          return id;
        continue;
      }
      if (value) this.set(id, { ...value }, !this.source);
      return id;
    }
    return null;
  }
  download(retained = false) {
    const blob = new Blob(
        [JSON.stringify(retained ? this.retained : this.slots, null, 2) + "\n"],
        {
          type: "application/json",
        },
      ),
      url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = retained ? "image-slots.draft.json" : IMAGE_STATE_FILE;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export const imageStore = new ImageStore();
