window.CodexFixedSheetReady = import("./fixed-sheet-runtime.js").then(
  async () => {
    if (document.readyState === "loading")
      await new Promise((resolve) =>
        document.addEventListener("DOMContentLoaded", resolve, { once: true }),
      );
    await document.fonts?.ready;
    window.CodexFixedSheet.refresh();
  },
);
