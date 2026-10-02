import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

export async function soundDecoderReady() {
  try {
    await run("ffmpeg", ["-version"], { timeout: 10000, maxBuffer: 16384 });
  } catch {
    throw new Error(
      "FFmpeg is required to validate generated MP3 audio. Install it before making a sound generation request.",
    );
  }
}
export async function validateSoundAudio(bytes) {
  await new Promise((resolve, reject) => {
    const decoder = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-xerror",
        "-f",
        "mp3",
        "-i",
        "pipe:0",
        "-map",
        "0:a:0",
        "-f",
        "null",
        "-",
      ],
      {
        stdio: ["pipe", "ignore", "ignore"],
        timeout: 15000,
        killSignal: "SIGKILL",
      },
    );
    decoder.once("error", () =>
      reject(
        new Error(
          "FFmpeg could not validate the sound response; no MP3 was published.",
        ),
      ),
    );
    decoder.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Sound response could not be decoded as MP3 audio; no MP3 was published.",
            ),
          ),
    );
    // A rejected stream may close stdin before the complete response is consumed.
    decoder.stdin.on("error", () => {});
    decoder.stdin.end(bytes);
  });
}
