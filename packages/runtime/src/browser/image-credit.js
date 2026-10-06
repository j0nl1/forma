export function unsplash(url, base) {
  try {
    return /(^|\.)unsplash\.com$/.test(
      new URL(url, base).hostname.replace(/\.$/, ""),
    );
  } catch {
    return false;
  }
}
export function creditUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (unsplash(url.href, base)) {
      if (!url.searchParams.has("utm_source"))
        url.searchParams.set("utm_source", "studio_design");
      if (!url.searchParams.has("utm_medium"))
        url.searchParams.set("utm_medium", "referral");
    }
    return url.href;
  } catch {
    return "";
  }
}
export function renderCredit(element, text, href) {
  element.replaceChildren();
  const link = (label, url) => {
    const node = document.createElement("a");
    node.textContent = label;
    node.href = url;
    node.target = "_blank";
    node.rel = "noopener noreferrer";
    return node;
  };
  const url = href ? creditUrl(href, document.baseURI) : "",
    parts = /^Photo by (.+) on Unsplash$/.exec(text);
  if (parts)
    element.append(
      "Photo by ",
      url ? link(parts[1], url) : parts[1],
      " on ",
      link("Unsplash", creditUrl("https://unsplash.com/", document.baseURI)),
    );
  else element.append(url ? link(text, url) : text);
}
