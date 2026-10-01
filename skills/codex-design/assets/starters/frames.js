/* Load as a classic local script. <device-frame platform="ios|android">,
   <browser-frame>, and <desktop-frame> wrap ordinary HTML via a slot. */
(() => {
  class Frame extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const kind = this.localName;
      const platform = this.getAttribute("platform") || "ios";
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `<style>:host{display:block;max-width:100%;color:#202632;font:13px system-ui}.shell{border:1px solid #cbd1db;overflow:hidden;border-radius:14px;background:white;box-shadow:0 16px 48px #16223318}.bar{height:38px;background:#edf0f5;display:flex;align-items:center;gap:8px;padding:0 14px}.dot{width:11px;height:11px;border-radius:50%;background:#ef6d66}.dot:nth-child(2){background:#f0c050}.dot:nth-child(3){background:#69bd72}.title{flex:1;text-align:center;overflow:hidden;text-overflow:ellipsis}.phone{width:390px;max-width:100%;border:8px solid #20242b;border-radius:40px}.phone .bar{background:white;justify-content:space-between;height:32px}.screen{position:relative;min-height:180px}.home{height:20px;display:grid;place-items:center}.home:after{content:'';height:4px;width:110px;background:#222;border-radius:6px}.url{background:white;border-radius:6px;padding:4px 12px;flex:1}slot{display:block}</style>`;
      const shell = document.createElement("div");
      shell.className = "shell" + (kind === "device-frame" ? " phone" : "");
      const bar = document.createElement("div");
      bar.className = "bar";
      if (kind === "device-frame") {
        bar.innerHTML =
          '<span>9:41</span><span aria-label="Battery and network">● ▰</span>';
        shell.dataset.platform = platform;
      } else {
        bar.innerHTML =
          '<i class="dot"></i><i class="dot"></i><i class="dot"></i>';
        const title = document.createElement("span");
        title.className = kind === "browser-frame" ? "url" : "title";
        title.textContent =
          this.getAttribute("title") ||
          (kind === "browser-frame" ? "Local preview" : "Application");
        bar.append(title);
      }
      const screen = document.createElement("div");
      screen.className = "screen";
      screen.append(document.createElement("slot"));
      shell.append(bar, screen);
      if (kind === "device-frame") {
        const home = document.createElement("div");
        home.className = "home";
        shell.append(home);
      }
      root.append(shell);
    }
  }
  for (const tag of ["device-frame", "browser-frame", "desktop-frame"])
    if (!customElements.get(tag))
      customElements.define(tag, class extends Frame {});
})();

// The reference-compatible fixed shells have a separate editable implementation.
window.CodexFramesReady = import("./platform-shells.js");
