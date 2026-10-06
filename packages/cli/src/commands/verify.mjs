#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { args, main } from "../../../core/src/lib/files.mjs";
import { withPage } from "../../../media/src/lib/browser.mjs";
export async function run(argv = process.argv.slice(2)) {
  const { positional: p, flags } = args(argv, {
    "--out": "value",
  });
  if (p.length !== 1)
    throw new Error(
      "Usage: node verify.mjs <loopback-url> [--out <artifact-directory>]",
    );
  const out = flags.out
    ? path.resolve(flags.out)
    : await fs.mkdtemp(path.join(os.tmpdir(), "forma-verify-"));
  await fs.mkdir(out, { recursive: true });
  const result = await withPage(p[0], async (page) => {
    const title = await page.title();
    const captures = [];
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: path.join(out, `${name}.png`),
        fullPage: true,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      captures.push({
        name,
        width,
        height,
        overflow,
        screenshot: path.join(out, `${name}.png`),
      });
    }
    return { title, captures };
  });
  console.log(
    JSON.stringify(
      {
        ...result,
        runtimeErrors: [],
        note: "Screenshots and overflow probes do not verify the main interaction flow.",
      },
      null,
      2,
    ),
  );
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(() => run());
