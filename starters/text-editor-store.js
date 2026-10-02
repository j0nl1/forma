import { sessionEntries, resolveRun, setRun } from "./text-editor-dom.js";
export class TextStore {
  constructor(owner, binding) {
    this.owner = owner;
    this.source = !!binding;
    this.metadata = binding || {
      entries: sessionEntries(),
      version: "session",
      undoDepth: 0,
      redoDepth: 0,
    };
    this.dirty = new Map();
    this.targetElements = new Map();
    this.history = [];
    this.redo = [];
    this.sessionChanges = new Map();
    this.busy = false;
    this.error = "";
    this.storageKey = `codex-text-drafts:${location.pathname}`;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(this.storageKey) || "null",
      );
      this.retained =
        Array.isArray(saved?.drafts) &&
        saved.drafts.length <= 100 &&
        saved.drafts.every(
          (draft) =>
            typeof draft.key === "string" &&
            typeof draft.text === "string" &&
            typeof draft.before === "string",
        )
          ? saved
          : null;
    } catch {
      this.retained = null;
    }
  }
  targets() {
    return this.metadata.entries
      .map((entry) => {
        const target = resolveRun(entry);
        if (
          !target ||
          (this.targetElements.has(entry.key) &&
            this.targetElements.get(entry.key) !== target.element)
        )
          return null;
        const actual = target.node?.data || "",
          draft = this.dirty.get(entry.key);
        if (
          actual !== entry.text &&
          actual !== draft?.text &&
          !(
            this.owner.active?.entry.key === entry.key &&
            this.owner.active.element === target.element &&
            this.owner.inlineMatches()
          )
        )
          return null;
        return target;
      })
      .filter(Boolean);
  }
  edit(target, text) {
    const existing = this.dirty.get(target.entry.key),
      base = existing?.before ?? target.entry.text;
    if (!this.targetElements.has(target.entry.key))
      this.targetElements.set(target.entry.key, target.element);
    this.dirty.set(target.entry.key, {
      key: target.entry.key,
      text,
      before: base,
      revision: (existing?.revision || 0) + 1,
    });
    if (
      !this.owner.invalid &&
      (!this.owner.inline || this.owner.active !== target)
    )
      target.node = setRun(target.element, target.entry.gap, text);
    this.checkpoint();
    this.owner.refresh();
    clearTimeout(this.timer);
    if (!this.owner.composing && !this.error)
      this.timer = setTimeout(() => this.flush(), 250);
  }
  checkpoint() {
    const drafts = this.source
      ? [...this.dirty.values()]
      : [...this.sessionChanges.values(), ...this.dirty.values()];
    try {
      if (drafts.length)
        sessionStorage.setItem(
          this.storageKey,
          JSON.stringify({
            drafts: drafts.map(({ key, text, before }) => ({
              key,
              text,
              before,
            })),
            version: this.metadata.version,
          }),
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
        "X-Codex-Text-Token": this.metadata.token,
      },
      body: JSON.stringify({ version: this.metadata.version, ...payload }),
      signal: AbortSignal.timeout(10000),
      keepalive:
        this.leaving === true && JSON.stringify(payload).length < 60000,
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
      (edit) => edit.text !== edit.before,
    );
    for (const edit of edits) {
      const entry = this.metadata.entries.find(
        (entry) => entry.key === edit.key,
      );
      const target = entry && resolveRun(entry);
      const inline =
        this.owner.inline &&
        this.owner.active?.entry.key === edit.key &&
        this.owner.inlineMatches();
      if (
        !target ||
        target.element !== this.targetElements.get(edit.key) ||
        (inline ? target.element.textContent : target.node?.data || "") !==
          edit.text
      ) {
        this.error =
          "Selected content changed outside the editor. Your draft is retained; reload before saving.";
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
            edits: edits.map(({ key, text }) => ({ key, text })),
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
              text: values.has(entry.key) ? values.get(entry.key) : entry.text,
            })),
            undoDepth: this.history.length,
            redoDepth: 0,
          };
          for (const edit of edits) {
            const old = this.sessionChanges.get(edit.key);
            this.sessionChanges.set(edit.key, {
              ...edit,
              before: old?.before ?? edit.before,
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
        this.error =
          error.name === "TimeoutError"
            ? "Save outcome is unknown. Your draft is retained; reload to inspect the source."
            : error.message;
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
        const from = action === "undo" ? this.history : this.redo,
          to = action === "undo" ? this.redo : this.history,
          edits = from.pop();
        if (!edits) return;
        to.push(edits);
        const values = new Map(
          edits.map((edit) => [
            edit.key,
            action === "undo" ? edit.before : edit.text,
          ]),
        );
        this.metadata = {
          ...before,
          entries: before.entries.map((entry) => ({
            ...entry,
            text: values.has(entry.key) ? values.get(entry.key) : entry.text,
          })),
          undoDepth: this.history.length,
          redoDepth: this.redo.length,
        };
        for (const [key, text] of values) {
          const entry = this.sessionChanges.get(key);
          if (entry) this.sessionChanges.set(key, { ...entry, text });
        }
      }
      const old = new Map(before.entries.map((entry) => [entry.key, entry]));
      for (const entry of this.metadata.entries) {
        const target = resolveRun(entry);
        if (
          target &&
          (target.node?.data || "") === old.get(entry.key)?.text &&
          entry.text !== old.get(entry.key)?.text
        )
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
    const drafts = this.dirty.size
      ? [...this.dirty.values()]
      : this.retained?.drafts || [...this.sessionChanges.values()];
    return drafts.map((draft) => `${draft.key}\n${draft.text}`).join("\n\n");
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
}
