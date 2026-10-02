// Screen fitting belongs to the owned sheet, so author nodes and print geometry stay intact.
export class DocumentPreview {
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
      attributeFilter: ["name", "content"],
    });
  }
  disconnect() {
    this.observer.disconnect();
    this.modeObserver.disconnect();
  }
  sync(geometry) {
    const page = this.page;
    const enabled =
      geometry.fixed &&
      page.getAttribute("preview") !== "actual-size" &&
      !page.closest("design-canvas,doc-page doc-page") &&
      !document.querySelector('meta[name="design_doc_mode"][content="canvas"]');
    this.wrapper.classList.toggle("scaled", enabled);
    page.sheet.classList.toggle("preview-fixed", enabled);
    if (!enabled) {
      this.scale = 1;
      if (this.style.textContent) this.style.textContent = "";
      return;
    }
    // Release the source component's max-content desk before measuring available width.
    const base = "@media screen{:host{min-width:0}}";
    if (!this.style.textContent) this.style.textContent = base;
    const computed = getComputedStyle(page);
    const inset = (first, second) =>
      (parseFloat(computed[first]) || 0) + (parseFloat(computed[second]) || 0);
    const sheetStyle = getComputedStyle(page.sheet);
    const width = parseFloat(sheetStyle.width);
    const height = parseFloat(sheetStyle.height);
    const pageHeight = parseFloat(sheetStyle.minHeight);
    // A hidden ancestor has no measurable height; retain the last valid presentation.
    if (
      ![width, height, pageHeight].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    )
      return;
    const availableWidth = Math.max(
      1,
      page.clientWidth - inset("paddingLeft", "paddingRight"),
    );
    const top = page.getBoundingClientRect().top + scrollY;
    const leading = top >= 0 && top < innerHeight ? top : 0;
    const availableHeight = Math.max(
      1,
      innerHeight - leading - inset("paddingTop", "paddingBottom"),
    );
    this.scale = Math.min(availableWidth / width, availableHeight / pageHeight);
    const css = `${base}@media screen{.preview.scaled{width:${width * this.scale}px;height:${height * this.scale}px}.preview.scaled>.sheet{transform:scale(${this.scale})}}`;
    if (this.style.textContent !== css) this.style.textContent = css;
  }
}
