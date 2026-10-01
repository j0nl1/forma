export const stageStyle = `
:host{position:relative;display:block;width:100%;height:100vh;overflow:hidden;background:var(--stage-bg,#f0eee6);color:#252824}
:host(three-stage){height:500px;min-height:250px;border-radius:12px}
.viewport{position:absolute;inset:0}canvas{display:block;width:100%;height:100%}
.tools{position:absolute;right:16px;bottom:16px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
button{font:13px system-ui;border:1px solid #b9b8af;border-radius:6px;padding:8px 12px;background:#fffdf5;cursor:pointer;color:inherit}
button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:2px solid #275dad;outline-offset:3px}
.note{position:absolute;left:16px;bottom:16px;max-width:60%;margin:0;font:12px/1.5 system-ui;pointer-events:none}
.error{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center;font:16px/1.5 system-ui}
.status{position:absolute;top:16px;left:16px;right:16px;margin:0;padding:12px;background:#fffdf5;border:1px solid #b9b8af;font:14px system-ui}
.status[hidden]{display:none}
@media(max-width:600px){.note{bottom:72px;max-width:calc(100% - 32px)}.tools{left:16px;right:16px}button{flex:1;padding:8px}}
`;
