/* Copy document-*.js companions beside this loader, or bundle it locally. */
window.CodexDocumentReady = import("./document-runtime.js").then(async () => {
  await Promise.all(
    [...document.querySelectorAll("doc-page")].map((page) => page.ready),
  );
});
