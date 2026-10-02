export const overlayStyle = `
:host{display:block}
:host([controls=on]:not([data-passthrough])){padding:18px 20px;font-family:var(--font-ui,system-ui,sans-serif);color:var(--text-primary,currentColor)}
*{box-sizing:border-box}
.dv-sent{display:none;font:420 19px/1.55 var(--font-display,Georgia,serif);margin:0 0 14px;color:var(--text-secondary,currentColor)}
:host([controls=on]) .dv-sent{display:block}
.dv-tok{display:inline-block;position:relative;cursor:pointer;color:var(--text-primary,currentColor);border-bottom:1.5px dotted var(--border-strong,#bcb7ad);padding:0 2px 1px;font:inherit;background:none;border-top:0;border-left:0;border-right:0}
.dv-tok:focus-visible{outline:2px solid var(--accent-primary,#D97757);outline-offset:2px}
.dv-tcar{font-size:10px;margin-left:3px}
.dv-menu{position:fixed;min-width:232px;max-width:calc(100vw - 16px);background:var(--bg-surface,#fdfbf6);color:var(--text-primary,#28251f);border:1px solid #d6d1c7;border-radius:12px;padding:6px;z-index:130;box-shadow:0 12px 36px #14120d29;font:420 16.5px/1.45 var(--font-display,Georgia,serif);overflow:auto}
.dv-mi{display:block;border:0;text-align:left;width:100%;padding:7px 12px;border-radius:8px;background:none;color:inherit;font:inherit;cursor:pointer}
.dv-mi:hover,.dv-mi:focus{background:#d9775717;outline:none}.dv-cur{font-weight:600}
.dv-mdiv{border-top:1px solid #ddd7cc;margin:6px 10px}
.dv-min{position:relative;padding:4px 6px 3px}.dv-minp{width:100%;border:1px solid #ddd7cc;border-radius:8px;background:#14120d08;color:inherit;padding:6px 10px;font:inherit;font-size:15.5px;outline:none}
.dv-minp:focus{border-color:var(--accent-primary,#D97757)}.dv-minp[aria-invalid]{border-color:#b3261e}.dv-minp::placeholder{color:#777168;opacity:1;transition:opacity .35s}.dv-phfade::placeholder{opacity:0}
.dv-mgo{position:absolute;right:12px;top:50%;transform:translateY(-50%);border:0;border-radius:6px;background:var(--accent-primary,#D97757);color:#fff;font:400 11.5px var(--font-ui,system-ui);padding:3px 9px;cursor:pointer}.dv-mgo[hidden]{display:none}.dv-min[data-filled] .dv-minp{padding-right:48px}
.dv-ask{border:0;border-radius:8px;background:var(--accent-primary,#D97757);color:#fff;font:400 12.5px var(--font-ui,system-ui);padding:6px 11px;margin-left:8px;cursor:pointer}.dv-ask[data-busy]{background:#77716824;color:var(--text-secondary,currentColor)}
.dv-meta{display:none;font:400 11.5px/1.4 var(--font-ui,system-ui);color:var(--text-tertiary,currentColor);margin:-8px 0 14px}
:host([controls=on]) .dv-meta:not(:empty){display:block}
.dv-finding{font:420 16.5px/1.5 var(--font-display,Georgia,serif);color:var(--text-primary,currentColor);margin:0;padding:0 2px 12px}.dv-finding:empty{display:none}
.dv-stage{position:relative}
:host([controls=on]) .dv-stage{background:var(--bg-surface,#fff);border:1px solid var(--border-subtle,#ddd7cc);border-radius:14px;box-shadow:var(--shadow-sm,0 1px 3px #14120d0f);overflow:hidden}
.dv-layer{position:absolute;inset:0;pointer-events:none;z-index:100}
@keyframes overlay-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
:host([data-state=loading]) .dv-layer{background:linear-gradient(90deg,#14120d05,#14120d12,#14120d05);background-size:200% 100%;animation:overlay-shimmer 1.4s linear infinite}
:host([data-state=stale]) .dv-layer{opacity:.6;background:repeating-linear-gradient(45deg,#14120d0a 0 6px,transparent 6px 12px)}
.dv-box{position:absolute;border-radius:6px}.dv-wash{position:absolute;inset:-1px;border-radius:inherit;mix-blend-mode:multiply;opacity:.85}.dv-wash.nil{background:repeating-linear-gradient(45deg,#14120d1a 0 4px,transparent 4px 8px);outline:1px dashed #14120d40;mix-blend-mode:normal}
.dv-tag{position:absolute;min-width:28px;padding:2px 5px;border-radius:5px;color:#fff;font:700 9.5px/1 var(--font-ui,system-ui);font-variant-numeric:tabular-nums;text-align:center;box-shadow:0 1px 3px #0003;white-space:nowrap}.dv-d{margin-left:4px;font-weight:600;opacity:.85}
.dv-spot{position:absolute;border:1.5px solid;border-radius:7px}
.dv-co{position:absolute;width:222px;max-width:calc(100% - 16px);padding:9px 11px;background:var(--bg-surface,#fff);border-radius:10px;box-shadow:0 4px 16px #14120d29;z-index:103;pointer-events:auto;overflow-wrap:anywhere}
.dv-coh{display:block;font:550 12px/1.3 var(--font-ui,system-ui);color:var(--text-primary,#28251f);margin-bottom:3px}.dv-cob{display:block;font:400 11px/1.4 var(--font-ui,system-ui);color:var(--text-tertiary,#777168)}
.dv-pin{position:absolute;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#558a42;color:#fff;font:600 10px/18px var(--font-ui,system-ui);text-align:center;box-shadow:0 1px 3px #0003;z-index:110}.dv-pin.inl{position:static;display:inline-block;margin-right:6px;box-shadow:none}
.dv-coleads{position:absolute;inset:0;pointer-events:none;z-index:102;max-width:100%}.dv-colead{stroke:#14120d73;stroke-width:1;opacity:.6}
.dv-co,.dv-colead{transition:opacity .12s}.dv-layer[data-iso] .dv-co:not([data-hot]),.dv-layer[data-iso] .dv-colead:not([data-hot]){opacity:0}
.dv-legend{display:flex;align-items:center;flex-wrap:wrap;gap:10px 18px;padding:10px 2px 0;font:400 11.5px/1.4 var(--font-ui,system-ui);color:var(--text-secondary,currentColor)}.dv-legend:empty{display:none}.dv-li{display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap}.dv-lsw{width:13px;height:13px;border-radius:3px;display:inline-block}.dv-basis.warn{color:#a26c17}
.dv-empty{position:absolute;inset:0;display:grid;place-items:center;padding:20px;font:500 13px/1.4 var(--font-ui,system-ui);color:var(--text-tertiary,currentColor);text-align:center}
.dv-draft{padding:14px 0;font:400 12px/1.5 var(--font-ui,system-ui)}.dv-draft[hidden]{display:none}.dv-draft textarea{display:block;width:100%;min-height:100px;margin:8px 0;padding:8px;font:inherit;color:inherit;background:var(--bg-surface,#fff);border:1px solid #ccc;border-radius:6px}.dv-draft button{font:inherit;cursor:pointer}.dv-draft p{margin:5px 0}
:host([data-passthrough]) .dv-stage{display:contents}:host([data-passthrough]) .dv-sent,:host([data-passthrough]) .dv-meta,:host([data-passthrough]) .dv-finding,:host([data-passthrough]) .dv-legend,:host([data-passthrough]) .dv-layer,:host([data-passthrough]) .dv-draft{display:none}
@media(prefers-reduced-motion:reduce){:host([data-state=loading]) .dv-layer{animation:none}.dv-co,.dv-colead,.dv-minp::placeholder{transition:none}}
`;
