import {
  printOptions,
  papers,
  pixels,
} from "../../../runtime/src/browser/document-model.js";
export async function renderPdf(page, output, options = {}) {
  const settings = printOptions(options),
    landscape = settings.orientation === "landscape";
  const dimensions = [...papers[settings.paper || "letter"]];
  if (landscape) dimensions.reverse();
  const size = settings.paper ? dimensions.join(" ") : settings.orientation;
  await page.evaluate(
    async ({ settings, size }) => {
      if (window.CodexDocument && document.querySelector("doc-page"))
        await window.CodexDocument.preparePrint(settings);
      else if (!(await window.CodexFixedSheet?.preparePrint()) && size) {
        const rule = document.createElement("style");
        rule.id = "codex-pdf-paper-choice";
        rule.dataset.codexInjected = "";
        rule.textContent = `@page{size:${size}}`;
        document.head.append(rule);
      }
    },
    { settings, size },
  );
  try {
    await page.emulateMedia({ media: "print" });
    // Commit media-dependent layout and finish the shortened entrance animations.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.pdf({
      path: output,
      printBackground: true,
      preferCSSPageSize: true,
      width: `${pixels(dimensions[0])}px`,
      height: `${pixels(dimensions[1])}px`,
    });
  } finally {
    await page.evaluate(() => {
      window.CodexDocument?.restorePrint();
      window.CodexFixedSheet?.restorePrint();
      document.getElementById("codex-pdf-paper-choice")?.remove();
    });
  }
}
