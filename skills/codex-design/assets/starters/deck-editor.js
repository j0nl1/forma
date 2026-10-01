import { DeckThumbnails, cleanDeckCopy } from "./deck-thumbnails.js";
import {
  validateDeckOperation,
  moveDeckItems,
  editDeckNotes,
} from "./deck-operations.js";
const styles = `
.layout{height:calc(100% - var(--toolbar-height,58px))}.toolbar{height:auto;min-height:58px}.rail{overflow-y:auto;overscroll-behavior:contain}.rail[data-user-hidden]{display:none}.thumb{display:flex;gap:8px;margin:10px 0;align-items:flex-start;cursor:pointer;outline:none;position:relative}.num{width:20px;flex:none;text-align:right;padding-top:5px;color:#a5afbf;font-size:12px}.frame{flex:1;min-width:0;border:2px solid #4c5564;border-radius:5px;position:relative;overflow:hidden;background:white}.frame>div{position:absolute;inset:0}.thumb[aria-current=true] .frame,.thumb[data-selected] .frame{border-color:#8bacff}.thumb:focus-visible .frame{outline:2px solid white;outline-offset:2px}.thumb[data-skipped]{opacity:.4}.thumb[data-dragging]{opacity:.5;pointer-events:none}.thumb[data-drop=before]::before,.thumb[data-drop=after]::after{content:"";position:absolute;left:25px;right:0;height:3px;background:#8bacff}.thumb[data-drop=before]::before{top:-5px}.thumb[data-drop=after]::after{bottom:-5px}.rail-resize{width:6px;flex:none;cursor:col-resize;touch-action:none}.rail-resize:hover,.rail-resize[data-dragging]{background:#8bacff66}:host([no-rail]) .rail-resize,:host([noscale]) .rail-resize,:host([data-fullscreen]) .rail-resize,:host([data-presenting]) .rail-resize,.rail[data-user-hidden]+.rail-resize{display:none}.deck-menu{position:fixed;z-index:1000;background:#252e3a;border:1px solid #687482;padding:5px;border-radius:8px;min-width:175px;box-shadow:0 8px 28px #0006}.deck-menu button{display:block;width:100%;text-align:left;border:0}.deck-menu button:hover{background:#344766}.deck-menu button:disabled{opacity:.4;cursor:default}.deck-confirm{background:#252e3a;color:white;border:1px solid #687482;border-radius:12px;padding:24px;max-width:calc(100vw - 64px)}.deck-confirm::backdrop{background:#0009}.deck-confirm footer{display:flex;gap:12px;justify-content:flex-end}.deck-confirm .danger{background:#a1273c}.deck-status{font-size:11px;color:#b7c1cf;max-width:220px}:host([data-fullscreen]) .deck-status,:host([data-presenting]) .deck-status{display:none}@media(max-width:640px){.rail-resize{display:none}.deck-status{max-width:140px}}@media print{.layout{height:auto}.rail-resize,.deck-menu,.deck-confirm,.deck-status{display:none!important}}`;
const fresh = (prefix) =>
  `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
export class DeckEditor {
  constructor(deck) {
    this.deck = deck;
    this.root = deck.shadowRoot;
    this.selection = new Set();
    this.history = [];
    this.busy = false;
    this.stale = false;
    this.controller = new AbortController();
    const options = { signal: this.controller.signal };
    const style = document.createElement("style");
    style.textContent = styles;
    this.root.append(style);
    this.style = style;
    this.rail = this.root.querySelector(".rail");
    this.rail.replaceChildren();
    this.rail.setAttribute("role", "listbox");
    this.rail.setAttribute("aria-multiselectable", "true");
    this.resize = document.createElement("div");
    this.resize.className = "rail-resize";
    this.resize.tabIndex = 0;
    this.resize.setAttribute("role", "separator");
    this.resize.setAttribute("aria-label", "Resize slide rail");
    this.resize.setAttribute("aria-orientation", "vertical");
    this.rail.after(this.resize);
    this.status = document.createElement("span");
    this.status.className = "deck-status";
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-label", "Deck editor status");
    this.root.querySelector(".toolbar").append(this.status);
    this.menu = document.createElement("div");
    this.menu.className = "deck-menu";
    this.menu.setAttribute("role", "menu");
    this.menu.hidden = true;
    this.root.append(this.menu);
    this.dialog = document.createElement("dialog");
    this.dialog.className = "deck-confirm";
    this.dialog.setAttribute("aria-labelledby", "deck-delete-title");
    this.dialog.innerHTML =
      '<h2 id="deck-delete-title"></h2><p>These slides will be removed from the deck.</p><footer><button data-cancel>Cancel</button><button class="danger">Delete</button></footer>';
    this.root.append(this.dialog);
    this.dialog
      .querySelector("[data-cancel]")
      .addEventListener("click", () => this.closeConfirm(), options);
    this.dialog.querySelector(".danger").addEventListener(
      "click",
      async () => {
        const slides = this.confirmSlides ?? [];
        const indices = slides.map((slide) => this.deck.slides.indexOf(slide));
        if (indices.some((index) => index < 0)) {
          this.notice("The selected slides changed; select them again");
          this.closeConfirm();
          return;
        }
        this.dialog.close();
        await this.run({ type: "remove", indices });
        this.focusCurrent();
      },
      options,
    );
    this.dialog.addEventListener(
      "cancel",
      () => queueMicrotask(() => this.focusCurrent()),
      options,
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!event.composedPath().includes(this.menu)) this.menu.hidden = true;
      },
      options,
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          if (!this.menu.hidden || this.selection.size) {
            event.preventDefault();
            event.stopPropagation();
          }
          this.menu.hidden = true;
          this.clearSelection();
        }
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "z" &&
          !event.shiftKey &&
          event.composedPath().includes(deck) &&
          !event
            .composedPath()
            .some(
              (node) =>
                node.isContentEditable ||
                node.matches?.("input,textarea,select"),
            )
        ) {
          event.preventDefault();
          this.undo();
        }
      },
      { ...options, capture: true },
    );
    this.storageKey = `codex-design-deck-rail:${location.pathname}:${deck.id || [...document.querySelectorAll("deck-stage")].indexOf(deck)}`;
    try {
      const preferences = JSON.parse(localStorage.getItem(this.storageKey));
      this.setWidth(preferences?.width ?? 188);
      this.rail.toggleAttribute(
        "data-user-hidden",
        preferences?.hidden === true,
      );
    } catch {
      this.setWidth(188);
    }
    this.resize.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        this.resize.setPointerCapture(event.pointerId);
        this.resize.setAttribute("data-dragging", "");
        this.dragWidth = { x: event.clientX, width: this.railWidth };
      },
      options,
    );
    this.resize.addEventListener(
      "pointermove",
      (event) => {
        if (this.dragWidth)
          this.setWidth(
            this.dragWidth.width + event.clientX - this.dragWidth.x,
          );
      },
      options,
    );
    for (const name of ["pointerup", "pointercancel"])
      this.resize.addEventListener(
        name,
        () => {
          this.dragWidth = null;
          this.resize.removeAttribute("data-dragging");
          this.savePreferences();
        },
        options,
      );
    this.resize.addEventListener(
      "keydown",
      (event) => {
        if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          this.setWidth(
            this.railWidth + (event.key === "ArrowRight" ? 10 : -10),
          );
          this.savePreferences();
        }
      },
      options,
    );
    deck.addEventListener(
      "codex-deck-updating",
      (event) => {
        this.updating = event.detail?.updating === true;
      },
      options,
    );
    this.thumbnails = new DeckThumbnails(deck, this.rail, (entry) =>
      this.bindEntry(entry),
    );
    this.sourceReady = this.connectSource();
  }
  notice(message) {
    this.status.textContent = message;
  }
  setWidth(value) {
    this.railWidth = Math.max(
      120,
      Math.min(360, Math.round(Number(value) || 188)),
    );
    this.deck.style.setProperty("--rail-width", `${this.railWidth}px`);
    this.resize.setAttribute("aria-valuenow", this.railWidth);
    this.resize.setAttribute("aria-valuemin", "120");
    this.resize.setAttribute("aria-valuemax", "360");
    this.deck.fit();
    this.thumbnails?.scale();
  }
  savePreferences() {
    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({
          width: this.railWidth,
          hidden: this.rail.hasAttribute("data-user-hidden"),
        }),
      );
    } catch {}
  }
  toggleRail() {
    this.rail.toggleAttribute("data-user-hidden");
    this.savePreferences();
    this.deck.fit();
  }
  clearSelection() {
    this.selection.clear();
    this.anchor = this.deck.slides[this.deck.index];
    this.thumbnails?.sync();
  }
  reconcile() {
    for (const slide of this.selection)
      if (!this.deck.slides.includes(slide)) this.selection.delete(slide);
    this.thumbnails.reconcile();
  }
  selected(fallback = this.deck.index) {
    const selected = this.deck.slides.filter((slide) =>
      this.selection.has(slide),
    );
    return selected.length
      ? selected
      : [this.deck.slides[fallback]].filter(Boolean);
  }
  bindEntry(entry) {
    const options = { signal: this.controller.signal },
      thumb = entry.thumb;
    thumb.addEventListener(
      "click",
      (event) => {
        thumb.focus({ preventScroll: true });
        if (event.shiftKey) {
          const anchor = Math.max(
            0,
            this.deck.slides.indexOf(
              this.anchor ?? this.deck.slides[this.deck.index],
            ),
          );
          this.selection = new Set(
            this.deck.slides.slice(
              Math.min(anchor, entry.index),
              Math.max(anchor, entry.index) + 1,
            ),
          );
        } else if (event.ctrlKey || event.metaKey) {
          if (!this.selection.size && entry.index !== this.deck.index)
            this.selection.add(this.deck.slides[this.deck.index]);
          if (this.selection.has(entry.slide))
            this.selection.delete(entry.slide);
          else {
            this.selection.add(entry.slide);
            this.anchor = entry.slide;
          }
        } else {
          this.clearSelection();
          this.anchor = entry.slide;
          this.deck.goTo(entry.index, "click");
        }
        this.thumbnails.sync();
      },
      options,
    );
    thumb.addEventListener(
      "keydown",
      (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (["ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          this.clearSelection();
          this.deck.goTo(
            Math.max(
              0,
              Math.min(
                this.deck.length - 1,
                entry.index + (event.key === "ArrowDown" ? 1 : -1),
              ),
            ),
            "keyboard",
          );
          this.focusCurrent();
        } else if (["Delete", "Backspace"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          this.confirm(this.selected(entry.index));
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          thumb.click();
        } else if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
          const bounds = thumb.getBoundingClientRect();
          this.openMenu(entry, bounds.right, bounds.top);
        }
      },
      options,
    );
    thumb.addEventListener(
      "contextmenu",
      (event) => {
        event.preventDefault();
        this.openMenu(entry, event.clientX, event.clientY);
      },
      options,
    );
    thumb.draggable = true;
    thumb.addEventListener(
      "dragstart",
      (event) => {
        if (this.busy || this.updating || this.stale) {
          event.preventDefault();
          return;
        }
        this.clearSelection();
        this.drag = { entry, y: event.clientY };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(entry.index));
        const blank = document.createElement("canvas");
        blank.width = blank.height = 1;
        event.dataTransfer.setDragImage(blank, 0, 0);
        this.dragFrame = requestAnimationFrame(() => {
          if (this.drag?.entry === entry)
            thumb.setAttribute("data-dragging", "");
        });
      },
      options,
    );
    thumb.addEventListener(
      "drag",
      (event) => {
        if (this.drag?.entry === entry && event.clientY)
          thumb.style.transform = `translateY(${event.clientY - this.drag.y}px)`;
      },
      options,
    );
    thumb.addEventListener("dragend", () => this.clearDrag(), options);
    thumb.addEventListener(
      "dragover",
      (event) => {
        if (!this.drag) return;
        event.preventDefault();
        this.clearDrop();
        event.dataTransfer.dropEffect = "move";
        thumb.dataset.drop =
          event.clientY <
          thumb.getBoundingClientRect().top + thumb.offsetHeight / 2
            ? "before"
            : "after";
        const bounds = this.rail.getBoundingClientRect();
        if (event.clientY < bounds.top + 35) this.rail.scrollTop -= 15;
        else if (event.clientY > bounds.bottom - 35) this.rail.scrollTop += 15;
      },
      options,
    );
    thumb.addEventListener(
      "drop",
      (event) => {
        if (!this.drag) return;
        event.preventDefault();
        const from = this.drag.entry.index;
        let to =
          entry.index +
          (event.clientY >=
          thumb.getBoundingClientRect().top + thumb.offsetHeight / 2
            ? 1
            : 0);
        if (from < to) to--;
        this.clearDrag();
        if (from !== to) this.run({ type: "move", from, to });
      },
      options,
    );
  }
  clearDrop() {
    for (const entry of this.thumbnails.entries.values())
      entry.thumb.removeAttribute("data-drop");
  }
  clearDrag() {
    cancelAnimationFrame(this.dragFrame);
    if (this.drag) {
      this.drag.entry.thumb.style.transform = "";
      this.drag.entry.thumb.removeAttribute("data-dragging");
    }
    this.drag = null;
    this.clearDrop();
  }
  openMenu(entry, x, y) {
    if (this.selection.size && !this.selection.has(entry.slide)) {
      this.selection = new Set([entry.slide]);
      this.anchor = entry.slide;
      this.thumbnails.sync();
    }
    const selected = this.selected(entry.index);
    this.menu.replaceChildren();
    const add = (text, action, disabled = false) => {
      const button = document.createElement("button");
      button.textContent = text;
      button.disabled = disabled || this.busy || this.stale;
      button.setAttribute("role", "menuitem");
      button.onclick = () => {
        this.menu.hidden = true;
        action();
      };
      this.menu.append(button);
    };
    if (selected.length <= 1) {
      add(
        entry.slide.hasAttribute("data-deck-skip")
          ? "Unskip slide"
          : "Skip slide",
        () =>
          this.run({
            type: "skip",
            index: entry.index,
            value: !entry.slide.hasAttribute("data-deck-skip"),
          }),
      );
      add(
        "Move up",
        () =>
          this.run({ type: "move", from: entry.index, to: entry.index - 1 }),
        entry.index === 0,
      );
      add(
        "Move down",
        () =>
          this.run({ type: "move", from: entry.index, to: entry.index + 1 }),
        entry.index === this.deck.length - 1,
      );
      add("Duplicate slide", () => this.duplicate(entry.index));
    }
    add(
      selected.length > 1 ? `Delete ${selected.length} slides` : "Delete slide",
      () => this.confirm(selected),
      selected.length >= this.deck.length,
    );
    this.menu.hidden = false;
    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;
    const bounds = this.menu.getBoundingClientRect();
    this.menu.style.left = `${Math.max(4, Math.min(x, innerWidth - bounds.width - 4))}px`;
    this.menu.style.top = `${Math.max(4, Math.min(y, innerHeight - bounds.height - 4))}px`;
    this.menu
      .querySelector("button:not(:disabled)")
      ?.focus({ preventScroll: true });
  }
  confirm(slides) {
    if (this.busy || this.stale || this.updating) {
      this.notice("The deck is being updated; try again when it finishes");
      return;
    }
    if (slides.length >= this.deck.length) {
      this.notice("At least one slide must stay in the deck");
      return;
    }
    this.confirmSlides = [...slides];
    this.dialog.querySelector("h2").textContent =
      slides.length > 1
        ? `Delete ${slides.length} slides?`
        : `Delete ${slides[0].hasAttribute("data-deck-skip") ? "skipped slide" : "slide " + (this.deck.slides.filter((slide) => !slide.hasAttribute("data-deck-skip")).indexOf(slides[0]) + 1)}?`;
    this.dialog.showModal();
    this.dialog.querySelector(".danger").focus();
  }
  closeConfirm() {
    this.dialog.close();
    this.confirmSlides = null;
    this.focusCurrent();
  }
  focusCurrent() {
    const active = this.root.activeElement;
    if (
      document.activeElement !== this.deck &&
      ![document.body, null].includes(document.activeElement)
    )
      return;
    if (
      active &&
      !this.rail.contains(active) &&
      !this.menu.contains(active) &&
      !this.dialog.contains(active)
    )
      return;
    const entry = this.thumbnails.entries.get(
      this.deck.slides[this.deck.index],
    );
    if (entry && this.rail.getBoundingClientRect().width) {
      entry.thumb.scrollIntoView({ block: "nearest" });
      entry.thumb.focus({ preventScroll: true });
    }
  }
  async connectSource() {
    const endpoint = document.querySelector(
      'meta[name="codex-deck-source"]',
    )?.content;
    if (!endpoint || document.querySelector("deck-stage") !== this.deck) {
      this.notice("Edits stay in this preview");
      return;
    }
    try {
      if (new URL(endpoint, location.href).origin !== location.origin)
        throw new Error("Deck source must use the preview origin");
      const response = await fetch(endpoint);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.count !== this.deck.length)
        throw new Error("Source slide count differs from the rendered deck");
      this.source = { endpoint, ...data };
      this.notice("Source editing connected");
    } catch (error) {
      this.stale = true;
      this.notice(error.message);
    }
  }
  async save(operation) {
    if (!this.source) return;
    const response = await fetch(this.source.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Codex-Deck-Token": this.source.token,
      },
      body: JSON.stringify({
        version: this.source.version,
        count: this.deck.length,
        operation,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 409) this.stale = true;
      throw new Error(data.error || "Deck save failed");
    }
    this.source = { ...this.source, ...data };
  }
  snapshot() {
    return {
      slides: [...this.deck.slides],
      skipped: this.deck.slides.map((slide) =>
        slide.hasAttribute("data-deck-skip"),
      ),
      active: this.deck.slides[this.deck.index],
      notes: document.getElementById("speaker-notes")?.textContent,
    };
  }
  restore(snapshot) {
    for (const slide of this.deck.slides)
      if (!snapshot.slides.includes(slide)) slide.remove();
    snapshot.slides.forEach((slide, index) => {
      slide.toggleAttribute("data-deck-skip", snapshot.skipped[index]);
      this.deck.append(slide);
    });
    const notes = document.getElementById("speaker-notes");
    if (notes && snapshot.notes !== undefined)
      notes.textContent = snapshot.notes;
    return snapshot.active;
  }
  async run(input, copy) {
    if (this.busy) return false;
    this.busy = true;
    try {
      await this.sourceReady;
      if (this.stale)
        throw new Error("Deck source changed; reload before editing");
      if (this.updating)
        throw new Error(
          "The deck is being updated; try again when it finishes",
        );
      const operation = validateDeckOperation(input, this.deck.length),
        snapshot = this.snapshot();
      if (operation.type === "move" && operation.from === operation.to)
        return false;
      await this.save(operation);
      this.deck.buildPlayer.clear();
      let active = snapshot.active;
      if (operation.type === "undo") {
        const last = this.history.pop();
        if (!last) {
          if (this.source) {
            location.reload();
            return true;
          }
          throw new Error("No deck edit to undo");
        }
        active = this.restore(last);
      } else {
        this.history.push(snapshot);
        if (this.history.length > 100) this.history.shift();
        if (operation.type === "move")
          for (const slide of moveDeckItems(
            snapshot.slides,
            operation.from,
            operation.to,
          ))
            this.deck.append(slide);
        if (operation.type === "skip")
          snapshot.slides[operation.index].toggleAttribute(
            "data-deck-skip",
            operation.value,
          );
        if (operation.type === "duplicate") {
          snapshot.slides[operation.index].after(copy);
          active = copy;
        }
        if (operation.type === "remove") {
          const deleted = new Set(
            operation.indices.map((index) => snapshot.slides[index]),
          );
          if (deleted.has(active))
            active =
              snapshot.slides
                .slice(this.deck.index + 1)
                .find((slide) => !deleted.has(slide)) ??
              snapshot.slides
                .slice(0, this.deck.index)
                .reverse()
                .find((slide) => !deleted.has(slide));
          for (const slide of deleted) slide.remove();
        }
        const notes = document.getElementById("speaker-notes");
        if (notes && operation.type !== "skip")
          try {
            const values = JSON.parse(notes.textContent);
            if (
              Array.isArray(values) &&
              values.every((value) => typeof value === "string")
            ) {
              while (values.length < snapshot.slides.length) values.push("");
              notes.textContent = JSON.stringify(
                editDeckNotes(values, operation),
              );
            }
          } catch {}
      }
      this.clearSelection();
      this.deck.collect();
      this.deck.show(
        Math.max(0, this.deck.slides.indexOf(active)),
        true,
        "mutation",
      );
      this.deck.fit();
      this.deck.dispatchEvent(
        new CustomEvent("codex-deck-edit", {
          detail: { operation, persisted: !!this.source },
          bubbles: true,
          composed: true,
        }),
      );
      this.notice(
        this.source ? "Saved to HTML source" : "Changed in this preview",
      );
      this.focusCurrent();
      return true;
    } catch (error) {
      this.notice(error.message);
      return false;
    } finally {
      this.busy = false;
    }
  }
  async duplicate(index) {
    if (this.busy || this.updating || this.stale) return;
    const original = this.deck.slides[index];
    if (!original) return;
    const copy = cleanDeckCopy(original.cloneNode(true)),
      ids = Object.create(null),
      storageKeys = Object.create(null),
      used = new Set(),
      storageCopies = [];
    for (const node of [copy, ...copy.querySelectorAll("*")]) {
      if (node.id) {
        const old = node.id,
          component = customElements.get(node.localName);
        let next;
        const free = (value) =>
          /^[A-Za-z][\w-]{0,63}$/.test(value) &&
          !document.getElementById(value) &&
          !used.has(value);
        try {
          if (node !== copy && typeof component?.cloneSlot === "function")
            next = component.cloneSlot(old, free);
        } catch {}
        if (typeof next === "string" && free(next)) {
          node.id = next;
          ids[old] = next;
          used.add(next);
        } else node.removeAttribute("id");
      }
      const key = node.getAttribute("storage-key");
      if (
        key &&
        typeof customElements.get(node.localName)?.cloneStorageKey ===
          "function"
      ) {
        const next = storageKeys[key] ?? fresh("image");
        storageKeys[key] = next;
        node.setAttribute("storage-key", next);
        storageCopies.push({
          node,
          component: customElements.get(node.localName),
          from: key,
          to: next,
        });
      }
    }
    const success = await this.run(
      { type: "duplicate", index, ids, storageKeys },
      copy,
    );
    if (success)
      for (const { node, component, from, to } of storageCopies) {
        try {
          component.cloneStorageKey(from, to);
        } catch {
          this.notice(
            "The slide was duplicated, but its stored component state could not be copied",
          );
        }
        // The connected clone may have loaded before the source state's key was copied.
        node.reloadStoredImage?.();
      }
  }
  async undo() {
    await this.sourceReady;
    if (this.history.length || this.source?.undoDepth)
      return this.run({ type: "undo" });
    this.notice("No deck edit to undo");
  }
  dispose() {
    this.controller.abort();
    this.thumbnails.dispose();
    this.clearDrag();
    this.dialog.close();
    for (const node of [
      this.style,
      this.resize,
      this.status,
      this.menu,
      this.dialog,
    ])
      node.remove();
  }
}
