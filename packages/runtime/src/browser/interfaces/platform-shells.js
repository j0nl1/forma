// Fixed presentation shells preserve authored child nodes through native slots.
(() => {
  const number = (element, name, fallback, min = 1) => {
    const parsed = parseInt(element.getAttribute(name), 10);
    return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
  };
  const enabled = (element, name) =>
    ["", "true"].includes(element?.getAttribute(name));
  const exportAsset = async (shell, kind, target) => {
    target ||=
      shell.querySelector("[data-codex-frame-export]") ||
      shell.firstElementChild;
    if (!target || !shell.contains(target))
      throw new Error("Choose authored content inside this shell.");
    for (const image of target.querySelectorAll("img"))
      if (image.getAttribute("src")) await image.decode();
    for (const slot of [
      target,
      ...target.querySelectorAll("image-slot"),
    ].filter((node) => node.localName === "image-slot"))
      await slot.prepareCapture?.();
    const { exportRegion } = await import("../canvas/canvas-export.js");
    return exportRegion(target, kind, {
      title:
        target.getAttribute("data-codex-frame-label") ||
        shell.getAttribute("label") ||
        "Asset",
    });
  };
  const icons = `<span class="network" aria-label="Network and battery"><svg width="19" height="12" viewBox="0 0 19 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx=".7"/><rect x="5" y="5" width="3" height="7" rx=".7"/><rect x="10" y="3" width="3" height="9" rx=".7"/><rect x="15" y="0" width="3" height="12" rx=".7"/></svg><svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M1 4 Q8.5 -2 16 4 M4 7 Q8.5 3 13 7"/><circle cx="8.5" cy="10" r="1.4" fill="currentColor" stroke="none"/></svg><svg width="26" height="12" viewBox="0 0 26 12" fill="currentColor"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" opacity=".35"/><rect x="2" y="2" width="19" height="8" rx="1.5"/><rect x="24" y="4" width="1.3" height="4" rx=".6" opacity=".5"/></svg></span>`;
  class IOSShell extends HTMLElement {
    exportAsset(kind = "png", target) {
      return exportAsset(this, kind, target);
    }
    static observedAttributes = [
      "dark",
      "width",
      "screen-height",
      "image-only",
      "data-composed-phone",
    ];
    connectedCallback() {
      if (!this.shadowRoot) {
        const root = this.attachShadow({ mode: "open", clonable: true });
        root.innerHTML = `<style>:host{display:block;position:relative;box-sizing:border-box;padding:13px;border-radius:56px;background:#0b0b0e;box-shadow:0 28px 80px #0f0c084d;flex:none}.ios-screen{position:relative;border-radius:43px;overflow:hidden;background:white}.ios-content{position:absolute;inset:0}slot{display:block}.ios-island{position:absolute;top:13px;left:50%;transform:translateX(-50%);width:112px;height:33px;border-radius:20px;background:#0b0b0e;z-index:30;pointer-events:none}.ios-statusbar{position:absolute;inset:0 0 auto;height:54px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 30px 0 34px;z-index:25;font:600 16px/1 system-ui;color:#14130f;pointer-events:none}.network{display:flex;align-items:center;gap:7px}.ios-homebar{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:134px;height:5px;border-radius:3px;background:#00000052;z-index:30;pointer-events:none}:host([dark]) .ios-statusbar{color:white;text-shadow:0 1px 4px #0006}:host([dark]) .ios-homebar{background:#ffffffb3}:host([data-asset-only]){padding:0;border-radius:0;background:transparent;box-shadow:none}:host([data-asset-only]) .ios-screen{border-radius:0}:host([data-asset-only]) [data-codex-chrome]{display:none}</style><div class="ios-screen" part="screen"><div class="ios-content" part="content"><slot></slot></div><div class="ios-island" data-codex-chrome aria-hidden="true"></div><div class="ios-statusbar" data-codex-chrome><span>9:41</span>${icons}</div><div class="ios-homebar" data-codex-chrome aria-hidden="true"></div></div>`;
      }
      this.screen = this.shadowRoot.querySelector(".ios-screen");
      this.content = this.shadowRoot.querySelector(".ios-content");
      if (!this.slotWired) {
        this.shadowRoot
          .querySelector("slot")
          .addEventListener("slotchange", () => this.sync());
        this.slotWired = true;
      }
      this.observer = new ResizeObserver(() => this.sync());
      for (const child of this.children) this.observer.observe(child);
      this.parentObserver = new MutationObserver(() => this.sync());
      if (this.parentElement)
        this.parentObserver.observe(this.parentElement, {
          attributes: true,
          attributeFilter: ["image-only"],
        });
      this.sync();
    }
    disconnectedCallback() {
      this.observer?.disconnect();
      this.parentObserver?.disconnect();
    }
    attributeChangedCallback() {
      if (this.isConnected && this.screen) this.sync();
    }
    sync() {
      if (!this.isConnected || !this.screen) return;
      const outer = number(this, "width", 428, 27),
        height = number(this, "screen-height", 874);
      const composed =
        this.hasAttribute("data-composed-phone") &&
        enabled(this.parentElement, "image-only");
      const asset = enabled(this, "image-only") || composed;
      this.toggleAttribute("data-asset-only", asset);
      const width = asset ? outer - 26 : outer;
      for (const name of ["width", "min-width", "max-width"])
        this.style.setProperty(name, `${width}px`, "important");
      if (asset) {
        this.style.setProperty("height", "auto", "important");
        this.style.setProperty("min-height", "0", "important");
        this.style.setProperty("max-height", "none", "important");
        this.content.style.position = "static";
        this.screen.style.height = "auto";
        if (!this.content.offsetHeight) {
          this.content.style.position = "absolute";
          this.screen.style.height = `${height}px`;
        }
      } else {
        for (const name of ["height", "min-height", "max-height"])
          this.style.setProperty(name, `${height + 26}px`, "important");
        this.content.style.position = "absolute";
        this.screen.style.height = `${height}px`;
      }
      if (composed) {
        this.style.setProperty("width", "auto", "important");
        this.style.setProperty("min-width", "0", "important");
        this.style.setProperty("max-width", "none", "important");
      }
      for (const child of this.children) this.observer?.observe(child);
    }
  }
  class ChromeShell extends HTMLElement {
    exportAsset(kind = "png", target) {
      return exportAsset(this, kind, target);
    }
    static observedAttributes = ["tab", "url", "fav", "width", "image-only"];
    connectedCallback() {
      if (!this.shadowRoot) {
        const root = this.attachShadow({ mode: "open", clonable: true });
        root.innerHTML = `<style>:host{display:block;box-sizing:border-box;border-radius:12px;overflow:hidden;background:white;box-shadow:0 24px 70px #0f0c0838;flex:none;font-family:system-ui}.cr-top{background:#dee1e6;padding:10px 10px 0;display:flex;align-items:center}.cr-lights{display:flex;gap:8px;padding:0 10px 0 6px}.cr-lights i{width:12px;height:12px;border-radius:50%;display:block}.cr-tab{background:white;border-radius:8px 8px 0 0;padding:9px 10px 9px 12px;display:flex;align-items:center;gap:8px;font:13px/1.3 system-ui;color:#3c4043;max-width:230px;min-width:120px;white-space:nowrap}.cr-fav{width:16px;height:16px;border-radius:4px;flex:none}.cr-tab-title{flex:1;overflow:hidden;text-overflow:ellipsis}.cr-x,.cr-newtab{color:#5f6368;flex:none;display:grid;place-items:center;border-radius:50%}.cr-x{width:16px;height:16px}.cr-x:hover{background:#e8eaed}.cr-newtab{width:28px;height:28px;margin-left:8px}.cr-url{background:white;padding:12px 14px;display:flex;align-items:center;gap:14px}.cr-btns{display:flex;gap:16px;color:#5f6368}.cr-urlbar{flex:1;background:#f1f3f4;border-radius:999px;padding:8px 16px;font:13px/1.3 system-ui;color:#5f6368;display:flex;align-items:center;gap:9px;min-width:0}.cr-urlbar-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cr-body,slot{display:block;background:white}:host([data-asset-only]){border-radius:0;box-shadow:none}:host([data-asset-only]) [data-codex-chrome]{display:none}</style><div class="cr-top" data-codex-chrome><div class="cr-lights" aria-label="Window controls"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div><div class="cr-tab"><span class="cr-fav"></span><span class="cr-tab-title"></span><span class="cr-x" aria-hidden="true">×</span></div><span class="cr-newtab" aria-hidden="true">+</span></div><div class="cr-url" data-codex-chrome><div class="cr-btns" aria-hidden="true"><span>←</span><span style="opacity:.4">→</span><span>↻</span></div><div class="cr-urlbar"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><span class="cr-urlbar-text"></span></div></div><div class="cr-body" part="content"><slot></slot></div>`;
      }
      this.sync();
    }
    attributeChangedCallback() {
      if (this.isConnected && this.shadowRoot) this.sync();
    }
    sync() {
      const width = number(this, "width", 780);
      for (const name of ["width", "min-width", "max-width"])
        this.style.setProperty(name, `${width}px`, "important");
      for (const name of ["height", "min-height", "max-height"])
        this.style.setProperty(name, "fit-content");
      this.toggleAttribute("data-asset-only", enabled(this, "image-only"));
      this.shadowRoot.querySelector(".cr-tab-title").textContent =
        this.getAttribute("tab") || "New Tab";
      this.shadowRoot.querySelector(".cr-urlbar-text").textContent =
        this.getAttribute("url") || "example.com";
      this.shadowRoot.querySelector(".cr-fav").style.background =
        this.getAttribute("fav") || "#d97757";
    }
  }
  for (const [name, Component] of [
    ["ios-shell", IOSShell],
    ["chrome-shell", ChromeShell],
  ])
    if (!customElements.get(name)) customElements.define(name, Component);
})();
