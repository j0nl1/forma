// Transform writes stay outside React so pointer and wheel input do not remount artboards.
export function attachViewport(canvas, view, world, output) {
  const minimum = Number(canvas.getAttribute("min-scale") ?? 0.1);
  const maximum = Number(canvas.getAttribute("max-scale") ?? 8);
  const min = Number.isFinite(minimum) && minimum > 0 ? minimum : 0.1;
  const max =
    Number.isFinite(maximum) && maximum >= min ? maximum : Math.max(8, min);
  const clamp = (scale) => Math.min(max, Math.max(min, scale));
  const key = `dc-viewport:${location.pathname}:${canvas.id || "default"}`;
  let transform = { x: 0, y: 0, scale: 1 },
    restored = false,
    interacted = false;
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (stored && [stored.x, stored.y, stored.scale].every(Number.isFinite)) {
      transform = { ...stored, scale: clamp(stored.scale) };
      restored = true;
    }
  } catch {}
  let timer,
    pan,
    burstTime = -Infinity,
    burstZoom = false,
    gestureScale = null;
  const abort = new AbortController(),
    options = { signal: abort.signal };
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify(transform));
    } catch {}
  };
  const apply = () => {
    world.style.transform = `translate3d(${transform.x}px,${transform.y}px,0) scale(${transform.scale})`;
    canvas.style.setProperty("--dc-inv-zoom", 1 / transform.scale);
    output.value = `${Math.round(transform.scale * 100)}%`;
    clearTimeout(timer);
    timer = setTimeout(save, 200);
    canvas.dispatchEvent(
      new CustomEvent("codex-canvas-viewport", { detail: { ...transform } }),
    );
  };
  const zoomAt = (scale, x, y, anchor) => {
    const rect = view.getBoundingClientRect(),
      cx = x - rect.left,
      cy = y - rect.top;
    const before = anchor?.getBoundingClientRect().top;
    const ratio = clamp(scale) / transform.scale;
    transform = {
      x: cx - (cx - transform.x) * ratio,
      y: cy - (cy - transform.y) * ratio,
      scale: clamp(scale),
    };
    apply();
    if (before !== undefined) {
      const expected = y + (before - y) * ratio;
      transform.y += expected - anchor.getBoundingClientRect().top;
      apply();
    }
  };
  const targetPath = (event) =>
    event.composedPath().filter((node) => node instanceof Element);
  const notch = (event) =>
    event.deltaMode !== 0 ||
    (event.deltaX === 0 &&
      Number.isInteger(event.deltaY) &&
      Math.abs(event.deltaY) >= 40);
  view.addEventListener(
    "wheel",
    (event) => {
      interacted = true;
      const path = targetPath(event);
      if (
        path.some((node) => node.localName === "deck-stage") &&
        !event.ctrlKey &&
        !event.metaKey
      )
        return;
      event.preventDefault();
      if (gestureScale !== null) return;
      const click = notch(event),
        modified = event.ctrlKey || event.metaKey;
      if (modified) {
        burstTime = -Infinity;
      } else {
        if (event.timeStamp - burstTime > 200) burstZoom = click;
        burstTime = event.timeStamp;
      }
      if (modified || (burstZoom && click)) {
        const factor = click
          ? event.deltaY < 0
            ? 1.1
            : 1 / 1.1
          : Math.exp(-event.deltaY * 0.01);
        const anchor = path.find((node) =>
          ["design-board", "design-section", "design-note"].includes(
            node.localName,
          ),
        );
        zoomAt(transform.scale * factor, event.clientX, event.clientY, anchor);
      } else {
        transform.x -= event.deltaX;
        transform.y -= event.deltaY;
        apply();
      }
    },
    { ...options, passive: false },
  );
  view.addEventListener(
    "pointerdown",
    (event) => {
      interacted = true;
      if (event.button !== 0 && event.button !== 1) return;
      const path = targetPath(event);
      if (
        event.button === 0 &&
        path.some((node) =>
          node.matches(
            "design-board,design-note,input,button,textarea,select,[contenteditable]",
          ),
        )
      )
        return;
      event.preventDefault();
      pan = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        tx: transform.x,
        ty: transform.y,
      };
      view.setPointerCapture(event.pointerId);
      view.style.cursor = "grabbing";
    },
    options,
  );
  view.addEventListener(
    "pointermove",
    (event) => {
      if (!pan || pan.id !== event.pointerId) return;
      transform.x = pan.tx + event.clientX - pan.x;
      transform.y = pan.ty + event.clientY - pan.y;
      apply();
    },
    options,
  );
  const release = (event) => {
    if (pan?.id !== event.pointerId) return;
    if (view.hasPointerCapture(event.pointerId))
      view.releasePointerCapture(event.pointerId);
    pan = null;
    view.style.cursor = "";
    save();
  };
  view.addEventListener("pointerup", release, options);
  view.addEventListener("pointercancel", release, options);
  view.addEventListener(
    "gesturestart",
    (event) => {
      event.preventDefault();
      interacted = true;
      gestureScale = transform.scale;
    },
    { ...options, passive: false },
  );
  view.addEventListener(
    "gesturechange",
    (event) => {
      event.preventDefault();
      if (gestureScale !== null)
        zoomAt(gestureScale * event.scale, event.clientX, event.clientY);
    },
    { ...options, passive: false },
  );
  view.addEventListener(
    "gestureend",
    (event) => {
      event.preventDefault();
      gestureScale = null;
    },
    { ...options, passive: false },
  );
  window.addEventListener("pagehide", save, options);
  apply();
  let checks = 0,
    misses = 0;
  const visibility = () => {
    if (!restored || interacted || checks++ >= 10) return;
    const rect = view.getBoundingClientRect();
    const boxes = [...canvas.querySelectorAll("design-board,design-section")]
      .filter((node) => !node.hidden)
      .map((node) =>
        node.localName === "design-section"
          ? node.shadowRoot?.querySelector("header")?.getBoundingClientRect()
          : node.getBoundingClientRect(),
      )
      .filter(Boolean);
    if (boxes.length) {
      const visible = boxes.some(
        (box) =>
          box.right > rect.left &&
          box.left < rect.right &&
          box.bottom > rect.top &&
          box.top < rect.bottom,
      );
      misses = visible ? 0 : misses + 1;
      if (misses >= 2) {
        transform = { x: 0, y: 0, scale: clamp(1) };
        apply();
        return;
      }
      if (visible) return;
    }
    timerVisibility = setTimeout(visibility, 400);
  };
  let timerVisibility = setTimeout(visibility, 250);
  return {
    get value() {
      return { ...transform };
    },
    zoom(scale) {
      const rect = view.getBoundingClientRect();
      interacted = true;
      zoomAt(scale, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    set(value) {
      if (![value.x, value.y, value.scale].every(Number.isFinite))
        throw new Error("Invalid viewport transform");
      interacted = true;
      transform = { ...value, scale: clamp(value.scale) };
      apply();
    },
    fit() {
      interacted = true;
      transform = {
        x: 0,
        y: 0,
        scale: clamp(
          Math.min(
            1,
            view.clientWidth / Math.max(1, world.scrollWidth),
            view.clientHeight / Math.max(1, world.scrollHeight),
          ),
        ),
      };
      apply();
    },
    destroy() {
      clearTimeout(timer);
      clearTimeout(timerVisibility);
      save();
      abort.abort();
    },
  };
}
