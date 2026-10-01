/* <image-slot storage-key="unique-local-key" alt="..." src="optional-local-image">.
   Uploads stay in the browser. Image/crop edits persist when local storage permits. */
(() => {
  class ImageSlot extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML =
        '<style>:host{display:block;background:#eef2f6;border:1px dashed #98a5b5;border-radius:10px;overflow:hidden;font:13px system-ui}.image{aspect-ratio:16/9;display:grid;place-items:center}img{width:100%;height:100%;object-fit:cover;min-height:0}form{padding:12px;background:white;display:grid;gap:8px}label{display:flex;gap:8px;align-items:center}input{min-width:0;max-width:100%}[hidden]{display:none}output{color:#4e5e70}button{font:inherit;padding:6px;background:white;border:1px solid #bbb;border-radius:4px}</style><div class="image"><img hidden><span>Add a local image</span></div><form><input aria-label="Choose local image" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><label>Alt text <input data-alt></label><label>Horizontal crop <input data-x type="range" min="0" max="100" value="50"></label><label>Vertical crop <input data-y type="range" min="0" max="100" value="50"></label><button type="button">Reset image</button><output aria-live="polite"></output></form>';
      this.value = {
        src: this.getAttribute("src") || "",
        alt: this.getAttribute("alt") || "",
        x: 50,
        y: 50,
      };
      this.original = { ...this.value };
      this.key = this.getAttribute("storage-key");
      if (this.key)
        try {
          const saved = JSON.parse(
            localStorage.getItem("codex-design-image:" + this.key),
          );
          if (saved && typeof saved.src === "string")
            this.value = { ...this.value, ...saved };
        } catch {}
      const update = () => {
        const img = root.querySelector("img");
        img.hidden = !this.value.src;
        root.querySelector(".image span").hidden = !!this.value.src;
        img.src = this.value.src;
        img.alt = this.value.alt;
        img.style.objectPosition = `${this.value.x}% ${this.value.y}%`;
        root.querySelector("[data-alt]").value = this.value.alt;
        root.querySelector("[data-x]").value = this.value.x;
        root.querySelector("[data-y]").value = this.value.y;
      };
      const save = () => {
        update();
        if (this.key)
          try {
            localStorage.setItem(
              "codex-design-image:" + this.key,
              JSON.stringify(this.value),
            );
            root.querySelector("output").textContent = "Saved in this browser.";
          } catch {
            root.querySelector("output").textContent =
              "Storage unavailable; changes remain in this page.";
          }
      };
      root.querySelector("input[type=file]").onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            file.type,
          ) ||
          file.size > 10 * 1024 * 1024
        ) {
          root.querySelector("output").textContent =
            "Choose a PNG, JPEG, WebP, or GIF smaller than 10 MiB.";
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          this.value.src = reader.result;
          save();
        };
        reader.readAsDataURL(file);
      };
      for (const key of ["alt", "x", "y"])
        root.querySelector("[data-" + key + "]").oninput = (e) => {
          this.value[key] =
            key === "alt" ? e.target.value : Number(e.target.value);
          save();
        };
      root.querySelector("button").onclick = () => {
        this.value = { ...this.original };
        if (this.key)
          try {
            localStorage.removeItem("codex-design-image:" + this.key);
          } catch {}
        update();
        root.querySelector("output").textContent = "Image reset.";
      };
      update();
    }
  }
  if (!customElements.get("image-slot"))
    customElements.define("image-slot", ImageSlot);
})();
