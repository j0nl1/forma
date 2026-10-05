import {
  reconcileCanvas,
  validateCanvasState,
  visibleBoards,
} from "./canvas-model.js";
import { attachViewport } from "./canvas-viewport.js";
import { downloadBlob, exportBoard } from "./canvas-export.js";
import { openFocus } from "./canvas-focus.js";
const editStyle = `input,button,select{font:inherit}input{border:0;background:transparent;min-width:0;color:inherit}button{border:1px solid #d2d3cf;border-radius:5px;background:#fff;padding:5px 8px;cursor:pointer;color:#42443e}button:hover{background:#f3f2ee}button:focus-visible,input:focus-visible{outline:2px solid #49797c;outline-offset:2px}`;
const identity = (element, fallback) =>
  element.getAttribute("canvas-id") || element.id || fallback;
export class DesignCanvasElement extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.state = { sections: {} };
    this.source = [];
    this.nodes = new Map();
    this.focus = null;
    this.storageKey = `dc-state:${location.pathname}:${this.id || "default"}`;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;position:relative;height:80vh;min-height:400px;overflow:hidden;background:#f0eee9;color:#45483f;font:14px system-ui;border:1px solid #deddd6;--dc-inv-zoom:1}*{box-sizing:border-box}${editStyle}.toolbar{position:relative;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;background:#fff;z-index:10;border-bottom:1px solid #deddd6}.toolbar output{width:48px;text-align:center}.toolbar span{margin-left:auto;color:#686c62;font-size:12px}.viewport{position:absolute;inset:58px 0 0;overflow:hidden;cursor:grab;touch-action:none}.world{position:absolute;left:0;top:0;transform-origin:0 0;padding:60px 60px 80px;width:max-content;min-width:100%}.world:before{content:'';position:absolute;inset:-6000px;z-index:-1;pointer-events:none;background-image:linear-gradient(#0000000f 1px,transparent 1px),linear-gradient(90deg,#0000000f 1px,transparent 1px);background-size:120px 120px}.items{display:flex;flex-direction:column;gap:calc(80px * var(--dc-inv-zoom))}.items.flat{flex-direction:row;gap:48px;align-items:flex-start}slot{display:contents}[data-import]{display:none}</style><div class="toolbar"><button data-out aria-label="Zoom out">−</button><output aria-label="Canvas zoom">100%</output><button data-in aria-label="Zoom in">+</button><button data-fit>Fit</button><button data-restore>Restore removed</button><button data-state>Save canvas state</button><button data-load>Load canvas state</button><input data-import type="file" accept="application/json,.json"><span role="status" aria-label="Canvas status">Loading canvas…</span></div><div class="viewport"><div class="world"><div class="items"><slot></slot></div></div></div>`;
    root.querySelector(".world").style.visibility = "hidden";
    this.chromeObserver = new ResizeObserver(() => {
      root.querySelector(".viewport").style.top =
        `${root.querySelector(".toolbar").offsetHeight}px`;
    });
    this.chromeObserver.observe(root.querySelector(".toolbar"));
    this.viewport = attachViewport(
      this,
      root.querySelector(".viewport"),
      root.querySelector(".world"),
      root.querySelector("output"),
    );
    root.querySelector("[data-out]").onclick = () =>
      this.viewport.zoom(Math.round((this.zoom - 0.1) * 1000) / 1000);
    root.querySelector("[data-in]").onclick = () =>
      this.viewport.zoom(Math.round((this.zoom + 0.1) * 1000) / 1000);
    root.querySelector("[data-fit]").onclick = () => this.viewport.fit();
    root.querySelector("[data-restore]").onclick = () =>
      this.commit((sections) => {
        for (const section of Object.values(sections)) section.hidden = [];
      });
    root.querySelector("[data-state]").onclick = () =>
      downloadBlob(
        new Blob([JSON.stringify(this.state, null, 2) + "\n"], {
          type: "application/json",
        }),
        "design-canvas.state.json",
      );
    const input = root.querySelector("[data-import]");
    root.querySelector("[data-load]").onclick = () => input.click();
    input.onchange = async () => {
      try {
        const next = validateCanvasState(
          JSON.parse(await input.files[0].text()),
        );
        this.state = reconcileCanvas(this.source, next);
        this.render();
        this.scheduleSave();
      } catch (error) {
        this.status(error.message);
      } finally {
        input.value = "";
      }
    };
    queueMicrotask(async () => {
      try {
        if (!this.managed) this.readNativeSource();
        let saved;
        try {
          saved = JSON.parse(localStorage.getItem(this.storageKey));
          if (saved) saved = validateCanvasState(saved);
        } catch {
          saved = undefined;
        }
        const sourceMeta = document.querySelector(
          'meta[name="codex-canvas-source"]',
        );
        if (
          sourceMeta &&
          (sourceMeta.dataset.canvasId
            ? sourceMeta.dataset.canvasId === this.id
            : document.querySelector("design-canvas") === this)
        ) {
          this.endpoint = sourceMeta.content;
          const response = await fetch(this.endpoint, {
            cache: "no-store",
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok)
            throw new Error("Cannot read the canvas source state");
          const value = await response.json();
          this.version = value.version;
          this.token = value.token;
          saved = validateCanvasState(value.state);
        } else if (this.hasAttribute("state-file")) {
          const response = await fetch(this.getAttribute("state-file"), {
            cache: "no-store",
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok)
            throw new Error("Cannot read the canvas state file");
          saved = validateCanvasState(await response.json());
        }
        this.state = reconcileCanvas(this.source, saved);
        this.ready = true;
        root.querySelector(".world").style.visibility = "";
        this.render();
        this.status(
          this.endpoint
            ? "Project persistence enabled"
            : "Browser persistence enabled",
        );
        this.dispatchEvent(new CustomEvent("codex-canvas-ready"));
      } catch (error) {
        this.ready = true;
        root.querySelector(".world").style.visibility = "";
        this.state = reconcileCanvas(this.source, this.state);
        this.render();
        this.status(error.message);
        this.dispatchEvent(new CustomEvent("codex-canvas-ready"));
      }
    });
  }
  disconnectedCallback() {
    // Native focus temporarily moves boards, but never moves the canvas itself.
    this.chromeObserver?.disconnect();
    this.viewport?.destroy();
    clearTimeout(this.saveTimer);
    this.focusView?.close();
  }
  get zoom() {
    return this.viewport?.value.scale ?? 1;
  }
  set zoom(value) {
    this.viewport?.zoom(value);
  }
  status(message) {
    this.shadowRoot.querySelector('[role="status"]').textContent = message;
  }
  readNativeSource() {
    const elements = [...this.children].filter((node) =>
      node.matches("design-section"),
    );
    this.shadowRoot
      .querySelector(".items")
      .classList.toggle("flat", !elements.length);
    const containers = elements.length ? elements : [this];
    const source = containers.map((node) => {
      const title =
        node === this
          ? "Artboards"
          : node.getAttribute("title") || "Untitled section";
      const sid = node === this ? "default" : identity(node, title);
      const boards = [...node.children]
        .filter((board) => board.matches("design-board"))
        .map((board) => {
          const label = board.getAttribute("label") || "Option",
            id = identity(board, label);
          this.nodes.set(`${sid}\x1f${id}`, board);
          board.ownerCanvas = this;
          board.sectionId = sid;
          board.boardId = id;
          return { id, label };
        });
      if (node !== this) {
        node.ownerCanvas = this;
        node.sectionId = sid;
      }
      return {
        id: sid,
        title,
        subtitle: node.getAttribute("subtitle") || "",
        boards,
        element: node,
      };
    });
    this.setSource(source);
  }
  setSource(source) {
    this.source = source;
    this.state = reconcileCanvas(source, this.state);
    if (this.ready) this.render();
  }
  boardElement(section, board) {
    if (!this.managed) return this.nodes.get(`${section}\x1f${board}`);
    return [...this.querySelectorAll("design-board")].find(
      (node) => node.sectionId === section && node.boardId === board,
    );
  }
  render() {
    if (!this.managed) {
      for (const section of this.source) {
        const state = this.state.sections[section.id];
        if (section.element !== this)
          section.element.titleInput.value = state.title ?? section.title;
        const visible = new Set(
          visibleBoards(section, state).map((board) => board.id),
        );
        for (const board of section.boards) {
          const node = this.boardElement(section.id, board.id);
          if (!visible.has(board.id)) node.remove();
        }
        const ordered = state.order.filter((id) => visible.has(id));
        const current = [...section.element.children]
          .filter((node) => node.localName === "design-board")
          .map((node) => node.boardId);
        const reorder =
          ordered
            .filter(
              (id) =>
                !this.boardElement(section.id, id).hasAttribute("data-focused"),
            )
            .join("\x1f") !== current.join("\x1f");
        for (const id of ordered) {
          const node = this.boardElement(section.id, id),
            board = section.boards.find((board) => board.id === id);
          node.setAttribute("label", state.labels[id] ?? board.label);
          node.updateLabel();
          if (reorder && !node.hasAttribute("data-focused"))
            section.element.append(node);
        }
      }
    }
    this.dispatchEvent(
      new CustomEvent("codex-canvas-change", {
        detail: structuredClone(this.state),
      }),
    );
    if (this.focusView) {
      const s = this.state.sections[this.focus.section];
      if (!s || s.hidden.includes(this.focus.board)) this.focusView.close();
    }
  }
  commit(update) {
    if (!this.ready) return;
    const next = structuredClone(this.state);
    update(next.sections);
    this.state = reconcileCanvas(this.source, next);
    this.render();
    this.scheduleSave();
  }
  rename(section, board, label) {
    this.commit((sections) => {
      Object.defineProperty(sections[section].labels, board, {
        value: label,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    });
  }
  reorder(section, ids) {
    this.commit((sections) => {
      sections[section].order = ids;
    });
  }
  removeBoard(board) {
    this.commit((sections) => {
      if (!sections[board.sectionId].hidden.includes(board.boardId))
        sections[board.sectionId].hidden.push(board.boardId);
    });
  }
  moveBoard(board, direction) {
    const state = this.state.sections[board.sectionId];
    const visible = state.order.filter((id) => !state.hidden.includes(id));
    const index = visible.indexOf(board.boardId),
      next = index + direction;
    if (next < 0 || next >= visible.length) return;
    const order = [...state.order],
      a = order.indexOf(visible[index]),
      b = order.indexOf(visible[next]);
    [order[a], order[b]] = [order[b], order[a]];
    this.reorder(board.sectionId, order);
  }
  openFocus(board) {
    this.focusView?.close();
    this.focusView = openFocus(this, {
      section: board.sectionId,
      board: board.boardId,
    });
  }
  scheduleSave() {
    if (!this.ready) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch {
      this.status(
        "Browser storage unavailable; download the canvas state to keep it",
      );
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveSource(), 250);
  }
  async saveSource() {
    if (!this.endpoint || !this.token || this.conflict) return;
    if (this.saving) {
      this.saveAgain = true;
      return;
    }
    this.saving = true;
    const state = structuredClone(this.state);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Codex-Canvas-Token": this.token,
        },
        body: JSON.stringify({ version: this.version, state }),
      });
      const value = await response.json();
      if (!response.ok) {
        this.conflict = true;
        throw new Error(value.error || "Canvas save failed");
      }
      this.version = value.version;
      this.status("Canvas state saved to the project");
    } catch (error) {
      this.status(`${error.message}. Download your state before reloading.`);
    } finally {
      this.saving = false;
      if (this.saveAgain) {
        this.saveAgain = false;
        this.saveSource();
      }
    }
  }
}
export class DesignSectionElement extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;position:relative;isolation:isolate}${editStyle}header{zoom:var(--dc-inv-zoom,1);padding-bottom:36px;position:relative;z-index:2}input{font-size:28px;font-weight:600;width:100%;display:block}p{font-size:16px;color:#777b70;margin:10px 0 0}.row{display:flex;align-items:flex-start;gap:var(--dc-gap,48px);width:max-content}slot{display:contents}::slotted(design-note){position:absolute}</style><header><input aria-label="Section title"><p></p></header><div class="row"><slot></slot></div>`;
    this.titleInput = root.querySelector("input");
    this.titleInput.value = this.getAttribute("title") || "Untitled section";
    root.querySelector("p").textContent = this.getAttribute("subtitle") || "";
    if (this.hasAttribute("gap"))
      this.style.setProperty(
        "--dc-gap",
        `${Number(this.getAttribute("gap"))}px`,
      );
    this.titleInput.onchange = () =>
      this.ownerCanvas?.commit((sections) => {
        sections[this.sectionId].title = this.titleInput.value;
      });
    this.titleInput.onkeydown = (event) => {
      if (event.key === "Enter") this.titleInput.blur();
    };
  }
}
export class DesignBoardElement extends HTMLElement {
  static observedAttributes = ["label", "width", "height"];
  attributeChangedCallback(name, previous, value) {
    if (name === "label") this.updateLabel();
    else if (!value) this.style.removeProperty(`--board-${name}`);
    else if (value && /^\d+(\.\d+)?(px)?$/.test(value))
      this.style.setProperty(`--board-${name}`, `${parseFloat(value)}px`);
  }
  connectedCallback() {
    if (this.shadowRoot) {
      document.addEventListener("pointerdown", this.outside);
      return;
    }
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;position:relative;flex:none;width:var(--board-width,420px);isolation:isolate;color:inherit;font:inherit}${editStyle}header{position:relative;z-index:5;display:flex;align-items:center;gap:4px;zoom:var(--dc-inv-zoom,1);padding-bottom:9px;container-type:inline-size}input{flex:1;width:70px;text-overflow:ellipsis;font-size:13px}button{font-size:12px;padding:4px 6px}.grip{cursor:grab;touch-action:none}.card{position:relative;width:100%;height:var(--board-height,auto);overflow:hidden;background:#fff;border-radius:2px;box-shadow:0 6px 20px #1422380c;isolation:isolate}slot{display:block;height:100%}details{position:relative}summary{cursor:pointer;padding:4px 7px;list-style:none}details>div{position:absolute;right:0;top:100%;z-index:10;display:flex;flex-direction:column;gap:5px;min-width:170px;background:#fff;padding:10px;border-radius:8px;box-shadow:0 8px 35px #0003}@container(max-width:200px){.move{display:none}}@container(max-width:110px){input{visibility:hidden}.remove{display:none}}:host([data-dragging]){z-index:20}::slotted(*){box-sizing:border-box}</style><header part="header"><button class="grip" aria-label="Drag artboard" title="Drag to reorder">⠿</button><input aria-label="Artboard name"><button class="move" data-left aria-label="Move left">←</button><button class="move" data-right aria-label="Move right">→</button><button data-focus>Focus</button><button class="remove" data-remove aria-label="Remove artboard">×</button><details><summary aria-label="Artboard actions">⋯</summary><div><button data-png>Download PNG</button><button data-html>Download HTML</button><button data-delete>Delete artboard…</button><span role="status"></span></div></details></header><div class="card" part="card"><slot></slot></div>`;
    const dimension = (attr) => {
      const value = this.getAttribute(attr);
      return value && /^\d+(\.\d+)?(px)?$/.test(value)
        ? `${parseFloat(value)}px`
        : null;
    };
    if (dimension("width"))
      this.style.setProperty("--board-width", dimension("width"));
    if (dimension("height"))
      this.style.setProperty("--board-height", dimension("height"));
    this.updateLabel();
    root.querySelector("input").oninput = (event) =>
      this.ownerCanvas?.rename(
        this.sectionId,
        this.boardId,
        event.target.value,
      );
    root.querySelector("[data-left]").onclick = () =>
      this.ownerCanvas?.moveBoard(this, -1);
    root.querySelector("[data-right]").onclick = () =>
      this.ownerCanvas?.moveBoard(this, 1);
    root.querySelector("[data-remove]").onclick = () =>
      this.ownerCanvas?.removeBoard(this);
    root.querySelector("[data-focus]").onclick = () =>
      this.ownerCanvas?.openFocus(this);
    for (const kind of ["png", "html"])
      root.querySelector(`[data-${kind}]`).onclick = async () => {
        try {
          await exportBoard(this, kind);
          root.querySelector("details").open = false;
        } catch (error) {
          root.querySelector('[role="status"]').textContent = error.message;
        }
      };
    const details = root.querySelector("details"),
      deletion = root.querySelector("[data-delete]");
    deletion.onclick = () => {
      if (this.confirming) this.ownerCanvas?.removeBoard(this);
      else {
        this.confirming = true;
        deletion.textContent = "Confirm delete";
      }
    };
    details.addEventListener("toggle", () => {
      if (!details.open) {
        this.confirming = false;
        deletion.textContent = "Delete artboard…";
      }
    });
    this.outside = (event) => {
      if (!event.composedPath().includes(details)) details.open = false;
    };
    document.addEventListener("pointerdown", this.outside);
    this.attachDrag(root.querySelector(".grip"));
  }
  disconnectedCallback() {
    document.removeEventListener("pointerdown", this.outside);
  }
  updateLabel() {
    if (this.shadowRoot)
      this.shadowRoot.querySelector("input").value =
        this.getAttribute("label") ?? "Option";
  }
  dimensions() {
    const card = this.shadowRoot.querySelector(".card");
    return { width: card.offsetWidth, height: card.offsetHeight };
  }
  attachDrag(grip) {
    let drag;
    const clear = () => {
      if (!drag) return;
      for (const board of drag.peers) {
        board.style.transform = "";
        board.style.transition = "";
        board.removeAttribute("data-dragging");
      }
      drag = null;
    };
    grip.onpointerdown = (event) => {
      if (event.button !== 0 || !this.ownerCanvas?.ready) return;
      event.preventDefault();
      event.stopPropagation();
      const source = this.ownerCanvas.source.find(
          (section) => section.id === this.sectionId,
        ),
        state = this.ownerCanvas.state.sections[this.sectionId];
      const peers = visibleBoards(source, state).map((board) =>
        this.ownerCanvas.boardElement(this.sectionId, board.id),
      );
      drag = {
        id: event.pointerId,
        x: event.clientX,
        scale: this.ownerCanvas.zoom,
        peers,
        homes: peers.map((board) => board.getBoundingClientRect().left),
        from: peers.indexOf(this),
        to: peers.indexOf(this),
        order: [...state.order],
      };
      this.setAttribute("data-dragging", "");
      grip.setPointerCapture(event.pointerId);
    };
    grip.onpointermove = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x,
        left = drag.homes[drag.from] + dx;
      this.style.transform = `translateX(${dx / drag.scale}px)`;
      drag.to = drag.homes.reduce(
        (best, x, i) =>
          Math.abs(x - left) < Math.abs(drag.homes[best] - left) ? i : best,
        0,
      );
      const ordered = [...drag.peers];
      ordered.splice(drag.from, 1);
      ordered.splice(drag.to, 0, this);
      ordered.forEach((board, index) => {
        if (board === this) return;
        const from = drag.peers.indexOf(board);
        board.style.transition = "transform 160ms ease";
        board.style.transform = `translateX(${(drag.homes[index] - drag.homes[from]) / drag.scale}px)`;
      });
    };
    grip.onpointercancel = () => clear();
    grip.onpointerup = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const drop = drag;
      if (grip.hasPointerCapture(event.pointerId))
        grip.releasePointerCapture(event.pointerId);
      this.style.transition = "transform 180ms ease";
      this.style.transform = `translateX(${(drop.homes[drop.to] - drop.homes[drop.from]) / drop.scale}px)`;
      setTimeout(() => {
        if (drag !== drop) return;
        const order = [...drop.order],
          id = this.boardId;
        order.splice(order.indexOf(id), 1);
        const target = drop.peers[drop.to].boardId;
        if (drop.from !== drop.to)
          order.splice(
            order.indexOf(target) + (drop.to > drop.from ? 1 : 0),
            0,
            id,
          );
        else order.splice(drop.order.indexOf(id), 0, id);
        clear();
        this.ownerCanvas.reorder(this.sectionId, order);
      }, 180);
    };
    grip.onkeydown = (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        this.ownerCanvas?.moveBoard(this, event.key === "ArrowLeft" ? -1 : 1);
      }
    };
  }
}
export class DesignNoteElement extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;position:absolute;z-index:5;padding:14px 16px;width:180px;background:#fef4a8;color:#5a4a2a;font:14px/1.4 'Comic Sans MS',cursive;box-shadow:2px 6px 14px #0002;transform:rotate(var(--note-rotate,-2deg));box-sizing:border-box}slot{display:contents}</style><slot></slot>`;
    for (const edge of ["top", "left", "right", "bottom", "width"])
      if (this.hasAttribute(edge)) {
        const value = this.getAttribute(edge);
        this.style[edge] = /^-?\d+(\.\d+)?$/.test(value) ? `${value}px` : value;
      }
    if (this.hasAttribute("rotate"))
      this.style.setProperty(
        "--note-rotate",
        `${Number(this.getAttribute("rotate"))}deg`,
      );
  }
}
for (const [name, constructor] of [
  ["design-canvas", DesignCanvasElement],
  ["design-section", DesignSectionElement],
  ["design-board", DesignBoardElement],
  ["design-note", DesignNoteElement],
])
  if (!customElements.get(name)) customElements.define(name, constructor);
