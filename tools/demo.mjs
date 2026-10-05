#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { args, main } from "../skills/forma/scripts/lib/files.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { bundle } from "../skills/forma/scripts/build.mjs";
import {
  compile,
  importSystem,
  preview,
} from "../skills/forma/scripts/design-system.mjs";
import { exists } from "../skills/forma/scripts/lib/files.mjs";
export async function prepareDemo(destination) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  await fs.cp(path.join(root, "examples"), destination, { recursive: true });
  await fs.cp(
    path.join(root, "skills/forma/assets/starters"),
    path.join(destination, "starters"),
    { recursive: true },
  );
  await bundle(
    path.join(root, "examples/motion/main.jsx"),
    path.join(destination, "animation.bundle.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "examples/motion/watercolor.jsx"),
    path.join(destination, "watercolor.bundle.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "examples/motion/scenes.jsx"),
    path.join(destination, "scenes.bundle.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "examples/canvas/main.jsx"),
    path.join(destination, "canvas.bundle.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "examples/tweaks/main.jsx"),
    path.join(destination, "tweaks.bundle.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "skills/forma/assets/starters/deck.js"),
    path.join(destination, "starters/deck.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "skills/forma/assets/starters/chart-libraries.js"),
    path.join(destination, "chart-libraries.bundle.js"),
    { overwrite: true },
  );
  for (const [entry, output] of [
    ["geography-libraries.js", "geography.bundle.js"],
    ["street-libraries.js", "street.bundle.js"],
  ]) {
    await bundle(
      path.join(root, "skills/forma/assets/starters", entry),
      path.join(destination, output),
      { overwrite: true },
    );
  }
  await bundle(
    path.join(root, "skills/forma/assets/starters/data-overlay.js"),
    path.join(destination, "starters/data-overlay.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "skills/forma/assets/starters/three-stage.js"),
    path.join(destination, "three-stage.bundle.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "skills/forma/assets/starters/document.js"),
    path.join(destination, "starters/document.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "skills/forma/assets/starters/fixed-sheet.js"),
    path.join(destination, "starters/fixed-sheet.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "skills/forma/assets/starters/text-editor.js"),
    path.join(destination, "starters/text-editor.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "skills/forma/assets/starters/image-slot.js"),
    path.join(destination, "starters/image-slot.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "examples/platforms/main.jsx"),
    path.join(destination, "platforms.bundle.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "skills/forma/assets/starters/frames.js"),
    path.join(destination, "starters/frames.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "skills/forma/assets/starters/social.js"),
    path.join(destination, "starters/social.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "skills/forma/assets/starters/plain-canvas.js"),
    path.join(destination, "starters/plain-canvas.js"),
    { overwrite: true },
  );
  await bundle(
    path.join(root, "examples/campaign/main.jsx"),
    path.join(destination, "campaign.bundle.js"),
    { overwrite: true },
  );
  for (const [folder, slug] of [
    ["design-system", "harbor"],
    ["design-system-secondary", "trail"],
  ]) {
    await compile(path.join(destination, folder));
    await preview(path.join(destination, folder));
    await importSystem(path.join(destination, folder), destination, {
      update: await exists(path.join(destination, "_ds", slug)),
    });
  }
  return destination;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional: p, flags } = args(process.argv.slice(2), {
      "--port": "value",
    });
    if (p.length) throw new Error("Usage: node tools/demo.mjs [--port 4311]");
    const folder = await fs.mkdtemp(
      path.join(os.tmpdir(), "forma-demo-"),
    );
    await prepareDemo(folder);
    const { server, url } = await serve(folder, Number(flags.port ?? 4311));
    console.log(JSON.stringify({ url, folder }));
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () =>
        server.close(async () => {
          await fs.rm(folder, { recursive: true, force: true });
        }),
      );
  });
