(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // skills/studio-design/assets/starters/canvas-viewport.js
  function attachViewport(canvas, view, world, output, behavior = {}) {
    const minimum = Number(canvas.getAttribute("min-scale") ?? 0.1);
    const maximum = Number(canvas.getAttribute("max-scale") ?? 8);
    const min = Number.isFinite(minimum) && minimum > 0 ? minimum : 0.1;
    const max = Number.isFinite(maximum) && maximum >= min ? maximum : Math.max(8, min);
    const clamp = (scale) => Math.min(max, Math.max(min, scale));
    const key = `dc-viewport:${location.pathname}:${behavior.storageId ?? (canvas.id || "default")}`;
    let transform = { x: 0, y: 0, scale: 1 }, restored = false, interacted = false;
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      if (stored && [stored.x, stored.y, stored.scale].every(Number.isFinite)) {
        transform = { ...stored, scale: clamp(stored.scale) };
        restored = true;
      }
    } catch {
    }
    let timer, pan, burstTime = -Infinity, burstZoom = false, gestureScale = null;
    const abort = new AbortController(), options = { signal: abort.signal };
    const save = () => {
      try {
        localStorage.setItem(key, JSON.stringify(transform));
      } catch {
      }
    };
    const apply = () => {
      world.style.transform = `translate3d(${transform.x}px,${transform.y}px,0) scale(${transform.scale})`;
      canvas.style.setProperty("--dc-inv-zoom", 1 / transform.scale);
      output.value = `${Math.round(transform.scale * 100)}%`;
      clearTimeout(timer);
      timer = setTimeout(save, 200);
      canvas.dispatchEvent(
        new CustomEvent("codex-canvas-viewport", { detail: { ...transform } })
      );
    };
    const zoomAt = (scale, x, y, anchor) => {
      const rect = view.getBoundingClientRect(), cx = x - rect.left, cy = y - rect.top;
      const before = anchor?.getBoundingClientRect().top;
      const ratio = clamp(scale) / transform.scale;
      transform = {
        x: cx - (cx - transform.x) * ratio,
        y: cy - (cy - transform.y) * ratio,
        scale: clamp(scale)
      };
      apply();
      if (before !== void 0) {
        const expected = y + (before - y) * ratio;
        transform.y += expected - anchor.getBoundingClientRect().top;
        apply();
      }
    };
    const targetPath = (event) => event.composedPath().filter((node) => node instanceof Element);
    const notch = (event) => event.deltaMode !== 0 || event.deltaX === 0 && Number.isInteger(event.deltaY) && Math.abs(event.deltaY) >= 40;
    view.addEventListener(
      "wheel",
      (event) => {
        interacted = true;
        const path = targetPath(event);
        if (behavior.ignore?.(path)) return;
        if (path.some(
          (node) => node.localName === "deck-stage" || node.hasAttribute("data-dc-wheel-passthru") || node.hasAttribute("data-codex-wheel-passthru")
        ) && !event.ctrlKey && !event.metaKey)
          return;
        event.preventDefault();
        if (gestureScale !== null) return;
        const click = notch(event), modified = event.ctrlKey || event.metaKey;
        if (modified) {
          burstTime = -Infinity;
        } else {
          if (event.timeStamp - burstTime > 200) burstZoom = click;
          burstTime = event.timeStamp;
        }
        if (modified || burstZoom && click) {
          const factor = click ? event.deltaY < 0 ? 1.1 : 1 / 1.1 : Math.exp(-event.deltaY * 0.01);
          const anchor = path.find(
            (node) => ["design-board", "design-section", "design-note"].includes(
              node.localName
            )
          );
          zoomAt(transform.scale * factor, event.clientX, event.clientY, anchor);
        } else {
          transform.x -= event.deltaX;
          transform.y -= event.deltaY;
          apply();
        }
      },
      { ...options, passive: false }
    );
    view.addEventListener(
      "pointerdown",
      (event) => {
        interacted = true;
        if (event.button !== 0 && event.button !== 1) return;
        const path = targetPath(event);
        if (behavior.ignore?.(path)) return;
        if (event.button === 0 && (behavior.interactive?.(path) ?? path.some(
          (node) => node.matches(
            "design-board,design-note,input,button,textarea,select,[contenteditable]"
          )
        )))
          return;
        event.preventDefault();
        pan = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          tx: transform.x,
          ty: transform.y
        };
        view.setPointerCapture(event.pointerId);
        view.style.cursor = "grabbing";
      },
      options
    );
    view.addEventListener(
      "pointermove",
      (event) => {
        if (!pan || pan.id !== event.pointerId) return;
        transform.x = pan.tx + event.clientX - pan.x;
        transform.y = pan.ty + event.clientY - pan.y;
        apply();
      },
      options
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
      { ...options, passive: false }
    );
    view.addEventListener(
      "gesturechange",
      (event) => {
        event.preventDefault();
        if (gestureScale !== null)
          zoomAt(gestureScale * event.scale, event.clientX, event.clientY);
      },
      { ...options, passive: false }
    );
    view.addEventListener(
      "gestureend",
      (event) => {
        event.preventDefault();
        gestureScale = null;
      },
      { ...options, passive: false }
    );
    window.addEventListener("pagehide", save, options);
    apply();
    let checks = 0, misses = 0;
    const visibility = () => {
      if (!restored || interacted || checks++ >= 10) return;
      const rect = view.getBoundingClientRect();
      const boxes = behavior.boxes?.() ?? [...canvas.querySelectorAll("design-board,design-section")].filter((node) => !node.hidden).map(
        (node) => node.localName === "design-section" ? node.shadowRoot?.querySelector("header")?.getBoundingClientRect() : node.getBoundingClientRect()
      ).filter(Boolean);
      if (boxes.length) {
        const visible = boxes.some(
          (box) => box.right > rect.left && box.left < rect.right && box.bottom > rect.top && box.top < rect.bottom
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
        const extent = behavior.extent?.() ?? {
          width: world.scrollWidth,
          height: world.scrollHeight
        };
        transform = {
          x: 0,
          y: 0,
          scale: clamp(
            Math.min(
              1,
              view.clientWidth / Math.max(1, extent.width),
              view.clientHeight / Math.max(1, extent.height)
            )
          )
        };
        apply();
      },
      destroy() {
        clearTimeout(timer);
        clearTimeout(timerVisibility);
        save();
        abort.abort();
      }
    };
  }
  var init_canvas_viewport = __esm({
    "skills/studio-design/assets/starters/canvas-viewport.js"() {
    }
  });

  // skills/studio-design/assets/starters/canvas-export.js
  function downloadBlob(blob, name) {
    const link = document.createElement("a"), url = URL.createObjectURL(blob);
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async function exportRegion(card, kind, {
    title = "Asset",
    scale = 1,
    allowExternal = false,
    outputWidth,
    outputHeight,
    download = true
  } = {}) {
    if (!["png", "html"].includes(kind)) throw new Error("Choose PNG or HTML");
    if (!(card instanceof Element))
      throw new Error("Choose an actual content region");
    if (!Number.isFinite(scale) || scale <= 0 || scale > 4)
      throw new Error("Choose a capture scale between 0 and 4");
    await document.fonts.ready;
    const assets = /* @__PURE__ */ new Map();
    const embed = (raw, base = location.href) => {
      const url = new URL(raw, base);
      if (url.protocol === "data:") return Promise.resolve(url.href);
      if (!allowExternal && url.origin !== location.origin && url.protocol !== "blob:")
        throw new Error(
          "Localize external assets before exporting this artboard"
        );
      if (!assets.has(url.href))
        assets.set(
          url.href,
          (async () => {
            const response = await fetch(url);
            if (!response.ok)
              throw new Error(`Cannot embed asset: ${url.pathname}`);
            const blob2 = await response.blob();
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob2);
            });
          })()
        );
      return assets.get(url.href);
    };
    const embedUrls = async (css2, base) => {
      const matches = [...css2.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)];
      for (const match of matches) {
        if (!match[2] || match[2].startsWith("#")) continue;
        css2 = css2.split(match[0]).join(`url("${await embed(match[2], base)}")`);
      }
      return css2;
    };
    const fonts = [], pseudoRules = [], visited = /* @__PURE__ */ new Set(), fetchedCss = /* @__PURE__ */ new Set();
    const fetchCss = async (raw, base = location.href) => {
      const url = new URL(raw, base);
      if (fetchedCss.has(url.href)) return;
      fetchedCss.add(url.href);
      if (!allowExternal && url.origin !== location.origin)
        throw new Error(
          "Localize inaccessible stylesheets before exporting, or enable external assets"
        );
      const response = await fetch(url);
      if (!response.ok)
        throw new Error("Cannot read stylesheet for artboard export");
      let text = await response.text();
      const imports = [
        ...text.matchAll(/@import\s+(?:url\(\s*)?(['"]?)([^'"\s);]+)\1[^;]*;/g)
      ];
      for (const match of imports) {
        await fetchCss(match[2], url.href);
        text = text.replace(match[0], "");
      }
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      await walk(sheet, url.href);
    };
    const walk = async (sheet, base = sheet.href || location.href) => {
      if (visited.has(sheet)) return;
      visited.add(sheet);
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        if (sheet.href) {
          await fetchCss(sheet.href);
          return;
        }
        throw new Error("Cannot inspect stylesheet for artboard export");
      }
      const visit = async (list) => {
        for (const rule of list) {
          if (rule.type === CSSRule.FONT_FACE_RULE)
            fonts.push(await embedUrls(rule.cssText, base));
          else if (rule.styleSheet) await walk(rule.styleSheet);
          else if (rule.cssRules) await visit(rule.cssRules);
        }
      };
      await visit(rules);
    };
    for (const sheet of document.styleSheets) await walk(sheet);
    const clone = async (source) => {
      if (source.nodeType === Node.TEXT_NODE)
        return document.createTextNode(source.textContent);
      if (!(source instanceof Element) || source.matches(
        "script,link,style,[data-codex-chrome],[data-omelette-chrome]"
      ))
        return document.createTextNode("");
      if (source.localName === "slot") {
        const fragment = document.createDocumentFragment();
        for (const child of source.assignedNodes({ flatten: true }))
          fragment.append(await clone(child));
        return fragment;
      }
      const style = getComputedStyle(source);
      if (source.shadowRoot)
        for (const sheet of [
          ...source.shadowRoot.styleSheets,
          ...source.shadowRoot.adoptedStyleSheets
        ])
          await walk(sheet);
      let target = document.createElementNS(
        source.namespaceURI,
        source.localName.includes("-") ? "div" : source.localName
      );
      for (const attr of source.attributes)
        if (!["style", "src", "srcset"].includes(attr.name)) {
          if (attr.namespaceURI)
            target.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
          else target.setAttribute(attr.name, attr.value);
        }
      for (const property of style)
        target.style.setProperty(
          property,
          await embedUrls(style.getPropertyValue(property), location.href)
        );
      target.style.animation = "none";
      target.style.transition = "none";
      if (source instanceof HTMLElement) {
        let pseudoId;
        for (const name2 of ["before", "after"]) {
          const pseudo = getComputedStyle(source, `::${name2}`);
          if (["none", "normal"].includes(pseudo.content) || pseudo.display === "none")
            continue;
          const id = pseudoId ||= String(pseudoRules.length + 1);
          target.setAttribute("data-codex-capture-pseudo", id);
          const declaration = document.createElement("span").style;
          for (const property of pseudo)
            declaration.setProperty(
              property,
              await embedUrls(pseudo.getPropertyValue(property), location.href)
            );
          declaration.animation = "none";
          declaration.transition = "none";
          pseudoRules.push(
            `[data-codex-capture-pseudo="${id}"]::${name2}{${declaration.cssText}}`
          );
        }
      }
      if (source instanceof HTMLCanvasElement) {
        target = document.createElement("img");
        target.src = source.toDataURL();
        target.style.cssText = [...style].map((key) => `${key}:${style.getPropertyValue(key)}`).join(";");
      } else if (source instanceof HTMLImageElement) {
        target.src = await embed(source.currentSrc || source.src);
      } else if (source instanceof HTMLInputElement) {
        target.value = source.value;
        target.setAttribute("value", source.value);
        if (source.checked) target.setAttribute("checked", "");
      } else if (source instanceof HTMLTextAreaElement)
        target.textContent = source.value;
      else {
        for (const child of (source.shadowRoot ?? source).childNodes)
          target.append(await clone(child));
        if (source instanceof HTMLSelectElement)
          [...target.options].forEach((option, index) => {
            option.selected = source.options[index].selected;
            if (option.selected) option.setAttribute("selected", "");
          });
      }
      return target;
    };
    const box = getComputedStyle(card);
    const dimension = (axis, sides) => {
      const size = Number.parseFloat(box[axis]);
      return Number.isFinite(size) ? size + (box.boxSizing === "border-box" ? 0 : sides.reduce(
        (sum, side) => sum + (Number.parseFloat(box[side]) || 0),
        0
      )) : axis === "width" ? card.offsetWidth : card.offsetHeight;
    };
    const width = dimension("width", [
      "paddingLeft",
      "paddingRight",
      "borderLeftWidth",
      "borderRightWidth"
    ]), height = dimension("height", [
      "paddingTop",
      "paddingBottom",
      "borderTopWidth",
      "borderBottomWidth"
    ]);
    if (!width || !height) throw new Error("The artboard has no exportable size");
    const pixelWidth = outputWidth ?? Math.round(width * scale), pixelHeight = outputHeight ?? Math.round(height * scale);
    if (kind === "png" && ![pixelWidth, pixelHeight].every(
      (value) => Number.isSafeInteger(value) && value > 0
    ))
      throw new Error("Choose positive integer export dimensions.");
    const snapshot = await clone(card);
    snapshot.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    Object.assign(snapshot.style, {
      position: "relative",
      left: "auto",
      top: "auto",
      right: "auto",
      bottom: "auto",
      width: `${width}px`,
      height: `${height}px`,
      boxSizing: "border-box",
      transform: "none",
      boxShadow: "none",
      borderRadius: "0",
      margin: "0"
    });
    const name = title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "Artboard";
    if (kind === "html") {
      const doc = document.implementation.createHTMLDocument(title);
      doc.documentElement.lang = "en";
      const charset = doc.createElement("meta");
      charset.setAttribute("charset", "utf-8");
      doc.head.prepend(charset);
      const css2 = doc.createElement("style");
      css2.textContent = [...fonts, ...pseudoRules].join("\n");
      doc.head.append(css2);
      doc.body.style.margin = "0";
      doc.body.append(snapshot);
      const blob2 = new Blob(
        ["<!doctype html>\n", doc.documentElement.outerHTML],
        { type: "text/html" }
      );
      if (download) downloadBlob(blob2, `${name}.html`);
      return blob2;
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", pixelWidth);
    svg.setAttribute("height", pixelHeight);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const foreign = document.createElementNS(svg.namespaceURI, "foreignObject");
    foreign.setAttribute("width", width);
    foreign.setAttribute("height", height);
    const css = document.createElement("style");
    css.textContent = [...fonts, ...pseudoRules].join("\n");
    snapshot.prepend(css);
    foreign.append(snapshot);
    svg.append(foreign);
    const image = new Image();
    image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    await image.decode();
    const output = document.createElement("canvas");
    output.width = pixelWidth;
    output.height = pixelHeight;
    output.getContext("2d").drawImage(image, 0, 0);
    const blob = await new Promise((resolve) => output.toBlob(resolve));
    if (!blob) throw new Error("PNG encoding failed");
    if (download) downloadBlob(blob, `${name}.png`);
    return blob;
  }
  var init_canvas_export = __esm({
    "skills/studio-design/assets/starters/canvas-export.js"() {
    }
  });

  // skills/studio-design/assets/starters/plain-canvas-runtime.js
  var plain_canvas_runtime_exports = {};
  __export(plain_canvas_runtime_exports, {
    installPlainCanvas: () => installPlainCanvas
  });
  function activate() {
    const html = document.documentElement, body = document.body;
    const original = {
      transform: body.style.transform,
      zoom: body.style.getPropertyValue("--dc-inv-zoom")
    };
    const style = document.createElement("style");
    style.dataset.codexPlainCanvasStyle = "";
    style.textContent = pageStyle;
    document.head.append(style);
    html.setAttribute("data-codex-plain-canvas", "");
    const host = document.createElement("codex-plain-canvas-controls");
    host.setAttribute("data-codex-chrome", "");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${chromeStyle}</style><div class="bar" role="toolbar" aria-label="Plain HTML canvas"><button data-out aria-label="Zoom out">\u2212</button><output aria-label="Canvas zoom">100%</output><button data-in aria-label="Zoom in">+</button><button data-fit>Fit</button><button data-reset>Reset view</button><select aria-label="Canvas frame"></select><button data-png>Download PNG</button><button data-html>Download HTML</button><span role="status" aria-live="polite"></span></div>`;
    html.append(host);
    for (const editor of body.querySelectorAll(
      ":scope > text-editor[data-codex-injected],:scope > [data-codex-tweaks-chrome]"
    ))
      html.append(editor);
    const select = shadow.querySelector("select"), status = shadow.querySelector("[role=status]");
    let frames = [];
    const refresh = () => {
      const selected = frames[select.selectedIndex];
      frames = content();
      select.replaceChildren(
        ...frames.map((node, index) => {
          const option = document.createElement("option");
          option.textContent = node.getAttribute("aria-label") || node.getAttribute("data-codex-frame-label") || node.id || `Frame ${index + 1}`;
          return option;
        })
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
        ignore: (path) => path.includes(host) || path.some((node) => node.matches(ownedOverlay)),
        interactive: (path) => path.some(
          (node) => node.parentElement === body && content().includes(node)
        ) || path.some(
          (node) => node.matches("input,button,textarea,select,a,[contenteditable]")
        ),
        boxes: () => content().map((node) => node.getBoundingClientRect()),
        extent: () => {
          const origin = body.getBoundingClientRect(), scale = viewport.value.scale, boxes = content().map((node) => node.getBoundingClientRect());
          return {
            width: Math.max(
              1,
              ...boxes.map((box) => (box.right - origin.left) / scale)
            ) + 24,
            height: Math.max(
              1,
              ...boxes.map((box) => (box.bottom - origin.top) / scale)
            ) + 24
          };
        }
      }
    );
    shadow.querySelector("[data-out]").onclick = () => viewport.zoom(viewport.value.scale / 1.1);
    shadow.querySelector("[data-in]").onclick = () => viewport.zoom(viewport.value.scale * 1.1);
    shadow.querySelector("[data-fit]").onclick = () => viewport.fit();
    shadow.querySelector("[data-reset]").onclick = () => viewport.set({ x: 0, y: 0, scale: 1 });
    for (const kind of ["png", "html"])
      shadow.querySelector(`[data-${kind}]`).onclick = async () => {
        const frame = frames[select.selectedIndex];
        try {
          status.textContent = "Preparing export\u2026";
          await exportRegion(frame, kind, {
            title: select.selectedOptions[0]?.textContent || "Frame",
            scale: 3
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
      const box = target.getBoundingClientRect(), value = viewport.value;
      viewport.set({
        x: value.x + innerWidth / 2 - (box.left + box.width / 2),
        y: value.y + innerHeight / 2 - (box.top + box.height / 2),
        scale: value.scale
      });
    };
    html.addEventListener(
      "click",
      (event) => {
        const anchor = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
        if (!anchor || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target || anchor.hasAttribute("download"))
          return;
        const url = new URL(anchor.href);
        if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash)
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
      { signal: navigation.signal }
    );
    window.addEventListener("hashchange", revealHash, {
      signal: navigation.signal
    });
    window.addEventListener("popstate", revealHash, {
      signal: navigation.signal
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
          ":scope > text-editor[data-codex-injected],:scope > [data-codex-tweaks-chrome]"
        ))
          body.append(editor);
        style.remove();
      }
    };
  }
  async function installPlainCanvas() {
    if (window.CodexPlainCanvasInstallation)
      return window.CodexPlainCanvasInstallation;
    if (document.readyState === "loading")
      await new Promise(
        (resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true })
      );
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (window.CodexPlainCanvasInstallation)
      return window.CodexPlainCanvasInstallation;
    let controller = null, scheduled = 0;
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
        "data-codex-frame-label"
      ]
    });
    const installation = {
      refresh: reconcile,
      destroy() {
        observer.disconnect();
        cancelAnimationFrame(scheduled);
        controller?.destroy();
        window.CodexPlainCanvas = null;
        delete window.CodexPlainCanvasInstallation;
      }
    };
    window.CodexPlainCanvasInstallation = installation;
    return installation;
  }
  var marker, ownedOverlay, content, pageStyle, chromeStyle;
  var init_plain_canvas_runtime = __esm({
    "skills/studio-design/assets/starters/plain-canvas-runtime.js"() {
      init_canvas_viewport();
      init_canvas_export();
      marker = () => document.querySelector('meta[name="design_doc_mode"][content="canvas"]');
      ownedOverlay = "text-editor[data-codex-injected],[data-codex-tweaks-chrome]";
      content = () => [...document.body.children].filter(
        (node) => !node.matches("script,style,template,link,meta,[data-codex-chrome]") && !node.hidden && getComputedStyle(node).display !== "none"
      );
      pageStyle = `html[data-codex-plain-canvas]{height:100%;overflow:hidden;background:#f0eee9}html[data-codex-plain-canvas]>body{position:relative!important;margin:0!important;min-height:100vh;min-width:100%;width:max-content;transform-origin:0 0!important}html[data-codex-exporting]>codex-plain-canvas-controls{display:none!important}@media print{html[data-codex-plain-canvas]{overflow:visible}html[data-codex-plain-canvas]>body{transform:none!important}codex-plain-canvas-controls{display:none!important}}`;
      chromeStyle = `:host{position:fixed;top:12px;left:12px;right:12px;z-index:2147482900;pointer-events:none;font:13px system-ui;color:#45483f}*{box-sizing:border-box}.bar{pointer-events:auto;display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:10px 12px;background:#fffffff5;border:1px solid #deddd6;border-radius:10px;box-shadow:0 3px 18px #0001;width:fit-content;max-width:100%}button,select{font:inherit;border:1px solid #d2d3cf;border-radius:5px;background:white;color:inherit;padding:5px 8px;cursor:pointer}select{max-width:190px}output{min-width:44px;text-align:center}button:focus-visible,select:focus-visible{outline:2px solid #49797c;outline-offset:2px}[role=status]{font-size:12px;max-width:340px;overflow-wrap:anywhere}`;
    }
  });

  // skills/studio-design/assets/starters/plain-canvas.js
  window.CodexPlainCanvasReady = Promise.resolve().then(() => (init_plain_canvas_runtime(), plain_canvas_runtime_exports)).then(
    ({ installPlainCanvas: installPlainCanvas2 }) => installPlainCanvas2()
  );
})();
