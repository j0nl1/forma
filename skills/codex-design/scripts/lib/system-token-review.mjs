import { html } from "./files.mjs";

export function tokenReview(manifest) {
  const entries =
    manifest.tokenDetails ??
    Object.entries(manifest.tokens ?? {}).map(([name, value]) => ({
      name,
      value,
      kind: "other",
      resolvedValue: value,
    }));
  const rows = entries
    .map((token) => {
      const value = token.resolvedValue ?? token.value;
      const sample =
        token.kind === "font"
          ? "Aa Bb 0123"
          : token.kind === "other"
            ? "—"
            : "";
      return `<tr data-token-name="${html(token.name)}" data-token-kind="${html(token.kind)}"><th>${html(token.name)}</th><td>${html(token.value)}${value !== token.value ? `<small>Resolved: ${html(value)}</small>` : ""}</td><td>${html(token.kind)}</td><td><span class="token-preview" data-kind="${html(token.kind)}" aria-label="${html(token.kind)} preview for ${html(token.name)}" style="--review-token:${html(value)}">${sample}</span></td><td>${html(token.definedIn ?? "Not recorded")}${token.line ? `:${token.line}` : ""}${token.selector ? `<small>${html(token.selector)}</small>` : ""}${token.conditions?.length ? `<small>${html(token.conditions.join(" · "))}</small>` : ""}</td></tr>`;
    })
    .join("");
  const fonts = (manifest.fonts ?? [])
    .map(
      (font) =>
        `<tr data-font-family="${html(font.family)}"><th>${html(font.family)}</th><td>${html(font.weight)} · ${html(font.style)}${font.display ? ` · ${html(font.display)}` : ""}</td><td>${html(font.definedIn)}:${font.line}${font.conditions?.length ? `<small>${html(font.conditions.join(" · "))}</small>` : ""}${font.unicodeRange ? `<small>${html(font.unicodeRange)}</small>` : ""}</td></tr>`,
    )
    .join("");
  const missing = (manifest.brandFonts ?? [])
    .map(
      (font) =>
        `<p><strong>${html(font.family)}</strong> — no @font-face; may use an installed font or fallback. <code>${html(font.tokens.join(", "))}</code></p>`,
    )
    .join("");
  const warnings = (manifest.warnings ?? [])
    .map((warning) => `<p>${html(warning)}</p>`)
    .join("");
  return `<section id="tokens"><h2>Tokens</h2><p>${entries.length} declarations · ${Object.entries(
    manifest.tokenKinds ?? {},
  )
    .map(([kind, count]) => `${html(kind)} ${count}`)
    .join(
      " · ",
    )}</p><p class="table-hint">Scroll the table to see previews and sources.</p><div class="table-scroll" role="region" aria-label="Token inventory" tabindex="0"><table class="token-table"><thead><tr><th>Name</th><th>Value</th><th>Kind</th><th>Preview</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></div>${warnings ? `<details><summary>Token and font advisories</summary>${warnings}</details>` : ""}</section><section id="fonts"><h2>Fonts</h2>${fonts ? `<div class="table-scroll" role="region" aria-label="Font inventory" tabindex="0"><table class="font-table"><thead><tr><th>Family</th><th>Face</th><th>Source</th></tr></thead><tbody>${fonts}</tbody></table></div>` : "<p>No @font-face rules were found.</p>"}${missing}</section>`;
}
export const tokenReviewCSS = `.table-hint{display:none}@media(max-width:760px){.table-hint{display:block;font-size:12px;color:#68778c}}.token-table{min-width:720px}.token-table td:nth-child(2){min-width:160px}.token-table td:last-child{min-width:150px}.font-table{min-width:480px}.table-scroll:focus-visible{outline:3px solid #4779dc;outline-offset:3px}td small{display:block;color:#68778c;margin-top:4px}.token-preview{display:inline-block;vertical-align:middle}.token-preview[data-kind=color]{width:36px;height:20px;background:var(--review-token);border:1px solid #ddd}.token-preview[data-kind=font]{font:18px var(--review-token);white-space:nowrap}.token-preview[data-kind=shadow]{width:32px;height:24px;background:white;box-shadow:var(--review-token);margin:8px}.token-preview[data-kind=spacing]{display:block;width:clamp(0px,var(--review-token),160px);height:8px;background:#305f9d;min-width:1px}.token-preview[data-kind=radius]{width:36px;height:28px;background:#305f9d;border-radius:var(--review-token)}`;
