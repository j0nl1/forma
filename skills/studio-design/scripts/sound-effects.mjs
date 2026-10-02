#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, main } from "./lib/files.mjs";
import { soundRequest, requestSound } from "./lib/sound-request.mjs";
import { soundDecoderReady, validateSoundAudio } from "./lib/sound-audio.mjs";
import {
  soundDestination,
  reserveSound,
  saveSound,
} from "./lib/sound-assets.mjs";

export async function generateSound(project, prompt, options = {}) {
  if (options.generate != null && typeof options.generate !== "boolean")
    throw new Error("The generate option must be a boolean.");
  const request = soundRequest(prompt, options);
  const destination = await soundDestination(
    path.resolve(project),
    request.body.text,
    options.name,
  );
  const plan = {
    generated: false,
    project: destination.project,
    relativePath: destination.relativePath,
    ...request,
  };
  if (!options.generate) return plan;
  const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY;
  if (typeof apiKey !== "string" || !apiKey.trim() || /[\r\n]/.test(apiKey))
    throw new Error(
      "Set ELEVENLABS_API_KEY in the process environment before generating sound.",
    );
  await soundDecoderReady();
  const release = await reserveSound(destination);
  try {
    const bytes = await requestSound(request, {
      apiKey,
      timeoutMs: options.timeoutMs,
    });
    await validateSoundAudio(bytes);
    const result = await saveSound(destination, bytes, request);
    return { ...plan, generated: true, ...result };
  } finally {
    await release();
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional: p, flags } = args(process.argv.slice(2), {
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
  });
