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
