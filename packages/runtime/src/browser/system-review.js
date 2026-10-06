import { cardEnvironment } from "./system-review-scope.js";
import { fitCard } from "./system-review-fit.js";

const payload = JSON.parse(
  document.getElementById("system-review-data").textContent,
);
const sheets = payload.styles.map((css) => {
  if (!("adoptedStyleSheets" in ShadowRoot.prototype)) return null;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return sheet;
});
const baseline =
  ":host{all:initial;display:block;color-scheme:light;font:16px 'Times New Roman';color:black;background:transparent}head{display:none}body{display:flow-root;margin:8px}body>pre{white-space:pre-wrap} [data-review-document]{min-height:inherit}";
for (const font of payload.fonts) {
  const style = document.createElement("style");
  style.textContent = font;
  document.head.append(style);
}
async function mount(card) {
  const section = document.getElementById(card.id),
    viewport = section.querySelector(".review-viewport"),
    host = document.createElement("div");
  host.dataset.reviewHost = "";
  host.style.width = card.width + "px";
  const shadow = host.attachShadow({ mode: "open" }),
    defaults = document.createElement("style");
  defaults.textContent = baseline;
  shadow.append(defaults);
  if (sheets.every(Boolean))
    shadow.adoptedStyleSheets = card.sheetIds.map((index) => sheets[index]);
  else
    for (const index of card.sheetIds) {
      const style = document.createElement("style");
      style.textContent = payload.styles[index];
      shadow.append(style);
    }
  const root = document.createElement("div"),
    head = document.createElement("head"),
    body = document.createElement("body");
  root.dataset.reviewDocument = "";
  for (const [name, value] of Object.entries(card.htmlAttributes)) {
    if (!name.startsWith("on")) {
      root.setAttribute(name, value);
      host.setAttribute(name, value);
    }
  }
  for (const [name, value] of Object.entries(card.bodyAttributes))
    if (!name.startsWith("on")) body.setAttribute(name, value);
  head.innerHTML = card.head;
  body.innerHTML = card.body;
  root.append(head, body);
  shadow.append(root);
  viewport.append(host);
  const schedule = fitCard(
    section.querySelector(".review-frame"),
    viewport,
    host,
    body,
    card,
  );
  const report = (error) => {
    const message = document.createElement("p");
    message.className = "review-error";
    message.textContent = `Card error: ${error.message}`;
    section.append(message);
    console.error(card.name + ": " + (error.stack ?? error.message));
  };
  const environment = cardEnvironment({
    shadow,
    body,
    head,
    root,
    card,
    assets: payload.assets,
    schedule,
    report,
  });
  environment.handlers();
  for (const script of card.scripts)
    try {
      environment.run(script);
    } catch (error) {
      report(error);
    }
  await environment.ready();
  await document.fonts.ready;
  await Promise.all(
    [...shadow.querySelectorAll("img[src]")].map((image) =>
      image.decode().catch(report),
    ),
  );
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  schedule();
}
window.CodexSystemReviewReady = Promise.all(payload.cards.map(mount));
for (const toggle of document.querySelectorAll("[data-review-group]"))
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    document.getElementById(toggle.dataset.reviewGroup).hidden = expanded;
  });
const readmeToggle = document.querySelector("[data-readme-toggle]");
readmeToggle?.addEventListener("click", () => {
  const expanded = readmeToggle.getAttribute("aria-expanded") === "true";
  readmeToggle.setAttribute("aria-expanded", String(!expanded));
  document
    .querySelector(".review-readme")
    .classList.toggle("expanded", !expanded);
  readmeToggle.textContent = expanded ? "Show more" : "Show less";
});
const navigation = [...document.querySelectorAll("nav a[href^='#']")];
function scrollspy() {
  let active = navigation[0];
  for (const link of navigation) {
    const target = document.getElementById(link.hash.slice(1));
    if (target?.getBoundingClientRect().top <= 140) active = link;
  }
  for (const link of navigation) {
    if (link === active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
}
window.addEventListener("scroll", scrollspy, { passive: true });
scrollspy();
