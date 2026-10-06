import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { exists, write, readJson } from "../../core/src/lib/files.mjs";
import { inlineHtml } from "./lib/inline.mjs";
import { withPage } from "../../media/src/lib/browser.mjs";
import { videoOptions, renderVideo } from "../../media/src/lib/video.mjs";
import { renderPdf } from "./lib/pdf.mjs";
import { pptxOptions, renderPptx } from "./lib/pptx.mjs";

export async function exportArtifact(
  mode,
  input,
  output,
  options = {},
  {
    pageSession = withPage,
    video = renderVideo,
    pdf = renderPdf,
    powerpoint = renderPptx,
    inline = inlineHtml,
  } = {},
) {
  options.signal?.throwIfAborted();
  output = path.resolve(output);
  if (await exists(output)) throw new Error(`Refusing to overwrite: ${output}`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  if (mode === "html") {
    await write(output, await inline(path.resolve(input)));
    return { output };
  }
  if (!["pdf", "png", "video", "pptx"].includes(mode))
    throw new Error(`Unknown export mode: ${mode}`);
  if (mode === "pptx" && path.extname(output).toLowerCase() !== ".pptx")
    throw new Error("PowerPoint output must use the .pptx extension.");
  const config =
    mode === "video"
      ? videoOptions(options)
      : mode === "pptx"
        ? pptxOptions(options)
        : {};
  if (mode === "video") {
    const url = new URL(input);
    url.searchParams.set(config.captureParam, "");
    input = url.href;
  }
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    const result = await pageSession(
      input,
      async (page, errors) => {
        await page.evaluate(async () => {
          document.documentElement.setAttribute("data-codex-exporting", "");
          const slots = [];
          const visit = (root) => {
            for (const element of root.querySelectorAll("*")) {
              if (["image-slot", "file-window"].includes(element.localName))
                slots.push(element);
              if (element.shadowRoot) visit(element.shadowRoot);
            }
          };
          visit(document);
          await Promise.all(slots.map((slot) => slot.prepareCapture?.()));
        });
        if (mode === "pdf") {
          await pdf(page, temporary, options);
          return {};
        }
        if (mode === "pptx") return powerpoint(page, temporary, options);
        if (mode === "png") {
          await page.screenshot({
            path: temporary,
            type: "png",
            fullPage: true,
          });
          return {};
        }
        return video(page, errors, output, temporary, config);
      },
      {
        deviceScaleFactor: config.deviceScaleFactor ?? 1,
        fontOrigins: options.fontOrigins ?? [],
        signal: options.signal,
      },
    );
    options.signal?.throwIfAborted();
    await fs.rename(temporary, output);
    return { output, ...result };
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
