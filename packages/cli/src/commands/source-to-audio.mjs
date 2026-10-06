#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, main, readJson } from "../../../core/src/lib/files.mjs";
import {
  checkAudio,
  planAudio,
  measureAudio,
  assembleAudio,
} from "../../../media/src/source-to-audio.mjs";
export * from "../../../media/src/source-to-audio.mjs";
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

export async function run(argv = process.argv.slice(2)) {
  console.log(JSON.stringify(await runAudioCli(argv)));
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(() => run());
