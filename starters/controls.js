/* <design-controls> contains labeled native inputs with data-token="--name".
   Changes bind to document CSS variables. Reset and download are local actions. */
(() => {
  class Controls extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.initial = new Map();
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML =
        '<style>:host{position:fixed;bottom:20px;right:20px;z-index:1000;font:14px system-ui}button{font:inherit;padding:8px 12px;border:1px solid #c8cfd9;border-radius:7px;background:white;color:#182331;cursor:pointer}.panel{margin-top:8px;padding:18px;background:white;color:#182331;border:1px solid #c8cfd9;border-radius:10px;box-shadow:0 12px 32px #0002;max-width:min(320px,80vw)}.actions{display:flex;gap:8px;margin-top:12px}[hidden]{display:none}slot::slotted(label){display:block;margin-bottom:12px}</style><button aria-expanded="false">Tweaks</button><div class="panel" hidden><slot></slot><div class="actions"><button data-reset>Reset</button><button data-save>Download settings</button></div></div>';
      const toggle = root.querySelector("button");
      const panel = root.querySelector(".panel");
      toggle.onclick = () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute("aria-expanded", String(!panel.hidden));
      };
      const inputs = [...this.querySelectorAll("[data-token]")];
      for (const input of inputs) {
        const token = input.dataset.token;
        if (!/^--[\w-]+$/.test(token)) continue;
        this.initial.set(input, {
          value: input.value,
          css: document.documentElement.style.getPropertyValue(token),
        });
        input.addEventListener("input", () =>
          document.documentElement.style.setProperty(
            token,
            input.value + (input.dataset.unit || ""),
          ),
        );
      }
      root.querySelector("[data-reset]").onclick = () => {
        for (const [input, v] of this.initial) {
          input.value = v.value;
          if (v.css)
            document.documentElement.style.setProperty(
              input.dataset.token,
              v.css,
            );
          else
            document.documentElement.style.removeProperty(input.dataset.token);
        }
      };
      root.querySelector("[data-save]").onclick = () => {
        const settings = Object.fromEntries(
          inputs.map((i) => [
            i.dataset.token,
            i.value + (i.dataset.unit || ""),
          ]),
        );
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(settings, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "design-settings.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
    }
  }
  if (!customElements.get("design-controls"))
    customElements.define("design-controls", Controls);
})();
