#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { args, main } from "../skills/codex-design/scripts/lib/files.mjs";
import { serve } from "../skills/codex-design/scripts/preview.mjs";
export async function prepareDemo(destination) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  await fs.cp(path.join(root, "examples"), destination, { recursive: true });
  await fs.cp(
    path.join(root, "skills/codex-design/assets/starters"),
    path.join(destination, "starters"),
    { recursive: true },
  );
  return destination;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional: p, flags } = args(process.argv.slice(2), {
      "--port": "value",
    });
    if (p.length) throw new Error("Usage: node tools/demo.mjs [--port 4311]");
    const folder = await fs.mkdtemp(
      path.join(os.tmpdir(), "codex-design-demo-"),
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
