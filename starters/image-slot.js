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

  // skills/studio-design/assets/starters/image-model.js
  function imageValue(value) {
    if (typeof value === "string") value = { u: value };
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid image slot value.");
    if (Object.keys(value).some((key) => !["u", "s", "x", "y", "alt"].includes(key)))
      throw new Error("Unknown image slot field.");
    if (value.u !== void 0 && (typeof value.u !== "string" || !/^data:image\/[a-z\d.+-]+[;,]/i.test(value.u) || value.u.includes("\0")))
      throw new Error("Stored images must use image data URLs.");
    for (const key of ["s", "x", "y"])
      if (value[key] !== void 0 && !Number.isFinite(value[key]))
        throw new Error("Image framing must use finite numbers.");
    if (value.alt !== void 0 && typeof value.alt !== "string")
      throw new Error("Image alt text must be a string.");
    return {
      ...value.u ? { u: value.u } : {},
      s: clamp(value.s ?? 1, 1, 5),
      x: value.x ?? 0,
      y: value.y ?? 0,
      ...value.alt !== void 0 ? { alt: value.alt } : {}
    };
  }
  function imageSlots(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Image state must be an object keyed by slot id.");
    const result = /* @__PURE__ */ Object.create(null);
    for (const [id, entry] of Object.entries(value)) {
      if (!id || id.length > 256 || id.includes("\0"))
        throw new Error("Invalid image slot id.");
      result[id] = imageValue(entry);
    }
    return result;
  }
  function readableImageSlots(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Image state must be an object keyed by slot id.");
    const slots = /* @__PURE__ */ Object.create(null), errors = [];
    for (const [id, entry] of Object.entries(value)) {
      try {
        Object.assign(slots, imageSlots({ [id]: entry }));
      } catch {
        errors.push(id);
      }
    }
    return { slots, errors };
  }
  function framing(iw, ih, fw, fh, fit, view) {
    if (![iw, ih, fw, fh].every((value) => Number.isFinite(value) && value > 0))
      return null;
    const base = fit === "contain" ? Math.min(fw / iw, fh / ih) : Math.max(fw / iw, fh / ih);
    const s = clamp(view.s ?? 1, 1, 5), width = iw * base * s, height = ih * base * s;
    const mx = Math.max(0, (width / fw - 1) * 50), my = Math.max(0, (height / fh - 1) * 50);
    const x = clamp(view.x ?? 0, -mx, mx), y = clamp(view.y ?? 0, -my, my);
    return { s, x, y, width, height, mx, my, base, fw, fh };
  }
  function zoomAt(view, factor, cursor) {
    const s = clamp(view.s * factor, 1, 5), ratio = s / view.s;
    return {
      s,
      x: cursor.x + (view.x - cursor.x) * ratio,
      y: cursor.y + (view.y - cursor.y) * ratio
    };
  }
  function resizeCorner(start, point) {
    const sx = start.corner.includes("e") ? 1 : -1, sy = start.corner.includes("s") ? 1 : -1;
    const anchor = {
      x: start.cx - sx * start.width / 2,
      y: start.cy - sy * start.height / 2
    };
    const diagonal = Math.hypot(start.width, start.height), unit = {
      x: sx * start.width / diagonal,
      y: sy * start.height / diagonal
    };
    const projection = (point.x - anchor.x) * unit.x + (point.y - anchor.y) * unit.y;
    const s = clamp(start.s * projection / diagonal, 1, 5), length = diagonal * s / start.s;
    return {
      s,
      x: (anchor.x + unit.x * length / 2) / start.fw * 100 - 50,
      y: (anchor.y + unit.y * length / 2) / start.fh * 100 - 50
    };
  }
  var IMAGE_STATE_FILE, IMAGE_TYPES, imageTypeAllowed, clamp;
  var init_image_model = __esm({
    "skills/studio-design/assets/starters/image-model.js"() {
      IMAGE_STATE_FILE = "image-slots.state.json";
      IMAGE_TYPES = [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/avif"
      ];
      imageTypeAllowed = (type, legacy = false) => IMAGE_TYPES.includes(type) || legacy && type === "image/gif";
      clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    }
  });

  // skills/studio-design/assets/starters/image-store.js
  var ImageStore, imageStore;
  var init_image_store = __esm({
    "skills/studio-design/assets/starters/image-store.js"() {
      init_image_model();
      ImageStore = class {
        constructor() {
          this.slots = /* @__PURE__ */ Object.create(null);
          this.changes = /* @__PURE__ */ new Map();
          this.listeners = /* @__PURE__ */ new Set();
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
              'meta[name="codex-images-source"]'
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
                  new URL(IMAGE_STATE_FILE, document.baseURI)
                );
                initial = response.ok ? await response.json() : {};
              }
            }
            const read = readableImageSlots(initial || {}), incoming = read.slots;
            this.warning = read.errors.length ? "Some image state entries are invalid; valid images remain available." : "";
            for (const [id, edit] of this.changes) {
              if (edit.value === null) delete incoming[id];
              else
                incoming[id] = {
                  ...edit.value,
                  ...!edit.value.u && incoming[id]?.u ? { u: incoming[id].u } : {}
                };
              if (edit.value !== null) edit.value = incoming[id];
            }
            this.slots = incoming;
            if (this.sessionRequested || document.querySelector('image-slot[editable="session"]'))
              this.hydrateSession();
            try {
              const retained = localStorage.getItem(this.storageKey + ":draft");
              this.retained = retained ? imageSlots(JSON.parse(retained)) : null;
            } catch {
            }
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
          } catch {
          }
          return true;
        }
        set(id, value, session = false) {
          if (!id) return;
          const previous = this.changes.get(id), next = value === null ? null : imageValue(value);
          if (next === null) delete this.slots[id];
          else this.slots[id] = next;
          this.changes.set(id, {
            id,
            value: next,
            revision: (previous?.revision || 0) + 1
          });
          if (!this.source && session) {
            try {
              localStorage.setItem(this.storageKey, JSON.stringify(this.slots));
              this.sessionStatus = "Saved in this browser.";
            } catch {
              this.sessionStatus = "Storage unavailable; changes remain in this page.";
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
                JSON.stringify(this.slots)
              );
            else if (this.source || this.endpoint)
              localStorage.removeItem(this.storageKey + ":draft");
          } catch {
          }
        }
        async flush() {
          if (!this.loaded) return this.ready;
          if (this.saving) return this.pending;
          if (!this.source || this.error || !this.changes.size) return false;
          const edits = [], encoder = new TextEncoder();
          let bytes = encoder.encode(
            JSON.stringify({ version: this.version, edits: [] })
          ).length;
          for (const edit of this.changes.values()) {
            const size = encoder.encode(JSON.stringify({ id: edit.id, value: edit.value })).length + 1;
            if (edits.length && (edits.length === 100 || bytes + size > 30 * 1024 * 1024))
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
                edits: edits.map(({ id, value }) => ({ id, value }))
              });
              const response = await fetch(this.endpoint, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Codex-Images-Token": this.token
                },
                body,
                signal: AbortSignal.timeout(15e3),
                keepalive: this.leaving === true && new TextEncoder().encode(body).length < 6e4
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
              this.error = error.name === "TimeoutError" ? "Image save outcome is unknown. Download the current state and inspect the saved file." : error.message;
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
          const value = this.get(from), stem = from.replace(/-\d+$/, "") || from;
          for (let n = 2; n < 100; n++) {
            const id = `${stem}-${n}`;
            if (id === from || isFree && !isFree(id)) continue;
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
              type: "application/json"
            }
          ), url = URL.createObjectURL(blob), anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = retained ? "image-slots.draft.json" : IMAGE_STATE_FILE;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1e3);
        }
      };
      imageStore = new ImageStore();
    }
  });

  // skills/studio-design/assets/starters/image-style.js
  var imageStyle;
  var init_image_style = __esm({
    "skills/studio-design/assets/starters/image-style.js"() {
      imageStyle = `
:host{display:block;position:relative;width:100%;height:100%;aspect-ratio:3/2;color:inherit;font:13px/1.4 system-ui}
.frame{position:absolute;inset:0;overflow:hidden;background:#7f7f7f14}
.photo{position:absolute;max-width:none;transform:translate(-50%,-50%);user-select:none;-webkit-user-drag:none;touch-action:none}
.empty,.attribution{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:6px;padding:14px;text-align:center;box-sizing:border-box;color:inherit}
.empty{cursor:pointer}.empty .symbol{font-size:24px;opacity:.5}.empty .caption,.empty .browse{opacity:.75}.browse{font-size:11px;text-decoration:underline;text-underline-offset:2px}
.attribution{background:#f2f1ef;color:#6e6c66}.ring{position:absolute;inset:0;box-sizing:border-box;border:1.5px dashed currentColor;opacity:.35;pointer-events:none}
:host([data-filled]) .ring{display:none}:host([data-over]) .frame{outline:2px solid #315f52;outline-offset:-2px}:host([data-over]) .ring{opacity:1}
.loading{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}.loading::after{content:"";width:22px;height:22px;border:2px solid #7f7f7f40;border-top-color:currentColor;border-radius:50%;animation:codex-image-spin .7s linear infinite}
@keyframes codex-image-spin{to{transform:rotate(360deg)}}:host([data-swapping]) .photo{visibility:hidden}
.toolbar{position:absolute;inset:auto;top:8px;right:8px;margin:0;padding:0;border:0;background:transparent;display:flex;gap:6px;opacity:0;pointer-events:none;z-index:2;overflow:visible}
:host([data-editable]:hover) .toolbar,:host([data-editable]:focus-within) .toolbar,:host([data-reframe]) .toolbar{opacity:1;pointer-events:auto}
.toolbar:popover-open{position:fixed;inset:auto;transform:translateX(-100%)}
button{font:11px/1.2 system-ui;border:0;border-radius:6px;padding:6px 10px;color:white;background:#162d25dd;cursor:pointer;white-space:nowrap}
button:disabled{opacity:.4;cursor:default}button:focus-visible,.empty:focus-visible,input:focus-visible{outline:2px solid #315f52;outline-offset:2px}
.credit{position:absolute;left:6px;bottom:6px;max-width:calc(100% - 12px);font:10px/1.3 system-ui;padding:3px 7px;border-radius:5px;background:#0009;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:1}
.credit a{color:inherit;text-decoration:none}.credit a:hover,.credit a:focus-visible{text-decoration:underline}
.status{position:absolute;left:8px;top:44px;right:8px;padding:5px 7px;margin:0;border-radius:5px;background:#fffef2ed;color:#263b34;font-size:11px;z-index:3}.status[data-error=true]{color:#942e2e}.status:empty{display:none}.status .download{margin-left:6px}
.spill{position:fixed;inset:auto;margin:0;padding:0;border:0;background:transparent;transform:translate(-50%,-50%);overflow:visible;cursor:grab;touch-action:none;z-index:2147482000}
.ghost{position:absolute;inset:0;width:100%;height:100%;opacity:.35;pointer-events:none;box-shadow:0 0 0 1px #0004,0 12px 32px #0003}
.handle{position:absolute;width:12px;height:12px;background:white;border-radius:50%;box-shadow:0 0 0 1.5px #315f52;transform:translate(-50%,-50%);touch-action:none}
.handle[data-c=nw]{left:0;top:0;cursor:nwse-resize}.handle[data-c=ne]{left:100%;top:0;cursor:nesw-resize}.handle[data-c=sw]{left:0;top:100%;cursor:nesw-resize}.handle[data-c=se]{left:100%;top:100%;cursor:nwse-resize}
:host([data-reframe]) .frame{box-shadow:0 0 0 2px #315f52}.legacy{display:grid;gap:8px;padding:12px;background:white;color:#263b34}.legacy label{display:flex;align-items:center;gap:8px}.legacy input{min-width:0;max-width:100%}
:host([storage-key]){height:auto;aspect-ratio:auto}:host([storage-key]) .frame{position:relative;aspect-ratio:16/9}:host([storage-key]) .status{position:static}:host([storage-key]) .toolbar{position:relative;top:auto;right:auto;opacity:1;pointer-events:auto;padding:8px}
[hidden]{display:none!important}
:host-context([data-codex-exporting]) .toolbar,:host-context([data-codex-exporting]) .credit,:host-context([data-codex-exporting]) .status,:host-context([data-codex-exporting]) .legacy,:host-context([data-codex-exporting]) .spill,:host-context([data-codex-exporting]) .loading{display:none!important}
@media print{.toolbar,.credit,.status,.legacy,.spill,.loading{display:none!important}:host([data-swapping]) .photo{visibility:visible}}
@media(prefers-reduced-motion:reduce){.loading::after{animation:none}}
`;
    }
  });

  // skills/studio-design/assets/starters/image-credit.js
  function unsplash(url, base) {
    try {
      return /(^|\.)unsplash\.com$/.test(
        new URL(url, base).hostname.replace(/\.$/, "")
      );
    } catch {
      return false;
    }
  }
  function creditUrl(value, base) {
    try {
      const url = new URL(value, base);
      if (!["http:", "https:"].includes(url.protocol)) return "";
      if (unsplash(url.href, base)) {
        if (!url.searchParams.has("utm_source"))
          url.searchParams.set("utm_source", "studio_design");
        if (!url.searchParams.has("utm_medium"))
          url.searchParams.set("utm_medium", "referral");
      }
      return url.href;
    } catch {
      return "";
    }
  }
  function renderCredit(element, text, href) {
    element.replaceChildren();
    const link = (label, url2) => {
      const node = document.createElement("a");
      node.textContent = label;
      node.href = url2;
      node.target = "_blank";
      node.rel = "noopener noreferrer";
      return node;
    };
    const url = href ? creditUrl(href, document.baseURI) : "", parts = /^Photo by (.+) on Unsplash$/.exec(text);
    if (parts)
      element.append(
        "Photo by ",
        url ? link(parts[1], url) : parts[1],
        " on ",
        link("Unsplash", creditUrl("https://unsplash.com/", document.baseURI))
      );
    else element.append(url ? link(text, url) : text);
  }
  var init_image_credit = __esm({
    "skills/studio-design/assets/starters/image-credit.js"() {
    }
  });

  // skills/studio-design/assets/starters/image-media.js
  async function encodeImage(file, renderedWidth, legacy = false) {
    if (!imageTypeAllowed(file?.type, legacy))
      throw new Error("Choose a PNG, JPEG, WebP, or AVIF image.");
    if (legacy && file.type === "image/gif") {
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read that image."));
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = url;
      await image.decode();
      return url;
    }
    const bitmap = await createImageBitmap(file);
    try {
      const cap = Math.min(
        1200,
        Math.max(1, Math.round((renderedWidth || 1200) * 2))
      ), scale = Math.min(1, cap / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image encoding is unavailable.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/webp", 0.85);
    } finally {
      bitmap.close?.();
    }
  }
  var init_image_media = __esm({
    "skills/studio-design/assets/starters/image-media.js"() {
      init_image_model();
    }
  });

  // skills/studio-design/assets/starters/image-reframe.js
  var active, ImageReframe;
  var init_image_reframe = __esm({
    "skills/studio-design/assets/starters/image-reframe.js"() {
      init_image_model();
      active = null;
      ImageReframe = class {
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
          const on = (target, type, listener, options = {}) => target.addEventListener(type, listener, {
            ...options,
            signal: this.controller.signal
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
            { passive: false }
          );
          on(slot, "wheel", (event) => this.wheel(event), { passive: false });
          on(
            document,
            "pointerdown",
            (event) => {
              if (!event.composedPath().includes(slot) && !event.composedPath().includes(this.portal))
                this.exit(true);
            },
            { capture: true }
          );
          on(document, "keydown", (event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              this.exit(true);
              return;
            }
            if (!event.composedPath().includes(slot) && !event.composedPath().includes(this.portal))
              return;
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
              event.preventDefault();
              const step = event.shiftKey ? 10 : 1;
              slot.view.x += event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
              slot.view.y += event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
              slot.applyView();
            } else if (["+", "=", "-"].includes(event.key)) {
              event.preventDefault();
              slot.view = zoomAt(slot.view, event.key === "-" ? 0.9 : 1.1, {
                x: 0,
                y: 0
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
          const slot = this.slot, portal = document.createElement("div");
          portal.dataset.codexImageEditor = "";
          Object.assign(portal.style, {
            position: "fixed",
            inset: "0",
            pointerEvents: "none",
            zIndex: "2147483000"
          });
          const root = portal.attachShadow({ mode: "open" }), style = document.createElement("style");
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
          const slot = this.slot, rect = slot.ui.frame.getBoundingClientRect(), geometry = slot.geometry();
          if (!geometry) return;
          const corner = event.target.dataset.c, initial = { ...slot.view }, width = geometry.width * rect.width / geometry.fw, height = geometry.height * rect.height / geometry.fh;
          const start = {
            corner,
            s: initial.s,
            width,
            height,
            fw: rect.width,
            fh: rect.height,
            cx: (50 + initial.x) / 100 * rect.width,
            cy: (50 + initial.y) / 100 * rect.height
          };
          const move = (next) => {
            if (next.pointerId !== event.pointerId) return;
            slot.view = corner ? resizeCorner(start, {
              x: next.clientX - rect.left,
              y: next.clientY - rect.top
            }) : {
              ...initial,
              x: initial.x + (next.clientX - event.clientX) / rect.width * 100,
              y: initial.y + (next.clientY - event.clientY) / rect.height * 100
            };
            slot.applyView();
          };
          const spill = slot.ui.spill;
          spill.setPointerCapture(event.pointerId);
          const end = (next) => {
            if (next && next.pointerId !== event.pointerId) return;
            try {
              spill.releasePointerCapture(event.pointerId);
            } catch {
            }
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
          const slot = this.slot, rect = slot.ui.frame.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
          slot.view = zoomAt(slot.view, Math.exp(-delta * 15e-4), {
            x: (event.clientX - rect.left) / rect.width * 100 - 50,
            y: (event.clientY - rect.top) / rect.height * 100 - 50
          });
          slot.applyView();
        }
        position(geometry) {
          const slot = this.slot, rect = slot.ui.frame.getBoundingClientRect();
          Object.assign(slot.ui.spill.style, {
            width: `${geometry.width * rect.width / geometry.fw}px`,
            height: `${geometry.height * rect.height / geometry.fh}px`,
            left: `${rect.left + (50 + slot.view.x) / 100 * rect.width}px`,
            top: `${rect.top + (50 + slot.view.y) / 100 * rect.height}px`
          });
          Object.assign(slot.ui.toolbar.style, {
            left: `${rect.right - 8}px`,
            top: `${rect.top + 8}px`,
            right: "auto"
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
          } catch {
          }
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
            "zIndex"
          ])
            slot.ui.toolbar.style[key] = "";
          slot.removeAttribute("data-reframe");
          if (commit) slot.saveView();
          if (active === this) active = null;
          this.signal(false);
        }
        signal(active2) {
          const slot = this.slot;
          (slot.isConnected ? slot : document).dispatchEvent(
            new CustomEvent("image-slot:reframe", {
              bubbles: true,
              composed: true,
              detail: { active: active2, id: slot.id || null }
            })
          );
        }
      };
    }
  });

  // skills/studio-design/assets/starters/image-legacy.js
  function readLegacy(key) {
    try {
      const value = JSON.parse(localStorage.getItem(legacyKey(key)) || "null");
      if (!value || typeof value.src !== "string" || value.src && !/^data:image\//i.test(value.src))
        return null;
      return {
        u: value.src || void 0,
        s: Number.isFinite(value.s) ? value.s : 1,
        x: Number.isFinite(value.panX) ? value.panX : 0,
        y: Number.isFinite(value.panY) ? value.panY : 0,
        alt: typeof value.alt === "string" ? value.alt : "",
        ...value.panX === void 0 ? {
          position: {
            x: Number.isFinite(value.x) ? value.x : 50,
            y: Number.isFinite(value.y) ? value.y : 50
          }
        } : {}
      };
    } catch {
      return null;
    }
  }
  function saveLegacy(key, value, position) {
    try {
      localStorage.setItem(
        legacyKey(key),
        JSON.stringify({
          src: value.u || "",
          alt: value.alt || "",
          x: position.x,
          y: position.y,
          s: value.s,
          panX: value.x,
          panY: value.y
        })
      );
      return "Saved in this browser.";
    } catch {
      return "Storage unavailable; changes remain in this page.";
    }
  }
  function cloneLegacy(from, to) {
    try {
      const value = localStorage.getItem(legacyKey(from));
      if (value) localStorage.setItem(legacyKey(to), value);
    } catch {
    }
  }
  var legacyKey;
  var init_image_legacy = __esm({
    "skills/studio-design/assets/starters/image-legacy.js"() {
      legacyKey = (key) => `codex-design-image:${key}`;
    }
  });

  // skills/studio-design/assets/starters/image-runtime.js
  var image_runtime_exports = {};
  __export(image_runtime_exports, {
    ImageSlot: () => ImageSlot,
    imageStore: () => imageStore
  });
  var ImageSlot;
  var init_image_runtime = __esm({
    "skills/studio-design/assets/starters/image-runtime.js"() {
      init_image_store();
      init_image_style();
      init_image_model();
      init_image_credit();
      init_image_media();
      init_image_reframe();
      init_image_legacy();
      ImageSlot = class extends HTMLElement {
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
          "editable"
        ];
        static cloneSlot(from, isFree) {
          return imageStore.clone(from, isFree);
        }
        static cloneStorageKey(from, to) {
          cloneLegacy(from, to);
        }
        constructor() {
          super();
          const root = this.shadowRoot || this.attachShadow({ mode: "open", clonable: true });
          root.innerHTML = `<style>${imageStyle}</style><div class="frame" part="frame"><img class="photo" part="image" draggable="false" hidden><div class="empty" part="empty" role="button" tabindex="0"><span class="symbol" aria-hidden="true">\u25A7</span><span class="caption"></span><span class="browse">or browse files</span></div><div class="attribution" part="attribution-error" hidden>This photo needs attribution</div><div class="ring" part="ring"></div><div class="loading" part="loading" aria-label="Loading image" hidden></div></div><span class="credit" part="credit" hidden></span><div class="toolbar" popover="manual" data-codex-edit-transparent><button class="replace" title="Replace image">Replace</button><button class="edit" title="Reframe image">Edit</button><button class="clear" title="Reset image">Reset image</button></div><div class="spill" popover="manual" hidden data-codex-edit-transparent><img class="ghost" draggable="false" alt=""><span class="handle" role="button" tabindex="0" aria-label="Resize image northwest" data-c="nw"></span><span class="handle" role="button" tabindex="0" aria-label="Resize image northeast" data-c="ne"></span><span class="handle" role="button" tabindex="0" aria-label="Resize image southwest" data-c="sw"></span><span class="handle" role="button" tabindex="0" aria-label="Resize image southeast" data-c="se"></span></div><input class="file" type="file" aria-label="Choose local image" hidden><form class="legacy" hidden><label>Alt text <input class="alt" data-alt></label><label>Horizontal crop <input class="crop-x" data-x type="range" min="0" max="100" value="50"></label><label>Vertical crop <input class="crop-y" data-y type="range" min="0" max="100" value="50"></label></form><p class="status" role="status"><span class="message"></span><button class="download" hidden>Download image state</button><button class="retained" hidden>Download retained draft</button></p>`;
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
              "retained"
            ].map((name) => [name, root.querySelector(`.${name}`)])
          );
          this.store = imageStore;
          for (const name of [
            "toolbar",
            "credit",
            "status",
            "legacy",
            "spill",
            "loading",
            "file"
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
              detail: { id: this.id || null }
            });
            if (this.dispatchEvent(event)) this.openFilePicker();
          });
          on(
            this.ui.edit,
            "click",
            () => this.crop.controller ? this.crop.exit(true) : this.crop.enter()
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
          on(
            this.ui.alt,
            "input",
            () => this.setRecord(
              {
                ...this.record(),
                ...this.view,
                alt: this.ui.alt.value
              },
              true
            )
          );
          for (const axis of ["x", "y"])
            on(this.ui[`crop-${axis}`], "input", () => {
              const geometry = this.geometry();
              if (geometry)
                this.view[axis] = (50 - Number(this.ui[`crop-${axis}`].value)) * geometry[axis === "x" ? "mx" : "my"] / 50;
              this.saveView();
            });
        }
        get legacy() {
          return this.hasAttribute("storage-key");
        }
        get editable() {
          return !new URL(location.href).searchParams.has("capture") && (this.legacy || this.getAttribute("editable") === "session" || this.store.source || !!this.store.endpoint);
        }
        set editable(value) {
          if (value === null || value === void 0 || value === false)
            this.removeAttribute("editable");
          else this.setAttribute("editable", String(value));
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
          return this.legacy ? this.legacyState || {} : this.id ? this.store.get(this.id) || {} : this.local || {};
        }
        connectedCallback() {
          if (this.connected) return;
          this.connected = true;
          if (this.getAttribute("editable") === "session") this.store.enableSession();
          this.controller = new AbortController();
          const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, {
            ...options,
            signal: this.controller.signal
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
            u: value.src || void 0,
            alt: value.alt,
            s: this.view.s,
            x: this.view.x,
            y: this.view.y
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
          if (!imageTypeAllowed(file?.type, this.legacy)) {
            this.error = "Choose a PNG, JPEG, WebP, or AVIF image.";
            this.render();
            return false;
          }
          const generation = ++this.generation;
          this.error = "";
          this.encoding = true;
          this.encodingSwap = this.filled;
          this.render();
          try {
            const url = await encodeImage(
              file,
              this.ui.frame.clientWidth,
              this.legacy
            );
            if (generation !== this.generation) return false;
            this.crop.exit(false);
            this.encoding = false;
            this.setRecord({
              u: url,
              s: 1,
              x: 0,
              y: 0,
              alt: this.record().alt ?? this.getAttribute("alt") ?? ""
            });
            return true;
          } catch (error) {
            if (generation !== this.generation) return false;
            this.encoding = false;
            this.error = error.message.includes("Choose") ? error.message : "Could not read that image. The previous image is retained.";
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
            } catch {
            }
            this.notice = "Image reset.";
          } else if (this.id)
            this.store.set(
              this.id,
              null,
              this.getAttribute("editable") === "session"
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
              this.getAttribute("editable") === "session"
            );
          else {
            this.local = { ...value };
            this.notice = "Session only \u2014 use a unique id to retain the image.";
          }
          this.render();
        }
        persistLegacy() {
          this.notice = saveLegacy(
            this.getAttribute("storage-key"),
            this.legacyState,
            this.position()
          );
        }
        position() {
          const geometry = this.geometry();
          return {
            x: geometry?.mx ? 50 - this.view.x / geometry.mx * 50 : 50,
            y: geometry?.my ? 50 - this.view.y / geometry.my * 50 : 50
          };
        }
        saveView() {
          const previous = this.record();
          this.setRecord({
            ...previous,
            s: this.view.s,
            x: this.view.x,
            y: this.view.y
          });
        }
        geometry() {
          return framing(
            this.ui.photo.naturalWidth,
            this.ui.photo.naturalHeight,
            this.ui.frame.clientWidth,
            this.ui.frame.clientHeight,
            this.getAttribute("fit") === "contain" ? "contain" : "cover",
            this.view
          );
        }
        applyView() {
          const geometry = this.geometry();
          if (!geometry) return;
          this.view = { s: geometry.s, x: geometry.x, y: geometry.y };
          Object.assign(this.ui.photo.style, {
            width: `${geometry.width / geometry.fw * 100}%`,
            height: `${geometry.height / geometry.fh * 100}%`,
            left: `${50 + geometry.x}%`,
            top: `${50 + geometry.y}%`,
            objectFit: ""
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
          const ui = this.ui, record = this.record(), source = record.u || this.getAttribute("src") || "", credit = (this.getAttribute("credit") || "").trim();
          const blocked = !!(source && !record.u && unsplash(source, document.baseURI) && !credit);
          this.toggleAttribute("data-attribution-error", blocked);
          this.toggleAttribute("data-editable", this.editable);
          this.toggleAttribute("data-filled", !!source && !blocked);
          const mask = this.getAttribute("mask") || "", shape = (this.getAttribute("shape") || "rounded").toLowerCase(), rawRadius = parseFloat(this.getAttribute("radius")), radius = shape === "circle" ? "50%" : shape === "pill" ? "9999px" : shape === "rounded" ? `${Number.isFinite(rawRadius) ? Math.max(0, rawRadius) : 12}px` : "0";
          ui.frame.style.borderRadius = mask ? "" : radius;
          ui.frame.style.clipPath = mask;
          ui.ring.style.borderRadius = mask ? "" : radius;
          ui.ring.hidden = !!mask;
          ui.caption.textContent = this.getAttribute("placeholder") || "Drop an image";
          ui.browse.hidden = !this.editable;
          ui.empty.tabIndex = this.editable ? 0 : -1;
          ui.empty.setAttribute("aria-disabled", String(!this.editable));
          ui.file.accept = [
            ...IMAGE_TYPES,
            ...this.legacy ? ["image/gif"] : []
          ].join(",");
          ui.file.hidden = !this.legacy;
          ui.legacy.hidden = !this.legacy;
          for (const name of ["replace", "edit", "clear"])
            ui[name].disabled = !this.editable || name === "edit" && !this.filled;
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
                this.view.x = (50 - record.position.x) * geometry.mx / 50;
                this.view.y = (50 - record.position.y) * geometry.my / 50;
              }
            }
            Object.assign(
              ui.photo.style,
              this.geometry() ? {} : {
                width: "100%",
                height: "100%",
                left: "50%",
                top: "50%",
                objectFit: this.getAttribute("fit") === "contain" ? "contain" : "cover"
              }
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
          const swapping = !!(this.loading && this.swapNeeded || this.encoding && this.encodingSwap);
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
            y: position.y
          };
          ui.alt.value = this._value.alt;
          ui["crop-x"].value = position.x;
          ui["crop-y"].value = position.y;
          const error = this.error || (!this.legacy ? this.store.error || this.store.warning : "");
          ui.status.dataset.error = String(!!error);
          ui.status.setAttribute(
            "part",
            !error && !this.notice && !this.store.retained && !this.store.sessionStatus && !this.store.saving && !this.store.source && this.getAttribute("editable") === "session" ? "status status-session" : "status"
          );
          ui.message.textContent = error || this.notice || (!this.legacy ? this.store.saving ? "Saving image state\u2026" : this.store.source ? "" : this.getAttribute("editable") === "session" ? this.store.sessionStatus || "Session preview \u2014 source image state is not saved." : "" : "");
          ui.download.hidden = !this.store.error || this.legacy;
          ui.retained.hidden = !this.store.retained || this.legacy;
          if (this.store.retained && !error && !this.legacy)
            ui.message.textContent = "A previous image draft is available for review.";
          ui.status.hidden = !ui.message.textContent && ui.download.hidden && ui.retained.hidden;
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
      };
      if (!customElements.get("image-slot"))
        customElements.define("image-slot", ImageSlot);
    }
  });

  // skills/studio-design/assets/starters/image-slot.js
  window.CodexImagesReady = Promise.resolve().then(() => (init_image_runtime(), image_runtime_exports)).then(
    async ({ imageStore: imageStore2 }) => {
      await imageStore2.ready;
      await Promise.all(
        [...document.querySelectorAll("image-slot")].map(
          (slot) => slot.settled?.()
        )
      );
    }
  );
})();
