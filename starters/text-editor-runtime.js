import { TextStore } from "./text-editor-store.js";
import { editorStyle } from "./text-editor-style.js";
import { pointedText, setRun } from "./text-editor-dom.js";
export class TextEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML =
      `<style>${editorStyle}</style><aside class="panel" aria-label="Text editor"><div class="toolbar"><button class="mode" aria-pressed="false">Edit text</button><button class="undo">Undo</button><button class="redo">Redo</button></div><p class="status" role="status"></p><div class="field" hidden><label for="selected">Selected text</label><textarea id="selected" spellcheck="true"></textarea><div class="actions"><button class="done">Done</button><button class="cancel">Cancel edit</button></div></div><div class="recovery" hidden><div class="actions"><button class="copy">Copy draft</button><button class="reload">Reload source</button></div></div><div class="retained" hidden><label for="draft">Retained draft — review before applying</label><textarea id="draft" readonly></textarea><button class="preserved" hidden>Draft preserved — reload</button></div></aside><div class="outline" hidden></div>`;
    this.ui = Object.fromEntries(
      [
        "mode",
        "undo",
        "redo",
        "status",
        "field",
        "done",
        "cancel",
        "copy",
        "reload",
        "recovery",
        "retained",
        "outline",
        "preserved",
      ].map((name) => [name, this.shadowRoot.querySelector(`.${name}`)]),
    );
    this.ui.selected = this.shadowRoot.querySelector("#selected");
    this.ui.draft = this.shadowRoot.querySelector("#draft");
    this.enabled = false;
    this.notice = "";
  }
  connectedCallback() {
    if (this.controller) return;
    this.controller = new AbortController();
    const on = (target, type, listener, options = {}) =>
      target.addEventListener(type, listener, {
        ...options,
        signal: this.controller.signal,
      });
    let binding = null;
    const element = document.getElementById("codex-text-binding");
    if (element) binding = JSON.parse(element.textContent);
    this.store ||= new TextStore(this, binding);
    this.hidden = new URL(location.href).searchParams.has("capture");
    on(this.ui.mode, "click", () => {
      this.finish();
      this.enabled = !this.enabled;
      this.notice = "";
      this.refresh();
    });
    for (const action of ["undo", "redo"])
      on(this.ui[action], "click", async () => {
        this.finish();
        await this.flush();
        await this.store.moveHistory(action);
        this.refresh();
      });
    on(this.ui.done, "click", () => this.finish());
    on(this.ui.cancel, "click", () => this.finish(true));
    on(this.ui.selected, "input", () => {
      if (!this.active) return;
      this.normalizeInline();
      this.store.edit(this.active, this.ui.selected.value);
      this.position(this.active.element);
    });
    on(this.ui.selected, "compositionstart", () => {
      this.composing = true;
    });
    on(this.ui.selected, "compositionend", () => {
      this.composing = false;
      if (this.active) this.store.edit(this.active, this.ui.selected.value);
    });
    on(this.ui.copy, "click", () => this.store.copyDraft());
    on(this.ui.reload, "click", () => {
      this.store.checkpoint();
      if (
        this.store.dirty.size &&
        !this.store.storageAvailable &&
        this.store.copiedDraft !== this.store.draftText()
      ) {
        this.notice =
          "Browser draft storage is unavailable. Copy your draft before reloading.";
        this.showDraft(this.store.draftText());
        this.refresh();
        return;
      }
      location.reload();
    });
    on(this.ui.preserved, "click", () => location.reload());
    on(document, "click", (event) => this.pick(event), { capture: true });
    on(document, "keydown", (event) => {
      if (event.key === "Escape" && this.active && !this.composing) {
        event.preventDefault();
        this.finish(true);
      }
    });
    on(document, "input", (event) => {
      if (this.inline && event.target === this.active?.element) {
        const text = this.active.element.textContent;
        this.rememberInline();
        this.ui.selected.value = text;
        this.store.edit(this.active, text);
      }
    });
    on(document, "compositionstart", (event) => {
      if (event.target === this.active?.element) this.composing = true;
    });
    on(document, "compositionend", (event) => {
      if (event.target === this.active?.element) {
        this.composing = false;
        this.rememberInline();
        this.store.edit(this.active, this.active.element.textContent);
      }
    });
    on(document, "keydown", (event) => {
      if (
        this.inline &&
        event.target === this.active?.element &&
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.isComposing &&
        !this.composing
      ) {
        event.preventDefault();
        this.finish();
      }
    });
    on(window, "resize", () => this.position(this.active?.element));
    on(document, "scroll", () => this.position(this.active?.element), {
      capture: true,
    });
    on(window, "pagehide", () => {
      this.normalizeInline();
      this.store.leaving = true;
      this.store.checkpoint();
      void this.store.flush();
    });
    if (this.store.retained) this.showDraft(this.store.draftText());
    this.refresh();
  }
  disconnectedCallback() {
    this.normalizeInline();
    this.controller?.abort();
    this.controller = null;
    clearTimeout(this.store?.timer);
    if (this.store) {
      this.store.checkpoint();
      void this.store.flush();
    }
  }
  pick(event) {
    if (
      !this.enabled ||
      event.composedPath().includes(this) ||
      !(event.target instanceof Element)
    )
      return;
    const pointed = pointedText(event),
      targets = this.store.targets();
    let target = targets.find((target) => pointed && target.node === pointed);
    if (!target)
      target = targets.find(
        (target) =>
          target.element === event.target &&
          !target.element.childElementCount &&
          target.entry.text.trim(),
      );
    if (!target)
      target = targets.find(
        (target) =>
          target.element === event.target && !target.element.childElementCount,
      );
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!target) {
      this.notice = this.store.source
        ? "This content has no matching literal HTML text. Edit its authoring code in Codex."
        : "This content changed outside the editor. Reload the preview before selecting it.";
      this.refresh();
      return;
    }
    if (this.active?.entry.key === target.entry.key) return;
    this.finish();
    this.active = target;
    this.invalid = false;
    this.baseline = target.node?.data || "";
    this.notice = "";
    this.ui.selected.value = this.baseline;
    const nodes = [...target.element.childNodes];
    this.inline =
      target.element.namespaceURI === "http://www.w3.org/1999/xhtml" &&
      !target.element.childElementCount &&
      nodes.every((node) => node.nodeType === Node.TEXT_NODE);
    if (this.inline) {
      this.inlineState = {
        element: target.element,
        node: target.node,
        attributes: new Map(
          ["contenteditable", "tabindex"].map((name) => [
            name,
            target.element.getAttribute(name),
          ]),
        ),
      };
      this.rememberInline();
      target.element.setAttribute("contenteditable", "plaintext-only");
      target.element.setAttribute("tabindex", "0");
      target.element.focus({ preventScroll: true });
    } else this.ui.selected.focus({ preventScroll: true });
    this.refresh();
    this.position(target.element);
  }
  rememberInline() {
    if (!this.inlineState) return;
    this.inlineState.signature = [...this.inlineState.element.childNodes].map(
      (node) => ({ node, text: node.textContent }),
    );
  }
  inlineMatches() {
    const state = this.inlineState;
    if (!state || !state.element.isConnected) return false;
    const nodes = [...state.element.childNodes];
    return (
      nodes.length === state.signature.length &&
      nodes.every(
        (node, index) =>
          node === state.signature[index].node &&
          node.textContent === state.signature[index].text,
      )
    );
  }
  normalizeInline() {
    if (!this.inlineState) {
      this.inline = false;
      return;
    }
    const { element, node, attributes } = this.inlineState,
      text = element.textContent;
    if (this.inlineMatches()) {
      if (node) {
        node.data = text;
        element.replaceChildren(node);
      } else setRun(element, 0, text);
      if (this.active?.element === element)
        this.active.node = element.firstChild;
    } else {
      this.invalid = true;
      this.store.error =
        "Selected content changed outside the editor. Your draft is retained; reload before saving.";
    }
    for (const [name, value] of attributes)
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    this.inline = false;
    this.inlineState = null;
  }
  finish(cancel = false) {
    if (!this.active) return;
    this.composing = false;
    this.normalizeInline();
    if (cancel) {
      this.store.edit(this.active, this.baseline);
      this.ui.selected.value = this.baseline;
    }
    this.active = null;
    this.refresh();
    void this.store.flush();
  }
  refreshActiveEntry() {
    if (!this.active) return;
    const entry = this.store.metadata.entries.find(
      (entry) => entry.key === this.active.entry.key,
    );
    if (entry) this.active.entry = entry;
  }
  position(element) {
    this.ui.outline.hidden = !element || !element.isConnected || !this.enabled;
    if (this.ui.outline.hidden) return;
    const rect = element.getBoundingClientRect();
    Object.assign(this.ui.outline.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }
  showDraft(text) {
    this.ui.retained.hidden = false;
    this.ui.draft.value = text;
  }
  refresh() {
    if (!this.store) return;
    const { store } = this;
    this.ui.mode.setAttribute("aria-pressed", String(this.enabled));
    this.ui.field.hidden = !this.active;
    this.ui.undo.disabled =
      store.busy || !!store.error || !store.metadata.undoDepth;
    this.ui.redo.disabled =
      store.busy || !!store.error || !store.metadata.redoDepth;
    this.ui.recovery.hidden =
      !store.dirty.size &&
      !store.retained &&
      !store.sessionChanges.size &&
      !store.error;
    this.ui.reload.hidden = !store.source;
    this.ui.preserved.hidden =
      !store.source || store.storageAvailable !== false || !store.dirty.size;
    this.ui.status.dataset.error = String(!!store.error);
    const status =
      store.error ||
      (store.source
        ? store.busy
          ? "Saving text…"
          : store.dirty.size
            ? "Unsaved text — draft retained."
            : `Saved to ${store.metadata.filename}.`
        : "Session preview — original HTML is not saved.");
    this.ui.status.textContent = [status, this.notice]
      .filter(Boolean)
      .join(" ");
    this.position(this.active?.element);
  }
  async flush() {
    this.normalizeInline();
    await this.store.flush();
    while (this.store.dirty.size && !this.store.error && !this.composing)
      await this.store.flush();
    return !this.store.error && !this.store.dirty.size;
  }
}
if (!customElements.get("text-editor"))
  customElements.define("text-editor", TextEditor);
if (
  document.getElementById("codex-text-binding") &&
  !document.querySelector("text-editor")
) {
  const editor = document.createElement("text-editor");
  editor.setAttribute("data-codex-injected", "");
  (document.documentElement.hasAttribute("data-codex-plain-canvas")
    ? document.documentElement
    : document.body
  ).append(editor);
}
