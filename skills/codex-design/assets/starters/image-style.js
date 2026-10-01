export const imageStyle = `
:host{display:block;position:relative;width:100%;height:100%;aspect-ratio:3/2;color:inherit;font:13px/1.4 system-ui}
.frame{position:absolute;inset:0;overflow:hidden;background:#7f7f7f14}
.photo{position:absolute;max-width:none;transform:translate(-50%,-50%);user-select:none;-webkit-user-drag:none;touch-action:none}
.empty,.attribution{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:6px;padding:14px;text-align:center;box-sizing:border-box;color:inherit}
.empty{cursor:pointer}.empty .symbol{font-size:24px;opacity:.5}.empty .caption,.empty .browse{opacity:.75}.browse{font-size:11px;text-decoration:underline;text-underline-offset:2px}
.attribution{background:#f2f1ef;color:#6e6c66}.ring{position:absolute;inset:0;box-sizing:border-box;border:1.5px dashed currentColor;opacity:.35;pointer-events:none}
:host([data-filled]) .ring{display:none}:host([data-over]) .frame{outline:2px solid #315f52;outline-offset:-2px}:host([data-over]) .ring{opacity:1}
.loading{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}.loading::after{content:"";width:22px;height:22px;border:2px solid #7f7f7f40;border-top-color:currentColor;border-radius:50%;animation:codex-image-spin .7s linear infinite}
@keyframes codex-image-spin{to{transform:rotate(360deg)}}:host([data-swapping]) .photo{visibility:hidden}
.toolbar{position:absolute;inset:auto;top:8px;right:8px;margin:0;padding:0;border:0;background:transparent;display:flex;gap:6px;opacity:0;pointer-events:none;z-index:2;overflow:visible}
:host([data-editable]:hover) .toolbar,:host([data-editable]:focus-within) .toolbar,:host([data-reframe]) .toolbar{opacity:1;pointer-events:auto}
.toolbar:popover-open{position:fixed;inset:auto;transform:translateX(-100%)}
button{font:11px/1.2 system-ui;border:0;border-radius:6px;padding:6px 10px;color:white;background:#162d25dd;cursor:pointer;white-space:nowrap}
button:disabled{opacity:.4;cursor:default}button:focus-visible,.empty:focus-visible,input:focus-visible{outline:2px solid #315f52;outline-offset:2px}
.credit{position:absolute;left:6px;bottom:6px;max-width:calc(100% - 12px);font:10px/1.3 system-ui;padding:3px 7px;border-radius:5px;background:#0009;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:1}
.credit a{color:inherit;text-decoration:none}.credit a:hover,.credit a:focus-visible{text-decoration:underline}
.status{position:absolute;left:8px;top:44px;right:8px;padding:5px 7px;margin:0;border-radius:5px;background:#fffef2ed;color:#263b34;font-size:11px;z-index:3}.status[data-error=true]{color:#942e2e}.status:empty{display:none}.status .download{margin-left:6px}
.spill{position:fixed;inset:auto;margin:0;padding:0;border:0;background:transparent;transform:translate(-50%,-50%);overflow:visible;cursor:grab;touch-action:none;z-index:2147482000}
.ghost{position:absolute;inset:0;width:100%;height:100%;opacity:.35;pointer-events:none;box-shadow:0 0 0 1px #0004,0 12px 32px #0003}
.handle{position:absolute;width:12px;height:12px;background:white;border-radius:50%;box-shadow:0 0 0 1.5px #315f52;transform:translate(-50%,-50%);touch-action:none}
.handle[data-c=nw]{left:0;top:0;cursor:nwse-resize}.handle[data-c=ne]{left:100%;top:0;cursor:nesw-resize}.handle[data-c=sw]{left:0;top:100%;cursor:nesw-resize}.handle[data-c=se]{left:100%;top:100%;cursor:nwse-resize}
:host([data-reframe]) .frame{box-shadow:0 0 0 2px #315f52}.legacy{display:grid;gap:8px;padding:12px;background:white;color:#263b34}.legacy label{display:flex;align-items:center;gap:8px}.legacy input{min-width:0;max-width:100%}
:host([storage-key]){height:auto;aspect-ratio:auto}:host([storage-key]) .frame{position:relative;aspect-ratio:16/9}:host([storage-key]) .status{position:static}:host([storage-key]) .toolbar{position:relative;top:auto;right:auto;opacity:1;pointer-events:auto;padding:8px}
[hidden]{display:none!important}
:host-context([data-codex-exporting]) .toolbar,:host-context([data-codex-exporting]) .credit,:host-context([data-codex-exporting]) .status,:host-context([data-codex-exporting]) .legacy,:host-context([data-codex-exporting]) .spill,:host-context([data-codex-exporting]) .loading{display:none!important}
@media print{.toolbar,.credit,.status,.legacy,.spill,.loading{display:none!important}:host([data-swapping]) .photo{visibility:visible}}
@media(prefers-reduced-motion:reduce){.loading::after{animation:none}}
`;
