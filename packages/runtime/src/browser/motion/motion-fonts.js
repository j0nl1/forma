import { parse } from "postcss";
import { fontOrigins, cssImport, rewriteCSSURLs } from "../shared/font-css.js";

export async function embedMotionFonts(root, { origins = [], signal } = {}) {
  const allowed = new Set(fontOrigins(origins));
  const warnings = new Set(),
    seen = new Set(),
    inlineSheets = new WeakSet(),
    fontCache = new Map(),
    records = [];
  const permitted = (url) =>
    url.origin === location.origin || allowed.has(url.origin);
  const read = async (url) => {
    if (
      url.protocol === "data:" ||
      (url.protocol === "blob:" && url.origin === location.origin)
    )
      return fetch(url, { signal });
    if (!["http:", "https:"].includes(url.protocol) || !permitted(url))
      throw new Error(
        "An unconfigured font or stylesheet origin was skipped: " + url.origin,
      );
    if (url.username || url.password)
      throw new Error("A credentialed font URL was skipped");
    const response = await fetch(url, {
      signal,
      credentials: url.origin === location.origin ? "same-origin" : "omit",
    });
    if (!response.ok)
      throw new Error(
        "A font resource could not be read: " + url.origin + url.pathname,
      );
    if (!permitted(new URL(response.url)))
      throw new Error("A font redirect ended at an unconfigured origin");
    return response;
  };
  const collect = async (nodes, base, wrappers, ancestors) => {
    for (const node of nodes ?? []) {
      if (node.type !== "atrule") continue;
      const name = node.name.toLowerCase();
      if (name === "font-face")
        records.push({ css: node.toString(), base, wrappers });
      else if (name === "import") {
        try {
          const source = cssImport(node.params);
          await sheet(
            new URL(source.value, base).href,
            [...wrappers, ...source.wrappers],
            undefined,
            ancestors,
          );
        } catch (error) {
          if (signal?.aborted) throw error;
          warnings.add(error.message);
        }
      } else if (node.nodes)
        await collect(
          node.nodes,
          base,
          [
            ...wrappers,
            "@" + node.name + (node.params ? " " + node.params : ""),
          ],
          ancestors,
        );
    }
  };
  const sheet = async (url, wrappers = [], existing, ancestors = []) => {
    if (ancestors.includes(url)) {
      warnings.add("A recursive stylesheet import was skipped");
      return;
    }
    const key = JSON.stringify([url, wrappers]);
    if (existing && !existing.href) {
      if (inlineSheets.has(existing)) return;
      inlineSheets.add(existing);
    } else {
      if (seen.has(key)) return;
      seen.add(key);
    }
    try {
      let text,
        base = url;
      if (existing) {
        try {
          text = [...existing.cssRules].map((rule) => rule.cssText).join("\n");
        } catch {
          /* Fetch a configured opaque sheet as CSS data. */
        }
      }
      if (text === undefined) {
        const response = await read(new URL(url));
        text = await response.text();
        base = response.url;
      }
      await collect(parse(text).nodes, base, wrappers, [
        ...ancestors,
        url,
        base,
      ]);
    } catch (error) {
      if (signal?.aborted) throw error;
      warnings.add(error.message);
    }
  };
  // Accessible imported sheets are still resolved against their own URLs.
  // CSS parsing treats providers' text as data and retains media/support/layer conditions.
  for (const source of document.styleSheets)
    await sheet(
      source.href || source.ownerNode?.baseURI || document.baseURI,
      [],
      source,
    );
  const encode = async (value) => {
    const url = new URL(value, document.baseURI);
    if (url.protocol === "data:") return value;
    if (!fontCache.has(url.href))
      fontCache.set(
        url.href,
        (async () => {
          const response = await read(url);
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
        })(),
      );
    return fontCache.get(url.href);
  };
  const styles = await Promise.all(
    records.map(async ({ css, base, wrappers }) => {
      const embedded = await rewriteCSSURLs(css, async (value) => {
        try {
          return await encode(new URL(value, base).href);
        } catch (error) {
          if (signal?.aborted) throw error;
          warnings.add(error.message);
          return null;
        }
      });
      return wrappers
        .toReversed()
        .reduce((text, prefix) => prefix + "{" + text + "}", embedded);
    }),
  );
  if (signal?.aborted) throw signal.reason;
  const host = root.querySelector("foreignObject > div");
  const style = document.createElement("style");
  style.dataset.codexMotionFonts = "";
  style.textContent = styles.join("\n");
  if (styles.length) host.prepend(style);
  void host.offsetWidth;
  await document.fonts.ready;
  if (signal?.aborted) {
    style.remove();
    throw signal.reason;
  }
  if (warnings.size) root.dataset.codexFontWarning = [...warnings].join("; ");
  else delete root.dataset.codexFontWarning;
  root.dataset.codexFontsInlined = "true";
  return () => {
    style.remove();
    delete root.dataset.codexFontsInlined;
    delete root.dataset.codexFontWarning;
  };
}
