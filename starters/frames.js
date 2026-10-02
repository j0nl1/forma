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

  // skills/studio-design/assets/starters/canvas-export.js
  var canvas_export_exports = {};
  __export(canvas_export_exports, {
    downloadBlob: () => downloadBlob,
    exportBoard: () => exportBoard,
    exportRegion: () => exportRegion
  });
  function downloadBlob(blob, name) {
    const link = document.createElement("a"), url = URL.createObjectURL(blob);
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async function exportBoard(board, kind) {
    return exportRegion(board.shadowRoot.querySelector(".card"), kind, {
      title: board.getAttribute("label") || "Artboard",
      scale: 3,
      allowExternal: board.ownerCanvas?.hasAttribute("allow-external-assets")
    });
  }
  async function exportRegion(card, kind, {
    title = "Asset",
    scale = 1,
    allowExternal = false,
    outputWidth,
    outputHeight,
    download = true
  } = {}) {
    if (!["png", "html"].includes(kind)) throw new Error("Choose PNG or HTML");
    if (!(card instanceof Element))
      throw new Error("Choose an actual content region");
    if (!Number.isFinite(scale) || scale <= 0 || scale > 4)
      throw new Error("Choose a capture scale between 0 and 4");
    await document.fonts.ready;
    const assets = /* @__PURE__ */ new Map();
    const embed = (raw, base = location.href) => {
      const url = new URL(raw, base);
      if (url.protocol === "data:") return Promise.resolve(url.href);
      if (!allowExternal && url.origin !== location.origin && url.protocol !== "blob:")
        throw new Error(
          "Localize external assets before exporting this artboard"
        );
      if (!assets.has(url.href))
        assets.set(
          url.href,
          (async () => {
            const response = await fetch(url);
            if (!response.ok)
              throw new Error(`Cannot embed asset: ${url.pathname}`);
            const blob2 = await response.blob();
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob2);
            });
          })()
        );
      return assets.get(url.href);
    };
    const embedUrls = async (css2, base) => {
      const matches = [...css2.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)];
      for (const match of matches) {
        if (!match[2] || match[2].startsWith("#")) continue;
        css2 = css2.split(match[0]).join(`url("${await embed(match[2], base)}")`);
      }
      return css2;
    };
    const fonts = [], pseudoRules = [], visited = /* @__PURE__ */ new Set(), fetchedCss = /* @__PURE__ */ new Set();
    const fetchCss = async (raw, base = location.href) => {
      const url = new URL(raw, base);
      if (fetchedCss.has(url.href)) return;
      fetchedCss.add(url.href);
      if (!allowExternal && url.origin !== location.origin)
        throw new Error(
          "Localize inaccessible stylesheets before exporting, or enable external assets"
        );
      const response = await fetch(url);
      if (!response.ok)
        throw new Error("Cannot read stylesheet for artboard export");
      let text = await response.text();
      const imports = [
        ...text.matchAll(/@import\s+(?:url\(\s*)?(['"]?)([^'"\s);]+)\1[^;]*;/g)
      ];
      for (const match of imports) {
        await fetchCss(match[2], url.href);
        text = text.replace(match[0], "");
      }
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      await walk(sheet, url.href);
    };
    const walk = async (sheet, base = sheet.href || location.href) => {
      if (visited.has(sheet)) return;
      visited.add(sheet);
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        if (sheet.href) {
          await fetchCss(sheet.href);
          return;
        }
        throw new Error("Cannot inspect stylesheet for artboard export");
      }
      const visit = async (list) => {
        for (const rule of list) {
          if (rule.type === CSSRule.FONT_FACE_RULE)
            fonts.push(await embedUrls(rule.cssText, base));
          else if (rule.styleSheet) await walk(rule.styleSheet);
          else if (rule.cssRules) await visit(rule.cssRules);
        }
      };
      await visit(rules);
    };
    for (const sheet of document.styleSheets) await walk(sheet);
    const clone = async (source) => {
      if (source.nodeType === Node.TEXT_NODE)
        return document.createTextNode(source.textContent);
      if (!(source instanceof Element) || source.matches(
        "script,link,style,[data-codex-chrome],[data-omelette-chrome]"
      ))
        return document.createTextNode("");
      if (source.localName === "slot") {
        const fragment = document.createDocumentFragment();
        for (const child of source.assignedNodes({ flatten: true }))
          fragment.append(await clone(child));
        return fragment;
      }
      const style = getComputedStyle(source);
      if (source.shadowRoot)
        for (const sheet of [
          ...source.shadowRoot.styleSheets,
          ...source.shadowRoot.adoptedStyleSheets
        ])
          await walk(sheet);
      let target = document.createElementNS(
        source.namespaceURI,
        source.localName.includes("-") ? "div" : source.localName
      );
      for (const attr of source.attributes)
        if (!["style", "src", "srcset"].includes(attr.name)) {
          if (attr.namespaceURI)
            target.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
          else target.setAttribute(attr.name, attr.value);
        }
      for (const property of style)
        target.style.setProperty(
          property,
          await embedUrls(style.getPropertyValue(property), location.href)
        );
      target.style.animation = "none";
      target.style.transition = "none";
      if (source instanceof HTMLElement) {
        let pseudoId;
        for (const name2 of ["before", "after"]) {
          const pseudo = getComputedStyle(source, `::${name2}`);
          if (["none", "normal"].includes(pseudo.content) || pseudo.display === "none")
            continue;
          const id = pseudoId ||= String(pseudoRules.length + 1);
          target.setAttribute("data-codex-capture-pseudo", id);
          const declaration = document.createElement("span").style;
          for (const property of pseudo)
            declaration.setProperty(
              property,
              await embedUrls(pseudo.getPropertyValue(property), location.href)
            );
          declaration.animation = "none";
          declaration.transition = "none";
          pseudoRules.push(
            `[data-codex-capture-pseudo="${id}"]::${name2}{${declaration.cssText}}`
          );
        }
      }
      if (source instanceof HTMLCanvasElement) {
        target = document.createElement("img");
        target.src = source.toDataURL();
        target.style.cssText = [...style].map((key) => `${key}:${style.getPropertyValue(key)}`).join(";");
      } else if (source instanceof HTMLImageElement) {
        target.src = await embed(source.currentSrc || source.src);
      } else if (source instanceof HTMLInputElement) {
        target.value = source.value;
        target.setAttribute("value", source.value);
        if (source.checked) target.setAttribute("checked", "");
      } else if (source instanceof HTMLTextAreaElement)
        target.textContent = source.value;
      else {
        for (const child of (source.shadowRoot ?? source).childNodes)
          target.append(await clone(child));
        if (source instanceof HTMLSelectElement)
          [...target.options].forEach((option, index) => {
            option.selected = source.options[index].selected;
            if (option.selected) option.setAttribute("selected", "");
          });
      }
      return target;
    };
    const box = getComputedStyle(card);
    const dimension = (axis, sides) => {
      const size = Number.parseFloat(box[axis]);
      return Number.isFinite(size) ? size + (box.boxSizing === "border-box" ? 0 : sides.reduce(
        (sum, side) => sum + (Number.parseFloat(box[side]) || 0),
        0
      )) : axis === "width" ? card.offsetWidth : card.offsetHeight;
    };
    const width = dimension("width", [
      "paddingLeft",
      "paddingRight",
      "borderLeftWidth",
      "borderRightWidth"
    ]), height = dimension("height", [
      "paddingTop",
      "paddingBottom",
      "borderTopWidth",
      "borderBottomWidth"
    ]);
    if (!width || !height) throw new Error("The artboard has no exportable size");
    const pixelWidth = outputWidth ?? Math.round(width * scale), pixelHeight = outputHeight ?? Math.round(height * scale);
    if (kind === "png" && ![pixelWidth, pixelHeight].every(
      (value) => Number.isSafeInteger(value) && value > 0
    ))
      throw new Error("Choose positive integer export dimensions.");
    const snapshot = await clone(card);
    snapshot.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    Object.assign(snapshot.style, {
      position: "relative",
      left: "auto",
      top: "auto",
      right: "auto",
      bottom: "auto",
      width: `${width}px`,
      height: `${height}px`,
      boxSizing: "border-box",
      transform: "none",
      boxShadow: "none",
      borderRadius: "0",
      margin: "0"
    });
    const name = title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "Artboard";
    if (kind === "html") {
      const doc = document.implementation.createHTMLDocument(title);
      doc.documentElement.lang = "en";
      const charset = doc.createElement("meta");
      charset.setAttribute("charset", "utf-8");
      doc.head.prepend(charset);
      const css2 = doc.createElement("style");
      css2.textContent = [...fonts, ...pseudoRules].join("\n");
      doc.head.append(css2);
      doc.body.style.margin = "0";
      doc.body.append(snapshot);
      const blob2 = new Blob(
        ["<!doctype html>\n", doc.documentElement.outerHTML],
        { type: "text/html" }
      );
      if (download) downloadBlob(blob2, `${name}.html`);
      return blob2;
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", pixelWidth);
    svg.setAttribute("height", pixelHeight);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const foreign = document.createElementNS(svg.namespaceURI, "foreignObject");
    foreign.setAttribute("width", width);
    foreign.setAttribute("height", height);
    const css = document.createElement("style");
    css.textContent = [...fonts, ...pseudoRules].join("\n");
    snapshot.prepend(css);
    foreign.append(snapshot);
    svg.append(foreign);
    const image = new Image();
    image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    await image.decode();
    const output = document.createElement("canvas");
    output.width = pixelWidth;
    output.height = pixelHeight;
    output.getContext("2d").drawImage(image, 0, 0);
    const blob = await new Promise((resolve) => output.toBlob(resolve));
    if (!blob) throw new Error("PNG encoding failed");
    if (download) downloadBlob(blob, `${name}.png`);
    return blob;
  }
  var init_canvas_export = __esm({
    "skills/studio-design/assets/starters/canvas-export.js"() {
    }
  });

  // skills/studio-design/assets/starters/platform-shells.js
  var platform_shells_exports = {};
  var init_platform_shells = __esm({
    "skills/studio-design/assets/starters/platform-shells.js"() {
      (() => {
        const number = (element, name, fallback, min = 1) => {
          const parsed = parseInt(element.getAttribute(name), 10);
          return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
        };
        const enabled = (element, name) => ["", "true"].includes(element?.getAttribute(name));
        const exportAsset = async (shell, kind, target) => {
          target ||= shell.querySelector("[data-codex-frame-export]") || shell.firstElementChild;
          if (!target || !shell.contains(target))
            throw new Error("Choose authored content inside this shell.");
          for (const image of target.querySelectorAll("img"))
            if (image.getAttribute("src")) await image.decode();
          for (const slot of [
            target,
            ...target.querySelectorAll("image-slot")
          ].filter((node) => node.localName === "image-slot"))
            await slot.prepareCapture?.();
          const { exportRegion: exportRegion2 } = await Promise.resolve().then(() => (init_canvas_export(), canvas_export_exports));
          return exportRegion2(target, kind, {
            title: target.getAttribute("data-codex-frame-label") || shell.getAttribute("label") || "Asset"
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
            "data-composed-phone"
          ];
          connectedCallback() {
            if (!this.shadowRoot) {
              const root = this.attachShadow({ mode: "open", clonable: true });
              root.innerHTML = `<style>:host{display:block;position:relative;box-sizing:border-box;padding:13px;border-radius:56px;background:#0b0b0e;box-shadow:0 28px 80px #0f0c084d;flex:none}.ios-screen{position:relative;border-radius:43px;overflow:hidden;background:white}.ios-content{position:absolute;inset:0}slot{display:block}.ios-island{position:absolute;top:13px;left:50%;transform:translateX(-50%);width:112px;height:33px;border-radius:20px;background:#0b0b0e;z-index:30;pointer-events:none}.ios-statusbar{position:absolute;inset:0 0 auto;height:54px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 30px 0 34px;z-index:25;font:600 16px/1 system-ui;color:#14130f;pointer-events:none}.network{display:flex;align-items:center;gap:7px}.ios-homebar{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:134px;height:5px;border-radius:3px;background:#00000052;z-index:30;pointer-events:none}:host([dark]) .ios-statusbar{color:white;text-shadow:0 1px 4px #0006}:host([dark]) .ios-homebar{background:#ffffffb3}:host([data-asset-only]){padding:0;border-radius:0;background:transparent;box-shadow:none}:host([data-asset-only]) .ios-screen{border-radius:0}:host([data-asset-only]) [data-codex-chrome]{display:none}</style><div class="ios-screen" part="screen"><div class="ios-content" part="content"><slot></slot></div><div class="ios-island" data-codex-chrome aria-hidden="true"></div><div class="ios-statusbar" data-codex-chrome><span>9:41</span>${icons}</div><div class="ios-homebar" data-codex-chrome aria-hidden="true"></div></div>`;
            }
            this.screen = this.shadowRoot.querySelector(".ios-screen");
            this.content = this.shadowRoot.querySelector(".ios-content");
            if (!this.slotWired) {
              this.shadowRoot.querySelector("slot").addEventListener("slotchange", () => this.sync());
              this.slotWired = true;
            }
            this.observer = new ResizeObserver(() => this.sync());
            for (const child of this.children) this.observer.observe(child);
            this.parentObserver = new MutationObserver(() => this.sync());
            if (this.parentElement)
              this.parentObserver.observe(this.parentElement, {
                attributes: true,
                attributeFilter: ["image-only"]
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
            const outer = number(this, "width", 428, 27), height = number(this, "screen-height", 874);
            const composed = this.hasAttribute("data-composed-phone") && enabled(this.parentElement, "image-only");
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
              root.innerHTML = `<style>:host{display:block;box-sizing:border-box;border-radius:12px;overflow:hidden;background:white;box-shadow:0 24px 70px #0f0c0838;flex:none;font-family:system-ui}.cr-top{background:#dee1e6;padding:10px 10px 0;display:flex;align-items:center}.cr-lights{display:flex;gap:8px;padding:0 10px 0 6px}.cr-lights i{width:12px;height:12px;border-radius:50%;display:block}.cr-tab{background:white;border-radius:8px 8px 0 0;padding:9px 10px 9px 12px;display:flex;align-items:center;gap:8px;font:13px/1.3 system-ui;color:#3c4043;max-width:230px;min-width:120px;white-space:nowrap}.cr-fav{width:16px;height:16px;border-radius:4px;flex:none}.cr-tab-title{flex:1;overflow:hidden;text-overflow:ellipsis}.cr-x,.cr-newtab{color:#5f6368;flex:none;display:grid;place-items:center;border-radius:50%}.cr-x{width:16px;height:16px}.cr-x:hover{background:#e8eaed}.cr-newtab{width:28px;height:28px;margin-left:8px}.cr-url{background:white;padding:12px 14px;display:flex;align-items:center;gap:14px}.cr-btns{display:flex;gap:16px;color:#5f6368}.cr-urlbar{flex:1;background:#f1f3f4;border-radius:999px;padding:8px 16px;font:13px/1.3 system-ui;color:#5f6368;display:flex;align-items:center;gap:9px;min-width:0}.cr-urlbar-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cr-body,slot{display:block;background:white}:host([data-asset-only]){border-radius:0;box-shadow:none}:host([data-asset-only]) [data-codex-chrome]{display:none}</style><div class="cr-top" data-codex-chrome><div class="cr-lights" aria-label="Window controls"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div><div class="cr-tab"><span class="cr-fav"></span><span class="cr-tab-title"></span><span class="cr-x" aria-hidden="true">\xD7</span></div><span class="cr-newtab" aria-hidden="true">+</span></div><div class="cr-url" data-codex-chrome><div class="cr-btns" aria-hidden="true"><span>\u2190</span><span style="opacity:.4">\u2192</span><span>\u21BB</span></div><div class="cr-urlbar"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><span class="cr-urlbar-text"></span></div></div><div class="cr-body" part="content"><slot></slot></div>`;
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
            this.shadowRoot.querySelector(".cr-tab-title").textContent = this.getAttribute("tab") || "New Tab";
            this.shadowRoot.querySelector(".cr-urlbar-text").textContent = this.getAttribute("url") || "example.com";
            this.shadowRoot.querySelector(".cr-fav").style.background = this.getAttribute("fav") || "#d97757";
          }
        }
        for (const [name, Component] of [
          ["ios-shell", IOSShell],
          ["chrome-shell", ChromeShell]
        ])
          if (!customElements.get(name)) customElements.define(name, Component);
      })();
    }
  });

  // skills/studio-design/assets/starters/frames.js
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
          bar.innerHTML = '<span>9:41</span><span aria-label="Battery and network">\u25CF \u25B0</span>';
          shell.dataset.platform = platform;
        } else {
          bar.innerHTML = '<i class="dot"></i><i class="dot"></i><i class="dot"></i>';
          const title = document.createElement("span");
          title.className = kind === "browser-frame" ? "url" : "title";
          title.textContent = this.getAttribute("title") || (kind === "browser-frame" ? "Local preview" : "Application");
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
        customElements.define(tag, class extends Frame {
        });
  })();
  window.CodexFramesReady = Promise.resolve().then(() => (init_platform_shells(), platform_shells_exports));
})();
