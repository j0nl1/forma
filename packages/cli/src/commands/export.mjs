#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, main, readJson } from "../../../core/src/lib/files.mjs";
import { exportArtifact } from "../../../exports/src/export.mjs";
export * from "../../../exports/src/export.mjs";
export async function run(argv = process.argv.slice(2)) {
  const { positional, flags } = args(argv, {
    "--fps": "value",
    "--config": "value",
    "--crf": "value",
    "--start-ms": "value",
    "--end-ms": "value",
    "--scale": "value",
    "--bridge": "value",
    "--audio": "value",
    "--capture-method": "value",
    "--paper": "value",
    "--orientation": "value",
    "--pptx-mode": "value",
    "--pptx-animations": "value",
  });
  if (positional.length !== 3)
    throw new Error(
      "Usage: node export.mjs html|pdf|png|video|pptx <input-path-or-loopback-url> <output> [--config export.json] [--fps 30] [--crf 18] [--start-ms 0] [--end-ms 2000] [--scale 2] [--bridge codexTimeline] [--audio auto|none] [--capture-method standard|fast] [--paper letter|a4|legal] [--orientation portrait|landscape] [--pptx-mode editable|screenshots] [--pptx-animations native|static]",
    );
  const config = flags.config ? await readJson(path.resolve(flags.config)) : {};
  for (const [flag, key] of Object.entries({
    fps: "fps",
    crf: "crf",
    "start-ms": "startMs",
    "end-ms": "endMs",
    scale: "deviceScaleFactor",
    bridge: "bridgeGlobal",
    audio: "audio",
    "capture-method": "captureMethod",
    paper: "paper",
    orientation: "orientation",
    "pptx-mode": "pptxMode",
    "pptx-animations": "pptxAnimations",
  }))
    if (flags[flag] !== undefined) config[key] = flags[flag];
  console.log(JSON.stringify(await exportArtifact(...positional, config)));
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(() => run());
