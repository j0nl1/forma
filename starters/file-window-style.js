import { sketchStyle } from "./file-window-sketch.js";
const common = `
.fw-crop{display:block;position:relative;overflow:hidden;border-radius:6px;background:var(--fw-muted,#f0eee6)}
iframe{display:block;border:0;background:white;transform-origin:top left;pointer-events:none;opacity:0;transition:opacity .25s ease}iframe[data-ready]{opacity:1}
.fw-fence{position:absolute;inset:0}.fw-label{font:550 12.5px/1.3 var(--fw-font,system-ui);color:var(--fw-fg,#0f0c08eb);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
button{font:inherit;border:0;background:transparent;color:var(--fw-fg3,#0f0c087a);cursor:pointer;border-radius:5px;padding:4px;line-height:1;flex:none}button:hover{background:var(--fw-hov,#0f0c080a);color:var(--fw-fg,#0f0c08eb)}button:focus-visible{outline:2px solid var(--fw-sel,#2a78d6);outline-offset:1px}button:disabled{opacity:.4;cursor:default}
[hidden]{display:none!important}.fw-caption{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 3px 0}.fw-skeleton{position:absolute;inset:0;display:flex;flex-direction:column;gap:7px;padding:11px}.fw-skeleton span{background:var(--fw-skel,#0f0c0817);border-radius:3px;animation:fw-pulse 1.6s ease-in-out infinite}
.fw-gone{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:10px;text-align:center;color:var(--fw-fg3,#0f0c087a);font:500 11.5px/1.35 var(--fw-font,system-ui)}
@keyframes fw-pulse{50%{opacity:.45}}
@media(prefers-reduced-motion:reduce){iframe,.fw-skeleton span{animation:none;transition:none}}
${sketchStyle}`;
export const cardStyle = `${common}
:host{display:block;position:relative;background:var(--fw-surf,white);border:1px solid var(--fw-line,#0f0c0824);border-radius:12px;padding:8px;box-shadow:0 1px 2px #0f0c080d;cursor:pointer;transition:box-shadow .12s ease,border-color .12s ease,transform .12s ease}
:host(:hover){border-color:var(--fw-line2,#0f0c0838);box-shadow:0 6px 20px #0f0c081c;transform:translateY(-2px)}:host(:focus-visible){outline:2.5px solid var(--fw-sel,#2a78d6);outline-offset:3px}
:host([data-state=unavailable]){cursor:not-allowed;background:transparent;border-style:dashed;box-shadow:none}:host([data-state=unavailable]:hover){transform:none;box-shadow:none}
:host-context([data-codex-exporting]) iframe{transition:none}
@media(prefers-reduced-motion:reduce){:host{transition:none}:host(:hover){transform:none}}
`;
export const modalStyle = `
.codex-file-modal{position:fixed;inset:0;margin:auto;max-width:calc(100vw - 64px);max-height:calc(100vh - 64px);padding:9px;border:1px solid var(--fw-line2,#0f0c0838);border-radius:14px;background:var(--fw-surf,white);box-shadow:0 24px 60px #0f0c0847;overflow:visible;color:var(--fw-fg,#0f0c08eb);font:14px var(--fw-font,system-ui)}
.codex-file-modal::backdrop{background:#0f0c086b;backdrop-filter:blur(3px)}.codex-file-modal[data-theme=dark]::backdrop{background:#0009}
.codex-file-modal .fw-caption{padding:2px 4px 9px}.codex-file-modal .fw-actions{display:flex;align-items:center;gap:7px}.codex-file-modal .fw-action{border:1px solid var(--fw-line2,#0f0c0838);padding:8px 13px;border-radius:9px;font:550 12.5px/1.2 var(--fw-font,system-ui)}
.codex-file-modal .fw-crop{overflow:auto;overscroll-behavior:contain;outline-offset:-2px}.codex-file-modal .fw-crop:focus-visible{outline:2.5px solid var(--fw-sel,#2a78d6)}
.codex-file-modal .fw-page{display:block;position:relative;overflow:clip}.codex-file-modal .fw-view{position:sticky;top:0;display:block;overflow:hidden}
.codex-file-modal .fw-crop::-webkit-scrollbar{width:8px;height:8px}.codex-file-modal .fw-crop::-webkit-scrollbar-thumb{background:var(--fw-scroll,#0f0c0847);border:2px solid transparent;border-radius:4px;background-clip:content-box}.codex-file-modal .fw-crop::-webkit-scrollbar-corner{background:transparent}
`;
export const modalContentsStyle = common;
