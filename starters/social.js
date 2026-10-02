(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err2) => function __init() {
    if (err2) throw err2[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err2 = [e], e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // skills/studio-design/assets/starters/social-model.js
  function nominalFrame(frame) {
    const label = frameLabel(frame), match = label.match(/(?:^|\s|·)(\d+)\s*[×x]\s*(\d+)\s*$/i);
    const width = Number(
      frame.getAttribute("data-codex-frame-width") || match?.[1] || frame.offsetWidth
    ), height = Number(
      frame.getAttribute("data-codex-frame-height") || match?.[2] || frame.offsetHeight
    );
    if (![width, height].every((value) => Number.isSafeInteger(value) && value > 0))
      throw new Error("Choose positive integer nominal frame dimensions.");
    return {
      label,
      title: label.replace(/\s*·?\s*\d+\s*[×x]\s*\d+\s*$/i, "").trim() || "Frame",
      width,
      height
    };
  }
  function assetName(title, used = /* @__PURE__ */ new Set()) {
    const base = title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "Frame";
    let name = base + ".png", index = 2;
    while (used.has(name.toLowerCase())) name = `${base}-${index++}.png`;
    used.add(name.toLowerCase());
    return name;
  }
  var postPlatforms, assetOnly, frameSelector, frameLabel;
  var init_social_model = __esm({
    "skills/studio-design/assets/starters/social-model.js"() {
      postPlatforms = {
        x: { sub: "@yourbrand \xB7 2h", reactions: ["\u2661 1.2K", "\u21BA 340", "\u{1F4AC} 88"] },
        linkedin: { sub: "Company \xB7 2h", reactions: ["\u{1F44D} 847", "\u{1F4AC} 63", "\u2197 Share"] },
        facebook: { sub: "2h \xB7 \u{1F310}", reactions: ["\u{1F44D} Like", "\u{1F4AC} Comment", "\u2197 Share"] },
        reddit: {
          sub: "r/design \xB7 Posted by u/yourbrand \xB7 5h",
          reactions: ["\u{1F4AC} 128 Comments", "\u2197 Share", "\u2B50 Award"]
        }
      };
      assetOnly = (node) => ["", "true"].includes(node?.getAttribute("image-only"));
      frameSelector = "[data-codex-frame-export],[data-om-frame-export]";
      frameLabel = (frame) => frame.getAttribute("data-codex-frame-label") || frame.getAttribute("data-om-frame-label") || "Frame";
    }
  });

  // skills/studio-design/assets/starters/social-dom.js
  function descendants(root) {
    const nodes = [], visited = /* @__PURE__ */ new Set();
    const visit = (node) => {
      if (!node || visited.has(node)) return;
      visited.add(node);
      if (node instanceof Element) nodes.push(node);
      if (node instanceof HTMLSlotElement) {
        const assigned = node.assignedNodes({ flatten: true });
        if (assigned.length) {
          for (const child of assigned) visit(child);
          return;
        }
      }
      if (node.shadowRoot) visit(node.shadowRoot);
      for (const child of node.childNodes) visit(child);
    };
    if (root.shadowRoot) visit(root.shadowRoot);
    for (const child of root.childNodes) visit(child);
    return nodes;
  }
  function parentOf(node) {
    return node.parentElement || node.getRootNode()?.host || null;
  }
  function belongsTo(node, board) {
    for (let parent = parentOf(node); parent; parent = parentOf(parent)) {
      if (parent === board) return true;
      if (parent.localName === "social-frames") return false;
    }
    return false;
  }
  function visibleFrame(node) {
    const style11 = getComputedStyle(node), box = node.getBoundingClientRect();
    return style11.display !== "none" && style11.visibility !== "hidden" && style11.position !== "fixed" && box.width >= 2 && box.height >= 2;
  }
  function frameList(board) {
    return descendants(board).filter((node) => {
      if (!node.matches(frameSelector) || !belongsTo(node, board) || !visibleFrame(node))
        return false;
      for (let parent = parentOf(node); parent && parent !== board; parent = parentOf(parent))
        if (parent.matches(frameSelector)) return false;
      return true;
    });
  }
  function cssImage(node, source) {
    node.style.backgroundImage = source ? `url(${JSON.stringify(source)})` : "";
  }
  var init_social_dom = __esm({
    "skills/studio-design/assets/starters/social-dom.js"() {
      init_social_model();
    }
  });

  // skills/studio-design/assets/starters/post-card-runtime.js
  var post_card_runtime_exports = {};
  var style, PostCard;
  var init_post_card_runtime = __esm({
    "skills/studio-design/assets/starters/post-card-runtime.js"() {
      init_social_model();
      init_social_dom();
      style = `
:host{display:block;padding:22px 26px;color:#14130f;background:#fff;font-family:system-ui}*{box-sizing:border-box}[hidden]{display:none!important}.head{display:flex;align-items:center;gap:12px;margin-bottom:12px}.avatar{width:48px;height:48px;border-radius:50%;background:#cfd4da center/cover no-repeat;flex:none}.names{flex:1}.name{font-size:16px;font-weight:700;line-height:1.25}.sub{font-size:14px;color:#77726a}.copy{font-size:16px;line-height:1.5;margin:0 0 14px;white-space:pre-wrap}.media{position:relative;border:1px solid #0f0c081a;border-radius:16px;overflow:hidden}slot{display:block}::slotted([data-codex-frame-export]),::slotted([data-om-frame-export]){border:0!important;border-radius:0!important}.link{border:1px solid #0f0c081a;border-top:0;padding:13px 16px;background:#faf9f7}.domain{font-size:12px;color:#8b8578;text-transform:uppercase;letter-spacing:.04em}.link-title{font-size:16px;font-weight:700;margin-top:3px}.reactions{display:flex;gap:34px;padding:14px 2px 2px;color:#57534a;font-weight:600;font-size:14px}.reactions span{display:flex;align-items:center;gap:7px;white-space:nowrap}.row{display:flex;gap:14px}.main{flex:1;min-width:0}.votes{display:none;flex-direction:column;align-items:center;gap:3px;color:#878a8c;font-size:13px;font-weight:700}.votes svg{display:block}.votes span{color:#14130f}
:host([data-platform=reddit]) .votes{display:flex}:host([data-platform=reddit]) .avatar{display:none}:host([data-platform=reddit]) .head{display:block}:host([data-platform=reddit]) .names{display:flex;flex-direction:column}:host([data-platform=reddit]) .sub{order:-1}:host([data-platform=reddit]) .name{font-size:18px;margin:5px 0 12px}:host([data-platform=reddit]) .head{margin-bottom:0}
:host([image-only=""]),:host([image-only=true]){padding:0;background:transparent}:host([image-only=""]) .head,:host([image-only=true]) .head,:host([image-only=""]) .copy,:host([image-only=true]) .copy,:host([image-only=""]) .reactions,:host([image-only=true]) .reactions,:host([image-only=""]) .link,:host([image-only=true]) .link,:host([image-only=""]) .votes,:host([image-only=true]) .votes{display:none}:host([image-only=""]) .media,:host([image-only=true]) .media{border:0;border-radius:0}
`;
      PostCard = class extends HTMLElement {
        static observedAttributes = [
          "platform",
          "name",
          "author",
          "sub",
          "text",
          "avatar",
          "link-domain",
          "link-title"
        ];
        constructor() {
          super();
          const root = this.shadowRoot || this.attachShadow({ mode: "open", clonable: true });
          root.innerHTML = `<style>${style}</style><div class="row"><div class="votes" aria-label="Illustrative vote count"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 4 17 11H3Z"/></svg><span>2.4k</span><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 16 3 9H17Z"/></svg></div><div class="main"><div class="head"><div class="avatar" aria-hidden="true"></div><div class="names"><div class="name"></div><div class="sub"></div></div></div><p class="copy"></p><div class="media" part="media"><slot></slot></div><div class="link" hidden><div class="domain"></div><div class="link-title"></div></div><div class="reactions" aria-label="Illustrative reaction row"></div></div></div>`;
        }
        connectedCallback() {
          this.sync();
        }
        attributeChangedCallback() {
          if (this.isConnected) this.sync();
        }
        sync() {
          const platform = Object.hasOwn(postPlatforms, this.getAttribute("platform")) ? this.getAttribute("platform") : "x", defaults = postPlatforms[platform], root = this.shadowRoot;
          this.dataset.platform = platform;
          root.querySelector(".name").textContent = this.getAttribute("name") || this.getAttribute("author") || "Your brand";
          root.querySelector(".sub").textContent = this.getAttribute("sub") || defaults.sub;
          const copy = root.querySelector(".copy");
          copy.textContent = this.getAttribute("text") || "";
          copy.hidden = !copy.textContent;
          cssImage(root.querySelector(".avatar"), this.getAttribute("avatar"));
          root.querySelector(".domain").textContent = this.getAttribute("link-domain") || "";
          root.querySelector(".link-title").textContent = this.getAttribute("link-title") || "";
          root.querySelector(".link").hidden = platform !== "facebook" || !(this.getAttribute("link-domain") || this.getAttribute("link-title"));
          root.querySelector(".reactions").replaceChildren(
            ...defaults.reactions.map((text) => {
              const span = document.createElement("span");
              span.textContent = text;
              return span;
            })
          );
        }
      };
      if (!customElements.get("post-card"))
        customElements.define("post-card", PostCard);
    }
  });

  // skills/studio-design/assets/starters/post-card.js
  var post_card_exports = {};
  var init_post_card = __esm({
    "skills/studio-design/assets/starters/post-card.js"() {
      window.CodexPostsReady = Promise.resolve().then(() => (init_post_card_runtime(), post_card_runtime_exports));
    }
  });

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
      const style11 = getComputedStyle(source);
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
      for (const property of style11)
        target.style.setProperty(
          property,
          await embedUrls(style11.getPropertyValue(property), location.href)
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
        target.style.cssText = [...style11].map((key) => `${key}:${style11.getPropertyValue(key)}`).join(";");
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
        const icons2 = `<span class="network" aria-label="Network and battery"><svg width="19" height="12" viewBox="0 0 19 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx=".7"/><rect x="5" y="5" width="3" height="7" rx=".7"/><rect x="10" y="3" width="3" height="9" rx=".7"/><rect x="15" y="0" width="3" height="12" rx=".7"/></svg><svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M1 4 Q8.5 -2 16 4 M4 7 Q8.5 3 13 7"/><circle cx="8.5" cy="10" r="1.4" fill="currentColor" stroke="none"/></svg><svg width="26" height="12" viewBox="0 0 26 12" fill="currentColor"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" opacity=".35"/><rect x="2" y="2" width="19" height="8" rx="1.5"/><rect x="24" y="4" width="1.3" height="4" rx=".6" opacity=".5"/></svg></span>`;
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
              root.innerHTML = `<style>:host{display:block;position:relative;box-sizing:border-box;padding:13px;border-radius:56px;background:#0b0b0e;box-shadow:0 28px 80px #0f0c084d;flex:none}.ios-screen{position:relative;border-radius:43px;overflow:hidden;background:white}.ios-content{position:absolute;inset:0}slot{display:block}.ios-island{position:absolute;top:13px;left:50%;transform:translateX(-50%);width:112px;height:33px;border-radius:20px;background:#0b0b0e;z-index:30;pointer-events:none}.ios-statusbar{position:absolute;inset:0 0 auto;height:54px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 30px 0 34px;z-index:25;font:600 16px/1 system-ui;color:#14130f;pointer-events:none}.network{display:flex;align-items:center;gap:7px}.ios-homebar{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:134px;height:5px;border-radius:3px;background:#00000052;z-index:30;pointer-events:none}:host([dark]) .ios-statusbar{color:white;text-shadow:0 1px 4px #0006}:host([dark]) .ios-homebar{background:#ffffffb3}:host([data-asset-only]){padding:0;border-radius:0;background:transparent;box-shadow:none}:host([data-asset-only]) .ios-screen{border-radius:0}:host([data-asset-only]) [data-codex-chrome]{display:none}</style><div class="ios-screen" part="screen"><div class="ios-content" part="content"><slot></slot></div><div class="ios-island" data-codex-chrome aria-hidden="true"></div><div class="ios-statusbar" data-codex-chrome><span>9:41</span>${icons2}</div><div class="ios-homebar" data-codex-chrome aria-hidden="true"></div></div>`;
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
    const x2 = clamp(view.x ?? 0, -mx, mx), y = clamp(view.y ?? 0, -my, my);
    return { s, x: x2, y, width, height, mx, my, base, fw, fh };
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
          const root = portal.attachShadow({ mode: "open" }), style11 = document.createElement("style");
          style11.textContent = slot.shadowRoot.querySelector("style").textContent;
          portal.setAttribute("data-reframe", "");
          root.append(style11, slot.ui.spill, slot.ui.toolbar);
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

  // skills/studio-design/assets/starters/instagram-story-runtime.js
  var instagram_story_runtime_exports = {};
  var identity, style2, icons, InstagramStory;
  var init_instagram_story_runtime = __esm({
    "skills/studio-design/assets/starters/instagram-story-runtime.js"() {
      init_social_model();
      init_social_dom();
      identity = 0;
      style2 = `
:host{display:block;width:fit-content}*{box-sizing:border-box}.screen{position:relative;display:flex;flex-direction:column;justify-content:center;height:var(--story-height,874px);width:var(--story-width,402px);background:#000;font-family:system-ui}.stage{position:relative;width:100%;aspect-ratio:9/16;overflow:hidden;background:#111}.photo{display:block;position:absolute;inset:0;width:100%;height:100%}.progress{position:absolute;top:10px;left:10px;right:10px;display:flex;gap:4px;z-index:40}.progress i{flex:1;height:2.5px;border-radius:2px;background:#ffffff59}.progress i:first-child{background:white}.head{position:absolute;top:22px;left:14px;right:12px;display:flex;align-items:center;gap:10px;z-index:40;color:white;text-shadow:0 1px 4px #0007}.avatar{width:34px;height:34px;border-radius:50%;flex:none;background:linear-gradient(135deg,#e8e0d8,#c9c2ba) center/cover no-repeat;border:1px solid #ffffff66}.username{font-size:14px;font-weight:600;line-height:1.25}.time{font-size:14px;font-weight:400;opacity:.75}.icons{margin-left:auto;display:flex;align-items:center;gap:16px}.icons svg,.reply svg{display:block;flex:none}.reply{position:absolute;left:14px;right:14px;bottom:24px;display:flex;align-items:center;gap:14px;z-index:40;color:white}.field{flex:1;height:44px;border:1px solid #ffffff8c;border-radius:22px;display:flex;align-items:center;padding:0 18px;font-size:14px;color:#ffffffbf}.extras{display:contents}
.photo::part(status-session){display:none}
:host([image-only=""]) .screen,:host([image-only=true]) .screen{height:auto;background:transparent}:host([image-only=""]) [data-codex-chrome],:host([image-only=true]) [data-codex-chrome]{display:none}
`;
      icons = {
        more: '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><circle cx="3" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="17" cy="10" r="1.6"/></svg>',
        close: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m5 5 12 12M17 5 5 17"/></svg>',
        heart: '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M13 22 4 13C-2 6 7 0 13 7c6-7 15-1 9 6Z"/></svg>',
        send: '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m3 11 20-8-8 20-4-8Zm8 4L23 3"/></svg>'
      };
      InstagramStory = class extends HTMLElement {
        static observedAttributes = [
          "id",
          "image-src",
          "image-credit",
          "image-credit-href",
          "username",
          "avatar-src",
          "time",
          "image-only",
          "width",
          "editable"
        ];
        constructor() {
          super();
          this.fallbackId = `instagram-story-${++identity}`;
          const root = this.shadowRoot || this.attachShadow({ mode: "open", clonable: true });
          root.innerHTML = `<style>${style2}</style><ios-shell data-composed-phone dark><div class="screen"><div class="stage" part="asset" data-codex-frame-export data-codex-frame-label="Instagram story \xB7 1080\xD71920"><image-slot class="photo" fit="cover" shape="rect" radius="0" placeholder="Drop the story photo"></image-slot><slot class="extras"></slot><div class="progress" data-codex-chrome aria-hidden="true"><i></i><i></i><i></i></div><div class="head" data-codex-chrome><div class="avatar" aria-hidden="true"></div><span class="username"></span><span class="time"></span><span class="icons" aria-hidden="true">${icons.more}${icons.close}</span></div></div><div class="reply" data-codex-chrome><div class="field">Send message</div><span aria-hidden="true">${icons.heart}</span><span aria-hidden="true">${icons.send}</span></div></div></ios-shell>`;
          this.phone = root.querySelector("ios-shell");
          this.image = root.querySelector("image-slot");
          this.frame = root.querySelector(".stage");
        }
        connectedCallback() {
          this.sync();
        }
        attributeChangedCallback() {
          if (this.isConnected) this.sync();
        }
        sync() {
          const raw = Number.parseInt(this.getAttribute("width"), 10), outer = Number.isFinite(raw) && raw >= 27 ? raw : 428, inner = outer - 26, height = Math.round(inner * 874 / 402);
          this.style.setProperty("--story-width", `${inner}px`);
          this.style.setProperty("--story-height", `${height}px`);
          this.phone.setAttribute("width", String(outer));
          this.phone.setAttribute("screen-height", String(height));
          this.phone.setAttribute("image-only", assetOnly(this) ? "true" : "false");
          this.image.id = `${this.id || this.fallbackId}-photo`;
          for (const [attribute, target] of [
            ["image-src", "src"],
            ["image-credit", "credit"],
            ["image-credit-href", "credit-href"],
            ["editable", "editable"]
          ]) {
            const value = this.getAttribute(attribute);
            if (value !== null) this.image.setAttribute(target, value);
            else this.image.removeAttribute(target);
          }
          this.shadowRoot.querySelector(".username").textContent = this.getAttribute("username") || "yourbrand";
          this.shadowRoot.querySelector(".time").textContent = this.getAttribute("time") || "2h";
          cssImage(
            this.shadowRoot.querySelector(".avatar"),
            this.getAttribute("avatar-src")
          );
        }
        async prepareCapture() {
          await this.image.prepareCapture?.();
        }
      };
      if (!customElements.get("instagram-story"))
        customElements.define("instagram-story", InstagramStory);
    }
  });

  // skills/studio-design/assets/starters/instagram-story.js
  var instagram_story_exports = {};
  var init_instagram_story = __esm({
    "skills/studio-design/assets/starters/instagram-story.js"() {
      window.CodexStoriesReady = (async () => {
        if (!customElements.get("ios-shell")) await Promise.resolve().then(() => (init_platform_shells(), platform_shells_exports));
        if (!customElements.get("image-slot")) await Promise.resolve().then(() => (init_image_runtime(), image_runtime_exports));
        await Promise.resolve().then(() => (init_instagram_story_runtime(), instagram_story_runtime_exports));
        await Promise.all(
          [...document.querySelectorAll("instagram-story")].map(
            (story) => story.image?.settled?.()
          )
        );
      })();
    }
  });

  // skills/studio-design/assets/starters/social-frames-style.js
  var boardStyle;
  var init_social_frames_style = __esm({
    "skills/studio-design/assets/starters/social-frames-style.js"() {
      boardStyle = `
:host{display:block;font-family:system-ui}*{box-sizing:border-box}[hidden]{display:none!important}.layout{position:relative;display:flex;flex-wrap:wrap;align-items:flex-start;gap:72px 60px;padding:48px}.units{display:contents}::slotted(*){margin-top:38px}.toolbar{flex:0 0 100%;display:flex;align-items:center;flex-wrap:wrap;gap:18px}.all,.download{cursor:pointer;border:0;color:white;background:#191915;font:600 14px/1 system-ui;border-radius:10px;padding:12px 20px}.all{box-shadow:0 2px 10px #0f0c081f}.all:hover,.download:hover{background:#2b2b26}.all:focus-visible,.download:focus-visible{outline:2px solid #269d80;outline-offset:3px}button:disabled{cursor:wait;opacity:.5}.labels{position:absolute;inset:0;pointer-events:none}.label{position:absolute;display:flex;align-items:center;gap:8px;color:#6b675c;font:550 15px/1.3 system-ui;pointer-events:auto}.label-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dimensions{color:#a5a095;font-weight:400;white-space:nowrap}.download{margin-left:auto;padding:6px 12px;border-radius:7px;font:600 12px/1.4 system-ui;white-space:nowrap;flex:none}.status{font:13px/1.5 system-ui;color:#6b675c;max-width:42em}:host([data-export-error]) .status{color:#9b3028}
@media(max-width:480px){.layout{padding:24px;gap:54px 30px}}
`;
    }
  });

  // node_modules/fflate/esm/browser.js
  function deflateSync(data, opts) {
    return dopt(data, opts || {}, 0, 0);
  }
  function strToU8(str, latin1) {
    if (latin1) {
      var ar_1 = new u8(str.length);
      for (var i2 = 0; i2 < str.length; ++i2)
        ar_1[i2] = str.charCodeAt(i2);
      return ar_1;
    }
    if (te)
      return te.encode(str);
    var l = str.length;
    var ar = new u8(str.length + (str.length >> 1));
    var ai = 0;
    var w = function(v) {
      ar[ai++] = v;
    };
    for (var i2 = 0; i2 < l; ++i2) {
      if (ai + 5 > ar.length) {
        var n = new u8(ai + 8 + (l - i2 << 1));
        n.set(ar);
        ar = n;
      }
      var c = str.charCodeAt(i2);
      if (c < 128 || latin1)
        w(c);
      else if (c < 2048)
        w(192 | c >> 6), w(128 | c & 63);
      else if (c > 55295 && c < 57344)
        c = 65536 + (c & 1023 << 10) | str.charCodeAt(++i2) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
      else
        w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
    }
    return slc(ar, 0, ai);
  }
  function zipSync(data, opts) {
    if (!opts)
      opts = {};
    var r = {};
    var files = [];
    fltn(data, "", r, opts);
    var o = 0;
    var tot = 0;
    for (var fn in r) {
      var _a2 = r[fn], file = _a2[0], p = _a2[1];
      var compression = p.level == 0 ? 0 : 8;
      var f = strToU8(fn), s = f.length;
      var com = p.comment, m = com && strToU8(com), ms = m && m.length;
      var exl = exfl(p.extra);
      if (s > 65535)
        err(11);
      var d = compression ? deflateSync(file, p) : file, l = d.length;
      var c = crc();
      c.p(file);
      files.push(mrg(p, {
        size: file.length,
        crc: c.d(),
        c: d,
        f,
        m,
        u: s != fn.length || m && com.length != ms,
        o,
        compression
      }));
      o += 30 + s + exl + l;
      tot += 76 + 2 * (s + exl) + (ms || 0) + l;
    }
    var out = new u8(tot + 22), oe = o, cdl = tot - o;
    for (var i2 = 0; i2 < files.length; ++i2) {
      var f = files[i2];
      wzh(out, f.o, f, f.f, f.u, f.c.length);
      var badd = 30 + f.f.length + exfl(f.extra);
      out.set(f.c, f.o + badd);
      wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
    }
    wzf(out, o, files.length, cdl, oe);
    return out;
  }
  var u8, u16, i32, fleb, fdeb, clim, freb, _a, fl, revfl, _b, fd, revfd, rev, x, i, hMap, flt, i, i, i, i, fdt, i, flm, fdm, shft, slc, ec, err, wbits, wbits16, hTree, ln, lc, clen, wfblk, wblk, deo, et, dflt, crct, crc, dopt, mrg, wbytes, fltn, te, td, tds, exfl, wzh, wzf;
  var init_browser = __esm({
    "node_modules/fflate/esm/browser.js"() {
      u8 = Uint8Array;
      u16 = Uint16Array;
      i32 = Int32Array;
      fleb = new u8([
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        1,
        1,
        1,
        2,
        2,
        2,
        2,
        3,
        3,
        3,
        3,
        4,
        4,
        4,
        4,
        5,
        5,
        5,
        5,
        0,
        /* unused */
        0,
        0,
        /* impossible */
        0
      ]);
      fdeb = new u8([
        0,
        0,
        0,
        0,
        1,
        1,
        2,
        2,
        3,
        3,
        4,
        4,
        5,
        5,
        6,
        6,
        7,
        7,
        8,
        8,
        9,
        9,
        10,
        10,
        11,
        11,
        12,
        12,
        13,
        13,
        /* unused */
        0,
        0
      ]);
      clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
      freb = function(eb, start) {
        var b = new u16(31);
        for (var i2 = 0; i2 < 31; ++i2) {
          b[i2] = start += 1 << eb[i2 - 1];
        }
        var r = new i32(b[30]);
        for (var i2 = 1; i2 < 30; ++i2) {
          for (var j = b[i2]; j < b[i2 + 1]; ++j) {
            r[j] = j - b[i2] << 5 | i2;
          }
        }
        return { b, r };
      };
      _a = freb(fleb, 2);
      fl = _a.b;
      revfl = _a.r;
      fl[28] = 258, revfl[258] = 28;
      _b = freb(fdeb, 0);
      fd = _b.b;
      revfd = _b.r;
      rev = new u16(32768);
      for (i = 0; i < 32768; ++i) {
        x = (i & 43690) >> 1 | (i & 21845) << 1;
        x = (x & 52428) >> 2 | (x & 13107) << 2;
        x = (x & 61680) >> 4 | (x & 3855) << 4;
        rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
      }
      hMap = (function(cd, mb, r) {
        var s = cd.length;
        var i2 = 0;
        var l = new u16(mb);
        for (; i2 < s; ++i2) {
          if (cd[i2])
            ++l[cd[i2] - 1];
        }
        var le = new u16(mb);
        for (i2 = 1; i2 < mb; ++i2) {
          le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
        }
        var co;
        if (r) {
          co = new u16(1 << mb);
          var rvb = 15 - mb;
          for (i2 = 0; i2 < s; ++i2) {
            if (cd[i2]) {
              var sv = i2 << 4 | cd[i2];
              var r_1 = mb - cd[i2];
              var v = le[cd[i2] - 1]++ << r_1;
              for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
                co[rev[v] >> rvb] = sv;
              }
            }
          }
        } else {
          co = new u16(s);
          for (i2 = 0; i2 < s; ++i2) {
            if (cd[i2]) {
              co[i2] = rev[le[cd[i2] - 1]++] >> 15 - cd[i2];
            }
          }
        }
        return co;
      });
      flt = new u8(288);
      for (i = 0; i < 144; ++i)
        flt[i] = 8;
      for (i = 144; i < 256; ++i)
        flt[i] = 9;
      for (i = 256; i < 280; ++i)
        flt[i] = 7;
      for (i = 280; i < 288; ++i)
        flt[i] = 8;
      fdt = new u8(32);
      for (i = 0; i < 32; ++i)
        fdt[i] = 5;
      flm = /* @__PURE__ */ hMap(flt, 9, 0);
      fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
      shft = function(p) {
        return (p + 7) / 8 | 0;
      };
      slc = function(v, s, e) {
        if (s == null || s < 0)
          s = 0;
        if (e == null || e > v.length)
          e = v.length;
        return new u8(v.subarray(s, e));
      };
      ec = [
        "unexpected EOF",
        "invalid block type",
        "invalid length/literal",
        "invalid distance",
        "stream finished",
        "no stream handler",
        ,
        // determined by compression function
        "no callback",
        "invalid UTF-8 data",
        "extra field too long",
        "date not in range 1980-2099",
        "filename too long",
        "stream finishing",
        "invalid zip data"
        // determined by unknown compression method
      ];
      err = function(ind, msg, nt) {
        var e = new Error(msg || ec[ind]);
        e.code = ind;
        if (Error.captureStackTrace)
          Error.captureStackTrace(e, err);
        if (!nt)
          throw e;
        return e;
      };
      wbits = function(d, p, v) {
        v <<= p & 7;
        var o = p / 8 | 0;
        d[o] |= v;
        d[o + 1] |= v >> 8;
      };
      wbits16 = function(d, p, v) {
        v <<= p & 7;
        var o = p / 8 | 0;
        d[o] |= v;
        d[o + 1] |= v >> 8;
        d[o + 2] |= v >> 16;
      };
      hTree = function(d, mb) {
        var t = [];
        for (var i2 = 0; i2 < d.length; ++i2) {
          if (d[i2])
            t.push({ s: i2, f: d[i2] });
        }
        var s = t.length;
        var t2 = t.slice();
        if (!s)
          return { t: et, l: 0 };
        if (s == 1) {
          var v = new u8(t[0].s + 1);
          v[t[0].s] = 1;
          return { t: v, l: 1 };
        }
        t.sort(function(a, b) {
          return a.f - b.f;
        });
        t.push({ s: -1, f: 25001 });
        var l = t[0], r = t[1], i0 = 0, i1 = 1, i22 = 2;
        t[0] = { s: -1, f: l.f + r.f, l, r };
        while (i1 != s - 1) {
          l = t[t[i0].f < t[i22].f ? i0++ : i22++];
          r = t[i0 != i1 && t[i0].f < t[i22].f ? i0++ : i22++];
          t[i1++] = { s: -1, f: l.f + r.f, l, r };
        }
        var maxSym = t2[0].s;
        for (var i2 = 1; i2 < s; ++i2) {
          if (t2[i2].s > maxSym)
            maxSym = t2[i2].s;
        }
        var tr = new u16(maxSym + 1);
        var mbt = ln(t[i1 - 1], tr, 0);
        if (mbt > mb) {
          var i2 = 0, dt = 0;
          var lft = mbt - mb, cst = 1 << lft;
          t2.sort(function(a, b) {
            return tr[b.s] - tr[a.s] || a.f - b.f;
          });
          for (; i2 < s; ++i2) {
            var i2_1 = t2[i2].s;
            if (tr[i2_1] > mb) {
              dt += cst - (1 << mbt - tr[i2_1]);
              tr[i2_1] = mb;
            } else
              break;
          }
          dt >>= lft;
          while (dt > 0) {
            var i2_2 = t2[i2].s;
            if (tr[i2_2] < mb)
              dt -= 1 << mb - tr[i2_2]++ - 1;
            else
              ++i2;
          }
          for (; i2 >= 0 && dt; --i2) {
            var i2_3 = t2[i2].s;
            if (tr[i2_3] == mb) {
              --tr[i2_3];
              ++dt;
            }
          }
          mbt = mb;
        }
        return { t: new u8(tr), l: mbt };
      };
      ln = function(n, l, d) {
        return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
      };
      lc = function(c) {
        var s = c.length;
        while (s && !c[--s])
          ;
        var cl = new u16(++s);
        var cli = 0, cln = c[0], cls = 1;
        var w = function(v) {
          cl[cli++] = v;
        };
        for (var i2 = 1; i2 <= s; ++i2) {
          if (c[i2] == cln && i2 != s)
            ++cls;
          else {
            if (!cln && cls > 2) {
              for (; cls > 138; cls -= 138)
                w(32754);
              if (cls > 2) {
                w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
                cls = 0;
              }
            } else if (cls > 3) {
              w(cln), --cls;
              for (; cls > 6; cls -= 6)
                w(8304);
              if (cls > 2)
                w(cls - 3 << 5 | 8208), cls = 0;
            }
            while (cls--)
              w(cln);
            cls = 1;
            cln = c[i2];
          }
        }
        return { c: cl.subarray(0, cli), n: s };
      };
      clen = function(cf, cl) {
        var l = 0;
        for (var i2 = 0; i2 < cl.length; ++i2)
          l += cf[i2] * cl[i2];
        return l;
      };
      wfblk = function(out, pos, dat) {
        var s = dat.length;
        var o = shft(pos + 2);
        out[o] = s & 255;
        out[o + 1] = s >> 8;
        out[o + 2] = out[o] ^ 255;
        out[o + 3] = out[o + 1] ^ 255;
        for (var i2 = 0; i2 < s; ++i2)
          out[o + i2 + 4] = dat[i2];
        return (o + 4 + s) * 8;
      };
      wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
        wbits(out, p++, final);
        ++lf[256];
        var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
        var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
        var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
        var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
        var lcfreq = new u16(19);
        for (var i2 = 0; i2 < lclt.length; ++i2)
          ++lcfreq[lclt[i2] & 31];
        for (var i2 = 0; i2 < lcdt.length; ++i2)
          ++lcfreq[lcdt[i2] & 31];
        var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
        var nlcc = 19;
        for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
          ;
        var flen = bl + 5 << 3;
        var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
        var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
        if (bs >= 0 && flen <= ftlen && flen <= dtlen)
          return wfblk(out, p, dat.subarray(bs, bs + bl));
        var lm, ll, dm, dl;
        wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
        if (dtlen < ftlen) {
          lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
          var llm = hMap(lct, mlcb, 0);
          wbits(out, p, nlc - 257);
          wbits(out, p + 5, ndc - 1);
          wbits(out, p + 10, nlcc - 4);
          p += 14;
          for (var i2 = 0; i2 < nlcc; ++i2)
            wbits(out, p + 3 * i2, lct[clim[i2]]);
          p += 3 * nlcc;
          var lcts = [lclt, lcdt];
          for (var it = 0; it < 2; ++it) {
            var clct = lcts[it];
            for (var i2 = 0; i2 < clct.length; ++i2) {
              var len = clct[i2] & 31;
              wbits(out, p, llm[len]), p += lct[len];
              if (len > 15)
                wbits(out, p, clct[i2] >> 5 & 127), p += clct[i2] >> 12;
            }
          }
        } else {
          lm = flm, ll = flt, dm = fdm, dl = fdt;
        }
        for (var i2 = 0; i2 < li; ++i2) {
          var sym = syms[i2];
          if (sym > 255) {
            var len = sym >> 18 & 31;
            wbits16(out, p, lm[len + 257]), p += ll[len + 257];
            if (len > 7)
              wbits(out, p, sym >> 23 & 31), p += fleb[len];
            var dst = sym & 31;
            wbits16(out, p, dm[dst]), p += dl[dst];
            if (dst > 3)
              wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
          } else {
            wbits16(out, p, lm[sym]), p += ll[sym];
          }
        }
        wbits16(out, p, lm[256]);
        return p + ll[256];
      };
      deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
      et = /* @__PURE__ */ new u8(0);
      dflt = function(dat, lvl, plvl, pre, post, st) {
        var s = st.z || dat.length;
        var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
        var w = o.subarray(pre, o.length - post);
        var lst = st.l;
        var pos = (st.r || 0) & 7;
        if (lvl) {
          if (pos)
            w[0] = st.r >> 3;
          var opt = deo[lvl - 1];
          var n = opt >> 13, c = opt & 8191;
          var msk_1 = (1 << plvl) - 1;
          var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
          var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
          var hsh = function(i3) {
            return (dat[i3] ^ dat[i3 + 1] << bs1_1 ^ dat[i3 + 2] << bs2_1) & msk_1;
          };
          var syms = new i32(25e3);
          var lf = new u16(288), df = new u16(32);
          var lc_1 = 0, eb = 0, i2 = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
          for (; i2 + 2 < s; ++i2) {
            var hv = hsh(i2);
            var imod = i2 & 32767, pimod = head[hv];
            prev[imod] = pimod;
            head[hv] = imod;
            if (wi <= i2) {
              var rem = s - i2;
              if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
                pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i2 - bs, pos);
                li = lc_1 = eb = 0, bs = i2;
                for (var j = 0; j < 286; ++j)
                  lf[j] = 0;
                for (var j = 0; j < 30; ++j)
                  df[j] = 0;
              }
              var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
              if (rem > 2 && hv == hsh(i2 - dif)) {
                var maxn = Math.min(n, rem) - 1;
                var maxd = Math.min(32767, i2);
                var ml = Math.min(258, rem);
                while (dif <= maxd && --ch_1 && imod != pimod) {
                  if (dat[i2 + l] == dat[i2 + l - dif]) {
                    var nl = 0;
                    for (; nl < ml && dat[i2 + nl] == dat[i2 + nl - dif]; ++nl)
                      ;
                    if (nl > l) {
                      l = nl, d = dif;
                      if (nl > maxn)
                        break;
                      var mmd = Math.min(dif, nl - 2);
                      var md = 0;
                      for (var j = 0; j < mmd; ++j) {
                        var ti = i2 - dif + j & 32767;
                        var pti = prev[ti];
                        var cd = ti - pti & 32767;
                        if (cd > md)
                          md = cd, pimod = ti;
                      }
                    }
                  }
                  imod = pimod, pimod = prev[imod];
                  dif += imod - pimod & 32767;
                }
              }
              if (d) {
                syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
                var lin = revfl[l] & 31, din = revfd[d] & 31;
                eb += fleb[lin] + fdeb[din];
                ++lf[257 + lin];
                ++df[din];
                wi = i2 + l;
                ++lc_1;
              } else {
                syms[li++] = dat[i2];
                ++lf[dat[i2]];
              }
            }
          }
          for (i2 = Math.max(i2, wi); i2 < s; ++i2) {
            syms[li++] = dat[i2];
            ++lf[dat[i2]];
          }
          pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i2 - bs, pos);
          if (!lst) {
            st.r = pos & 7 | w[pos / 8 | 0] << 3;
            pos -= 7;
            st.h = head, st.p = prev, st.i = i2, st.w = wi;
          }
        } else {
          for (var i2 = st.w || 0; i2 < s + lst; i2 += 65535) {
            var e = i2 + 65535;
            if (e >= s) {
              w[pos / 8 | 0] = lst;
              e = s;
            }
            pos = wfblk(w, pos + 1, dat.subarray(i2, e));
          }
          st.i = s;
        }
        return slc(o, 0, pre + shft(pos) + post);
      };
      crct = /* @__PURE__ */ (function() {
        var t = new Int32Array(256);
        for (var i2 = 0; i2 < 256; ++i2) {
          var c = i2, k = 9;
          while (--k)
            c = (c & 1 && -306674912) ^ c >>> 1;
          t[i2] = c;
        }
        return t;
      })();
      crc = function() {
        var c = -1;
        return {
          p: function(d) {
            var cr = c;
            for (var i2 = 0; i2 < d.length; ++i2)
              cr = crct[cr & 255 ^ d[i2]] ^ cr >>> 8;
            c = cr;
          },
          d: function() {
            return ~c;
          }
        };
      };
      dopt = function(dat, opt, pre, post, st) {
        if (!st) {
          st = { l: 1 };
          if (opt.dictionary) {
            var dict = opt.dictionary.subarray(-32768);
            var newDat = new u8(dict.length + dat.length);
            newDat.set(dict);
            newDat.set(dat, dict.length);
            dat = newDat;
            st.w = dict.length;
          }
        }
        return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
      };
      mrg = function(a, b) {
        var o = {};
        for (var k in a)
          o[k] = a[k];
        for (var k in b)
          o[k] = b[k];
        return o;
      };
      wbytes = function(d, b, v) {
        for (; v; ++b)
          d[b] = v, v >>>= 8;
      };
      fltn = function(d, p, t, o) {
        for (var k in d) {
          var val = d[k], n = p + k, op = o;
          if (Array.isArray(val))
            op = mrg(o, val[1]), val = val[0];
          if (ArrayBuffer.isView(val))
            t[n] = [val, op];
          else {
            t[n += "/"] = [new u8(0), op];
            fltn(val, n, t, o);
          }
        }
      };
      te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
      td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
      tds = 0;
      try {
        td.decode(et, { stream: true });
        tds = 1;
      } catch (e) {
      }
      exfl = function(ex) {
        var le = 0;
        if (ex) {
          for (var k in ex) {
            var l = ex[k].length;
            if (l > 65535)
              err(9);
            le += l + 4;
          }
        }
        return le;
      };
      wzh = function(d, b, f, fn, u, c, ce, co) {
        var fl2 = fn.length, ex = f.extra, col = co && co.length;
        var exl = exfl(ex);
        wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
        if (ce != null)
          d[b++] = 20, d[b++] = f.os;
        d[b] = 20, b += 2;
        d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
        d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
        var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
        if (y < 0 || y > 119)
          err(10);
        wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >> 1), b += 4;
        if (c != -1) {
          wbytes(d, b, f.crc);
          wbytes(d, b + 4, c < 0 ? -c - 2 : c);
          wbytes(d, b + 8, f.size);
        }
        wbytes(d, b + 12, fl2);
        wbytes(d, b + 14, exl), b += 16;
        if (ce != null) {
          wbytes(d, b, col);
          wbytes(d, b + 6, f.attrs);
          wbytes(d, b + 10, ce), b += 14;
        }
        d.set(fn, b);
        b += fl2;
        if (exl) {
          for (var k in ex) {
            var exf = ex[k], l = exf.length;
            wbytes(d, b, +k);
            wbytes(d, b + 2, l);
            d.set(exf, b + 4), b += 4 + l;
          }
        }
        if (col)
          d.set(co, b), b += col;
        return b;
      };
      wzf = function(o, b, c, d, e) {
        wbytes(o, b, 101010256);
        wbytes(o, b + 8, c);
        wbytes(o, b + 10, c);
        wbytes(o, b + 12, d);
        wbytes(o, b + 16, e);
      };
    }
  });

  // skills/studio-design/assets/starters/social-frames-export.js
  async function captureFrame(frame, allowExternal = false) {
    const model = nominalFrame(frame);
    const nodes = [frame, ...descendants(frame)];
    for (const slot of nodes.filter((node) => node.localName === "image-slot"))
      await slot.prepareCapture?.();
    for (const image of nodes.filter((node) => node instanceof HTMLImageElement))
      if (image.getAttribute("src")) await image.decode();
    const blob = await exportRegion(frame, "png", {
      title: model.title,
      outputWidth: model.width,
      outputHeight: model.height,
      allowExternal,
      download: false
    });
    return { ...model, blob };
  }
  async function downloadFrames(frames, {
    all = false,
    allowExternal = false,
    title = "Social assets",
    onProgress = () => {
    }
  } = {}) {
    const outputs = [], names = /* @__PURE__ */ new Set();
    for (let index = 0; index < frames.length; index++) {
      onProgress(index, frames.length);
      const captured = await captureFrame(frames[index], allowExternal), name2 = assetName(captured.title, names);
      outputs.push({ ...captured, name: name2 });
    }
    if (!outputs.length)
      throw new Error("There are no visible frames to export.");
    let blob, name;
    if (all) {
      const files = /* @__PURE__ */ Object.create(null);
      for (const output of outputs)
        files[output.name] = new Uint8Array(await output.blob.arrayBuffer());
      blob = new Blob([zipSync(files, { level: 0 })], {
        type: "application/zip"
      });
      name = assetName(title).replace(/\.png$/, ".zip");
    } else {
      blob = outputs[0].blob;
      name = outputs[0].name;
    }
    downloadBlob(blob, name);
    return {
      blob,
      name,
      frames: outputs.map(({ label, width, height, name: name2 }) => ({
        label,
        width,
        height,
        name: name2
      }))
    };
  }
  var init_social_frames_export = __esm({
    "skills/studio-design/assets/starters/social-frames-export.js"() {
      init_browser();
      init_canvas_export();
      init_social_model();
      init_social_dom();
    }
  });

  // skills/studio-design/assets/starters/social-frames-runtime.js
  var social_frames_runtime_exports = {};
  var SocialFrames;
  var init_social_frames_runtime = __esm({
    "skills/studio-design/assets/starters/social-frames-runtime.js"() {
      init_social_frames_style();
      init_social_dom();
      init_social_model();
      init_social_frames_export();
      SocialFrames = class extends HTMLElement {
        constructor() {
          super();
          const root = this.shadowRoot || this.attachShadow({ mode: "open", clonable: true });
          root.innerHTML = `<style>${boardStyle}</style><div class="layout"><div class="toolbar" data-codex-chrome><button class="all" hidden>\u2193 Download all (zip)</button><span class="status" role="status" aria-live="polite"></span></div><slot class="units"></slot><div class="labels" data-codex-chrome></div></div>`;
          this.layout = root.querySelector(".layout");
          this.labels = root.querySelector(".labels");
          this.all = root.querySelector(".all");
          this.status = root.querySelector(".status");
          this.records = /* @__PURE__ */ new Map();
          root.querySelector("slot").addEventListener("slotchange", () => this.schedule());
          this.all.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void this.exportAll().catch(() => {
            });
          });
        }
        connectedCallback() {
          this.setAttribute("data-codex-multi-frame", "");
          this.controller = new AbortController();
          this.observer = new MutationObserver(() => this.schedule());
          this.observer.observe(this, {
            subtree: true,
            childList: true,
            attributes: true
          });
          this.resize = new ResizeObserver(() => this.schedule());
          this.observedUnits = /* @__PURE__ */ new Set();
          this.resize.observe(this.layout);
          window.addEventListener("resize", () => this.schedule(), {
            signal: this.controller.signal
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
          const frames = this.frames(), units = [...this.children].filter(
            (node) => !node.matches("style,script,template")
          );
          const live = /* @__PURE__ */ new Set();
          for (const unit of units) {
            if (!this.observedUnits.has(unit)) {
              this.resize.observe(unit);
              this.observedUnits.add(unit);
            }
            const frame = [unit, ...descendants(unit)].find(
              (node) => node.matches(frameSelector) && frames.includes(node)
            );
            if (!frame) continue;
            live.add(unit);
            let record = this.records.get(unit);
            if (!record) {
              const bar = document.createElement("div");
              bar.className = "label";
              const text = document.createElement("span"), dim = document.createElement("span"), button = document.createElement("button");
              text.className = "label-text";
              dim.className = "dimensions";
              button.className = "download";
              button.textContent = "\u2193 PNG";
              button.title = "Download this frame at its nominal pixel size";
              bar.append(text, dim, button);
              this.labels.append(bar);
              record = { bar, text, dim, button, frame };
              this.records.set(unit, record);
              button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                void this.exportFrame(record.frame).catch(() => {
                });
              });
            }
            record.frame = frame;
            const label = frameLabel(frame), split = label.indexOf(" \xB7 ");
            record.text.textContent = split < 0 ? label : label.slice(0, split);
            record.dim.textContent = split < 0 ? "" : label.slice(split);
            record.dim.hidden = split < 0;
            record.button.setAttribute("aria-label", `Download ${label} as PNG`);
            record.button.disabled = !!this.exporting;
            const box = unit.getBoundingClientRect(), base = this.layout.getBoundingClientRect(), scaleX = base.width / this.layout.offsetWidth || 1, scaleY = base.height / this.layout.offsetHeight || 1;
            Object.assign(record.bar.style, {
              left: `${(box.left - base.left) / scaleX}px`,
              top: `${(box.top - base.top) / scaleY - 38}px`,
              width: `${box.width / scaleX}px`
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
            this.status.textContent = frames.length ? `${frames.length} visible ${frames.length === 1 ? "format" : "formats"}` : "No visible formats";
        }
        exportFrame(frame = 0) {
          return this.run(
            typeof frame === "number" ? [this.frames()[frame]] : [frame],
            false
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
                this.status.textContent = `Preparing ${index + 1} of ${total} formats\u2026`;
              }
            });
            this.status.textContent = `Downloaded ${result.name}`;
            this.message = true;
            this.dispatchEvent(
              new CustomEvent("social-frames:export", {
                bubbles: true,
                composed: true,
                detail: { name: result.name, frames: result.frames }
              })
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
                detail: { message: error.message }
              })
            );
            throw error;
          } finally {
            this.exporting = false;
            this.scan();
          }
        }
      };
      if (!customElements.get("social-frames"))
        customElements.define("social-frames", SocialFrames);
    }
  });

  // skills/studio-design/assets/starters/social-frames.js
  var social_frames_exports = {};
  var init_social_frames = __esm({
    "skills/studio-design/assets/starters/social-frames.js"() {
      window.CodexSocialFramesReady = Promise.resolve().then(() => (init_social_frames_runtime(), social_frames_runtime_exports));
    }
  });

  // skills/studio-design/assets/starters/social-phone-loader.js
  var social_phone_loader_exports = {};
  __export(social_phone_loader_exports, {
    loadPhoneShell: () => loadPhoneShell
  });
  async function loadPhoneShell(tag, runtime) {
    if (!customElements.get("ios-shell")) await Promise.resolve().then(() => (init_platform_shells(), platform_shells_exports));
    if (!customElements.get("image-slot")) await Promise.resolve().then(() => (init_image_runtime(), image_runtime_exports));
    await runtime();
    await Promise.all(
      [...document.querySelectorAll(tag)].map(
        (shell) => shell.image?.settled?.()
      )
    );
  }
  var init_social_phone_loader = __esm({
    "skills/studio-design/assets/starters/social-phone-loader.js"() {
    }
  });

  // skills/studio-design/assets/starters/social-phone.js
  var identity2, commonStyle, phoneAttributes, SocialPhone;
  var init_social_phone = __esm({
    "skills/studio-design/assets/starters/social-phone.js"() {
      init_social_model();
      init_social_dom();
      identity2 = 0;
      commonStyle = `
:host{display:block;width:fit-content}*{box-sizing:border-box}
.screen{position:relative;display:flex;flex-direction:column;width:var(--shell-inner-w,402px);height:var(--shell-screen-h,874px);background:white;font-family:-apple-system,system-ui,sans-serif}
.frame{position:relative;width:100%;flex:none;overflow:hidden;background:#f0f0f0}
.photo{position:absolute;inset:0;display:block;width:100%;height:100%}.extras{display:contents}
.photo::part(status-session){display:none}[hidden]{display:none!important}
svg{display:block;flex:none}.avatar{flex:none;background:linear-gradient(135deg,#e8e0d8,#c9c2ba) center/cover no-repeat}
:host([image-only=""]) .screen,:host([image-only=true]) .screen{height:auto;background:transparent}
:host([image-only=""]) [data-codex-chrome],:host([image-only=true]) [data-codex-chrome]{display:none}
`;
      phoneAttributes = [
        "id",
        "width",
        "image-only",
        "image-src",
        "image-credit",
        "image-credit-href",
        "avatar-src",
        "editable"
      ];
      SocialPhone = class extends HTMLElement {
        constructor({ style: style11, markup, dark = false, placeholder }) {
          super();
          this.fallbackId = `social-phone-${++identity2}`;
          const root = this.shadowRoot || this.attachShadow({ mode: "open", clonable: true });
          root.innerHTML = `<style>${commonStyle}${style11}</style><ios-shell data-composed-phone ${dark ? "dark" : ""}>${markup}</ios-shell>`;
          this.phone = root.querySelector("ios-shell");
          this.frame = root.querySelector(".frame");
          this.image = document.createElement("image-slot");
          for (const [name, value] of Object.entries({
            class: "photo",
            fit: "cover",
            shape: "rect",
            radius: "0",
            placeholder
          }))
            this.image.setAttribute(name, value);
          this.frame.prepend(this.image);
          this.frame.setAttribute("data-codex-frame-export", "");
        }
        connectedCallback() {
          this.sync();
        }
        attributeChangedCallback() {
          if (this.isConnected) this.sync();
        }
        value(name, fallback = "") {
          return this.getAttribute(name) || fallback;
        }
        setText(selector, value, hideEmpty = false) {
          const node = this.shadowRoot.querySelector(selector);
          node.textContent = value;
          if (hideEmpty) node.hidden = !value;
        }
        sync() {
          const parsed = Number.parseInt(this.getAttribute("width"), 10), outer = Number.isFinite(parsed) && parsed >= 27 ? parsed : 428;
          this.style.setProperty("--shell-inner-w", `${outer - 26}px`);
          this.style.setProperty(
            "--shell-screen-h",
            `${Math.round((outer - 26) * 874 / 402)}px`
          );
          this.phone.setAttribute("width", String(outer));
          this.phone.setAttribute(
            "screen-height",
            String(Math.round((outer - 26) * 874 / 402))
          );
          this.phone.setAttribute("image-only", assetOnly(this) ? "true" : "false");
          this.image.id = `${this.id || this.fallbackId}-photo`;
          for (const [attribute, target] of [
            ["image-src", "src"],
            ["image-credit", "credit"],
            ["image-credit-href", "credit-href"],
            ["editable", "editable"]
          ]) {
            const value = this.getAttribute(attribute);
            if (value !== null) this.image.setAttribute(target, value);
            else this.image.removeAttribute(target);
          }
          for (const avatar of this.shadowRoot.querySelectorAll(".avatar"))
            cssImage(avatar, this.getAttribute("avatar-src"));
        }
        async prepareCapture() {
          await this.image.prepareCapture?.();
        }
      };
    }
  });

  // skills/studio-design/assets/starters/social-icons.js
  function icon(name, size = 24, filled = false) {
    return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${paths[name] || ""}</svg>`;
  }
  var paths;
  var init_social_icons = __esm({
    "skills/studio-design/assets/starters/social-icons.js"() {
      paths = {
        back: '<path d="m14 5-7 7 7 7"/>',
        heart: '<path d="M12 20 4 12C-1 6 6 1 12 7c6-6 13-1 8 5Z"/>',
        comment: '<path d="M20 12a8 8 0 0 1-11 7l-5 2 1-5A8 8 0 1 1 20 12Z"/>',
        send: '<path d="m3 10 18-7-7 18-4-7Zm7 4L21 3"/>',
        save: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
        repost: '<path d="m17 3 4 4-4 4M21 7H8a4 4 0 0 0-4 4M7 21l-4-4 4-4M3 17h13a4 4 0 0 0 4-4"/>',
        share: '<path d="M5 12v8h14v-8M12 15V3m-5 5 5-5 5 5"/>',
        forward: '<path d="m14 4 7 6-7 7v-5c-5 0-8 2-11 6 1-6 5-9 11-10Z"/>',
        home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',
        search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
        bell: '<path d="M4 17h16c-2-2-2-4-2-8a6 6 0 0 0-12 0c0 4 0 6-2 8m6 3h4"/>',
        inbox: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
        plus: '<path d="M12 4v16M4 12h16"/>',
        create: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
        more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
        people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 3c4 0 5 3 5 7"/>',
        person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
        music: '<path d="M10 17V4l10-2v12M10 7l10-2"/><ellipse cx="7" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="15" rx="3" ry="2"/>',
        thumb: '<path d="M7 10 12 3l2 2-1 5h6l1 2-2 8H7Zm0 0H3v10h4"/>',
        globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
        video: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m10 8 5 3-5 3Z"/>',
        store: '<path d="M3 9h18l-2-5H5Zm2 3v8h14v-8M9 20v-6h6v6M3 9c0 4 5 4 5 0 0 4 4 4 4 0 0 4 4 4 4 0 0 4 5 4 5 0"/>',
        menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
        briefcase: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V4h8v4"/>',
        orbit: '<circle cx="12" cy="12" r="7"/><ellipse cx="12" cy="12" rx="11" ry="4" transform="rotate(-20 12 12)"/>',
        up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
        down: '<path d="M12 4v16m-6-6 6 6 6-6"/>',
        kebab: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
        cast: '<path d="M3 5h18v14h-7M3 5v4M3 13a8 8 0 0 1 8 8M3 17a4 4 0 0 1 4 4"/>',
        shorts: '<rect x="7" y="3" width="10" height="18" rx="4"/><path d="m10 9 5 3-5 3Z"/>',
        subscriptions: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 4h10m-7 7 5 3-5 3Z"/>',
        createCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'
      };
    }
  });

  // skills/studio-design/assets/starters/x-shell-runtime.js
  var x_shell_runtime_exports = {};
  var style3, XShell;
  var init_x_shell_runtime = __esm({
    "skills/studio-design/assets/starters/x-shell-runtime.js"() {
      init_social_phone();
      init_social_icons();
      style3 = `
.screen{color:#0f1419}.top{display:flex;align-items:center;gap:22px;padding:58px 16px 10px;font-size:17px;font-weight:700}
.head{display:flex;align-items:center;gap:10px;padding:12px 16px 4px}.avatar{width:40px;height:40px;border-radius:50%}.author{flex:1}.name{font-size:15px;font-weight:700;line-height:1.25}.handle{font-size:14px;color:#536471;line-height:1.25}.follow{margin-left:auto;border:0;border-radius:999px;background:#0f1419;color:white;padding:7px 16px;font:700 14px system-ui}
.copy{padding:8px 16px 12px;font-size:16.5px;line-height:1.4;white-space:pre-wrap}.media{position:relative;flex:none;margin:0 16px;border:1px solid #e1e8ed;border-radius:16px;overflow:hidden}
.meta{padding:14px 16px 12px;font-size:14px;color:#536471;border-bottom:.5px solid #e1e8ed}.views{color:#0f1419;font-weight:700}.actions{display:flex;align-items:center;justify-content:space-around;padding:10px;border-bottom:.5px solid #e1e8ed;color:#6b7580}.action{display:flex;align-items:center;gap:5px;font-size:13px}
.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-around;padding:12px 10px 30px;border-top:.5px solid #e1e8ed}
:host([image-only=""]) .media,:host([image-only=true]) .media{margin:0;border:0;border-radius:0}
`;
      XShell = class extends SocialPhone {
        static observedAttributes = [
          ...phoneAttributes,
          "name",
          "handle",
          "text",
          "time",
          "views",
          "replies",
          "reposts",
          "likes",
          "aspect"
        ];
        constructor() {
          super({
            style: style3,
            placeholder: "Drop the post image",
            markup: `<div class="screen"><div class="top" data-codex-chrome>${icon("back", 22)}<span>Post</span></div><div class="head" data-codex-chrome><div class="avatar"></div><div class="author"><div class="name"></div><div class="handle"></div></div><button class="follow" type="button">Follow</button></div><div class="copy" data-codex-chrome></div><div class="media"><div class="frame" part="asset"><slot class="extras"></slot></div></div><div class="meta" data-codex-chrome><span class="time"></span> \xB7 <b class="views"></b> Views</div><div class="actions" data-codex-chrome>${[
              ["comment", "replies"],
              ["repost", "reposts"],
              ["heart", "likes"],
              ["save", ""],
              ["share", ""]
            ].map(
              ([symbol, count]) => `<span class="action">${icon(symbol, 18)}${count ? `<span class="${count}"></span>` : ""}</span>`
            ).join(
              ""
            )}</div><div class="nav" data-codex-chrome aria-label="Feed navigation">${icon("home", 25, true)}${icon("search")}${icon("bell")}${icon("inbox")}</div></div>`
          });
        }
        sync() {
          super.sync();
          for (const [selector, attribute, fallback] of [
            [".name", "name", "Your brand"],
            [".handle", "handle", "@yourbrand"],
            [".time", "time", "9:41 AM \xB7 Today"],
            [".views", "views", "12.4K"],
            [".replies", "replies", "88"],
            [".reposts", "reposts", "340"],
            [".likes", "likes", "1.2K"]
          ])
            this.setText(selector, this.value(attribute, fallback));
          this.setText(".copy", this.value("text"), true);
          const square = this.value("aspect") === "square";
          this.frame.style.aspectRatio = square ? "1/1" : "1200/675";
          this.frame.setAttribute(
            "data-codex-frame-label",
            square ? "X post \xB7 1080\xD71080" : "X post \xB7 1200\xD7675"
          );
        }
      };
      if (!customElements.get("x-shell")) customElements.define("x-shell", XShell);
    }
  });

  // skills/studio-design/assets/starters/x-shell.js
  var x_shell_exports = {};
  var init_x_shell = __esm({
    "skills/studio-design/assets/starters/x-shell.js"() {
      window.CodexXReady = Promise.resolve().then(() => (init_social_phone_loader(), social_phone_loader_exports)).then(
        ({ loadPhoneShell: loadPhoneShell2 }) => loadPhoneShell2("x-shell", () => Promise.resolve().then(() => (init_x_shell_runtime(), x_shell_runtime_exports)))
      );
    }
  });

  // skills/studio-design/assets/starters/instagram-shell-runtime.js
  var instagram_shell_runtime_exports = {};
  var style4, InstagramShell;
  var init_instagram_shell_runtime = __esm({
    "skills/studio-design/assets/starters/instagram-shell-runtime.js"() {
      init_social_phone();
      init_social_icons();
      style4 = `
.screen{color:#000}.top{display:flex;align-items:center;justify-content:space-between;padding:58px 16px 8px}.title{font-size:22px;font-weight:700;letter-spacing:-.4px}.icons{display:flex;gap:20px;align-items:center}
.head{display:flex;align-items:center;gap:10px;padding:8px 14px}.avatar-ring{width:34px;height:34px;border-radius:50%;padding:2px;background:linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5);flex:none}.avatar-ring .avatar{width:100%;height:100%;border-radius:50%;border:2px solid white}.author{flex:1}.username{font-size:13px;font-weight:600;line-height:1.25}.location{font-size:11px;line-height:1.25}
.actions{display:flex;align-items:center;gap:15px;padding:8px 14px 4px}.save{margin-left:auto}.meta{padding:0 14px;display:flex;flex-direction:column;gap:5px;flex:0 1 auto;min-height:0;overflow:hidden}.likes{font-size:13px;font-weight:600}.caption{font-size:13px;line-height:1.4}.caption b{font-weight:600;margin-right:4px}.comments{font-size:13px;color:#8e8e8e;margin-top:2px}.time{font-size:10px;color:#8e8e8e;letter-spacing:.3px;text-transform:uppercase;margin-top:4px}
.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-between;padding:12px 22px 30px;border-top:.5px solid #dbdbdb}.nav .avatar{width:26px;height:26px;border-radius:50%;border:1.5px solid #000}
`;
      InstagramShell = class extends SocialPhone {
        static observedAttributes = [
          ...phoneAttributes,
          "username",
          "location",
          "caption",
          "likes",
          "comments",
          "time",
          "aspect"
        ];
        constructor() {
          super({
            style: style4,
            placeholder: "Drop the post photo",
            markup: `<div class="screen"><div class="top" data-codex-chrome><span class="title">Home</span><span class="icons">${icon("plus")}${icon("heart")}${icon("send")}</span></div><div class="head" data-codex-chrome><div class="avatar-ring"><div class="avatar"></div></div><div class="author"><div class="username"></div><div class="location"></div></div>${icon("more", 22)}</div><div class="frame" part="asset"><slot class="extras"></slot></div><div class="actions" data-codex-chrome>${icon("heart", 25)}${icon("comment", 25)}${icon("send", 25)}<span class="save">${icon("save", 25)}</span></div><div class="meta" data-codex-chrome><div class="likes"></div><div class="caption"><b></b><span></span></div><div class="comments"></div><div class="time"></div></div><div class="nav" data-codex-chrome aria-label="Feed navigation">${icon("home", 26, true)}${icon("search", 25)}${icon("create", 25)}${icon("heart", 26)}<span class="avatar"></span></div></div>`
          });
        }
        sync() {
          super.sync();
          const username = this.value("username", "yourbrand");
          this.setText(".username", username);
          this.setText(".caption b", username);
          this.setText(".caption span", this.value("caption").replace(/^\s+/, ""));
          this.setText(".location", this.value("location"), true);
          this.setText(".comments", this.value("comments"), true);
          this.setText(".likes", this.value("likes", "1,024 likes"));
          this.setText(".time", this.value("time", "2 hours ago"));
          const portrait = this.value("aspect") === "portrait";
          this.frame.style.aspectRatio = portrait ? "1080/1350" : "1/1";
          this.frame.setAttribute(
            "data-codex-frame-label",
            portrait ? "Instagram portrait \xB7 1080\xD71350" : "Instagram post \xB7 1080\xD71080"
          );
        }
      };
      if (!customElements.get("instagram-shell"))
        customElements.define("instagram-shell", InstagramShell);
    }
  });

  // skills/studio-design/assets/starters/instagram-shell.js
  var instagram_shell_exports = {};
  var init_instagram_shell = __esm({
    "skills/studio-design/assets/starters/instagram-shell.js"() {
      window.CodexInstagramReady = Promise.resolve().then(() => (init_social_phone_loader(), social_phone_loader_exports)).then(
        ({ loadPhoneShell: loadPhoneShell2 }) => loadPhoneShell2(
          "instagram-shell",
          () => Promise.resolve().then(() => (init_instagram_shell_runtime(), instagram_shell_runtime_exports))
        )
      );
    }
  });

  // skills/studio-design/assets/starters/tiktok-shell-runtime.js
  var tiktok_shell_runtime_exports = {};
  var style5, TikTokShell;
  var init_tiktok_shell_runtime = __esm({
    "skills/studio-design/assets/starters/tiktok-shell-runtime.js"() {
      init_social_phone();
      init_social_icons();
      style5 = `
.screen{justify-content:center;background:black}.frame{aspect-ratio:9/16;background:#111}
.tabs{position:absolute;top:14px;left:0;right:0;display:flex;justify-content:center;gap:18px;z-index:40;color:white;font-size:15px;text-shadow:0 1px 4px #0007}.tabs span{opacity:.7}.tabs .active{font-weight:700;opacity:1;position:relative}.tabs .active:after{content:"";position:absolute;left:50%;transform:translateX(-50%);bottom:-7px;width:28px;height:3px;border-radius:2px;background:white}
.rail{position:absolute;right:8px;bottom:16px;display:flex;flex-direction:column;align-items:center;gap:17px;z-index:40;color:white}.action{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:12px;font-weight:600;text-shadow:0 1px 4px #0007}.rail svg{filter:drop-shadow(0 1px 3px #0006)}.avatar-wrap{position:relative;width:42px;height:42px;margin-bottom:4px}.avatar{display:block;width:42px;height:42px;border-radius:50%;border:1.5px solid white}.follow{position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);width:18px;height:18px;border-radius:50%;background:#fe2c55;color:white;display:grid;place-items:center;font-size:13px;font-weight:700;line-height:1}.disc{width:38px;height:38px;border-radius:50%;margin-top:2px;background:radial-gradient(circle,#e8e0d8 0 9px,#1c1c1e 9px 15px,#3a3a3c 15px)}
.meta{position:absolute;left:12px;right:76px;bottom:16px;display:flex;flex-direction:column;gap:7px;z-index:40;color:white;text-shadow:0 1px 4px #0007}.username{font-size:16px;font-weight:700;line-height:1.2}.caption{font-size:14px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sound{display:flex;align-items:center;gap:7px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sound span{overflow:hidden;text-overflow:ellipsis}
.nav{position:absolute;left:0;right:0;bottom:14px;display:flex;align-items:center;justify-content:space-around;padding:0 10px;z-index:40;color:#ffffff9e}.nav-item{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px}.nav-item.active{color:white;font-weight:600}.create{position:relative;width:42px;height:28px;margin:0 4px}.create:before,.create:after{content:"";position:absolute;inset:0;border-radius:8px}.create:before{background:#25f4ee;transform:translateX(-4px)}.create:after{background:#fe2c55;transform:translateX(4px)}.create b{position:absolute;inset:0;z-index:1;border-radius:8px;background:white;color:black;display:grid;place-items:center;font-size:19px;font-weight:600;line-height:1}
`;
      TikTokShell = class extends SocialPhone {
        static observedAttributes = [
          ...phoneAttributes,
          "username",
          "caption",
          "sound",
          "likes",
          "comments",
          "saves",
          "shares"
        ];
        constructor() {
          super({
            style: style5,
            dark: true,
            placeholder: "Drop the video still",
            markup: `<div class="screen"><div class="frame" part="asset" data-codex-frame-label="TikTok \xB7 1080\xD71920"><slot class="extras"></slot><div class="tabs" data-codex-chrome><span>Following</span><span class="active">For You</span></div><div class="rail" data-codex-chrome><span class="avatar-wrap"><span class="avatar"></span><span class="follow">+</span></span>${[
              ["heart", 32, "likes"],
              ["comment", 30, "comments"],
              ["save", 28, "saves"],
              ["forward", 30, "shares"]
            ].map(
              ([symbol, size, count]) => `<span class="action">${icon(symbol, size, true)}<span class="${count}"></span></span>`
            ).join(
              ""
            )}<span class="disc"></span></div><div class="meta" data-codex-chrome><span class="username"></span><span class="caption"></span><span class="sound">${icon("music", 14, true)}<span></span></span></div></div><div class="nav" data-codex-chrome><span class="nav-item active">${icon("home", 23, true)}Home</span><span class="nav-item">${icon("people", 23)}Friends</span><span class="create"><b>+</b></span><span class="nav-item">${icon("inbox", 23)}Inbox</span><span class="nav-item">${icon("person", 23)}Profile</span></div></div>`
          });
        }
        sync() {
          super.sync();
          const username = this.value("username", "yourbrand").replace(/^@/, "");
          this.setText(".username", "@" + username);
          this.setText(".caption", this.value("caption"), true);
          this.setText(
            ".sound span",
            this.value("sound", "Original sound \xB7 " + username)
          );
          for (const [name, fallback] of [
            ["likes", "24.5K"],
            ["comments", "482"],
            ["saves", "1,208"],
            ["shares", "3,407"]
          ])
            this.setText("." + name, this.value(name, fallback));
        }
      };
      if (!customElements.get("tiktok-shell"))
        customElements.define("tiktok-shell", TikTokShell);
    }
  });

  // skills/studio-design/assets/starters/tiktok-shell.js
  var tiktok_shell_exports = {};
  var init_tiktok_shell = __esm({
    "skills/studio-design/assets/starters/tiktok-shell.js"() {
      window.CodexTikTokReady = Promise.resolve().then(() => (init_social_phone_loader(), social_phone_loader_exports)).then(
        ({ loadPhoneShell: loadPhoneShell2 }) => loadPhoneShell2("tiktok-shell", () => Promise.resolve().then(() => (init_tiktok_shell_runtime(), tiktok_shell_runtime_exports)))
      );
    }
  });

  // skills/studio-design/assets/starters/facebook-shell-runtime.js
  var facebook_shell_runtime_exports = {};
  var style6, FacebookShell;
  var init_facebook_shell_runtime = __esm({
    "skills/studio-design/assets/starters/facebook-shell-runtime.js"() {
      init_social_phone();
      init_social_icons();
      style6 = `
.screen{background:#f0f2f5;color:#050505}.top{display:flex;align-items:center;justify-content:space-between;padding:58px 16px 10px;background:white}.feed-title{font-size:22px;font-weight:800;letter-spacing:-.4px}.icons{display:flex;gap:12px;align-items:center}.icon-disc{width:36px;height:36px;border-radius:50%;background:#e4e6eb;display:grid;place-items:center}
.card{background:white;margin-top:8px}.head{display:flex;align-items:center;gap:9px;padding:12px 14px 8px}.avatar{width:40px;height:40px;border-radius:50%}.author{flex:1}.name{font-size:15px;font-weight:600;line-height:1.25}.sub{font-size:12.5px;color:#65676b;line-height:1.25;display:flex;align-items:center;gap:4px}.copy{padding:0 14px 10px;font-size:15px;line-height:1.35}
.counts{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;font-size:13.5px;color:#65676b}.reactions{display:flex;align-items:center;gap:5px}.reaction-disc{width:18px;height:18px;border-radius:50%;background:#1877f2;display:inline-flex;align-items:center;justify-content:center;color:white}.reaction-disc.love{background:#f33e58;margin-left:-6px}.actions{display:flex;align-items:center;border-top:.5px solid #e4e6eb;margin:0 10px;padding:2px 0}.action{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:9px 0;font-size:14px;font-weight:600;color:#65676b}
.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-around;padding:12px 10px 30px;background:white;border-top:.5px solid #e4e6eb;color:#65676b}.nav .active{color:#1877f2}
:host([image-only=""]) .card,:host([image-only=true]) .card{margin:0;background:transparent}
`;
      FacebookShell = class extends SocialPhone {
        static observedAttributes = [
          ...phoneAttributes,
          "name",
          "time",
          "text",
          "likes",
          "comments",
          "shares",
          "aspect"
        ];
        constructor() {
          super({
            style: style6,
            placeholder: "Drop the post image",
            markup: `<div class="screen"><div class="top" data-codex-chrome><span class="feed-title">Feed</span><span class="icons"><span class="icon-disc">${icon("search", 19)}</span><span class="icon-disc">${icon("comment", 19)}</span></span></div><div class="card"><div class="head" data-codex-chrome><div class="avatar"></div><div class="author"><div class="name"></div><div class="sub"><span class="time"></span> \xB7 ${icon("globe", 12)}</div></div></div><div class="copy" data-codex-chrome></div><div class="frame" part="asset"><slot class="extras"></slot></div><div class="counts" data-codex-chrome><span class="reactions"><span class="reaction-disc">${icon("thumb", 11, true)}</span><span class="reaction-disc love">${icon("heart", 10, true)}</span><span class="likes"></span></span><span><span class="comments"></span> \xB7 <span class="shares"></span></span></div><div class="actions" data-codex-chrome>${[
              ["thumb", "Like"],
              ["comment", "Comment"],
              ["forward", "Share"]
            ].map(
              ([symbol, label]) => `<span class="action">${icon(symbol, 18)}${label}</span>`
            ).join(
              ""
            )}</div></div><div class="nav" data-codex-chrome><span class="active">${icon("home", 25, true)}</span>${icon("video", 25)}${icon("store", 25)}${icon("bell", 25)}${icon("menu", 25)}</div></div>`
          });
        }
        sync() {
          super.sync();
          for (const [name, fallback] of [
            ["name", "Your brand"],
            ["time", "2h"],
            ["likes", "1.2K"],
            ["comments", "84 comments"],
            ["shares", "23 shares"]
          ])
            this.setText("." + name, this.value(name, fallback));
          this.setText(".copy", this.value("text"), true);
          const square = this.value("aspect") === "square";
          this.frame.style.aspectRatio = square ? "1/1" : "1200/630";
          this.frame.setAttribute(
            "data-codex-frame-label",
            square ? "Facebook post \xB7 1080\xD71080" : "Facebook post \xB7 1200\xD7630"
          );
        }
      };
      if (!customElements.get("facebook-shell"))
        customElements.define("facebook-shell", FacebookShell);
    }
  });

  // skills/studio-design/assets/starters/facebook-shell.js
  var facebook_shell_exports = {};
  var init_facebook_shell = __esm({
    "skills/studio-design/assets/starters/facebook-shell.js"() {
      window.CodexFacebookReady = Promise.resolve().then(() => (init_social_phone_loader(), social_phone_loader_exports)).then(
        ({ loadPhoneShell: loadPhoneShell2 }) => loadPhoneShell2(
          "facebook-shell",
          () => Promise.resolve().then(() => (init_facebook_shell_runtime(), facebook_shell_runtime_exports))
        )
      );
    }
  });

  // skills/studio-design/assets/starters/linkedin-shell-runtime.js
  var linkedin_shell_runtime_exports = {};
  var style7, LinkedInShell;
  var init_linkedin_shell_runtime = __esm({
    "skills/studio-design/assets/starters/linkedin-shell-runtime.js"() {
      init_social_phone();
      init_social_icons();
      style7 = `
.screen{background:#f3f2ef;color:#1d1d1d}.top{display:flex;align-items:center;gap:10px;padding:58px 14px 10px;background:white}.profile-disc{width:32px;height:32px;border-radius:50%;flex:none;background:linear-gradient(135deg,#e8e0d8,#c9c2ba) center/cover no-repeat}.search{flex:1;background:#eef3f8;border-radius:6px;padding:8px 12px;font-size:14px;color:#5b6770;display:flex;align-items:center;gap:8px}
.card{background:white;margin-top:8px}.head{display:flex;align-items:flex-start;gap:9px;padding:12px 14px 8px}.avatar{width:44px;height:44px;border-radius:50%}.author{flex:1;min-width:0}.name{font-size:14.5px;font-weight:600;line-height:1.3}.headline{font-size:12.5px;color:#666;line-height:1.35}.sub{font-size:12.5px;color:#666;display:flex;align-items:center;gap:4px}.follow{margin-left:auto;color:#0a66c2;font-size:14.5px;font-weight:600;background:none;border:0;display:flex;align-items:center;gap:4px}.copy{padding:0 14px 10px;font-size:14.5px;line-height:1.4}
.counts{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;font-size:12.5px;color:#666;border-bottom:.5px solid #e8e8e8;margin:0 0 2px}.reaction-disc{width:16px;height:16px;border-radius:50%;background:#378fe9;display:inline-flex;align-items:center;justify-content:center;color:white;margin-right:4px}.actions{display:flex;align-items:center;padding:2px 6px 6px}.action{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 0;font-size:12px;font-weight:600;color:#5b6770;white-space:nowrap}
.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-around;padding:12px 10px 30px;background:white;border-top:.5px solid #e8e8e8;color:#5b6770}
:host([image-only=""]) .card,:host([image-only=true]) .card{margin:0;background:transparent}
`;
      LinkedInShell = class extends SocialPhone {
        static observedAttributes = [
          ...phoneAttributes,
          "name",
          "headline",
          "time",
          "text",
          "reactions",
          "comments",
          "reposts",
          "aspect"
        ];
        constructor() {
          super({
            style: style7,
            placeholder: "Drop the post image",
            markup: `<div class="screen"><div class="top" data-codex-chrome><span class="profile-disc"></span><div class="search">${icon("search", 15)}Search</div></div><div class="card"><div class="head" data-codex-chrome><div class="avatar"></div><div class="author"><div class="name"></div><div class="headline"></div><div class="sub"><span class="time"></span> \xB7 ${icon("globe", 11)}</div></div><button class="follow" type="button">${icon("plus", 14)}Follow</button></div><div class="copy" data-codex-chrome></div><div class="frame" part="asset"><slot class="extras"></slot></div><div class="counts" data-codex-chrome><span><span class="reaction-disc">${icon("thumb", 9, true)}</span><span class="reactions"></span></span><span><span class="comments"></span> \xB7 <span class="reposts"></span></span></div><div class="actions" data-codex-chrome>${[
              ["thumb", "Like"],
              ["comment", "Comment"],
              ["repost", "Repost"],
              ["send", "Send"]
            ].map(
              ([symbol, label]) => `<span class="action">${icon(symbol, 18)}${label}</span>`
            ).join(
              ""
            )}</div></div><div class="nav" data-codex-chrome>${icon("home", 24, true)}${icon("people")}${icon("create")}${icon("bell")}${icon("briefcase")}</div></div>`
          });
        }
        sync() {
          super.sync();
          for (const [name, fallback] of [
            ["name", "Your brand"],
            ["time", "2h"],
            ["reactions", "847"],
            ["comments", "63 comments"],
            ["reposts", "12 reposts"]
          ])
            this.setText("." + name, this.value(name, fallback));
          this.setText(".headline", this.value("headline"));
          this.setText(".copy", this.value("text"), true);
          const square = this.value("aspect") === "square";
          this.frame.style.aspectRatio = square ? "1/1" : "1200/627";
          this.frame.setAttribute(
            "data-codex-frame-label",
            square ? "LinkedIn post \xB7 1080\xD71080" : "LinkedIn post \xB7 1200\xD7627"
          );
        }
      };
      if (!customElements.get("linkedin-shell"))
        customElements.define("linkedin-shell", LinkedInShell);
    }
  });

  // skills/studio-design/assets/starters/linkedin-shell.js
  var linkedin_shell_exports = {};
  var init_linkedin_shell = __esm({
    "skills/studio-design/assets/starters/linkedin-shell.js"() {
      window.CodexLinkedInReady = Promise.resolve().then(() => (init_social_phone_loader(), social_phone_loader_exports)).then(
        ({ loadPhoneShell: loadPhoneShell2 }) => loadPhoneShell2(
          "linkedin-shell",
          () => Promise.resolve().then(() => (init_linkedin_shell_runtime(), linkedin_shell_runtime_exports))
        )
      );
    }
  });

  // skills/studio-design/assets/starters/pinterest-shell-runtime.js
  var pinterest_shell_runtime_exports = {};
  var style8, PinterestShell;
  var init_pinterest_shell_runtime = __esm({
    "skills/studio-design/assets/starters/pinterest-shell-runtime.js"() {
      init_social_phone();
      init_social_icons();
      style8 = `
.screen{color:#111}.top{display:flex;align-items:center;justify-content:space-between;padding:58px 14px 8px}.pin-wrap{position:relative;margin:4px 12px 0;border-radius:24px;overflow:hidden}.frame{aspect-ratio:1000/1500}.save{position:absolute;top:14px;right:14px;background:#e60023;color:white;border:0;border-radius:999px;padding:12px 20px;font-size:15px;font-weight:700;z-index:5}.visit{position:absolute;bottom:14px;left:14px;background:#fffffff2;color:#111;border:0;border-radius:999px;padding:11px 18px;font-size:14px;font-weight:600;z-index:5}.share{position:absolute;bottom:14px;right:14px;display:flex;gap:8px;z-index:5}.share span{width:40px;height:40px;border-radius:50%;background:#fffffff2;display:grid;place-items:center;color:#111}
.meta{padding:14px 18px 10px}.pin-title{font-size:17px;font-weight:700;line-height:1.3}.head{display:flex;align-items:center;gap:10px;padding:2px 18px 10px}.avatar{width:36px;height:36px;border-radius:50%}.author{flex:1}.username{font-size:14px;font-weight:600;line-height:1.3}.followers{font-size:12.5px;color:#767676;line-height:1.3}.follow{margin-left:auto;background:#efefef;color:#111;border:0;border-radius:999px;padding:9px 16px;font-size:13.5px;font-weight:700}.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-around;padding:12px 10px 30px;border-top:.5px solid #eee;color:#111}.nav .avatar{width:26px;height:26px}
:host([image-only=""]) .pin-wrap,:host([image-only=true]) .pin-wrap{margin:0;border-radius:0}
`;
      PinterestShell = class extends SocialPhone {
        static observedAttributes = [
          ...phoneAttributes,
          "title",
          "username",
          "followers",
          "site"
        ];
        constructor() {
          super({
            style: style8,
            placeholder: "Drop the pin image",
            markup: `<div class="screen"><div class="top" data-codex-chrome>${icon("back", 22)}${icon("more", 20)}</div><div class="pin-wrap"><div class="frame" part="asset" data-codex-frame-label="Pinterest pin \xB7 1000\xD71500"><slot class="extras"></slot></div><button class="save" data-codex-chrome type="button">Save</button><button class="visit" data-codex-chrome type="button"></button><div class="share" data-codex-chrome><span>${icon("share", 17)}</span><span>${icon("more", 20)}</span></div></div><div class="meta" data-codex-chrome><div class="pin-title"></div></div><div class="head" data-codex-chrome><div class="avatar"></div><div class="author"><div class="username"></div><div class="followers"></div></div><button class="follow" type="button">Follow</button></div><div class="nav" data-codex-chrome>${icon("home", 24, true)}${icon("search")}${icon("plus")}${icon("comment")}<span class="avatar"></span></div></div>`
          });
        }
        sync() {
          super.sync();
          const title = this.value("title");
          this.setText(".pin-title", title);
          this.shadowRoot.querySelector(".meta").hidden = !title;
          for (const [selector, name, fallback] of [
            [".username", "username", "yourbrand"],
            [".followers", "followers", "12k followers"],
            [".visit", "site", "Visit site"]
          ])
            this.setText(selector, this.value(name, fallback));
        }
      };
      if (!customElements.get("pinterest-shell"))
        customElements.define("pinterest-shell", PinterestShell);
    }
  });

  // skills/studio-design/assets/starters/pinterest-shell.js
  var pinterest_shell_exports = {};
  var init_pinterest_shell = __esm({
    "skills/studio-design/assets/starters/pinterest-shell.js"() {
      window.CodexPinterestReady = Promise.resolve().then(() => (init_social_phone_loader(), social_phone_loader_exports)).then(
        ({ loadPhoneShell: loadPhoneShell2 }) => loadPhoneShell2(
          "pinterest-shell",
          () => Promise.resolve().then(() => (init_pinterest_shell_runtime(), pinterest_shell_runtime_exports))
        )
      );
    }
  });

  // skills/studio-design/assets/starters/reddit-shell-runtime.js
  var reddit_shell_runtime_exports = {};
  var style9, RedditShell;
  var init_reddit_shell_runtime = __esm({
    "skills/studio-design/assets/starters/reddit-shell-runtime.js"() {
      init_social_phone();
      init_social_icons();
      style9 = `
.screen{color:#1a1a1b}.top{display:flex;align-items:center;gap:12px;padding:58px 16px 10px;border-bottom:.5px solid #e0e0e0}.community-top{font-size:15px;font-weight:700;flex:1}.head{display:flex;align-items:center;gap:9px;padding:12px 14px 6px}.community-disc{width:32px;height:32px;border-radius:50%;flex:none;background:linear-gradient(135deg,#ff6a3d,#ff9b63)}.author{flex:1}.community{font-size:13px;font-weight:700;line-height:1.3}.sub{font-size:11.5px;color:#7c7c7c;line-height:1.3}.join{margin-left:auto;background:#ff4500;color:white;border:0;border-radius:999px;padding:6px 14px;font-size:12.5px;font-weight:700}.post-title{padding:4px 14px 10px;font-size:16px;font-weight:600;line-height:1.35}
.actions{display:flex;align-items:center;gap:10px;padding:10px 14px}.chip{display:flex;align-items:center;gap:7px;border:1px solid #e0e0e0;border-radius:999px;padding:7px 13px;font-size:13px;font-weight:600;color:#333}.spacer{flex:1}.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-around;padding:12px 10px 30px;border-top:.5px solid #e0e0e0;color:#1a1a1b}.notifications{position:relative}.notifications:after{content:"";position:absolute;right:3px;top:2px;width:6px;height:6px;border-radius:50%;background:#ff4500}
`;
      RedditShell = class extends SocialPhone {
        static observedAttributes = [
          ...phoneAttributes,
          "community",
          "username",
          "time",
          "title",
          "upvotes",
          "comments",
          "aspect"
        ];
        constructor() {
          super({
            style: style9,
            placeholder: "Drop the post image",
            markup: `<div class="screen"><div class="top" data-codex-chrome>${icon("back", 22)}<span class="community-top"></span>${icon("more", 20)}</div><div class="head" data-codex-chrome><span class="community-disc"></span><div class="author"><div class="community"></div><div class="sub"></div></div><button class="join" type="button">Join</button></div><div class="post-title" data-codex-chrome></div><div class="frame" part="asset"><slot class="extras"></slot></div><div class="actions" data-codex-chrome><span class="chip">${icon("up", 17)}<span class="upvotes"></span>${icon("down", 17)}</span><span class="chip">${icon("comment", 16)}<span class="comments"></span></span><span class="spacer"></span><span class="chip">${icon("forward", 16)}Share</span></div><div class="nav" data-codex-chrome>${icon("home", 24, true)}${icon("orbit")}${icon("plus")}${icon("comment", 23)}<span class="notifications">${icon("bell")}</span></div></div>`
          });
        }
        sync() {
          super.sync();
          const community = this.value("community", "r/yourcommunity");
          this.setText(".community-top", community);
          this.setText(".community", community);
          this.setText(
            ".sub",
            this.value("username", "u/yourbrand") + " \xB7 " + this.value("time", "5h")
          );
          this.setText(".post-title", this.value("title"), true);
          this.setText(".upvotes", this.value("upvotes", "1.2k"));
          this.setText(".comments", this.value("comments", "84"));
          const square = this.value("aspect") === "square";
          this.frame.style.aspectRatio = square ? "1/1" : "1200/675";
          this.frame.setAttribute(
            "data-codex-frame-label",
            square ? "Reddit post \xB7 1080\xD71080" : "Reddit post \xB7 1200\xD7675"
          );
        }
      };
      if (!customElements.get("reddit-shell"))
        customElements.define("reddit-shell", RedditShell);
    }
  });

  // skills/studio-design/assets/starters/reddit-shell.js
  var reddit_shell_exports = {};
  var init_reddit_shell = __esm({
    "skills/studio-design/assets/starters/reddit-shell.js"() {
      window.CodexRedditReady = Promise.resolve().then(() => (init_social_phone_loader(), social_phone_loader_exports)).then(
        ({ loadPhoneShell: loadPhoneShell2 }) => loadPhoneShell2("reddit-shell", () => Promise.resolve().then(() => (init_reddit_shell_runtime(), reddit_shell_runtime_exports)))
      );
    }
  });

  // skills/studio-design/assets/starters/youtube-shell-runtime.js
  var youtube_shell_runtime_exports = {};
  var style10, YouTubeShell;
  var init_youtube_shell_runtime = __esm({
    "skills/studio-design/assets/starters/youtube-shell-runtime.js"() {
      init_social_phone();
      init_social_icons();
      style10 = `
.screen{color:#0f0f0f}.top{display:flex;align-items:center;justify-content:space-between;padding:58px 16px 8px}.feed-title{font-size:20px;font-weight:700;letter-spacing:-.3px}.icons{display:flex;gap:18px;align-items:center}.chips{display:flex;gap:8px;padding:8px 16px 12px;overflow:hidden}.chip{background:#f2f2f2;border-radius:8px;padding:6px 12px;font-size:13.5px;font-weight:500;white-space:nowrap}.chip.active{background:#0f0f0f;color:white}.frame{aspect-ratio:1280/720}.duration{position:absolute;right:8px;bottom:8px;background:#000b;color:white;font-size:12px;font-weight:500;line-height:1;padding:3px 5px;border-radius:4px;z-index:5}
.meta{display:flex;align-items:flex-start;gap:12px;padding:12px 16px 10px}.avatar{width:36px;height:36px;border-radius:50%}.description{flex:1;min-width:0}.video-title{font-size:15px;font-weight:600;line-height:1.35}.sub{font-size:12.5px;color:#606060;line-height:1.3;margin-top:4px}.kebab{flex:none;margin-top:2px}.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-around;padding:10px 10px 30px;border-top:.5px solid #e5e5e5}
`;
      YouTubeShell = class extends SocialPhone {
        static observedAttributes = [
          ...phoneAttributes,
          "title",
          "channel",
          "views",
          "time",
          "duration"
        ];
        constructor() {
          super({
            style: style10,
            placeholder: "Drop the thumbnail image",
            markup: `<div class="screen"><div class="top" data-codex-chrome><span class="feed-title">Home</span><span class="icons">${icon("cast", 20)}${icon("bell", 20)}${icon("search", 20)}</span></div><div class="chips" data-codex-chrome><span class="chip active">All</span><span class="chip">Music</span><span class="chip">Live</span><span class="chip">Gaming</span></div><div class="frame" part="asset" data-codex-frame-label="YouTube thumbnail \xB7 1280\xD7720"><span class="duration" data-codex-chrome></span><slot class="extras"></slot></div><div class="meta" data-codex-chrome><span class="avatar"></span><div class="description"><div class="video-title"></div><div class="sub"><span class="channel"></span> \xB7 <span class="views"></span> \xB7 <span class="time"></span></div></div><span class="kebab">${icon("kebab", 16)}</span></div><div class="nav" data-codex-chrome>${icon("home", 24, true)}${icon("shorts")}${icon("createCircle", 28)}${icon("subscriptions")}${icon("person")}</div></div>`
          });
        }
        sync() {
          super.sync();
          for (const [selector, name, fallback] of [
            [".video-title", "title", "Your video title"],
            [".channel", "channel", "Your brand"],
            [".views", "views", "12K views"],
            [".time", "time", "2 days ago"],
            [".duration", "duration", "3:12"]
          ])
            this.setText(selector, this.value(name, fallback));
        }
      };
      if (!customElements.get("youtube-shell"))
        customElements.define("youtube-shell", YouTubeShell);
    }
  });

  // skills/studio-design/assets/starters/youtube-shell.js
  var youtube_shell_exports = {};
  var init_youtube_shell = __esm({
    "skills/studio-design/assets/starters/youtube-shell.js"() {
      window.CodexYouTubeReady = Promise.resolve().then(() => (init_social_phone_loader(), social_phone_loader_exports)).then(
        ({ loadPhoneShell: loadPhoneShell2 }) => loadPhoneShell2("youtube-shell", () => Promise.resolve().then(() => (init_youtube_shell_runtime(), youtube_shell_runtime_exports)))
      );
    }
  });

  // skills/studio-design/assets/starters/social.js
  window.CodexSocialReady = (async () => {
    await Promise.all([
      Promise.resolve().then(() => (init_post_card(), post_card_exports)),
      Promise.resolve().then(() => (init_instagram_story(), instagram_story_exports)),
      Promise.resolve().then(() => (init_social_frames(), social_frames_exports)),
      Promise.resolve().then(() => (init_x_shell(), x_shell_exports)),
      Promise.resolve().then(() => (init_instagram_shell(), instagram_shell_exports)),
      Promise.resolve().then(() => (init_tiktok_shell(), tiktok_shell_exports)),
      Promise.resolve().then(() => (init_facebook_shell(), facebook_shell_exports)),
      Promise.resolve().then(() => (init_linkedin_shell(), linkedin_shell_exports)),
      Promise.resolve().then(() => (init_pinterest_shell(), pinterest_shell_exports)),
      Promise.resolve().then(() => (init_reddit_shell(), reddit_shell_exports)),
      Promise.resolve().then(() => (init_youtube_shell(), youtube_shell_exports))
    ]);
    await Promise.all([
      window.CodexPostsReady,
      window.CodexStoriesReady,
      window.CodexSocialFramesReady,
      window.CodexXReady,
      window.CodexInstagramReady,
      window.CodexTikTokReady,
      window.CodexFacebookReady,
      window.CodexLinkedInReady,
      window.CodexPinterestReady,
      window.CodexRedditReady,
      window.CodexYouTubeReady
    ]);
    const names = {
      instagram: "Instagram",
      story: "Instagram Story",
      x: "X",
      linkedin: "LinkedIn",
      reddit: "Reddit",
      youtube: "YouTube",
      tiktok: "TikTok",
      facebook: "Facebook",
      pinterest: "Pinterest"
    };
    class SocialFrame extends HTMLElement {
      static observedAttributes = ["platform"];
      connectedCallback() {
        if (!this.shadowRoot) {
          const root = this.attachShadow({ mode: "open", clonable: true });
          root.innerHTML = "<style>:host{display:block;max-width:540px;margin:auto;border:1px solid #d5dbe4;border-radius:14px;overflow:hidden;background:white;color:#192330;font:14px system-ui}header{padding:15px 20px;border-bottom:1px solid #ddd;font-weight:700}slot{display:block}</style><header></header><slot></slot>";
        }
        this.sync();
      }
      attributeChangedCallback() {
        if (this.isConnected && this.shadowRoot) this.sync();
      }
      sync() {
        this.shadowRoot.querySelector("header").textContent = (names[this.getAttribute("platform")] || "Social") + " \xB7 local mockup";
      }
    }
    if (!customElements.get("social-frame"))
      customElements.define("social-frame", SocialFrame);
  })();
})();
