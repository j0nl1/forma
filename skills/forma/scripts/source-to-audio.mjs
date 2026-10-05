#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { args, main } from "./lib/files.mjs";
import { loadEpisode, timingResult } from "./lib/podcast-model.mjs";
import { inspectClips } from "./lib/podcast-audio.mjs";

export async function checkAudio(episodeFile) {
  return (await loadEpisode(episodeFile)).report;
}
export async function planAudio(episodeFile) {
  const { episode, report } = await loadEpisode(episodeFile);
  const target = episode.timing.targetSeconds;
  return {
    ...report,
    timing: timingResult(report.estimatedSeconds, episode.timing),
    targetWordBudget:
      target === undefined
        ? null
        : Math.floor((target / 60) * episode.timing.wordsPerMinute),
  };
}
export async function measureAudio(episodeFile, clipsFile) {
  return inspectClips(await loadEpisode(episodeFile), clipsFile);
}
export async function assembleAudio(
  episodeFile,
  clipsFile,
  outputFile,
  options = {},
) {
  if (outputFile === undefined) throw new Error("An output file is required");
  return inspectClips(
    await loadEpisode(episodeFile),
    clipsFile,
    outputFile,
    options,
  );
}
export async function runAudioCli(argv = process.argv.slice(2)) {
  const { positional: p, flags } = args(argv, {
    "--clips": "value",
    "--out": "value",
    "--level-speech": "boolean",
    "--target-lufs": "value",
    "--true-peak-db": "value",
  });
  const [command, episodeFile] = p;
  if (
    p.length !== 2 ||
    !["plan", "check", "measure", "assemble"].includes(command) ||
    ((command === "plan" || command === "check") &&
      Object.keys(flags).length) ||
    ((command === "measure" || command === "assemble") && !flags.clips) ||
    (command === "measure" && flags.out) ||
    (command === "assemble" && !flags.out) ||
    (command !== "assemble" &&
      (flags["level-speech"] ||
        flags["target-lufs"] !== undefined ||
        flags["true-peak-db"] !== undefined))
  )
    throw new Error(
      "Usage: node source-to-audio.mjs plan|check <episode.json>; measure <episode.json> --clips <clips.json>; assemble <episode.json> --clips <clips.json> --out <new.mp3|wav> [--level-speech [--target-lufs <number>] [--true-peak-db <number>]]",
    );
  const result =
    command === "check"
      ? await checkAudio(episodeFile)
      : command === "plan"
        ? await planAudio(episodeFile)
        : command === "measure"
          ? await measureAudio(episodeFile, flags.clips)
          : await assembleAudio(episodeFile, flags.clips, flags.out, {
              levelSpeech: flags["level-speech"],
              targetLufs:
                flags["target-lufs"] === undefined
                  ? undefined
                  : Number(flags["target-lufs"]),
              truePeakDb:
                flags["true-peak-db"] === undefined
                  ? undefined
                  : Number(flags["true-peak-db"]),
            });
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    console.log(JSON.stringify(await runAudioCli()));
  });
