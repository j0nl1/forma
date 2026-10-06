import path from "node:path";
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
