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

  // skills/studio-design/assets/starters/document-model.js
  function length(value, fallback = null) {
    value = String(value ?? "").trim();
    return value === "0" ? "0px" : /^\d+(?:\.\d+)?(?:px|in|mm|cm|pt|pc)$/.test(value) ? value : fallback;
  }
  function pixels(value) {
    const match = /^(\d+(?:\.\d+)?)(px|in|mm|cm|pt|pc)$/.exec(
      length(value) || ""
    );
    return match ? Number(match[1]) * units[match[2]] : NaN;
  }
  function geometry(element, override = {}) {
    const paper = papers[override.paper || (element.getAttribute("size") || "").toLowerCase()] || papers.letter;
    const landscape = (override.orientation || element.getAttribute("orientation") || "").trim().toLowerCase() === "landscape";
    const named = landscape ? [...paper].reverse() : [...paper];
    const width = length(element.getAttribute("width")), height = length(element.getAttribute("height"));
    const fixed = pixels(width) > 0 && pixels(height) > 0;
    const pageWidth = fixed || !override.paper ? width || named[0] : named[0];
    const pageHeight = fixed || !override.paper ? height || named[1] : named[1];
    const margin = length(element.getAttribute("margin"), "0.75in");
    const contentWidth = length(element.getAttribute("content-width")), contentHeight = length(element.getAttribute("content-height"));
    const fitScale = Math.min(
      (pixels(pageWidth) - 2 * pixels(margin)) / pixels(contentWidth),
      (pixels(pageHeight) - 2 * pixels(margin)) / pixels(contentHeight)
    );
    const fit = pixels(contentWidth) > 0 && pixels(contentHeight) > 0 && fitScale > 0 && Number.isFinite(fitScale);
    return {
      pageWidth,
      pageHeight,
      margin,
      fixed,
      landscape,
      contentWidth,
      contentHeight,
      fitScale,
      fit
    };
  }
  function printOptions(options = {}) {
    const result = {};
    if (options.paper !== void 0) {
      const paper = String(options.paper).toLowerCase();
      if (!papers[paper]) throw new Error("Paper must be letter, a4 or legal.");
      result.paper = paper;
    }
    if (options.orientation !== void 0) {
      const orientation = String(options.orientation).toLowerCase();
      if (!["portrait", "landscape"].includes(orientation))
        throw new Error("Orientation must be portrait or landscape.");
      result.orientation = orientation;
    }
    return result;
  }
  var papers, units;
  var init_document_model = __esm({
    "skills/studio-design/assets/starters/document-model.js"() {
      papers = Object.freeze({
        letter: ["8.5in", "11in"],
        a4: ["210mm", "297mm"],
        legal: ["8.5in", "14in"]
      });
      units = {
        px: 1,
        in: 96,
        mm: 96 / 25.4,
        cm: 96 / 2.54,
        pt: 96 / 72,
        pc: 16
      };
    }
  });

  // skills/studio-design/assets/starters/document-style.js
  var documentStyle, printHygiene;
  var init_document_style = __esm({
    "skills/studio-design/assets/starters/document-style.js"() {
      documentStyle = `
:host{position:relative;display:block;box-sizing:border-box;min-width:max-content;min-height:100vh;padding:48px 24px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}
.sheet{box-sizing:border-box;width:var(--doc-page-w);margin:0 auto;padding:var(--doc-page-margin);background:#fff;border-radius:7px;box-shadow:0 2px 10px #1414131f}
.preview.scaled{position:relative;margin:0 auto;overflow:clip;overflow-clip-margin:12px}
.preview.scaled>.sheet{margin:0;transform-origin:top left}
@media screen{.sheet.preview-fixed{min-height:var(--doc-page-h)}}
.frame{width:100%;border-collapse:collapse}.frame td,.frame th{padding:0;text-align:left;font-weight:inherit}
.hdr-space{height:var(--doc-hdr-h)}.ftr-space{height:var(--doc-ftr-h)}
::slotted([slot=header]),::slotted([slot=footer]){display:block;box-sizing:border-box}
.sheet.paginated{padding:0;background:transparent;border-radius:0;box-shadow:none}
.paginated ::slotted(.page){position:relative;display:block;box-sizing:border-box;width:100%;aspect-ratio:var(--doc-page-ar);container-type:size;overflow:hidden;background:#fff;border-radius:7px;box-shadow:0 2px 10px #0004;break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.paginated ::slotted(.page:not(:first-child)){margin-top:1rem}
.fit-mode .fit-box{width:calc(var(--doc-fit-w) * var(--doc-fit-scale));height:calc(var(--doc-fit-h) * var(--doc-fit-scale));margin:0 auto;break-inside:avoid}
.fit-mode ::slotted(*){contain:layout}
.fit-mode .fit{width:var(--doc-fit-w);height:var(--doc-fit-h);transform:scale(var(--doc-fit-scale));transform-origin:top left}
@media print{
:host{padding:0;background:none;min-width:0;min-height:0}
.preview.scaled{width:auto;height:auto;overflow:visible}.preview.scaled>.sheet{transform:none;margin:0}
.sheet{width:auto;margin:0;padding:0 var(--doc-page-margin);border-radius:0;box-shadow:none}
.hdr-space{height:max(var(--doc-page-margin),calc(var(--doc-hdr-h) + var(--doc-hdr-pad)))}
.ftr-space{height:max(var(--doc-page-margin),calc(var(--doc-ftr-h) + var(--doc-ftr-pad)))}
.sheet.wk-print:not(.paginated) .hdr-space{height:max(0px,calc(max(var(--doc-page-margin),calc(var(--doc-hdr-h) + var(--doc-hdr-pad))) - var(--doc-page-margin)))}
.sheet.wk-print:not(.paginated) .ftr-space{height:max(0px,calc(max(var(--doc-page-margin),calc(var(--doc-ftr-h) + var(--doc-ftr-pad))) - var(--doc-page-margin)))}
::slotted([slot=header]){position:fixed;top:0;left:0;right:0;margin:0;padding:calc(var(--doc-page-margin) * .45) var(--doc-page-margin) 0}
::slotted([slot=footer]){position:fixed;bottom:0;left:0;right:0;margin:0;padding:0 var(--doc-page-margin) calc(var(--doc-page-margin) * .45)}
.sheet.paginated{padding:0}.sheet.paginated .hdr-space,.sheet.paginated .ftr-space{height:0}
.paginated ::slotted(.page){margin:0!important;border-radius:0!important;box-shadow:none!important;width:var(--doc-page-w)!important;height:var(--doc-page-h)!important;aspect-ratio:auto!important;overflow:hidden!important}
.paginated ::slotted(.page:not(:first-child)){break-before:page!important;margin-top:0!important}
.fit-mode .fit-box{overflow:hidden}
}
`;
      printHygiene = `
@media print{
html,body{margin:0!important;padding:0!important;background:none!important;height:auto!important;overflow:visible!important}
h1,h2,h3,h4,h5,h6{break-after:avoid}figure,pre,blockquote,img,svg,tr{break-inside:avoid}p,li{orphans:3;widows:3}
*{print-color-adjust:exact;-webkit-print-color-adjust:exact;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
*,*::before,*::after{animation-delay:-99s!important;animation-duration:.001s!important;animation-iteration-count:1!important;animation-fill-mode:both!important;animation-play-state:running!important;transition-duration:0s!important}
[data-doc-controls],design-controls{display:none!important}
}
`;
    }
  });

  // skills/studio-design/assets/starters/document-print.js
  function owned(id, tag) {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement(tag);
      node.id = id;
      node.dataset.codexInjected = "";
      document.head.append(node);
    }
    return node;
  }
  function meta(key, name, content) {
    const authored = [...document.querySelectorAll(`meta[name="${name}"]`)].some(
      (node2) => !node2.hasAttribute("data-codex-injected")
    );
    if (!content || authored) {
      document.getElementById(ids[key])?.remove();
      return;
    }
    const node = owned(ids[key], "meta");
    node.name = name;
    node.content = content;
  }
  function syncHead() {
    const pages = [...document.querySelectorAll("doc-page")].filter(
      (page) => page.sheet && page.isConnected
    );
    if (!pages.length) {
      for (const id of Object.values(ids)) document.getElementById(id)?.remove();
      return;
    }
    const fixed = pages.find((page) => page.printGeometry.fixed), owner = fixed || pages[0];
    const g = owner.printGeometry;
    const pinned = g.fixed || g.fit || owner.paginated || owner.printOverride?.paper;
    const size = pinned ? `size:${g.pageWidth} ${g.pageHeight};` : g.landscape ? "size:landscape;" : "";
    const margin = webkitPrint && !g.fixed && !g.fit && !owner.paginated ? `${g.margin} 0` : "0";
    const style = owned(ids.print, "style");
    const css = `@page{${size}margin:${margin}}${printHygiene}`;
    if (style.textContent !== css) style.textContent = css;
    if (document.head.lastElementChild !== style) document.head.append(style);
    const wrap = owned(ids.wrap, "style");
    const typography = ":where(doc-page h1,doc-page h2,doc-page h3,doc-page h4,doc-page h5,doc-page h6){text-wrap:balance}:where(doc-page p,doc-page li,doc-page blockquote,doc-page figcaption){text-wrap:pretty}";
    if (wrap.textContent !== typography) wrap.textContent = typography;
    meta("owns", "codex-owns-print", "true");
    meta(
      "fixed",
      "codex-fixed-size",
      fixed ? `${Math.round(fixed.printWidth)},${Math.round(fixed.printHeight)}` : null
    );
    meta(
      "sizing",
      "codex-print-sizing",
      fixed ? "fixed" : g.landscape ? "default-landscape" : "default-portrait"
    );
  }
  var webkitPrint, ids;
  var init_document_print = __esm({
    "skills/studio-design/assets/starters/document-print.js"() {
      init_document_style();
      webkitPrint = /apple/i.test(navigator.vendor || "");
      ids = {
        print: "codex-document-print",
        wrap: "codex-document-wrap",
        owns: "codex-document-owns-print",
        fixed: "codex-document-fixed-size",
        sizing: "codex-document-sizing"
      };
    }
  });

  // skills/studio-design/assets/starters/document-preview.js
  var DocumentPreview;
  var init_document_preview = __esm({
    "skills/studio-design/assets/starters/document-preview.js"() {
      DocumentPreview = class {
        constructor(page) {
          this.page = page;
          this.scale = 1;
          this.wrapper = page.shadowRoot.querySelector(".preview");
          this.style = page.shadowRoot.querySelector("[data-preview-vars]");
          this.observer = new ResizeObserver(() => page.schedule());
          this.modeObserver = new MutationObserver(() => page.schedule());
        }
        connect() {
          this.observer.observe(this.page);
          if (this.page.parentElement) this.observer.observe(this.page.parentElement);
          this.observer.observe(this.page.sheet);
          this.modeObserver.observe(document.head, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["name", "content"]
          });
        }
        disconnect() {
          this.observer.disconnect();
          this.modeObserver.disconnect();
        }
        sync(geometry2) {
          const page = this.page;
          const enabled = geometry2.fixed && page.getAttribute("preview") !== "actual-size" && !page.closest("design-canvas,doc-page doc-page") && !document.querySelector('meta[name="design_doc_mode"][content="canvas"]');
          this.wrapper.classList.toggle("scaled", enabled);
          page.sheet.classList.toggle("preview-fixed", enabled);
          if (!enabled) {
            this.scale = 1;
            if (this.style.textContent) this.style.textContent = "";
            return;
          }
          const base = "@media screen{:host{min-width:0}}";
          if (!this.style.textContent) this.style.textContent = base;
          const computed = getComputedStyle(page);
          const inset = (first, second) => (parseFloat(computed[first]) || 0) + (parseFloat(computed[second]) || 0);
          const sheetStyle = getComputedStyle(page.sheet);
          const width = parseFloat(sheetStyle.width);
          const height = parseFloat(sheetStyle.height);
          const pageHeight = parseFloat(sheetStyle.minHeight);
          if (![width, height, pageHeight].every(
            (value) => Number.isFinite(value) && value > 0
          ))
            return;
          const availableWidth = Math.max(
            1,
            page.clientWidth - inset("paddingLeft", "paddingRight")
          );
          const top = page.getBoundingClientRect().top + scrollY;
          const leading = top >= 0 && top < innerHeight ? top : 0;
          const availableHeight = Math.max(
            1,
            innerHeight - leading - inset("paddingTop", "paddingBottom")
          );
          this.scale = Math.min(availableWidth / width, availableHeight / pageHeight);
          const css = `${base}@media screen{.preview.scaled{width:${width * this.scale}px;height:${height * this.scale}px}.preview.scaled>.sheet{transform:scale(${this.scale})}}`;
          if (this.style.textContent !== css) this.style.textContent = css;
        }
      };
    }
  });

  // skills/studio-design/assets/starters/document-runtime.js
  var document_runtime_exports = {};
  __export(document_runtime_exports, {
    DocPage: () => DocPage
  });
  var DocPage;
  var init_document_runtime = __esm({
    "skills/studio-design/assets/starters/document-runtime.js"() {
      init_document_model();
      init_document_style();
      init_document_print();
      init_document_preview();
      DocPage = class extends HTMLElement {
        static observedAttributes = [
          "size",
          "width",
          "height",
          "margin",
          "orientation",
          "content-width",
          "content-height",
          "preview"
        ];
        constructor() {
          super();
          this.attachShadow({ mode: "open" }).innerHTML = `<style>${documentStyle}</style><style data-vars></style><style data-print-vars></style><style data-preview-vars></style>
      <div class="preview"><div class="sheet" data-screen-label="Document"><table class="frame" role="presentation">
      <thead><tr><th><div class="hdr-space"><slot name="header"></slot></div></th></tr></thead>
      <tbody><tr><td><div class="fit-box"><div class="fit"><slot></slot></div></div></td></tr></tbody>
      <tfoot><tr><td><div class="ftr-space"><slot name="footer"></slot></div></td></tr></tfoot></table></div></div>`;
          this.sheet = this.shadowRoot.querySelector(".sheet");
          this.ready = new Promise((resolve) => this.resolveReady = resolve);
          this.observer = new MutationObserver(() => this.schedule());
          this.resizeObserver = new ResizeObserver(() => this.schedule());
          this.runningPadding = /* @__PURE__ */ new WeakMap();
          this.headerHeight = 0;
          this.footerHeight = 0;
          this.paginated = false;
          this.previewController = new DocumentPreview(this);
        }
        get previewScale() {
          return this.printing ? 1 : this.previewController.scale;
        }
        get pageWidth() {
          return geometry(this).pageWidth;
        }
        get pageHeight() {
          return geometry(this).pageHeight;
        }
        get pageMargin() {
          return geometry(this).margin;
        }
        get printGeometry() {
          return geometry(this, this.printOverride);
        }
        get printWidth() {
          return pixels(this.printGeometry.pageWidth);
        }
        get printHeight() {
          return pixels(this.printGeometry.pageHeight);
        }
        get layoutMode() {
          const g = geometry(this);
          return this.paginated ? "paginated" : g.fit ? "fit" : g.fixed ? "fixed" : "flow";
        }
        connectedCallback() {
          this.events?.abort();
          this.events = new AbortController();
          const options = { signal: this.events.signal };
          this.observer.observe(this, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true
          });
          window.addEventListener("resize", () => this.schedule(), options);
          window.addEventListener(
            "beforeprint",
            () => {
              this.printing = true;
              this.syncSize();
              syncHead();
            },
            options
          );
          window.addEventListener("afterprint", () => this.restorePrint(), options);
          this.media = matchMedia("print");
          this.mediaChanged = (event) => {
            this.printing = event.matches;
            if (!event.matches) this.schedule();
          };
          this.media.addEventListener("change", this.mediaChanged, options);
          document.fonts?.addEventListener(
            "loadingdone",
            () => this.schedule(),
            options
          );
          document.fonts?.ready.then(() => this.schedule());
          this.measure();
          this.previewController.connect();
          this.resolveReady(this);
        }
        disconnectedCallback() {
          this.events?.abort();
          this.observer.disconnect();
          this.resizeObserver.disconnect();
          this.previewController.disconnect();
          this.targets = null;
          cancelAnimationFrame(this.frame);
          this.frame = null;
          syncHead();
        }
        attributeChangedCallback() {
          if (this.isConnected) this.measure();
        }
        schedule() {
          if (!this.isConnected || this.frame) return;
          this.frame = requestAnimationFrame(() => {
            this.frame = null;
            this.measure();
          });
        }
        runningHeight(node, edge) {
          if (!node) return 0;
          const style = getComputedStyle(node), top = parseFloat(style.paddingTop) || 0, bottom = parseFloat(style.paddingBottom) || 0;
          if (!this.media?.matches) {
            this.runningPadding.set(node, top + bottom);
            return node.offsetHeight;
          }
          const ownPadding = pixels(this.printGeometry.margin) * 0.45, side = edge === "top" ? top : bottom, opposite = edge === "top" ? bottom : top, added = Math.abs(side - ownPadding) < 0.01 && opposite === 0 ? Math.max(0, top + bottom - (this.runningPadding.get(node) || 0)) : 0;
          const height = parseFloat(style.height);
          const boxHeight = Number.isFinite(height) ? height + (style.boxSizing === "border-box" ? 0 : top + bottom + (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0)) : node.offsetHeight;
          return Math.max(0, Math.round(boxHeight - added));
        }
        measure() {
          if (!this.isConnected) return;
          this.paginated = !!this.querySelector(":scope > .page");
          this.sheet.classList.toggle("paginated", this.paginated);
          const header = this.querySelector(':scope > [slot="header"]'), footer = this.querySelector(':scope > [slot="footer"]');
          this.headerHeight = this.runningHeight(header, "top");
          this.footerHeight = this.runningHeight(footer, "bottom");
          if (!this.targets || header !== this.targets[0] || footer !== this.targets[1]) {
            this.resizeObserver.disconnect();
            for (const node of [header, footer])
              if (node) this.resizeObserver.observe(node);
            this.targets = [header, footer];
          }
          this.syncSize();
          syncHead();
        }
        variables(g) {
          const result = {
            "--doc-page-w": g.pageWidth,
            "--doc-page-h": g.pageHeight,
            "--doc-page-margin": g.margin,
            "--doc-page-ar": (pixels(g.pageWidth) / pixels(g.pageHeight)).toFixed(6),
            "--doc-hdr-h": `${this.headerHeight}px`,
            "--doc-ftr-h": `${this.footerHeight}px`,
            "--doc-hdr-pad": this.headerHeight ? "0.35in" : "0px",
            "--doc-ftr-pad": this.footerHeight ? "0.35in" : "0px"
          };
          if (g.fit)
            Object.assign(result, {
              "--doc-fit-w": g.contentWidth,
              "--doc-fit-h": g.contentHeight,
              "--doc-fit-scale": g.fitScale.toFixed(4)
            });
          return Object.entries(result).map(([key, value]) => `${key}:${value};`).join("");
        }
        syncSize() {
          const screen = geometry(this), print = this.printGeometry;
          this.sheet.classList.toggle("fit-mode", screen.fit);
          this.sheet.classList.toggle(
            "wk-print",
            webkitPrint && !this.paginated && !print.fixed && !print.fit
          );
          const styles = [
            ["[data-vars]", `:host{${this.variables(screen)}}`],
            ["[data-print-vars]", `@media print{:host{${this.variables(print)}}}`]
          ];
          for (const [selector, css] of styles) {
            const node = this.shadowRoot.querySelector(selector);
            if (node.textContent !== css) node.textContent = css;
          }
          if (!this.printing) this.previewController.sync(screen);
        }
        preparePrint(options = {}) {
          this.measure();
          this.printOverride = printOptions(options);
          this.printing = true;
          this.syncSize();
          syncHead();
        }
        restorePrint() {
          this.printOverride = void 0;
          this.printing = this.media?.matches || false;
          this.syncSize();
          syncHead();
          this.schedule();
        }
      };
      if (!customElements.get("doc-page")) customElements.define("doc-page", DocPage);
      window.CodexDocument = {
        async preparePrint(options = {}) {
          const normalized = printOptions(options), pages = [...document.querySelectorAll("doc-page")];
          await Promise.all([
            document.fonts?.ready,
            ...pages.map((page) => page.ready)
          ]);
          for (const page of pages) page.preparePrint(normalized);
        },
        restorePrint() {
          for (const page of document.querySelectorAll("doc-page"))
            page.restorePrint();
        }
      };
    }
  });

  // skills/studio-design/assets/starters/document.js
  window.CodexDocumentReady = Promise.resolve().then(() => (init_document_runtime(), document_runtime_exports)).then(async () => {
    await Promise.all(
      [...document.querySelectorAll("doc-page")].map((page) => page.ready)
    );
  });
})();
