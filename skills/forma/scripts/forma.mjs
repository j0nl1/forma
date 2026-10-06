#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const installed = new URL("../packages/cli/src/index.mjs", import.meta.url);
const entry = existsSync(fileURLToPath(installed))
  ? installed
  : new URL("../../../packages/cli/src/index.mjs", import.meta.url);
try {
  await (await import(entry.href)).run(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
