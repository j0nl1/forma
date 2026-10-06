/* <source-list> contains ordinary <a href="..."> citations. No fetching. */
(() => {
  class Sources extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.attachShadow({ mode: "open" }).innerHTML =
        "<style>:host{display:block;margin:24px 0;font:14px/1.5 system-ui}details{padding:14px;border:1px solid #d2d9e3;border-radius:8px}summary{cursor:pointer;font-weight:600}slot{display:grid;gap:8px;padding-top:12px}</style><details><summary>Sources and provenance</summary><slot></slot></details>";
    }
  }
  if (!customElements.get("source-list"))
    customElements.define("source-list", Sources);
})();
