/* <design-canvas><design-board label="Option A">...</design-board>...</design-canvas>
   Compare, pan, zoom, rename, reorder, remove, restore, or focus artboards locally. */
(() => {
  class Canvas extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.zoom = 1;
      this.removed = [];
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML =
        '<style>:host{display:block;height:80vh;min-height:400px;background:#eef1f5;border:1px solid #d3d9e2;border-radius:12px;overflow:hidden;font:14px system-ui}.toolbar{display:flex;gap:8px;padding:12px;background:white;border-bottom:1px solid #ddd;align-items:center;flex-wrap:wrap}button{border:1px solid #ccd3dc;border-radius:6px;background:white;padding:7px 10px;font:inherit;cursor:pointer}.viewport{height:calc(100% - 60px);overflow:auto;cursor:grab;touch-action:pan-x pan-y}.boards{display:flex;gap:28px;padding:36px;width:max-content;transform-origin:0 0}slot{display:contents}</style><div class="toolbar"><button data-out aria-label="Zoom out">−</button><output>100%</output><button data-in aria-label="Zoom in">+</button><button data-fit>Fit</button><button data-restore>Restore removed</button><span>Drag the background to pan</span></div><div class="viewport"><div class="boards"><slot></slot></div></div>';
      const view = root.querySelector(".viewport"),
        boards = root.querySelector(".boards");
      const update = () => {
        boards.style.transform = `scale(${this.zoom})`;
        root.querySelector("output").textContent =
          `${Math.round(this.zoom * 100)}%`;
      };
      root.querySelector("[data-out]").onclick = () => {
        this.zoom = Math.max(0.2, this.zoom - 0.1);
        update();
      };
      root.querySelector("[data-in]").onclick = () => {
        this.zoom = Math.min(2, this.zoom + 0.1);
        update();
      };
      root.querySelector("[data-fit]").onclick = () => {
        this.zoom = Math.min(1, view.clientWidth / boards.offsetWidth);
        update();
      };
      root.querySelector("[data-restore]").onclick = () => {
        for (const board of this.removed) this.append(board);
        this.removed = [];
      };
      view.addEventListener(
        "wheel",
        (e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.zoom = Math.min(
              2,
              Math.max(0.2, this.zoom - e.deltaY * 0.002),
            );
            update();
          }
        },
        { passive: false },
      );
      let drag = null;
      view.addEventListener("pointerdown", (e) => {
        if (e.target !== view && e.target !== boards) return;
        drag = {
          x: e.clientX,
          y: e.clientY,
          left: view.scrollLeft,
          top: view.scrollTop,
        };
        view.setPointerCapture(e.pointerId);
      });
      view.addEventListener("pointermove", (e) => {
        if (drag) {
          view.scrollLeft = drag.left - (e.clientX - drag.x);
          view.scrollTop = drag.top - (e.clientY - drag.y);
        }
      });
      view.addEventListener("pointerup", () => (drag = null));
      view.addEventListener("pointercancel", () => (drag = null));
    }
    removeBoard(board) {
      this.removed.push(board);
      board.remove();
    }
  }
  class Board extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.style.display = "block";
      this.style.width = this.getAttribute("width") || "420px";
      this.style.flexShrink = "0";
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML =
        '<style>:host{background:white;border:1px solid #cbd3df;border-radius:8px;overflow:hidden;box-shadow:0 6px 20px #1422380c}header{display:flex;gap:5px;padding:9px;background:#fafbfc;border-bottom:1px solid #ddd}input{width:100%;min-width:0;border:0;background:transparent;font:14px system-ui}button{border:1px solid #d3d9e2;border-radius:5px;background:white;cursor:pointer;padding:4px 7px}slot{display:block}.focus{position:fixed;inset:20px;z-index:10000;overflow:auto;background:white}</style><header><input aria-label="Artboard name"><button data-left aria-label="Move left">←</button><button data-right aria-label="Move right">→</button><button data-focus>Focus</button><button data-remove aria-label="Remove artboard">×</button></header><slot></slot>';
      root.querySelector("input").value =
        this.getAttribute("label") || "Option";
      root.querySelector("input").oninput = (e) =>
        this.setAttribute("label", e.target.value);
      root.querySelector("[data-left]").onclick = () => {
        if (this.previousElementSibling)
          this.parentElement.insertBefore(this, this.previousElementSibling);
      };
      root.querySelector("[data-right]").onclick = () => {
        if (this.nextElementSibling)
          this.parentElement.insertBefore(this.nextElementSibling, this);
      };
      root.querySelector("[data-remove]").onclick = () =>
        this.closest("design-canvas")?.removeBoard(this);
      root.querySelector("[data-focus]").onclick = async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (this.requestFullscreen) await this.requestFullscreen();
      };
    }
  }
  if (!customElements.get("design-canvas"))
    customElements.define("design-canvas", Canvas);
  if (!customElements.get("design-board"))
    customElements.define("design-board", Board);
})();
