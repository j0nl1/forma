import {
  findFixedSheet,
  sheetBox,
  authoredPageRule,
} from "./fixed-sheet-model.js";
import { printHygiene } from "./document-style.js";
if (!window.CodexFixedSheet) {
  const screen = document.createElement("style"),
    print = document.createElement("style");
  for (const node of [screen, print]) node.dataset.codexInjected = "";
  screen.dataset.codexSheetPreview = "";
  print.dataset.codexSheetPrint = "";
  let frame,
    root,
    box,
    reason = "fluid",
    scale = 1,
    mode = "fit",
    printing = false,
    refreshing = false;
  const media = matchMedia("print");
  const events = new AbortController();
  const resize = new ResizeObserver(schedule);
  const mutation = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          record.target !== screen &&
          record.target !== print &&
          record.target.parentNode !== screen &&
          record.target.parentNode !== print,
      )
    )
      schedule();
  });
  const overlays = new Set();
  function schedule() {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = undefined;
        refresh();
      });
  }
  function selector() {
    return root === document.body
      ? "body"
      : `body>:nth-child(${[...document.body.children].indexOf(root) + 1})`;
  }
  function restoreOverlays() {
    if (!document.documentElement.hasAttribute("data-codex-plain-canvas"))
      for (const overlay of overlays) {
        if (overlay.parentNode === document.documentElement)
          document.body.append(overlay);
      }
    overlays.clear();
  }
  function refresh() {
    if (refreshing || printing || media.matches || !document.body) return;
    refreshing = true;
    // Source measurements exclude our previous presentation and print rules.
    screen.textContent = "";
    print.textContent = "";
    screen.remove();
    print.remove();
    const found = findFixedSheet();
    reason = found.reason;
    if (found.root !== root) {
      restoreOverlays();
      resize.disconnect();
      root = found.root;
      if (root) {
        resize.observe(root);
        if (root.parentElement) resize.observe(root.parentElement);
      }
    }
    box = root && sheetBox(root);
    scale = 1;
    if (box) {
      document.head.append(screen, print);
      const own = selector();
      const width = box.width * box.zoom,
        height = box.height * box.zoom;
      if (mode === "fit") {
        const bodyStyle = getComputedStyle(document.body);
        const horizontal = [
          "marginLeft",
          "marginRight",
          "paddingLeft",
          "paddingRight",
        ].reduce((sum, name) => sum + (parseFloat(bodyStyle[name]) || 0), 0);
        const top = root.getBoundingClientRect().top + scrollY;
        const leading = top >= 0 && top < innerHeight ? top : 0;
        scale = Math.min(
          Math.max(1, innerWidth - horizontal) / width,
          Math.max(
            1,
            innerHeight - leading - (parseFloat(bodyStyle.paddingBottom) || 0),
          ) / height,
        );
        screen.textContent = `@media screen{${own}{zoom:${box.zoom * scale}}}`;
      }
      // Respect deliberate author page rules while still removing preview-only chrome.
      const page = authoredPageRule()
        ? ""
        : `@page{size:${width}px ${height}px;margin:0}`;
      const siblings =
        root === document.body
          ? ""
          : `body>:not(:nth-child(${[...document.body.children].indexOf(root) + 1})){display:none!important}`;
      const padding =
        root === document.body
          ? `padding:${getComputedStyle(root).padding}!important;`
          : "";
      const block = {
        inline: "block",
        "inline-block": "flow-root",
        "inline-flex": "flex",
        "inline-grid": "grid",
        "inline-table": "table",
      }[getComputedStyle(root).display];
      const display = block ? `display:${block}!important;` : "";
      const hygiene = printHygiene.replace("background:none!important;", "");
      print.textContent = `${page}${hygiene}@media print{html,body{margin:0!important;padding:0!important}${siblings}${own}{box-sizing:border-box!important;width:${box.width}px!important;height:${box.height}px!important;margin:0!important;overflow:hidden!important;contain:strict!important;${padding}${display}}}`;
      if (root === document.body)
        for (const overlay of document.body.querySelectorAll(
          ":scope > text-editor[data-codex-injected],:scope > [data-codex-tweaks-chrome]",
        )) {
          overlays.add(overlay);
          document.documentElement.append(overlay);
        }
    } else restoreOverlays();
    // Ignore only this pass's owned stylesheet/portal mutations.
    mutation.takeRecords();
    refreshing = false;
  }
  const api = {
    get root() {
      return root;
    },
    get reason() {
      return reason;
    },
    get dimensions() {
      return box
        ? { width: box.width * box.zoom, height: box.height * box.zoom }
        : null;
    },
    get previewScale() {
      return printing || media.matches ? 1 : scale;
    },
    setPreview(value) {
      if (!["fit", "actual-size"].includes(value))
        throw new Error("Preview must be fit or actual-size.");
      mode = value;
      refresh();
    },
    refresh,
    async preparePrint() {
      await document.fonts?.ready;
      refresh();
      printing = true;
      return !!box && !authoredPageRule();
    },
    restorePrint() {
      printing = false;
      schedule();
    },
    destroy() {
      events.abort();
      resize.disconnect();
      mutation.disconnect();
      cancelAnimationFrame(frame);
      screen.remove();
      print.remove();
      restoreOverlays();
      delete window.CodexFixedSheet;
    },
  };
  window.CodexFixedSheet = api;
  window.addEventListener("resize", schedule, { signal: events.signal });
  window.addEventListener(
    "beforeprint",
    () => {
      refresh();
      printing = true;
    },
    { signal: events.signal },
  );
  window.addEventListener("afterprint", () => api.restorePrint(), {
    signal: events.signal,
  });
  media.addEventListener(
    "change",
    () => {
      if (!media.matches) api.restorePrint();
    },
    { signal: events.signal },
  );
  document.fonts?.addEventListener("loadingdone", schedule, {
    signal: events.signal,
  });
  mutation.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
}
