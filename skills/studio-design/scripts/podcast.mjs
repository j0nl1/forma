#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { main } from "./lib/files.mjs";
import { runAudioCli } from "./source-to-audio.mjs";

// Retain the previous entry point and exports for existing audio workflows.
export {
  checkAudio as checkPodcast,
  planAudio as planPodcast,
  measureAudio as measurePodcast,
  assembleAudio as assemblePodcast,
} from "./source-to-audio.mjs";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    console.log(JSON.stringify(await runAudioCli()));
  });
