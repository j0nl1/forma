import { attachViewport } from "./canvas-viewport.js";
import { exportRegion } from "./canvas-export.js";
const marker = () =>
  document.querySelector('meta[name="design_doc_mode"][content="canvas"]');
const ownedOverlay =
  "text-editor[data-codex-injected],[data-codex-tweaks-chrome]";
const content = () =>
  [...document.body.children].filter(
    (node) =>
      !node.matches("script,style,template,link,meta,[data-codex-chrome]") &&
      !node.hidden &&
      getComputedStyle(node).display !== "none",
  );
const pageStyle = `html[data-codex-plain-canvas]{height:100%;overflow:hidden;background:#f0eee9}html[data-codex-plain-canvas]>body{position:relative!important;margin:0!important;min-height:100vh;min-width:100%;width:max-content;transform-origin:0 0!important}html[data-codex-exporting]>codex-plain-canvas-controls{display:none!important}@media print{html[data-codex-plain-canvas]{overflow:visible}html[data-codex-plain-canvas]>body{transform:none!important}codex-plain-canvas-controls{display:none!important}}`;
const chromeStyle = `:host{position:fixed;top:12px;left:12px;right:12px;z-index:2147482900;pointer-events:none;font:13px system-ui;color:#45483f}*{box-sizing:border-box}.bar{pointer-events:auto;display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:10px 12px;background:#fffffff5;border:1px solid #deddd6;border-radius:10px;box-shadow:0 3px 18px #0001;width:fit-content;max-width:100%}button,select{font:inherit;border:1px solid #d2d3cf;border-radius:5px;background:white;color:inherit;padding:5px 8px;cursor:pointer}select{max-width:190px}output{min-width:44px;text-align:center}button:focus-visible,select:focus-visible{outline:2px solid #49797c;outline-offset:2px}[role=status]{font-size:12px;max-width:340px;overflow-wrap:anywhere}`;
function activate() {
  const html = document.documentElement,
    body = document.body;
  const original = {
    transform: body.style.transform,
    zoom: body.style.getPropertyValue("--dc-inv-zoom"),
  };
  const style = document.createElement("style");
  style.dataset.codexPlainCanvasStyle = "";
  style.textContent = pageStyle;
  document.head.append(style);
  html.setAttribute("data-codex-plain-canvas", "");
  const host = document.createElement("codex-plain-canvas-controls");
  host.setAttribute("data-codex-chrome", "");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${chromeStyle}</style><div class="bar" role="toolbar" aria-label="Plain HTML canvas"><button data-out aria-label="Zoom out">−</button><output aria-label="Canvas zoom">100%</output><button data-in aria-label="Zoom in">+</button><button data-fit>Fit</button><button data-reset>Reset view</button><select aria-label="Canvas frame"></select><button data-png>Download PNG</button><button data-html>Download HTML</button><span role="status" aria-live="polite"></span></div>`;
  html.append(host);
  for (const editor of body.querySelectorAll(
    ":scope > text-editor[data-codex-injected],:scope > [data-codex-tweaks-chrome]",
  ))
    html.append(editor);
  const select = shadow.querySelector("select"),
    status = shadow.querySelector("[role=status]");
  let frames = [];
  const refresh = () => {
    const selected = frames[select.selectedIndex];
    frames = content();
    select.replaceChildren(
      ...frames.map((node, index) => {
        const option = document.createElement("option");
        option.textContent =
          node.getAttribute("aria-label") ||
          node.getAttribute("data-codex-frame-label") ||
          node.id ||
          `Frame ${index + 1}`;
        return option;
      }),
    );
    if (frames.includes(selected))
      select.selectedIndex = frames.indexOf(selected);
    for (const kind of ["png", "html"])
      shadow.querySelector(`[data-${kind}]`).disabled = !frames.length;
  };
  const viewport = attachViewport(
    host,
    html,
    body,
    shadow.querySelector("output"),
    {
      storageId: "plain-body",
      ignore: (path) =>
        path.includes(host) || path.some((node) => node.matches(ownedOverlay)),
      interactive: (path) =>
        path.some(
          (node) => node.parentElement === body && content().includes(node),
        ) ||
        path.some((node) =>
          node.matches("input,button,textarea,select,a,[contenteditable]"),
        ),
      boxes: () => content().map((node) => node.getBoundingClientRect()),
      extent: () => {
        const origin = body.getBoundingClientRect(),
          scale = viewport.value.scale,
          boxes = content().map((node) => node.getBoundingClientRect());
        return {
          width:
            Math.max(
              1,
              ...boxes.map((box) => (box.right - origin.left) / scale),
            ) + 24,
          height:
            Math.max(
              1,
              ...boxes.map((box) => (box.bottom - origin.top) / scale),
            ) + 24,
        };
      },
    },
  );
  shadow.querySelector("[data-out]").onclick = () =>
    viewport.zoom(viewport.value.scale / 1.1);
  shadow.querySelector("[data-in]").onclick = () =>
    viewport.zoom(viewport.value.scale * 1.1);
  shadow.querySelector("[data-fit]").onclick = () => viewport.fit();
  shadow.querySelector("[data-reset]").onclick = () =>
    viewport.set({ x: 0, y: 0, scale: 1 });
  for (const kind of ["png", "html"])
    shadow.querySelector(`[data-${kind}]`).onclick = async () => {
      const frame = frames[select.selectedIndex];
      try {
        status.textContent = "Preparing export…";
        await exportRegion(frame, kind, {
          title: select.selectedOptions[0]?.textContent || "Frame",
          scale: 3,
        });
        status.textContent = `Downloaded ${kind.toUpperCase()}`;
      } catch (error) {
        status.textContent = error.message;
      }
    };
  refresh();
  const navigation = new AbortController();
  const revealHash = () => {
    if (!location.hash) return;
    let id;
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      return;
    }
    const target = document.getElementById(id);
    if (!target || !body.contains(target)) return;
    window.scrollTo(0, 0);
    const box = target.getBoundingClientRect(),
      value = viewport.value;
    viewport.set({
      x: value.x + innerWidth / 2 - (box.left + box.width / 2),
      y: value.y + innerHeight / 2 - (box.top + box.height / 2),
      scale: value.scale,
    });
  };
  html.addEventListener(
    "click",
    (event) => {
      const anchor = event
        .composedPath()
        .find((node) => node instanceof HTMLAnchorElement);
      if (
        !anchor ||
        event.button ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        anchor.target ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href);
      if (
        url.origin !== location.origin ||
        url.pathname !== location.pathname ||
        url.search !== location.search ||
        !url.hash
      )
        return;
      let target;
      try {
        target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      } catch {
        return;
      }
      if (!target || !body.contains(target)) return;
      event.preventDefault();
      history.pushState(null, "", url.hash);
      revealHash();
    },
    { signal: navigation.signal },
  );
  window.addEventListener("hashchange", revealHash, {
    signal: navigation.signal,
  });
  window.addEventListener("popstate", revealHash, {
    signal: navigation.signal,
  });
  revealHash();
  return {
    viewport,
    host,
    refresh,
    destroy() {
      navigation.abort();
      viewport.destroy();
      body.style.transform = original.transform;
      if (original.zoom) body.style.setProperty("--dc-inv-zoom", original.zoom);
      else body.style.removeProperty("--dc-inv-zoom");
      html.removeAttribute("data-codex-plain-canvas");
      host.remove();
      for (const editor of html.querySelectorAll(
        ":scope > text-editor[data-codex-injected],:scope > [data-codex-tweaks-chrome]",
      ))
        body.append(editor);
      style.remove();
    },
  };
}
export async function installPlainCanvas() {
  if (window.CodexPlainCanvasInstallation)
    return window.CodexPlainCanvasInstallation;
  if (document.readyState === "loading")
    await new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve, { once: true }),
    );
  await new Promise((resolve) => requestAnimationFrame(resolve));
  if (window.CodexPlainCanvasInstallation)
    return window.CodexPlainCanvasInstallation;
  let controller = null,
    scheduled = 0;
  const reconcile = () => {
    scheduled = 0;
    const enabled = marker() && !document.querySelector("design-canvas");
    if (enabled && !controller) {
      controller = activate();
      window.CodexPlainCanvas = controller;
    } else if (!enabled && controller) {
      controller.destroy();
      controller = null;
      window.CodexPlainCanvas = null;
    } else controller?.refresh();
  };
  const observer = new MutationObserver(() => {
    if (!scheduled) scheduled = requestAnimationFrame(reconcile);
  });
  reconcile();
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "name",
      "content",
      "hidden",
      "id",
      "aria-label",
      "data-codex-frame-label",
    ],
  });
  const installation = {
    refresh: reconcile,
    destroy() {
      observer.disconnect();
      cancelAnimationFrame(scheduled);
      controller?.destroy();
      window.CodexPlainCanvas = null;
      delete window.CodexPlainCanvasInstallation;
    },
  };
  window.CodexPlainCanvasInstallation = installation;
  return installation;
}
