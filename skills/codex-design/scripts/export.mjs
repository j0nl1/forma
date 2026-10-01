#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { args, main, exists, write } from "./lib/files.mjs";
import { inlineHtml } from "./lib/inline.mjs";
import { withPage } from "./lib/browser.mjs";
export async function exportArtifact(mode, input, output, { fps = 30 } = {}) {
  output = path.resolve(output);
  if (await exists(output)) throw new Error(`Refusing to overwrite: ${output}`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  if (mode === "html") {
    await write(output, await inlineHtml(path.resolve(input)));
    return { output };
  }
  if (!["pdf", "png", "video"].includes(mode))
    throw new Error(`Unknown export mode: ${mode}`);
  const tmp = `${output}.${randomUUID()}.tmp`;
  try {
    const result = await withPage(input, async (page, errors) => {
      if (mode === "pdf") {
        await page.emulateMedia({ media: "print" });
        await page.pdf({
          path: tmp,
          printBackground: true,
          preferCSSPageSize: true,
        });
        return {};
      }
      if (mode === "png") {
        await page.screenshot({ path: tmp, type: "png", fullPage: true });
        return {};
      }
      fps = Number(fps);
      if (!Number.isInteger(fps) || fps < 1 || fps > 60)
        throw new Error("fps must be an integer between 1 and 60");
      const bridge = await page.evaluate(() => {
        const b = window.codexTimeline;
        if (!b || typeof b.seek !== "function") return null;
        return { duration: b.duration, width: b.width, height: b.height };
      });
      if (
        !bridge ||
        !Number.isFinite(bridge.duration) ||
        bridge.duration <= 0 ||
        bridge.duration > 300
      )
        throw new Error(
          "A timeline bridge with duration 0..300 seconds is required",
        );
      for (const key of ["width", "height"])
        if (
          !Number.isInteger(bridge[key]) ||
          bridge[key] < 2 ||
          bridge[key] > 4096 ||
          bridge[key] % 2
        )
          throw new Error(
            "Video dimensions must be even integers from 2 to 4096",
          );
      await page.setViewportSize({
        width: bridge.width,
        height: bridge.height,
      });
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-capture", "");
        const style = document.createElement("style");
        style.textContent =
          "html,body{margin:0;width:100%;height:100%;overflow:hidden}";
        document.head.append(style);
      });
      const ext = path.extname(output).slice(1).toLowerCase();
      const codec =
        ext === "mp4"
          ? [
              "-c:v",
              "libx264",
              "-crf",
              "18",
              "-pix_fmt",
              "yuv420p",
              "-movflags",
              "+faststart",
            ]
          : ext === "webm"
            ? ["-c:v", "libvpx-vp9", "-crf", "24", "-b:v", "0"]
            : ext === "gif"
              ? ["-vf", `fps=${fps}`]
              : null;
      if (!codec) throw new Error("Video output must be .mp4, .webm, or .gif");
      const encoder = spawn(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-n",
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
          tmp,
        ],
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      let diagnostic = "",
        failure;
      encoder.stderr.on("data", (d) => {
        diagnostic = (diagnostic + d).slice(-6000);
      });
      encoder.on("error", (e) => {
        failure = e;
      });
      encoder.stdin.on("error", (e) => {
        failure = e;
      });
      const completion = new Promise((resolve) =>
        encoder.on("close", (code) => resolve(code)),
      );
      const frames = Math.ceil(bridge.duration * fps);
      try {
        for (let i = 0; i < frames; i++) {
          if (failure) throw failure;
          await page.evaluate((t) => {
            window.codexTimeline.seek(t);
            return new Promise((r) =>
              requestAnimationFrame(() => requestAnimationFrame(r)),
            );
          }, i / fps);
          if (errors.length) throw new Error(errors.join("; "));
          const png = await page.screenshot({ type: "png" });
          if (encoder.exitCode !== null)
            throw new Error(`FFmpeg exited early: ${diagnostic}`);
          if (!encoder.stdin.write(png))
            await Promise.race([
              once(encoder.stdin, "drain"),
              completion.then(() => {
                throw new Error(`FFmpeg stopped: ${diagnostic}`);
              }),
            ]);
        }
        encoder.stdin.end();
        const code = await completion;
        if (failure || code !== 0)
          throw new Error(`FFmpeg failed: ${failure?.message ?? diagnostic}`);
      } catch (e) {
        encoder.kill();
        await completion;
        throw e;
      }
      return {
        frames,
        fps,
        duration: bridge.duration,
        width: bridge.width,
        height: bridge.height,
        audio: false,
      };
    });
    await fs.rename(tmp, output);
    return { output, ...result };
  } finally {
    await fs.rm(tmp, { force: true });
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional: p, flags } = args(process.argv.slice(2), {
      "--fps": "value",
    });
    if (p.length !== 3)
      throw new Error(
        "Usage: node export.mjs html|pdf|png|video <input-path-or-loopback-url> <output> [--fps 30]",
      );
    console.log(JSON.stringify(await exportArtifact(...p, flags)));
  });
