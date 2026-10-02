import { navigateFocus, visibleBoards } from "./canvas-model.js";
export function openFocus(canvas, initial) {
  const overlay = document.createElement("div");
  overlay.className = "codex-canvas-focus";
  overlay.innerHTML = `<style>
.codex-canvas-focus{position:fixed;inset:0;z-index:2147483000;background:#18202bbd;backdrop-filter:blur(14px);color:#fff;font:14px system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px}
.codex-canvas-focus .focus-top{position:absolute;top:22px;left:28px;right:28px;display:flex;gap:12px;align-items:center}.codex-canvas-focus .focus-top p{margin:0;flex:1}.codex-canvas-focus .focus-top button,.codex-canvas-focus .focus-top select,.codex-canvas-focus .focus-footer button{font:inherit;background:#fff;color:#18202b;border:0;border-radius:7px;padding:8px 12px;cursor:pointer}.codex-canvas-focus .focus-card{background:white;color:#18202b;transform-origin:center;flex:none;box-shadow:0 20px 100px #0004;overflow:hidden;position:absolute;left:50%;top:50%}.codex-canvas-focus .focus-footer{position:absolute;bottom:24px;display:flex;align-items:center;gap:12px}.codex-canvas-focus .focus-dots{display:flex;gap:5px}.codex-canvas-focus .focus-dots button{width:12px;height:12px;border-radius:50%;padding:0;opacity:.4}.codex-canvas-focus .focus-dots button[aria-current=true]{opacity:1}.codex-canvas-focus design-board[data-focused]{margin:0;transform:none!important}.codex-canvas-focus design-board[data-focused]::part(header){display:none}
</style><div class="focus-top"><select aria-label="Focus section"></select><p></p><button data-close aria-label="Close focus">Close ×</button></div><div class="focus-card"></div><div class="focus-footer"><button data-left aria-label="Previous artboard">←</button><span class="focus-label"></span><div class="focus-dots"></div><button data-right aria-label="Next artboard">→</button></div>`;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Artboard focus");
  overlay.tabIndex = -1;
  const card = overlay.querySelector(".focus-card"),
    select = overlay.querySelector("select"),
    dots = overlay.querySelector(".focus-dots");
  const previousActive = document.activeElement;
  const abort = new AbortController(),
    options = { signal: abort.signal };
  let focus = initial,
    restore,
    activeBoard;
  const cleanupCard = () => {
    restore?.();
    restore = null;
    activeBoard = null;
    if (!canvas.renderFocus) card.replaceChildren();
  };
  const close = () => {
    cleanupCard();
    canvas.renderFocus?.(null, null);
    abort.abort();
    overlay.remove();
    canvas.focusView = null;
    canvas.focus = null;
    canvas.dispatchEvent(
      new CustomEvent("codex-canvas-focus", { detail: null }),
    );
    previousActive?.focus();
  };
  const fit = () => {
    if (!activeBoard) return;
    const { width, height } = activeBoard.dimensions();
    const scale = Math.max(
      0.1,
      Math.min((innerWidth - 200) / width, (innerHeight - 260) / height, 2),
    );
    Object.assign(card.style, {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(-50%,-50%) scale(${scale})`,
    });
  };
  const show = (next) => {
    const section = canvas.source.find((s) => s.id === next?.section),
      state = section && canvas.state.sections[section.id];
    const board =
      section &&
      visibleBoards(section, state).find((b) => b.id === next?.board);
    if (!board) {
      close();
      return;
    }
    cleanupCard();
    focus = next;
    canvas.focus = { ...next };
    activeBoard = canvas.boardElement(next.section, next.board);
    select.replaceChildren();
    for (const s of canvas.source.filter(
      (s) => visibleBoards(s, canvas.state.sections[s.id]).length,
    )) {
      const option = document.createElement("option");
      option.value = s.id;
      option.textContent = canvas.state.sections[s.id].title ?? s.title;
      select.append(option);
    }
    select.value = section.id;
    overlay.querySelector(".focus-top p").textContent = section.subtitle || "";
    const boards = visibleBoards(section, state),
      index = boards.findIndex((b) => b.id === board.id);
    overlay.querySelector(".focus-label").textContent =
      `${state.labels[board.id] ?? board.label} · ${index + 1} / ${boards.length}`;
    dots.replaceChildren();
    boards.forEach((b, i) => {
      const button = document.createElement("button");
      button.setAttribute("aria-label", `Focus artboard ${i + 1}`);
      button.setAttribute("aria-current", String(i === index));
      button.onclick = () => show({ section: section.id, board: b.id });
      dots.append(button);
    });
    if (canvas.renderFocus) canvas.renderFocus(next, card);
    else {
      const placeholder = document.createComment("Focused artboard");
      activeBoard.before(placeholder);
      activeBoard.setAttribute("data-focused", "");
      card.append(activeBoard);
      const moved = activeBoard;
      restore = () => {
        moved.removeAttribute("data-focused");
        placeholder.replaceWith(moved);
      };
    }
    fit();
    canvas.dispatchEvent(
      new CustomEvent("codex-canvas-focus", { detail: { ...next } }),
    );
  };
  const navigate = (axis, direction) =>
    show(navigateFocus(canvas.source, canvas.state, focus, axis, direction));
  select.onchange = () => {
    const s = canvas.source.find((s) => s.id === select.value);
    show({
      section: s.id,
      board: visibleBoards(s, canvas.state.sections[s.id])[0].id,
    });
  };
  overlay.querySelector("[data-close]").onclick = close;
  overlay.querySelector("[data-left]").onclick = () => navigate("board", -1);
  overlay.querySelector("[data-right]").onclick = () => navigate("board", 1);
  overlay.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target === overlay) close();
    },
    options,
  );
  overlay.addEventListener("wheel", (event) => event.preventDefault(), {
    ...options,
    passive: false,
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.target.matches("input,textarea,[contenteditable]")) return;
      const action = {
        ArrowLeft: ["board", -1],
        ArrowRight: ["board", 1],
        ArrowUp: ["section", -1],
        ArrowDown: ["section", 1],
      }[event.key];
      if (action) {
        event.preventDefault();
        navigate(...action);
      }
      if (event.key === "Tab") {
        const buttons = [
          ...overlay.querySelectorAll(
            "button,select,input,textarea,[tabindex]",
          ),
        ].filter((node) => !node.disabled && node.getClientRects().length);
        const index = buttons.indexOf(document.activeElement);
        if (event.shiftKey && index <= 0) {
          event.preventDefault();
          buttons.at(-1)?.focus();
        } else if (
          !event.shiftKey &&
          (index < 0 || index === buttons.length - 1)
        ) {
          event.preventDefault();
          buttons[0]?.focus();
        }
      }
    },
    options,
  );
  window.addEventListener("resize", fit, options);
  document.body.append(overlay);
  overlay.focus();
  show(initial);
  return {
    show,
    close,
    refresh() {
      if (!canvas.renderFocus) cleanupCard();
      show(focus);
    },
  };
}
