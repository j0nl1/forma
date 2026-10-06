#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, main, readJson } from "../../../core/src/lib/files.mjs";
import { generateSound } from "../../../media/src/sound-effects.mjs";
export * from "../../../media/src/sound-effects.mjs";
export async function run(argv = process.argv.slice(2)) {
  const { positional: p, flags } = args(argv, {
    "--prompt": "value",
    "--name": "value",
    "--duration": "value",
    "--prompt-influence": "value",
    "--endpoint": "value",
    "--timeout-ms": "value",
    "--generate": "boolean",
  });
  if (p.length !== 1 || !flags.prompt)
    throw new Error(
      "Usage: node sound-effects.mjs <project> --prompt <text> [--name <slug>] [--duration <0.5..22>] [--prompt-influence <0..1>] [--endpoint <URL>] [--timeout-ms <ms>] [--generate]",
    );
  const result = await generateSound(p[0], flags.prompt, {
    name: flags.name,
    durationSeconds:
      flags.duration == null ? undefined : Number(flags.duration),
    promptInfluence:
      flags["prompt-influence"] == null
        ? undefined
        : Number(flags["prompt-influence"]),
    endpoint: flags.endpoint,
    timeoutMs:
      flags["timeout-ms"] == null ? undefined : Number(flags["timeout-ms"]),
    generate: flags.generate,
  });
  console.log(JSON.stringify(result));
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(() => run());
