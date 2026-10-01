/* <doc-page size="a4|letter" orientation="portrait|landscape">...</doc-page>
   Styles apply to light DOM content for predictable print layout. */
(() => {
  class Doc extends HTMLElement {
    connectedCallback() {
      const size = this.getAttribute("size") === "letter" ? "letter" : "a4";
      const landscape = this.getAttribute("orientation") === "landscape";
      const dims = size === "letter" ? [216, 279] : [210, 297];
      if (landscape) dims.reverse();
      this.style.setProperty("--paper-width", dims[0] + "mm");
      this.style.setProperty("--paper-height", dims[1] + "mm");
      if (!document.getElementById("codex-paper-styles")) {
        const style = document.createElement("style");
        style.id = "codex-paper-styles";
        style.textContent =
          "doc-page{display:block;box-sizing:border-box;width:var(--paper-width);min-height:var(--paper-height);padding:18mm;margin:24px auto;background:white;color:#17212c;box-shadow:0 8px 40px #0002;font:11pt/1.55 system-ui}doc-page h1,doc-page h2,doc-page h3{break-after:avoid}doc-page p,doc-page li{orphans:3;widows:3}@media print{html,body{margin:0;background:white}doc-page{margin:0;box-shadow:none;break-after:page;min-height:0;width:auto}design-controls{display:none}}";
        document.head.append(style);
      }
      const pageStyle = document.createElement("style");
      pageStyle.textContent = `@page {size:${size === "letter" ? "letter" : "A4"} ${landscape ? "landscape" : "portrait"};margin:0}`;
      this.append(pageStyle);
    }
  }
  if (!customElements.get("doc-page")) customElements.define("doc-page", Doc);
})();
