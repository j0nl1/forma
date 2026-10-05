export const editorStyle = `
:host{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:block;font:13px/1.4 system-ui;color:#263b34}
:host([hidden]){display:none!important}
.panel{width:340px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow:auto;padding:12px;border:1px solid #aebcaf;border-radius:10px;background:#fffdf5;box-shadow:0 5px 24px #172d2526}
.toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.toolbar button{flex:1;white-space:nowrap}
button{border:1px solid #aebcaf;border-radius:5px;background:#fff;color:inherit;padding:7px 9px;font:inherit;cursor:pointer}button:disabled{opacity:.45;cursor:default}
button[aria-pressed=true]{background:#dce8d7}button:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid #315f52;outline-offset:2px}
p{margin:8px 0 0;font-size:12px}.field{margin-top:10px}.field label{display:block;margin-bottom:4px;font-weight:600}
textarea,select{box-sizing:border-box;width:100%;border:1px solid #aebcaf;border-radius:5px;padding:8px;font:13px/1.5 system-ui;background:#fff;color:inherit}textarea{min-height:80px;resize:vertical}.retained textarea{min-height:120px}
.actions{display:flex;gap:6px;margin-top:8px}[hidden]{display:none!important}
.outline{position:fixed;pointer-events:none;box-sizing:border-box;border:2px solid #315f52;border-radius:3px;box-shadow:0 0 0 3px #e4ecd980}
.status[data-error=true]{color:#942e2e}
@media print{:host{display:none!important}}
`;
