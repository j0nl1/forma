import { spawn } from "node:child_process";

// Start the native encoder; the workflow owns backpressure, cancellation and publication.
export function ffmpegEncoder({ fps, codec, ext, temporary }) {
  return spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-n",
      "-filter_complex_threads",
      "1",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "-framerate",
      String(fps),
      "-i",
      "pipe:0",
      ...codec,
      "-f",
      ext,
      temporary,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
}
