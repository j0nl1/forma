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

export async function exportArtifact(mode, input, output, options = {}) {
  output = path.resolve(output);
  if (await exists(output)) throw new Error(`Refusing to overwrite: ${output}`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  if (mode === "html") {
    await write(output, await inlineHtml(path.resolve(input)));
    return { output };
  }
  if (!["pdf", "png", "video"].includes(mode))
    throw new Error(`Unknown export mode: ${mode}`);
  const config = mode === "video" ? videoOptions(options) : {};
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
        if (mode === "pdf") {
          await renderPdf(page, temporary, options);
          return {};
        }
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
      { deviceScaleFactor: config.deviceScaleFactor ?? 1 },
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
    });
    if (positional.length !== 3)
      throw new Error(
        "Usage: node export.mjs html|pdf|png|video <input-path-or-loopback-url> <output> [--config video.json] [--fps 30] [--crf 18] [--start-ms 0] [--end-ms 2000] [--scale 2] [--bridge codexTimeline] [--audio auto|none] [--paper letter|a4|legal] [--orientation portrait|landscape]",
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
    }))
      if (flags[flag] !== undefined) config[key] = flags[flag];
    console.log(JSON.stringify(await exportArtifact(...positional, config)));
  });
