import { boardStyle } from "./social-frames-style.js";
import { frameList, descendants } from "./social-dom.js";
import { frameLabel, frameSelector } from "./social-model.js";
import { downloadFrames } from "./social-frames-export.js";
class SocialFrames extends HTMLElement {
  constructor() {
    super();
    const root =
      this.shadowRoot || this.attachShadow({ mode: "open", clonable: true });
    root.innerHTML = `<style>${boardStyle}</style><div class="layout"><div class="toolbar" data-codex-chrome><button class="all" hidden>↓ Download all (zip)</button><span class="status" role="status" aria-live="polite"></span></div><slot class="units"></slot><div class="labels" data-codex-chrome></div></div>`;
    this.layout = root.querySelector(".layout");
    this.labels = root.querySelector(".labels");
    this.all = root.querySelector(".all");
    this.status = root.querySelector(".status");
    this.records = new Map();
    root
      .querySelector("slot")
      .addEventListener("slotchange", () => this.schedule());
    this.all.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.exportAll().catch(() => {});
    });
  }
  connectedCallback() {
    this.setAttribute("data-codex-multi-frame", "");
    this.controller = new AbortController();
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(this, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    this.resize = new ResizeObserver(() => this.schedule());
    this.observedUnits = new Set();
    this.resize.observe(this.layout);
    window.addEventListener("resize", () => this.schedule(), {
      signal: this.controller.signal,
    });
    this.scan();
  }
  disconnectedCallback() {
    this.controller?.abort();
    this.observer?.disconnect();
    this.resize?.disconnect();
    cancelAnimationFrame(this.scheduled);
    this.scheduled = 0;
  }
  schedule() {
    if (!this.isConnected || this.scheduled) return;
    this.scheduled = requestAnimationFrame(() => {
      this.scheduled = 0;
      this.scan();
    });
  }
  frames() {
    return frameList(this);
  }
  scan() {
    if (!this.isConnected) return;
    const frames = this.frames(),
      units = [...this.children].filter(
        (node) => !node.matches("style,script,template"),
      );
    const live = new Set();
    for (const unit of units) {
      if (!this.observedUnits.has(unit)) {
        this.resize.observe(unit);
        this.observedUnits.add(unit);
      }
      const frame = [unit, ...descendants(unit)].find(
        (node) => node.matches(frameSelector) && frames.includes(node),
      );
      if (!frame) continue;
      live.add(unit);
      let record = this.records.get(unit);
      if (!record) {
        const bar = document.createElement("div");
        bar.className = "label";
        const text = document.createElement("span"),
          dim = document.createElement("span"),
          button = document.createElement("button");
        text.className = "label-text";
        dim.className = "dimensions";
        button.className = "download";
        button.textContent = "↓ PNG";
        button.title = "Download this frame at its nominal pixel size";
        bar.append(text, dim, button);
        this.labels.append(bar);
        record = { bar, text, dim, button, frame };
        this.records.set(unit, record);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.exportFrame(record.frame).catch(() => {});
        });
      }
      record.frame = frame;
      const label = frameLabel(frame),
        split = label.indexOf(" · ");
      record.text.textContent = split < 0 ? label : label.slice(0, split);
      record.dim.textContent = split < 0 ? "" : label.slice(split);
      record.dim.hidden = split < 0;
      record.button.setAttribute("aria-label", `Download ${label} as PNG`);
      record.button.disabled = !!this.exporting;
      const box = unit.getBoundingClientRect(),
        base = this.layout.getBoundingClientRect(),
        scaleX = base.width / this.layout.offsetWidth || 1,
        scaleY = base.height / this.layout.offsetHeight || 1;
      Object.assign(record.bar.style, {
        left: `${(box.left - base.left) / scaleX}px`,
        top: `${(box.top - base.top) / scaleY - 38}px`,
        width: `${box.width / scaleX}px`,
      });
    }
    for (const [unit, record] of this.records)
      if (!live.has(unit)) {
        record.bar.remove();
        this.records.delete(unit);
      }
    for (const unit of this.observedUnits)
      if (!units.includes(unit)) {
        this.resize.unobserve(unit);
        this.observedUnits.delete(unit);
      }
    this.all.hidden = frames.length < 2;
    this.all.disabled = !!this.exporting;
    if (!this.exporting && !this.message)
      this.status.textContent = frames.length
        ? `${frames.length} visible ${frames.length === 1 ? "format" : "formats"}`
        : "No visible formats";
  }
  exportFrame(frame = 0) {
    return this.run(
      typeof frame === "number" ? [this.frames()[frame]] : [frame],
      false,
    );
  }
  exportAll() {
    return this.run(this.frames(), true);
  }
  async run(frames, all) {
    if (this.exporting)
      throw new Error("Wait for the current export to finish.");
    const available = this.frames();
    if (!frames.length || frames.some((frame) => !available.includes(frame)))
      throw new Error("Choose a visible frame owned by this board.");
    this.exporting = true;
    this.removeAttribute("data-export-error");
    this.scan();
    try {
      const result = await downloadFrames(frames, {
        all,
        title: this.getAttribute("label") || "Social assets",
        allowExternal: this.hasAttribute("allow-external-assets"),
        onProgress: (index, total) => {
          this.status.textContent = `Preparing ${index + 1} of ${total} formats…`;
        },
      });
      this.status.textContent = `Downloaded ${result.name}`;
      this.message = true;
      this.dispatchEvent(
        new CustomEvent("social-frames:export", {
          bubbles: true,
          composed: true,
          detail: { name: result.name, frames: result.frames },
        }),
      );
      return result;
    } catch (error) {
      this.setAttribute("data-export-error", "");
      this.status.textContent = error.message;
      this.message = true;
      this.dispatchEvent(
        new CustomEvent("social-frames:error", {
          bubbles: true,
          composed: true,
          detail: { message: error.message },
        }),
      );
      throw error;
    } finally {
      this.exporting = false;
      this.scan();
    }
  }
}
if (!customElements.get("social-frames"))
  customElements.define("social-frames", SocialFrames);
