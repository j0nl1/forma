// Build display-only copies without constructing custom elements or loading frames.
const runtimeAttribute = (name) =>
  [
    "data-deck-slide",
    "data-screen-label",
    "data-deck-active",
    "data-slide-hidden",
    "data-build-hidden",
    "data-deck-anim-hidden",
    "data-deck-anim-mask",
    "data-deck-last-visible",
  ].includes(name);
export function cleanDeckCopy(root) {
  for (const node of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of [...node.attributes])
      if (runtimeAttribute(attribute.name))
        node.removeAttribute(attribute.name);
  }
  return root;
}
function staticCopy(node) {
  if (node.nodeType === Node.TEXT_NODE)
    return document.createTextNode(node.data);
  if (
    node.nodeType !== Node.ELEMENT_NODE ||
    node.matches("script,dialog,[popover],.page-foot")
  )
    return null;
  const custom = node.localName.includes("-");
  let copy;
  if (node.matches("canvas")) {
    copy = document.createElement("img");
    try {
      copy.src = node.toDataURL();
    } catch {}
    copy.width = node.width;
    copy.height = node.height;
  } else if (node.matches("video") && node.poster) {
    copy = document.createElement("img");
    copy.src = node.poster;
  } else
    copy = custom
      ? document.createElement("div")
      : document.createElementNS(node.namespaceURI, node.localName);
  for (const attribute of node.attributes) {
    if (
      attribute.name === "id" ||
      /^on/i.test(attribute.name) ||
      runtimeAttribute(attribute.name) ||
      (node.matches("canvas,video") &&
        ["src", "srcset", "sizes"].includes(attribute.name))
    )
      continue;
    if (
      node.matches("iframe,audio,object,embed,video") &&
      ["src", "srcdoc", "data", "autoplay"].includes(attribute.name)
    )
      continue;
    copy.setAttribute(attribute.name, attribute.value);
  }
  if (custom) copy.dataset.deckStaticTag = node.localName;
  if (node.matches("canvas,video") && copy.localName === "img") {
    if (node.clientWidth) copy.style.width = `${node.clientWidth}px`;
    if (node.clientHeight) copy.style.height = `${node.clientHeight}px`;
    copy.style.objectFit = "cover";
  }
  if (copy.localName === "img") {
    copy.loading = "lazy";
    copy.decoding = "async";
  }
  if (!node.matches("iframe,audio,object,embed,video,canvas")) {
    for (const child of node.childNodes) {
      const content = staticCopy(child);
      if (content) copy.append(content);
    }
  }
  if (node.shadowRoot && custom) {
    const shadow = copy.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [...node.shadowRoot.adoptedStyleSheets];
    for (const child of node.shadowRoot.childNodes) {
      const content = staticCopy(child);
      if (content) shadow.append(content);
    }
    const style = document.createElement("style");
    style.textContent =
      "*,*::before,*::after{animation:none!important;transition:none!important}input,button{pointer-events:none}";
    shadow.append(style);
  }
  if (node.matches("input,textarea,select")) {
    if ("value" in copy) copy.value = node.value;
    if ("checked" in copy) copy.checked = node.checked;
  }
  return copy;
}
const selector = (value) =>
  value
    .replace(/:root((?:\[[^\]]*\]|[.#][\w-]+)+)/g, ":host($1)")
    .replace(/:root\b/g, ":host")
    .replace(/(^|[\s,>+~(])html((?:\[[^\]]*\]|[.#][\w-]+)+)/g, "$1:host($2)")
    .replace(/(^|[\s,>+~(])html\b/g, "$1:host")
    .replace(/(^|[\s,>+~(])body\b/g, "$1[data-deck-static-body]")
    .replace(
      /(^|[\s,>+~(])([a-z][\w]*-[\w-]+)(?=[\s,.#:[>+~)]|$)/gi,
      '$1[data-deck-static-tag="$2"]',
    );
function cssRules(rules) {
  return [...rules]
    .map((rule) => {
      if (rule.selectorText)
        return `${selector(rule.selectorText)}{${rule.style.cssText}}`;
      if (rule.cssRules)
        return `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${cssRules(rule.cssRules)}}`;
      return rule.cssText;
    })
    .join("\n");
}
export class DeckThumbnails {
  constructor(deck, rail, onSelect) {
    this.deck = deck;
    this.rail = rail;
    this.entries = new Map();
    this.onSelect = onSelect;
    this.sheet = new CSSStyleSheet();
    this.visibility = new IntersectionObserver(
      (items) => {
        for (const item of items)
          if (item.isIntersecting) this.materialize(item.target.deckEntry);
      },
      { root: rail, rootMargin: "300px" },
    );
    this.resize = new ResizeObserver(() => this.scale());
    this.resize.observe(rail);
    this.refreshStyles();
    this.observer = new MutationObserver((changes) => {
      this.dirty ??= new Set();
      const dirty = this.dirty;
      for (const change of changes) {
        if (
          change.type === "attributes" &&
          runtimeAttribute(change.attributeName)
        )
          continue;
        if (
          change.type === "attributes" &&
          change.target === deck &&
          [
            "data-fonts-pending",
            "data-chrome-visible",
            "data-fullscreen",
            "data-presenting",
          ].includes(change.attributeName)
        )
          continue;
        let target = change.target;
        while (target?.getRootNode()?.host && !deck.contains(target))
          target = target.getRootNode().host;
        const slide = deck.slides.find(
          (node) => node === target || node.contains(target),
        );
        if (slide) dirty.add(slide);
        else this.stylesDirty = true;
      }
      if (!dirty.size && !this.stylesDirty) return;
      cancelAnimationFrame(this.refreshFrame);
      this.refreshFrame = requestAnimationFrame(() => {
        if (this.stylesDirty) this.refreshStyles();
        this.stylesDirty = false;
        for (const slide of dirty) {
          const entry = this.entries.get(slide);
          if (entry?.host) {
            entry.host.remove();
            entry.host = null;
            this.materialize(entry);
          }
        }
        dirty.clear();
        this.sync();
      });
    });
    this.observer.observe(deck, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    this.observer.observe(document.documentElement, { attributes: true });
    this.observer.observe(document.body, { attributes: true });
    document.fonts.ready.then(() => {
      if (deck.isConnected) this.refreshStyles();
    });
  }
  refreshStyles() {
    const css = [...document.styleSheets]
      .map((sheet) => {
        try {
          return cssRules(sheet.cssRules);
        } catch {
          return "";
        }
      })
      .join("\n");
    this.variables = new Set(css.match(/--[\w-]+/g) ?? []);
    this.sheet.replaceSync(
      css +
        "\n*,*::before,*::after{animation:none!important;transition:none!important}[data-deck-static-root]{position:absolute!important;inset:0!important;width:var(--thumb-w)!important;height:var(--thumb-h)!important;box-sizing:border-box!important;opacity:1!important;visibility:visible!important;pointer-events:none!important;overflow:hidden!important;transform-origin:0 0!important;counter-increment:none!important}",
    );
    for (const entry of this.entries.values()) this.mirror(entry);
  }
  mirror(entry) {
    if (!entry.host) return;
    for (const [element, source] of [
      [entry.body, document.body],
      [entry.context, this.deck],
    ]) {
      if (!element) continue;
      for (const attribute of [...element.attributes])
        if (
          !["data-deck-static-body", "data-deck-static-tag"].includes(
            attribute.name,
          )
        )
          element.removeAttribute(attribute.name);
      for (const attribute of source.attributes)
        if (
          !["id", "style"].includes(attribute.name) &&
          !/^on/i.test(attribute.name) &&
          !runtimeAttribute(attribute.name)
        )
          element.setAttribute(attribute.name, attribute.value);
    }
    for (const attribute of [...entry.host.attributes])
      if (
        attribute.name === "class" ||
        attribute.name === "lang" ||
        attribute.name.startsWith("data-")
      )
        entry.host.removeAttribute(attribute.name);
    for (const attribute of document.documentElement.attributes)
      if (
        attribute.name === "class" ||
        attribute.name === "lang" ||
        attribute.name.startsWith("data-")
      )
        entry.host.setAttribute(attribute.name, attribute.value);
    const computed = getComputedStyle(this.deck);
    for (const name of this.variables)
      entry.host.style.setProperty(name, computed.getPropertyValue(name));
    entry.host.style.setProperty("--thumb-w", `${this.deck.width}px`);
    entry.host.style.setProperty("--thumb-h", `${this.deck.height}px`);
  }
  reconcile() {
    const positions = new Map(
      [...this.entries].map(([slide, entry]) => [
        slide,
        entry.thumb.getBoundingClientRect().top,
      ]),
    );
    for (const [slide, entry] of this.entries)
      if (!this.deck.slides.includes(slide)) {
        this.visibility.unobserve(entry.frame);
        entry.thumb.remove();
        this.entries.delete(slide);
      }
    this.deck.slides.forEach((slide, index) => {
      let entry = this.entries.get(slide);
      if (!entry) {
        const thumb = document.createElement("div");
        thumb.className = "thumb";
        thumb.tabIndex = 0;
        thumb.setAttribute("role", "option");
        const number = document.createElement("span");
        number.className = "num";
        const frame = document.createElement("div");
        frame.className = "frame";
        thumb.append(number, frame);
        entry = { slide, thumb, number, frame, index, host: null };
        frame.deckEntry = entry;
        this.entries.set(slide, entry);
        this.onSelect(entry);
        this.visibility.observe(frame);
      }
      entry.index = index;
      if (this.rail.children[index] !== entry.thumb)
        this.rail.insertBefore(entry.thumb, this.rail.children[index] ?? null);
      const offset =
        positions.get(slide) - entry.thumb.getBoundingClientRect().top;
      if (
        Number.isFinite(offset) &&
        Math.abs(offset) > 1 &&
        !matchMedia("(prefers-reduced-motion:reduce)").matches &&
        !entry.thumb.hasAttribute("data-dragging")
      )
        entry.thumb.animate(
          [
            { transform: `translateY(${offset}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 180, easing: "cubic-bezier(.2,.7,.3,1)" },
        );
    });
    this.sync();
    this.scale();
  }
  materialize(entry) {
    if (!entry || entry.host) return;
    const host = document.createElement("div");
    host.inert = true;
    host.className = "thumb-host";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [this.sheet];
    const body = document.createElement("div");
    body.dataset.deckStaticBody = "";
    for (const attribute of document.body.attributes)
      if (attribute.name !== "id" && !/^on/i.test(attribute.name))
        body.setAttribute(attribute.name, attribute.value);
    const context = document.createElement("div");
    context.dataset.deckStaticTag = "deck-stage";
    for (const attribute of this.deck.attributes)
      if (!["id", "style"].includes(attribute.name))
        context.setAttribute(attribute.name, attribute.value);
    const watchShadows = (node) => {
      if (node.shadowRoot) {
        this.observer.observe(node.shadowRoot, {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true,
        });
        for (const child of node.shadowRoot.querySelectorAll("*"))
          if (child.shadowRoot) watchShadows(child);
      }
      for (const child of node.querySelectorAll("*"))
        if (child.shadowRoot) watchShadows(child);
    };
    watchShadows(entry.slide);
    const clone = staticCopy(entry.slide);
    clone.dataset.deckStaticRoot = "";
    context.append(clone);
    body.append(context);
    shadow.append(body);
    entry.frame.replaceChildren(host);
    entry.host = host;
    entry.body = body;
    entry.context = context;
    entry.clone = clone;
    this.mirror(entry);
    this.scaleEntry(entry);
    this.visibility.unobserve(entry.frame);
  }
  scaleEntry(entry) {
    entry.frame.style.aspectRatio = `${this.deck.width}/${this.deck.height}`;
    if (entry.clone)
      entry.clone.style.transform = `scale(${entry.frame.clientWidth / this.deck.width})`;
  }
  scale() {
    for (const entry of this.entries.values()) this.scaleEntry(entry);
  }
  sync() {
    let number = 0;
    for (const slide of this.deck.slides) {
      const entry = this.entries.get(slide);
      if (!entry) continue;
      const skipped = entry.slide.hasAttribute("data-deck-skip");
      entry.number.textContent = skipped ? "" : String(++number);
      entry.thumb.toggleAttribute("data-skipped", skipped);
      entry.thumb.setAttribute(
        "aria-current",
        String(entry.index === this.deck.index),
      );
      const selected = this.deck.editor?.selection.has(entry.slide) ?? false;
      entry.thumb.toggleAttribute("data-selected", selected);
      entry.thumb.setAttribute(
        "aria-selected",
        String(
          selected ||
            (!this.deck.editor?.selection.size &&
              entry.index === this.deck.index),
        ),
      );
      entry.thumb.setAttribute(
        "aria-label",
        `${skipped ? "Skipped slide" : "Slide " + entry.number.textContent}: ${entry.slide.getAttribute("data-label") || entry.slide.querySelector("h1,h2,h3")?.textContent || "Untitled"}`,
      );
    }
  }
  dispose() {
    this.observer.disconnect();
    this.visibility.disconnect();
    this.resize.disconnect();
    cancelAnimationFrame(this.refreshFrame);
  }
}
