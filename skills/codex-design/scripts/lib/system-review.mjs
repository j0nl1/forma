import { html } from "./files.mjs";

export function systemReview(m) {
  const components = m.components ?? [];
  const json = JSON.stringify(components).replace(/</g, "\\u003c");
  const tokens = Object.entries(m.tokens ?? {})
    .map(
      ([name, value]) =>
        `<tr><th>${html(name)}</th><td>${html(value)}</td><td><span style="display:inline-block;width:3rem;height:1rem;background:var(${html(name)})"></span></td></tr>`,
    )
    .join("");
  const examples = (m.examples ?? [])
    .map(
      (example) =>
        `<article><h2>${html(example.name)}</h2>${example.html ?? ""}</article>`,
    )
    .join("");
  const properties = components
    .map(
      (component) =>
        `<article id="component-${html(component.name)}"><h3>${html(component.name)}</h3><div data-component="${html(component.name)}"></div>${component.contract ? `<details><summary>Properties · ${component.contract.props.length}</summary><div class="table-scroll"><table><thead><tr><th>Property</th><th>Type / variants</th><th>Default / notes</th></tr></thead><tbody>${component.contract.props.map((property) => `<tr><th>${html(property.name)}${property.optional ? "?" : ""}</th><td>${html(property.values ? property.values.map((value) => JSON.stringify(value)).join(" | ") : property.type)}</td><td>${html(Object.hasOwn(property, "default") ? JSON.stringify(property.default) : "")} ${html(property.description)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}</article>`,
    )
    .join("");
  const starts = (m.startingPoints ?? [])
    .map(
      (start) =>
        `<p><a href="${html(start.kind === "component" ? (start.previewPath ?? "#component-" + start.component) : start.path)}">${html(start.name)}</a> <span>${html(start.section ?? "")} · ${html(start.kind ?? "screen")}</span></p>`,
    )
    .join("");
  const cards = (m.cards ?? [])
    .map(
      (card) =>
        `<article><h3><a href="${html(card.path)}">${html(card.name)}</a></h3><p>${html(card.group)} · ${html(card.viewport)}</p><p>${html(card.subtitle)}</p></article>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(m.name)}</title><link rel="stylesheet" href="./_ds_tokens.css"><style>body{margin:0;padding:clamp(20px,4vw,64px);font:16px/1.5 system-ui;color:#18202c;background:#f7f8fa}main{max-width:1100px;margin:auto}article{padding:24px;margin:16px 0;background:white;border:1px solid #d9dfe8;border-radius:12px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}h1{font-size:clamp(32px,5vw,56px)}button:focus-visible,a:focus-visible{outline:3px solid #4169e1}.table-scroll{overflow:auto}summary{cursor:pointer;margin-top:18px}details{min-width:0}td{max-width:35rem}</style><main><h1>${html(m.name)}</h1><p>${html(m.guidance)}</p><h2>Tokens</h2><div class="table-scroll"><table><thead><tr><th>Name</th><th>Value</th><th>Preview</th></tr></thead><tbody>${tokens}</tbody></table></div><h2>Components</h2>${examples}${properties}${cards ? "<h2>Cards</h2>" + cards : ""}<h2>Starting points</h2>${starts}</main>${m.bundle ? `<script src="./_ds_bundle.js"></script><script>const ds=window[${JSON.stringify(m.namespace ?? "CodexDesignSystem")}];for(const c of ${json}){const mount=document.querySelector('[data-component="'+c.name+'"]');const Component=ds.Components[c.export||c.name];if(Component==null)throw new Error('Missing component export: '+c.name);if(c.kind==='constant'){const pre=document.createElement('pre');pre.textContent=JSON.stringify(Component,null,2);mount.append(pre);}else ds.createRoot(mount).render(ds.React.createElement(Component,c.props||{}));}</script>` : ""}</html>`;
}
