import { tokenReview, tokenReviewCSS } from "./system-token-review.mjs";
import { html } from "./files.mjs";
import { build } from "esbuild";

const scriptText = (value) => value.replace(/<\/script/gi, "<\\/script");
const jsonText = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
function properties(component) {
  if (!component?.contract) return "";
  return `<details><summary>Properties · ${component.contract.props.length}</summary><div class="table-scroll"><table><thead><tr><th>Property</th><th>Type / variants</th><th>Default / notes</th></tr></thead><tbody>${component.contract.props.map((property) => `<tr><th>${html(property.name)}${property.optional ? "?" : ""}</th><td>${html(property.values ? property.values.map((value) => JSON.stringify(value)).join(" | ") : property.type)}</td><td>${html(Object.hasOwn(property, "default") ? JSON.stringify(property.default) : "")} ${html(property.description)}</td></tr>`).join("")}</tbody></table></div></details>`;
}
export async function systemReview(manifest, { files, data }) {
  const runtime = await build({
    entryPoints: [
      new URL("../../assets/starters/system-review.js", import.meta.url)
        .pathname,
    ],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    logLevel: "silent",
  });
  const groups = new Map();
  for (const card of data.cards) {
    if (!groups.has(card.group)) groups.set(card.group, []);
    groups.get(card.group).push(card);
  }
  const nav = [...groups]
    .map(
      ([name, cards], index) =>
        `<button type="button" aria-label="${html(name)}" data-review-group="outline-group-${index}" aria-controls="outline-group-${index}" aria-expanded="true">${html(name)}</button><div id="outline-group-${index}">${cards.map((card) => `<a href="#${card.id}">${html(card.name)}</a>`).join("")}</div>`,
    )
    .join("");
  const sections = [...groups]
    .map(
      ([name, cards]) =>
        `<section class="review-group"><h2>${html(name)}</h2>${cards.map((card) => `<article id="${card.id}" data-card-name="${html(card.name)}"><header><h3>${html(card.name)}</h3><span>${card.width} × ${card.height}</span></header>${card.subtitle ? `<p>${html(card.subtitle)}</p>` : ""}<div class="review-frame"><div class="review-viewport"></div></div>${properties(card.component)}${card.component?.usage ? `<details><summary>Usage</summary><pre>${html(card.component.usage)}</pre></details>` : ""}</article>`).join("")}</section>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(manifest.name)}</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:30px}body{margin:0;font:15px/1.5 system-ui,sans-serif;color:#202938;background:#f6f7f9}aside{position:fixed;inset:0 auto 0 0;width:248px;padding:26px 20px;overflow:auto;border-right:1px solid #dde2e9;background:white}aside strong{display:block;font-size:18px;margin-bottom:22px}nav a{display:block;padding:7px 10px;color:#425169;text-decoration:none;border-radius:6px;font-size:14px}nav a[aria-current]{background:#edf2fc;color:#245bd6}nav button{width:100%;border:0;background:none;text-align:left;padding:18px 10px 5px;font:600 12px system-ui;color:#63738b;cursor:pointer}nav button:after{content:'−';float:right}nav button[aria-expanded=false]:after{content:'+'}main{margin-left:248px;padding:36px clamp(18px,4vw,60px)}.review-content{max-width:760px;margin:auto}h1{font-size:32px;line-height:1.2;margin:0 0 12px}h2{font-size:20px;margin:36px 0 16px}h3{font-size:16px;margin:0}article,.review-readme{background:white;border:1px solid #dce2eb;border-radius:10px;padding:20px;margin:16px 0;scroll-margin-top:28px;min-width:0}article header{display:flex;align-items:center;justify-content:space-between;gap:16px}article header span{font-size:12px;color:#68778c;white-space:nowrap}article>p{font-size:13px;color:#68778c}.review-frame{width:100%;margin-top:18px}.review-viewport{position:relative;overflow:visible}[data-review-host]{transform-origin:top left}.review-readme{position:relative;max-height:240px;overflow:hidden}.review-readme.expanded{max-height:none}.review-readme:not(.expanded):after{content:'';position:absolute;bottom:0;left:0;right:0;height:42px;background:linear-gradient(transparent,white);pointer-events:none}.review-readme img{max-width:100%}.readme-toggle{border:1px solid #dce2eb;padding:8px 14px;border-radius:6px;background:white;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;font-size:13px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e2e6ed;overflow-wrap:anywhere;vertical-align:top}th{font-weight:600}th:first-child{white-space:nowrap}.table-scroll{overflow:auto;max-width:100%}.swatch{display:inline-block;width:36px;height:20px;border:1px solid #ddd}summary{cursor:pointer;margin-top:18px;color:#4b5f7d}.review-error{color:#a52832;background:#fff2f2;padding:10px}a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid #4779dc;outline-offset:3px}@media(max-width:760px){aside{position:relative;width:auto;max-height:220px;border-right:0;border-bottom:1px solid #dde2e9}aside strong{margin-bottom:8px}main{margin-left:0;padding:24px 16px}article{padding:12px}nav{columns:2}nav>div,nav>button{break-inside:avoid}h1{font-size:28px}}
${tokenReviewCSS}</style></head><body><aside><strong>${html(manifest.name)}</strong><nav aria-label="System outline"><a href="#readme">Readme</a><a href="#tokens">Tokens</a><a href="#fonts">Fonts</a>${nav}</nav></aside><main><div class="review-content"><h1>${html(manifest.name)}</h1><p>Design-system review · interactive, isolated cards</p><section id="readme"><h2>Readme</h2><div class="review-readme">${data.readme || "<p>No system notes were provided.</p>"}</div><button class="readme-toggle" data-readme-toggle aria-expanded="false">Show more</button></section>${tokenReview(manifest)}${data.warnings.length ? `<details><summary>Portable asset warnings</summary>${data.warnings.map((warning) => `<p>${html(warning)}</p>`).join("")}</details>` : ""}${sections}</div></main><script id="system-review-data" type="application/json">${jsonText(data)}</script>${manifest.bundle ? `<script>${scriptText(files.get(manifest.bundle).toString())}</script>` : ""}<script>${scriptText(runtime.outputFiles[0].text)}</script></body></html>`;
}
