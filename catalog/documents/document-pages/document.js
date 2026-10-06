/* Copy the declared catalog dependency closure, or bundle this loader locally. */
window.CodexDocumentReady =
  import("../../../packages/runtime/src/browser/documents/document-runtime.js").then(
    async () => {
      await Promise.all(
        [...document.querySelectorAll("doc-page")].map((page) => page.ready),
      );
    },
  );
