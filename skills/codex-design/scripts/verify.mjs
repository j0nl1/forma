#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { args, main } from "./lib/files.mjs";
import { withPage } from "./lib/browser.mjs";
main(async () => {
  const { positional: p, flags } = args(process.argv.slice(2), {
    "--out": "value",
  });
  if (p.length !== 1)
    throw new Error(
      "Usage: node verify.mjs <loopback-url> [--out <artifact-directory>]",
    );
  const out = flags.out
    ? path.resolve(flags.out)
    : await fs.mkdtemp(path.join(os.tmpdir(), "codex-design-verify-"));
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
});
