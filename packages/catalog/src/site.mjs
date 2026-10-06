import path from "node:path";
import { catalogList } from "./index.mjs";
import { html, write } from "../../core/src/lib/files.mjs";

export async function buildCatalogSite(directory) {
  const items = await catalogList();
  const targets = [...new Set(items.flatMap((item) => item.targets))].sort();
  const cards = items
    .map(
      (item) =>
        `<article data-targets="${html(item.targets.join(" "))}" data-kind="${html(item.kind)}"><div class="kind">${html(item.kind)}</div><h2>${html(item.id)}</h2><p>${html(item.description)}</p><div class="tags">${item.targets.map((target) => `<span>${html(target)}</span>`).join("")}</div><details><summary>Use this item</summary><pre>forma catalog show ${html(item.id)}\nforma catalog add ${html(item.id)} ./my-project</pre><p>Requirements: ${html(item.requirements.join(", "))}</p></details>${item.preview ? `<a href="${html(item.preview)}" target="_blank" rel="noopener">Open example ↗</a>` : ""}</article>`,
    )
    .join("\n");
  const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forma Catalog</title><style>
:root{font-family:system-ui,sans-serif;color:#202925;background:#f5f5ef}*{box-sizing:border-box}body{margin:0}main{max-width:1180px;margin:auto;padding:48px 24px}header{max-width:760px;margin-bottom:32px}h1{font-size:clamp(36px,6vw,64px);letter-spacing:-.05em;margin:12px 0}header p{font-size:20px;line-height:1.5;color:#59645e}nav{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:28px}label{display:grid;gap:6px;font-size:14px}input,select{padding:10px 12px;border:1px solid #bdc7bd;border-radius:6px;background:white;font:inherit}input{min-width:260px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:16px}article{background:white;border:1px solid #d6dfd4;border-radius:10px;padding:24px;display:flex;flex-direction:column;gap:16px}article[hidden]{display:none}h2{font-size:21px;margin:0;overflow-wrap:anywhere}article p{line-height:1.55;color:#59645e;margin:0}.kind{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#41654c}.tags{display:flex;flex-wrap:wrap;gap:6px}.tags span{font-size:12px;background:#edf2e9;border-radius:4px;padding:5px 8px}summary,a{color:#285937;cursor:pointer}pre{font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}details p{font-size:13px}a{margin-top:auto}:focus-visible{outline:3px solid #558468;outline-offset:4px}footer{margin-top:36px;color:#59645e;font-size:14px}
</style></head><body><main><header><a href="https://github.com/j0nl1/forma">Forma</a><h1>Turn ideas into media.</h1><p>Reusable modules and creative presets. Find a starting point for your next creation.</p></header><nav aria-label="Catalog filters"><label>Search<input id="search" type="search" placeholder="Search resources"></label><label>Medium<select id="target"><option value="">All media</option>${targets.map((target) => `<option>${html(target)}</option>`).join("")}</select></label><label>Kind<select id="kind"><option value="">All kinds</option><option>component</option><option>preset</option><option>template</option></select></label></nav><p id="count" aria-live="polite"></p><section class="grid" aria-label="Catalog items">${cards}</section><footer>Generated from the same local catalog used by the CLI. Voice and image generation use your chosen tools. Example links require network access; browsing and filtering this page do not.</footer></main><script>
const cards=[...document.querySelectorAll('article')];
const controls=['search','target','kind'].map(id=>document.getElementById(id));
function filter(){const [query,target,kind]=controls.map(control=>control.value.toLowerCase());let count=0;for(const card of cards){card.hidden=!(card.textContent.toLowerCase().includes(query)&&(!target||card.dataset.targets.split(' ').includes(target))&&(!kind||card.dataset.kind===kind));if(!card.hidden)count++;}document.getElementById('count').textContent=count+(count===1?' resource':' resources');}
controls.forEach(control=>control.addEventListener('input',filter));filter();
</script></body></html>`;
  const output = path.join(path.resolve(directory), "index.html");
  await write(output, document);
  return { output, items: items.length };
}
