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

  // skills/studio-design/assets/starters/text-editor-model.js
  function textKey(selector, gap) {
    return `${selector}@${gap}`;
  }
  var blockedTextTags, leafTextTags;
  var init_text_editor_model = __esm({
    "skills/studio-design/assets/starters/text-editor-model.js"() {
      blockedTextTags = /* @__PURE__ */ new Set([
        "script",
        "style",
        "template",
        "noscript",
        "textarea",
        "select",
        "option",
        "input",
        "iframe",
        "object",
        "embed",
        "canvas",
        "text-editor"
      ]);
      leafTextTags = /* @__PURE__ */ new Set([
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "span",
        "a",
        "b",
        "strong",
        "i",
        "em",
        "u",
        "s",
        "code",
        "pre",
        "small",
        "mark",
        "q",
        "cite",
        "abbr",
        "label",
        "button",
        "li",
        "dt",
        "dd",
        "td",
        "th",
        "figcaption",
        "blockquote",
        "summary",
        "text",
        "tspan"
      ]);
    }
  });

  // skills/studio-design/assets/starters/text-editor-dom.js
  function selectorFor(element) {
    const parts = [];
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const tag = node.localName;
      const peers = [...node.parentElement.children].filter(
        (peer) => peer.localName === tag
      );
      parts.unshift(`${tag}:nth-of-type(${peers.indexOf(node) + 1})`);
    }
    return ["body", ...parts].join(">");
  }
  function textAtGap(element, gap) {
    let current = 0;
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (current === gap) return node;
      } else current++;
    }
    return null;
  }
  function setRun(element, gap, text) {
    const current = textAtGap(element, gap);
    if (current) {
      current.data = text;
      return current;
    }
    let index = 0, before = null;
    for (const child of element.childNodes)
      if (child.nodeType !== Node.TEXT_NODE) {
        if (index === gap) {
          before = child;
          break;
        }
        index++;
      }
    const node = document.createTextNode(text);
    element.insertBefore(node, before);
    return node;
  }
  function sessionEntries() {
    const entries = [];
    for (const element of [
      document.body,
      ...document.body.querySelectorAll("*")
    ]) {
      if (element.closest(blocked)) continue;
      let gap = 0, found = false;
      for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.data.trim()) {
            found = true;
            entries.push({
              selector: selectorFor(element),
              gap,
              key: textKey(selectorFor(element), gap),
              text: node.data,
              tag: element.localName
            });
          }
        } else gap++;
      }
      if (!found && !element.childNodes.length && leafTextTags.has(element.localName))
        entries.push({
          selector: selectorFor(element),
          gap: 0,
          key: textKey(selectorFor(element), 0),
          text: "",
          tag: element.localName
        });
    }
    return entries;
  }
  function resolveRun(entry) {
    let elements;
    try {
      elements = document.querySelectorAll(entry.selector);
    } catch {
      return null;
    }
    if (elements.length !== 1) return null;
    const element = elements[0];
    if (element.closest(blocked)) return null;
    const node = textAtGap(element, entry.gap);
    return { entry, element, node };
  }
  function pointedText(event) {
    const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (caret?.offsetNode?.nodeType === Node.TEXT_NODE) return caret.offsetNode;
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    return range?.startContainer?.nodeType === Node.TEXT_NODE ? range.startContainer : null;
  }
  var blocked;
  var init_text_editor_dom = __esm({
    "skills/studio-design/assets/starters/text-editor-dom.js"() {
      init_text_editor_model();
      blocked = [...blockedTextTags, "text-editor"].join(",");
    }
  });

  // skills/studio-design/assets/starters/text-editor-store.js
  var TextStore;
  var init_text_editor_store = __esm({
    "skills/studio-design/assets/starters/text-editor-store.js"() {
      init_text_editor_dom();
      TextStore = class {
        constructor(owner, binding) {
          this.owner = owner;
          this.source = !!binding;
          this.metadata = binding || {
            entries: sessionEntries(),
            version: "session",
            undoDepth: 0,
            redoDepth: 0
          };
          this.dirty = /* @__PURE__ */ new Map();
          this.targetElements = /* @__PURE__ */ new Map();
          this.history = [];
          this.redo = [];
          this.sessionChanges = /* @__PURE__ */ new Map();
          this.busy = false;
          this.error = "";
          this.storageKey = `codex-text-drafts:${location.pathname}`;
          try {
            const saved = JSON.parse(
              sessionStorage.getItem(this.storageKey) || "null"
            );
            this.retained = Array.isArray(saved?.drafts) && saved.drafts.length <= 100 && saved.drafts.every(
              (draft) => typeof draft.key === "string" && typeof draft.text === "string" && typeof draft.before === "string"
            ) ? saved : null;
          } catch {
            this.retained = null;
          }
        }
        targets() {
          return this.metadata.entries.map((entry) => {
            const target = resolveRun(entry);
            if (!target || this.targetElements.has(entry.key) && this.targetElements.get(entry.key) !== target.element)
              return null;
            const actual = target.node?.data || "", draft = this.dirty.get(entry.key);
            if (actual !== entry.text && actual !== draft?.text && !(this.owner.active?.entry.key === entry.key && this.owner.active.element === target.element && this.owner.inlineMatches()))
              return null;
            return target;
          }).filter(Boolean);
        }
        edit(target, text) {
          const existing = this.dirty.get(target.entry.key), base = existing?.before ?? target.entry.text;
          if (!this.targetElements.has(target.entry.key))
            this.targetElements.set(target.entry.key, target.element);
          this.dirty.set(target.entry.key, {
            key: target.entry.key,
            text,
            before: base,
            revision: (existing?.revision || 0) + 1
          });
          if (!this.owner.invalid && (!this.owner.inline || this.owner.active !== target))
            target.node = setRun(target.element, target.entry.gap, text);
          this.checkpoint();
          this.owner.refresh();
          clearTimeout(this.timer);
          if (!this.owner.composing && !this.error)
            this.timer = setTimeout(() => this.flush(), 250);
        }
        checkpoint() {
          const drafts = this.source ? [...this.dirty.values()] : [...this.sessionChanges.values(), ...this.dirty.values()];
          try {
            if (drafts.length)
              sessionStorage.setItem(
                this.storageKey,
                JSON.stringify({
                  drafts: drafts.map(({ key, text, before }) => ({
                    key,
                    text,
                    before
                  })),
                  version: this.metadata.version
                })
              );
            else sessionStorage.removeItem(this.storageKey);
            this.storageAvailable = true;
          } catch {
            this.storageAvailable = false;
          }
        }
        async request(payload) {
          const response = await fetch("/__codex_text", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Codex-Text-Token": this.metadata.token
            },
            body: JSON.stringify({ version: this.metadata.version, ...payload }),
            signal: AbortSignal.timeout(1e4),
            keepalive: this.leaving === true && JSON.stringify(payload).length < 6e4
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Text save failed.");
          return result;
        }
        async flush() {
          clearTimeout(this.timer);
          if (this.owner.inlineState && !this.owner.inlineMatches()) {
            this.owner.normalizeInline();
            this.checkpoint();
            this.owner.refresh();
          }
          if (this.busy) return this.pending;
          if (this.error || this.owner.composing || !this.dirty.size) return false;
          const edits = [...this.dirty.values()].filter(
            (edit) => edit.text !== edit.before
          );
          for (const edit of edits) {
            const entry = this.metadata.entries.find(
              (entry2) => entry2.key === edit.key
            );
            const target = entry && resolveRun(entry);
            const inline = this.owner.inline && this.owner.active?.entry.key === edit.key && this.owner.inlineMatches();
            if (!target || target.element !== this.targetElements.get(edit.key) || (inline ? target.element.textContent : target.node?.data || "") !== edit.text) {
              this.error = "Selected content changed outside the editor. Your draft is retained; reload before saving.";
              this.checkpoint();
              this.owner.refresh();
              return false;
            }
          }
          if (!edits.length) {
            this.dirty.clear();
            this.checkpoint();
            this.owner.refresh();
            return true;
          }
          this.busy = true;
          this.owner.refresh();
          this.pending = (async () => {
            try {
              let metadata;
              if (this.source)
                metadata = await this.request({
                  edits: edits.map(({ key, text }) => ({ key, text }))
                });
              else {
                this.history.push(edits.map((edit) => ({ ...edit })));
                if (this.history.length > 100) this.history.shift();
                this.redo = [];
                const values = new Map(edits.map((edit) => [edit.key, edit.text]));
                metadata = {
                  ...this.metadata,
                  entries: this.metadata.entries.map((entry) => ({
                    ...entry,
                    text: values.has(entry.key) ? values.get(entry.key) : entry.text
                  })),
                  undoDepth: this.history.length,
                  redoDepth: 0
                };
                for (const edit of edits) {
                  const old = this.sessionChanges.get(edit.key);
                  this.sessionChanges.set(edit.key, {
                    ...edit,
                    before: old?.before ?? edit.before
                  });
                }
              }
              for (const edit of edits) {
                const current = this.dirty.get(edit.key);
                if (current?.revision === edit.revision) this.dirty.delete(edit.key);
                else if (current) current.before = edit.text;
              }
              this.metadata = metadata;
              this.owner.refreshActiveEntry();
              return true;
            } catch (error) {
              this.error = error.name === "TimeoutError" ? "Save outcome is unknown. Your draft is retained; reload to inspect the source." : error.message;
              return false;
            } finally {
              this.busy = false;
              this.checkpoint();
              this.owner.refresh();
              if (this.dirty.size && !this.error)
                this.timer = setTimeout(() => this.flush(), 50);
            }
          })();
          return this.pending;
        }
        async moveHistory(action) {
          await this.flush();
          if (this.error || this.dirty.size) return;
          this.busy = true;
          this.owner.refresh();
          try {
            const before = this.metadata;
            if (this.source) this.metadata = await this.request({ action });
            else {
              const from = action === "undo" ? this.history : this.redo, to = action === "undo" ? this.redo : this.history, edits = from.pop();
              if (!edits) return;
              to.push(edits);
              const values = new Map(
                edits.map((edit) => [
                  edit.key,
                  action === "undo" ? edit.before : edit.text
                ])
              );
              this.metadata = {
                ...before,
                entries: before.entries.map((entry) => ({
                  ...entry,
                  text: values.has(entry.key) ? values.get(entry.key) : entry.text
                })),
                undoDepth: this.history.length,
                redoDepth: this.redo.length
              };
              for (const [key, text] of values) {
                const entry = this.sessionChanges.get(key);
                if (entry) this.sessionChanges.set(key, { ...entry, text });
              }
            }
            const old = new Map(before.entries.map((entry) => [entry.key, entry]));
            for (const entry of this.metadata.entries) {
              const target = resolveRun(entry);
              if (target && (target.node?.data || "") === old.get(entry.key)?.text && entry.text !== old.get(entry.key)?.text)
                setRun(target.element, entry.gap, entry.text);
            }
            this.owner.active = null;
          } catch (error) {
            this.error = error.message;
          } finally {
            this.busy = false;
            this.checkpoint();
            this.owner.refresh();
          }
        }
        draftText() {
          const drafts = this.dirty.size ? [...this.dirty.values()] : this.retained?.drafts || [...this.sessionChanges.values()];
          return drafts.map((draft) => `${draft.key}
${draft.text}`).join("\n\n");
        }
        async copyDraft() {
          const text = this.draftText();
          this.owner.showDraft(text);
          try {
            await navigator.clipboard.writeText(text);
            this.copiedDraft = text;
            this.owner.notice = "Draft copied.";
          } catch {
            this.owner.notice = "Select and copy the retained draft below.";
          }
          this.owner.refresh();
        }
      };
    }
  });

  // skills/studio-design/assets/starters/text-editor-style.js
  var editorStyle;
  var init_text_editor_style = __esm({
    "skills/studio-design/assets/starters/text-editor-style.js"() {
      editorStyle = `
:host{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:block;font:13px/1.4 system-ui;color:#263b34}
:host([hidden]){display:none!important}
.panel{width:340px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow:auto;padding:12px;border:1px solid #aebcaf;border-radius:10px;background:#fffdf5;box-shadow:0 5px 24px #172d2526}
.toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.toolbar button{flex:1;white-space:nowrap}
button{border:1px solid #aebcaf;border-radius:5px;background:#fff;color:inherit;padding:7px 9px;font:inherit;cursor:pointer}button:disabled{opacity:.45;cursor:default}
button[aria-pressed=true]{background:#dce8d7}button:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid #315f52;outline-offset:2px}
p{margin:8px 0 0;font-size:12px}.field{margin-top:10px}.field label{display:block;margin-bottom:4px;font-weight:600}
textarea,select{box-sizing:border-box;width:100%;border:1px solid #aebcaf;border-radius:5px;padding:8px;font:13px/1.5 system-ui;background:#fff;color:inherit}textarea{min-height:80px;resize:vertical}.retained textarea{min-height:120px}
.actions{display:flex;gap:6px;margin-top:8px}[hidden]{display:none!important}
.outline{position:fixed;pointer-events:none;box-sizing:border-box;border:2px solid #315f52;border-radius:3px;box-shadow:0 0 0 3px #e4ecd980}
.status[data-error=true]{color:#942e2e}
@media print{:host{display:none!important}}
`;
    }
  });

  // skills/studio-design/assets/starters/text-editor-runtime.js
  var text_editor_runtime_exports = {};
  __export(text_editor_runtime_exports, {
    TextEditor: () => TextEditor
  });
  var TextEditor;
  var init_text_editor_runtime = __esm({
    "skills/studio-design/assets/starters/text-editor-runtime.js"() {
      init_text_editor_store();
      init_text_editor_style();
      init_text_editor_dom();
      TextEditor = class extends HTMLElement {
        constructor() {
          super();
          this.attachShadow({ mode: "open" }).innerHTML = `<style>${editorStyle}</style><aside class="panel" aria-label="Text editor"><div class="toolbar"><button class="mode" aria-pressed="false">Edit text</button><button class="undo">Undo</button><button class="redo">Redo</button></div><p class="status" role="status"></p><div class="field" hidden><label for="selected">Selected text</label><textarea id="selected" spellcheck="true"></textarea><div class="actions"><button class="done">Done</button><button class="cancel">Cancel edit</button></div></div><div class="recovery" hidden><div class="actions"><button class="copy">Copy draft</button><button class="reload">Reload source</button></div></div><div class="retained" hidden><label for="draft">Retained draft \u2014 review before applying</label><textarea id="draft" readonly></textarea><button class="preserved" hidden>Draft preserved \u2014 reload</button></div></aside><div class="outline" hidden></div>`;
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
              "preserved"
            ].map((name) => [name, this.shadowRoot.querySelector(`.${name}`)])
          );
          this.ui.selected = this.shadowRoot.querySelector("#selected");
          this.ui.draft = this.shadowRoot.querySelector("#draft");
          this.enabled = false;
          this.notice = "";
        }
        connectedCallback() {
          if (this.controller) return;
          this.controller = new AbortController();
          const on = (target, type, listener, options = {}) => target.addEventListener(type, listener, {
            ...options,
            signal: this.controller.signal
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
            if (this.store.dirty.size && !this.store.storageAvailable && this.store.copiedDraft !== this.store.draftText()) {
              this.notice = "Browser draft storage is unavailable. Copy your draft before reloading.";
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
            if (this.inline && event.target === this.active?.element && event.key === "Enter" && !event.shiftKey && !event.isComposing && !this.composing) {
              event.preventDefault();
              this.finish();
            }
          });
          on(window, "resize", () => this.position(this.active?.element));
          on(document, "scroll", () => this.position(this.active?.element), {
            capture: true
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
          if (!this.enabled || event.composedPath().includes(this) || !(event.target instanceof Element))
            return;
          const pointed = pointedText(event), targets = this.store.targets();
          let target = targets.find((target2) => pointed && target2.node === pointed);
          if (!target)
            target = targets.find(
              (target2) => target2.element === event.target && !target2.element.childElementCount && target2.entry.text.trim()
            );
          if (!target)
            target = targets.find(
              (target2) => target2.element === event.target && !target2.element.childElementCount
            );
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!target) {
            this.notice = this.store.source ? "This content has no matching literal HTML text. Edit its authoring code in Codex." : "This content changed outside the editor. Reload the preview before selecting it.";
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
          this.inline = target.element.namespaceURI === "http://www.w3.org/1999/xhtml" && !target.element.childElementCount && nodes.every((node) => node.nodeType === Node.TEXT_NODE);
          if (this.inline) {
            this.inlineState = {
              element: target.element,
              node: target.node,
              attributes: new Map(
                ["contenteditable", "tabindex"].map((name) => [
                  name,
                  target.element.getAttribute(name)
                ])
              )
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
            (node) => ({ node, text: node.textContent })
          );
        }
        inlineMatches() {
          const state = this.inlineState;
          if (!state || !state.element.isConnected) return false;
          const nodes = [...state.element.childNodes];
          return nodes.length === state.signature.length && nodes.every(
            (node, index) => node === state.signature[index].node && node.textContent === state.signature[index].text
          );
        }
        normalizeInline() {
          if (!this.inlineState) {
            this.inline = false;
            return;
          }
          const { element, node, attributes } = this.inlineState, text = element.textContent;
          if (this.inlineMatches()) {
            if (node) {
              node.data = text;
              element.replaceChildren(node);
            } else setRun(element, 0, text);
            if (this.active?.element === element)
              this.active.node = element.firstChild;
          } else {
            this.invalid = true;
            this.store.error = "Selected content changed outside the editor. Your draft is retained; reload before saving.";
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
            (entry2) => entry2.key === this.active.entry.key
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
            height: `${rect.height}px`
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
          this.ui.undo.disabled = store.busy || !!store.error || !store.metadata.undoDepth;
          this.ui.redo.disabled = store.busy || !!store.error || !store.metadata.redoDepth;
          this.ui.recovery.hidden = !store.dirty.size && !store.retained && !store.sessionChanges.size && !store.error;
          this.ui.reload.hidden = !store.source;
          this.ui.preserved.hidden = !store.source || store.storageAvailable !== false || !store.dirty.size;
          this.ui.status.dataset.error = String(!!store.error);
          const status = store.error || (store.source ? store.busy ? "Saving text\u2026" : store.dirty.size ? "Unsaved text \u2014 draft retained." : `Saved to ${store.metadata.filename}.` : "Session preview \u2014 original HTML is not saved.");
          this.ui.status.textContent = [status, this.notice].filter(Boolean).join(" ");
          this.position(this.active?.element);
        }
        async flush() {
          this.normalizeInline();
          await this.store.flush();
          while (this.store.dirty.size && !this.store.error && !this.composing)
            await this.store.flush();
          return !this.store.error && !this.store.dirty.size;
        }
      };
      if (!customElements.get("text-editor"))
        customElements.define("text-editor", TextEditor);
      if (document.getElementById("codex-text-binding") && !document.querySelector("text-editor")) {
        const editor = document.createElement("text-editor");
        editor.setAttribute("data-codex-injected", "");
        (document.documentElement.hasAttribute("data-codex-plain-canvas") ? document.documentElement : document.body).append(editor);
      }
    }
  });

  // skills/studio-design/assets/starters/text-editor.js
  window.CodexTextReady = Promise.resolve().then(() => (init_text_editor_runtime(), text_editor_runtime_exports));
})();
