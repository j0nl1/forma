#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { args, main, exists, write, readJson } from "./lib/files.mjs";
import { inlineHtml } from "./lib/inline.mjs";
import { withPage } from "./lib/browser.mjs";
import { videoOptions, renderVideo } from "./lib/video.mjs";
import { renderPdf } from "./lib/pdf.mjs";
import { pptxOptions, renderPptx } from "./lib/pptx.mjs";

export async function exportArtifact(mode, input, output, options = {}) {
  output = path.resolve(output);
  if (await exists(output)) throw new Error(`Refusing to overwrite: ${output}`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  if (mode === "html") {
    await write(output, await inlineHtml(path.resolve(input)));
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
    const result = await withPage(
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
          await renderPdf(page, temporary, options);
          return {};
        }
        if (mode === "pptx") return renderPptx(page, temporary, options);
        if (mode === "png") {
          await page.screenshot({
            path: temporary,
            type: "png",
            fullPage: true,
          });
          return {};
        }
        return renderVideo(page, errors, output, temporary, config);
      },
      {
        deviceScaleFactor: config.deviceScaleFactor ?? 1,
        fontOrigins: options.fontOrigins ?? [],
      },
    );
    await fs.rename(temporary, output);
    return { output, ...result };
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional, flags } = args(process.argv.slice(2), {
      "--fps": "value",
      "--config": "value",
      "--crf": "value",
      "--start-ms": "value",
      "--end-ms": "value",
      "--scale": "value",
      "--bridge": "value",
      "--audio": "value",
      "--paper": "value",
      "--orientation": "value",
      "--pptx-mode": "value",
      "--pptx-animations": "value",
    });
    if (positional.length !== 3)
      throw new Error(
        "Usage: node export.mjs html|pdf|png|video|pptx <input-path-or-loopback-url> <output> [--config export.json] [--fps 30] [--crf 18] [--start-ms 0] [--end-ms 2000] [--scale 2] [--bridge codexTimeline] [--audio auto|none] [--paper letter|a4|legal] [--orientation portrait|landscape] [--pptx-mode editable|screenshots] [--pptx-animations native|static]",
      );
    const config = flags.config
      ? await readJson(path.resolve(flags.config))
      : {};
    for (const [flag, key] of Object.entries({
      fps: "fps",
      crf: "crf",
      "start-ms": "startMs",
      "end-ms": "endMs",
      scale: "deviceScaleFactor",
      bridge: "bridgeGlobal",
      audio: "audio",
      paper: "paper",
      orientation: "orientation",
      "pptx-mode": "pptxMode",
      "pptx-animations": "pptxAnimations",
    }))
      if (flags[flag] !== undefined) config[key] = flags[flag];
    console.log(JSON.stringify(await exportArtifact(...positional, config)));
  });
