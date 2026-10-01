import { geometry, pixels, printOptions } from "./document-model.js";
import { documentStyle } from "./document-style.js";
import { syncHead, webkitPrint } from "./document-print.js";
class DocPage extends HTMLElement {
  static observedAttributes = [
    "size",
    "width",
    "height",
    "margin",
    "orientation",
    "content-width",
    "content-height",
  ];
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML =
      `<style>${documentStyle}</style><style data-vars></style><style data-print-vars></style>
      <div class="sheet" data-screen-label="Document"><table class="frame" role="presentation">
      <thead><tr><th><div class="hdr-space"><slot name="header"></slot></div></th></tr></thead>
      <tbody><tr><td><div class="fit-box"><div class="fit"><slot></slot></div></div></td></tr></tbody>
      <tfoot><tr><td><div class="ftr-space"><slot name="footer"></slot></div></td></tr></tfoot></table></div>`;
    this.sheet = this.shadowRoot.querySelector(".sheet");
    this.ready = new Promise((resolve) => (this.resolveReady = resolve));
    this.observer = new MutationObserver(() => this.schedule());
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.printing) this.schedule();
    });
    this.headerHeight = 0;
    this.footerHeight = 0;
    this.paginated = false;
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
    return this.paginated
      ? "paginated"
      : g.fit
        ? "fit"
        : g.fixed
          ? "fixed"
          : "flow";
  }
  connectedCallback() {
    this.events?.abort();
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    this.observer.observe(this, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    window.addEventListener("resize", () => this.schedule(), options);
    window.addEventListener(
      "beforeprint",
      () => {
        this.printing = true;
        this.syncSize();
        syncHead();
      },
      options,
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
      options,
    );
    document.fonts?.ready.then(() => this.schedule());
    this.measure();
    this.resolveReady(this);
  }
  disconnectedCallback() {
    this.events?.abort();
    this.observer.disconnect();
    this.resizeObserver.disconnect();
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
  measure() {
    if (!this.isConnected) return;
    this.paginated = !!this.querySelector(":scope > .page");
    this.sheet.classList.toggle("paginated", this.paginated);
    const header = this.querySelector(':scope > [slot="header"]'),
      footer = this.querySelector(':scope > [slot="footer"]');
    if (!this.printing) {
      this.headerHeight = header?.offsetHeight || 0;
      this.footerHeight = footer?.offsetHeight || 0;
    }
    if (
      !this.targets ||
      header !== this.targets[0] ||
      footer !== this.targets[1]
    ) {
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
      "--doc-ftr-pad": this.footerHeight ? "0.35in" : "0px",
    };
    if (g.fit)
      Object.assign(result, {
        "--doc-fit-w": g.contentWidth,
        "--doc-fit-h": g.contentHeight,
        "--doc-fit-scale": g.fitScale.toFixed(4),
      });
    return Object.entries(result)
      .map(([key, value]) => `${key}:${value};`)
      .join("");
  }
  syncSize() {
    const screen = geometry(this),
      print = this.printGeometry;
    this.sheet.classList.toggle("fit-mode", screen.fit);
    this.sheet.classList.toggle(
      "wk-print",
      webkitPrint && !this.paginated && !print.fixed && !print.fit,
    );
    const styles = [
      ["[data-vars]", `:host{${this.variables(screen)}}`],
      ["[data-print-vars]", `@media print{:host{${this.variables(print)}}}`],
    ];
    for (const [selector, css] of styles) {
      const node = this.shadowRoot.querySelector(selector);
      if (node.textContent !== css) node.textContent = css;
    }
  }
  preparePrint(options = {}) {
    this.measure();
    this.printOverride = printOptions(options);
    this.printing = true;
    this.syncSize();
    syncHead();
  }
  restorePrint() {
    this.printOverride = undefined;
    this.printing = this.media?.matches || false;
    this.syncSize();
    syncHead();
    this.schedule();
  }
}
if (!customElements.get("doc-page")) customElements.define("doc-page", DocPage);
window.CodexDocument = {
  async preparePrint(options = {}) {
    const normalized = printOptions(options),
      pages = [...document.querySelectorAll("doc-page")];
    await Promise.all([
      document.fonts?.ready,
      ...pages.map((page) => page.ready),
    ]);
    for (const page of pages) page.preparePrint(normalized);
  },
  restorePrint() {
    for (const page of document.querySelectorAll("doc-page"))
      page.restorePrint();
  },
};
export { DocPage };
