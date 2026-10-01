// Exports are snapshots of visible content, with scripts removed and assets embedded.
export function downloadBlob(blob, name) {
  const link = document.createElement("a"),
    url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportBoard(board, kind) {
  return exportRegion(board.shadowRoot.querySelector(".card"), kind, {
    title: board.getAttribute("label") || "Artboard",
    scale: 3,
    allowExternal: board.ownerCanvas?.hasAttribute("allow-external-assets"),
  });
}
export async function exportRegion(
  card,
  kind,
  { title = "Asset", scale = 1, allowExternal = false } = {},
) {
  if (!["png", "html"].includes(kind)) throw new Error("Choose PNG or HTML");
  if (!(card instanceof Element))
    throw new Error("Choose an actual content region");
  if (!Number.isFinite(scale) || scale <= 0 || scale > 4)
    throw new Error("Choose a capture scale between 0 and 4");
  await document.fonts.ready;
  const assets = new Map();
  const embed = (raw, base = location.href) => {
    const url = new URL(raw, base);
    if (url.protocol === "data:") return Promise.resolve(url.href);
    if (
      !allowExternal &&
      url.origin !== location.origin &&
      url.protocol !== "blob:"
    )
      throw new Error(
        "Localize external assets before exporting this artboard",
      );
    if (!assets.has(url.href))
      assets.set(
        url.href,
        (async () => {
          const response = await fetch(url);
          if (!response.ok)
            throw new Error(`Cannot embed asset: ${url.pathname}`);
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        })(),
      );
    return assets.get(url.href);
  };
  const embedUrls = async (css, base) => {
    const matches = [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)];
    for (const match of matches) {
      if (!match[2] || match[2].startsWith("#")) continue;
      css = css.split(match[0]).join(`url("${await embed(match[2], base)}")`);
    }
    return css;
  };
  const fonts = [],
    visited = new Set(),
    fetchedCss = new Set();
  const fetchCss = async (raw, base = location.href) => {
    const url = new URL(raw, base);
    if (fetchedCss.has(url.href)) return;
    fetchedCss.add(url.href);
    if (!allowExternal && url.origin !== location.origin)
      throw new Error(
        "Localize inaccessible stylesheets before exporting, or enable external assets",
      );
    const response = await fetch(url);
    if (!response.ok)
      throw new Error("Cannot read stylesheet for artboard export");
    let text = await response.text();
    const imports = [
      ...text.matchAll(/@import\s+(?:url\(\s*)?(['"]?)([^'"\s);]+)\1[^;]*;/g),
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
    if (
      !(source instanceof Element) ||
      source.matches("script,link,style,[data-codex-chrome]")
    )
      return document.createTextNode("");
    if (source.localName === "slot") {
      const fragment = document.createDocumentFragment();
      for (const child of source.assignedNodes({ flatten: true }))
        fragment.append(await clone(child));
      return fragment;
    }
    const style = getComputedStyle(source);
    let target = document.createElementNS(
      source.namespaceURI,
      source.localName.includes("-") ? "div" : source.localName,
    );
    for (const attr of source.attributes)
      if (!["style", "src", "srcset"].includes(attr.name))
        target.setAttribute(attr.name, attr.value);
    for (const property of style)
      target.style.setProperty(
        property,
        await embedUrls(style.getPropertyValue(property), location.href),
      );
    target.style.animation = "none";
    target.style.transition = "none";
    if (source instanceof HTMLCanvasElement) {
      target = document.createElement("img");
      target.src = source.toDataURL();
      target.style.cssText = [...style]
        .map((key) => `${key}:${style.getPropertyValue(key)}`)
        .join(";");
    } else if (source instanceof HTMLImageElement)
      target.src = await embed(source.currentSrc || source.src);
    else if (source instanceof HTMLInputElement) {
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
  const width = card.offsetWidth,
    height = card.offsetHeight;
  if (!width || !height) throw new Error("The artboard has no exportable size");
  const snapshot = await clone(card);
  snapshot.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  Object.assign(snapshot.style, {
    width: `${width}px`,
    height: `${height}px`,
    transform: "none",
    boxShadow: "none",
    borderRadius: "0",
    margin: "0",
  });
  const name =
    title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "Artboard";
  if (kind === "html") {
    const doc = document.implementation.createHTMLDocument(title);
    doc.documentElement.lang = "en";
    const charset = doc.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    doc.head.prepend(charset);
    const css = doc.createElement("style");
    css.textContent = fonts.join("\n");
    doc.head.append(css);
    doc.body.style.margin = "0";
    doc.body.append(snapshot);
    const blob = new Blob(
      ["<!doctype html>\n", doc.documentElement.outerHTML],
      { type: "text/html" },
    );
    downloadBlob(blob, `${name}.html`);
    return blob;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", Math.round(width * scale));
  svg.setAttribute("height", Math.round(height * scale));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const foreign = document.createElementNS(svg.namespaceURI, "foreignObject");
  foreign.setAttribute("width", width);
  foreign.setAttribute("height", height);
  const css = document.createElement("style");
  css.textContent = fonts.join("\n");
  snapshot.prepend(css);
  foreign.append(snapshot);
  svg.append(foreign);
  const image = new Image();
  image.src =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(new XMLSerializer().serializeToString(svg));
  await image.decode();
  const output = document.createElement("canvas");
  output.width = Math.round(width * scale);
  output.height = Math.round(height * scale);
  output.getContext("2d").drawImage(image, 0, 0);
  const blob = await new Promise((resolve) => output.toBlob(resolve));
  if (!blob) throw new Error("PNG encoding failed");
  downloadBlob(blob, `${name}.png`);
  return blob;
}
