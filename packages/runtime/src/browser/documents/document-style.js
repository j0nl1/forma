export const documentStyle = `
:host{position:relative;display:block;box-sizing:border-box;min-width:max-content;min-height:100vh;padding:48px 24px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}
.sheet{box-sizing:border-box;width:var(--doc-page-w);margin:0 auto;padding:var(--doc-page-margin);background:#fff;border-radius:7px;box-shadow:0 2px 10px #1414131f}
.preview.scaled{position:relative;margin:0 auto;overflow:clip;overflow-clip-margin:12px}
.preview.scaled>.sheet{margin:0;transform-origin:top left}
@media screen{.sheet.preview-fixed{min-height:var(--doc-page-h)}}
.frame{width:100%;border-collapse:collapse}.frame td,.frame th{padding:0;text-align:left;font-weight:inherit}
.hdr-space{height:var(--doc-hdr-h)}.ftr-space{height:var(--doc-ftr-h)}
::slotted([slot=header]),::slotted([slot=footer]){display:block;box-sizing:border-box}
.sheet.paginated{padding:0;background:transparent;border-radius:0;box-shadow:none}
.paginated ::slotted(.page){position:relative;display:block;box-sizing:border-box;width:100%;aspect-ratio:var(--doc-page-ar);container-type:size;overflow:hidden;background:#fff;border-radius:7px;box-shadow:0 2px 10px #0004;break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.paginated ::slotted(.page:not(:first-child)){margin-top:1rem}
.fit-mode .fit-box{width:calc(var(--doc-fit-w) * var(--doc-fit-scale));height:calc(var(--doc-fit-h) * var(--doc-fit-scale));margin:0 auto;break-inside:avoid}
.fit-mode ::slotted(*){contain:layout}
.fit-mode .fit{width:var(--doc-fit-w);height:var(--doc-fit-h);transform:scale(var(--doc-fit-scale));transform-origin:top left}
@media print{
:host{padding:0;background:none;min-width:0;min-height:0}
.preview.scaled{width:auto;height:auto;overflow:visible}.preview.scaled>.sheet{transform:none;margin:0}
.sheet{width:auto;margin:0;padding:0 var(--doc-page-margin);border-radius:0;box-shadow:none}
.hdr-space{height:max(var(--doc-page-margin),calc(var(--doc-hdr-h) + var(--doc-hdr-pad)))}
.ftr-space{height:max(var(--doc-page-margin),calc(var(--doc-ftr-h) + var(--doc-ftr-pad)))}
.sheet.wk-print:not(.paginated) .hdr-space{height:max(0px,calc(max(var(--doc-page-margin),calc(var(--doc-hdr-h) + var(--doc-hdr-pad))) - var(--doc-page-margin)))}
.sheet.wk-print:not(.paginated) .ftr-space{height:max(0px,calc(max(var(--doc-page-margin),calc(var(--doc-ftr-h) + var(--doc-ftr-pad))) - var(--doc-page-margin)))}
::slotted([slot=header]){position:fixed;top:0;left:0;right:0;margin:0;padding:calc(var(--doc-page-margin) * .45) var(--doc-page-margin) 0}
::slotted([slot=footer]){position:fixed;bottom:0;left:0;right:0;margin:0;padding:0 var(--doc-page-margin) calc(var(--doc-page-margin) * .45)}
.sheet.paginated{padding:0}.sheet.paginated .hdr-space,.sheet.paginated .ftr-space{height:0}
.paginated ::slotted(.page){margin:0!important;border-radius:0!important;box-shadow:none!important;width:var(--doc-page-w)!important;height:var(--doc-page-h)!important;aspect-ratio:auto!important;overflow:hidden!important}
.paginated ::slotted(.page:not(:first-child)){break-before:page!important;margin-top:0!important}
.fit-mode .fit-box{overflow:hidden}
}
`;
export const printHygiene = `
@media print{
html,body{margin:0!important;padding:0!important;background:none!important;height:auto!important;overflow:visible!important}
h1,h2,h3,h4,h5,h6{break-after:avoid}figure,pre,blockquote,img,svg,tr{break-inside:avoid}p,li{orphans:3;widows:3}
*{print-color-adjust:exact;-webkit-print-color-adjust:exact;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
*,*::before,*::after{animation-delay:-99s!important;animation-duration:.001s!important;animation-iteration-count:1!important;animation-fill-mode:both!important;animation-play-state:running!important;transition-duration:0s!important}
[data-doc-controls],design-controls{display:none!important}
}
`;
