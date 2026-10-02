import { localUrl } from "./files.mjs";
import { settlePptxControls } from "./pptx-controls.mjs";
import { preparePptxPlayback } from "./pptx-media-playback.mjs";
import { addPptxMediaTiming } from "./pptx-media-timing.mjs";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

const maxBytes = 128 * 1024 * 1024;

async function snapshotSource(page, source) {
  const url = new URL(source);
  const origin = new URL(localUrl(page.url())).origin;
  if (url.protocol === "blob:") {
    if (url.origin !== origin)
      throw new Error(
        "PowerPoint media blob must belong to the local page origin.",
      );
    const encoded = await page.evaluate(
      async ({ source, maxBytes }) => {
        const response = await fetch(source, {
          signal: AbortSignal.timeout(30000),
        });
        const chunks = [];
        const reader = response.body.getReader();
        let length = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > maxBytes) {
            await reader.cancel();
            throw new Error(
              "PowerPoint media source exceeds the 128 MiB snapshot limit.",
            );
          }
          chunks.push(value);
        }
        const blob = new Blob(chunks);
        if (!blob.size || blob.size > maxBytes)
          throw new Error(
            "PowerPoint media source must contain 1 byte to 128 MiB.",
          );
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = () =>
            reject(new Error("PowerPoint media blob could not be read."));
          reader.readAsDataURL(blob);
        });
      },
      { source, maxBytes },
    );
    return Buffer.from(encoded, "base64");
  }
  if (url.protocol === "data:" && source.length > maxBytes * 1.4)
    throw new Error(
      "PowerPoint media source exceeds the 128 MiB snapshot limit.",
    );
  let current = source;
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (new URL(current).protocol !== "data:") {
      localUrl(current);
      if (new URL(current).origin !== origin)
        throw new Error(
          "PowerPoint media must use the same loopback origin as the source deck.",
        );
    }
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.has("location")
    ) {
      await response.body?.cancel();
      current = new URL(response.headers.get("location"), current).href;
      localUrl(current);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `PowerPoint media source returned HTTP ${response.status}.`,
      );
    }
    if (Number(response.headers.get("content-length")) > maxBytes) {
      await response.body?.cancel();
      throw new Error(
        "PowerPoint media source exceeds the 128 MiB snapshot limit.",
      );
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > maxBytes)
        throw new Error(
          "PowerPoint media source exceeds the 128 MiB snapshot limit.",
        );
      chunks.push(chunk);
    }
    if (!length) throw new Error("PowerPoint media source is empty.");
    return Buffer.concat(chunks);
  }
  throw new Error("PowerPoint media source has too many redirects.");
}

function container(bytes, type) {
  if (bytes.subarray(4, 8).toString() === "ftyp")
    return type === "audio" ? "m4a" : "mp4";
  if (bytes.subarray(0, 4).toString("hex") === "1a45dfa3") return "webm";
  if (bytes.subarray(0, 4).toString() === "OggS")
    return type === "audio" ? "ogg" : "ogv";
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WAVE"
  )
    return "wav";
  if (
    bytes.subarray(0, 3).toString() === "ID3" ||
    (bytes[0] === 255 && (bytes[1] & 224) === 224 && (bytes[1] & 6) !== 0)
  )
    return "mp3";
  if (bytes.subarray(0, 4).toString() === "fLaC") return "flac";
  throw new Error(
    "PowerPoint media source has an unsupported or unrecognized file container.",
  );
}

// Pass encoded source bytes to PptxGenJS, never a URL that it could fetch later.
export async function preparePptxMedia(page, object, coverBuffer) {
  if (!object.src)
    throw new Error(
      "PowerPoint audio/video requires an available local source.",
    );
  const original = await snapshotSource(page, object.src);
  const type = object.mediaType;
  const { bytes, extn, playback } = await preparePptxPlayback(
    original,
    container(original, type),
    object,
  );
  object.playback = playback;
  const warnings = [];
  if (object.hidden && playback.trigger === "on-click")
    warnings.push(
      "Audio without a visible HTML control is embedded off-slide; move its control onto the slide to play it manually.",
    );
  if (playback.embeddedSource === "derived")
    warnings.push(
      `Embedded media uses a local ${extn.toUpperCase()} playback copy for ${playback.changes.join(", ")}: source ${playback.sourceStart}–${playback.sourceEnd}s, initial position ${playback.initialPosition}s, rate ${playback.playbackRate}, gain ${playback.gain}. The source file is unchanged; video copies use H.264/AAC encoding${playback.outputFrameRate ? ` at ${playback.outputFrameRate} fps (bounded to 1–120 fps)` : ""}.`,
    );
  if (playback.loop)
    warnings.push(
      "Media looping is encoded as native repetition, but the tested LibreOffice 25.8 player plays it once; Microsoft PowerPoint loop playback remains unverified.",
    );
  if (playback.trigger === "on-click")
    warnings.push(
      "Media uses native on-click activation; the tested LibreOffice 25.8 player starts media on slide entry instead. Verify activation in the receiving application.",
    );
  if (playback.fragmentEnd != null)
    warnings.push(
      playback.fragmentBoundary === "first-playback-trim"
        ? `The HTML media fragment's one-shot pause at ${playback.fragmentEnd}s is exported as the first playback interval without repetition. The browser's internal consumed-pause flag is unavailable in a snapshot; the trimmed native copy cannot reproduce later continuation beyond the boundary or Chromium's 250ms pause-timer overshoot.`
        : `The captured HTML media position has passed its fragment end (${playback.fragmentEnd}s). Export preserves continuation to the source ending; Chromium's internal one-shot pause state cannot be recovered from the media element.`,
    );
  const changesFit =
    type === "video" &&
    object.videoWidth &&
    object.videoHeight &&
    object.objectFit !== "fill" &&
    Math.abs(object.w / object.h - object.videoWidth / object.videoHeight) >
      0.01;
  if (
    object.decorated ||
    changesFit ||
    (type === "video" && object.objectPosition !== "50% 50%")
  )
    warnings.push(
      "The media cover preserves its HTML appearance, but native playback does not reproduce CSS decoration, clipping or object-fit/object-position.",
    );
  if (!["mp4", "m4a", "mp3", "wav"].includes(extn))
    warnings.push(
      `Embedded ${extn.toUpperCase()} playback depends on the recipient application's codec support; the original source was preserved without transcoding.`,
    );
  return {
    options: {
      type,
      extn,
      data: `${type}/${extn};base64,${bytes.toString("base64")}`,
      cover: `image/png;base64,${coverBuffer.toString("base64")}`,
    },
    warnings,
    playback,
  };
}

// PptxGenJS emits videoFile for both media kinds and allocates picture IDs from
// relationship IDs. Keep media IDs stable and repair colliding native-shape IDs
// before native animations add any new object references.
export function normalizePptxMedia(buffer, slides) {
  const zip = unzipSync(buffer);
  slides.forEach((slide, index) => {
    const file = `ppt/slides/slide${index + 1}.xml`;
    let xml = strFromU8(zip[file]);
    const audioNames = new Set(
      slide.objects
        .filter(
          (object) => object.kind === "media" && object.mediaType === "audio",
        )
        .map((object) => object.objectName),
    );
    const shapePattern =
      /<p:(sp|pic|graphicFrame|cxnSp)\b[^>]*>[\s\S]*?<\/p:\1>/g;
    const shapes = [...xml.matchAll(shapePattern)];
    const mediaIds = new Set(
      shapes
        .filter(([source]) =>
          /<(?:p14:media|a:videoFile|a:audioFile)\b/.test(source),
        )
        .map(([source]) =>
          Number(source.match(/<p:cNvPr\b[^>]*\bid="(\d+)"/)?.[1]),
        ),
    );
    const allIds = [...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map(
      (match) => Number(match[1]),
    );
    let nextId = Math.max(1, ...allIds) + 1;
    const used = new Set([1, ...mediaIds]),
      audioIds = new Set();
    xml = xml.replace(shapePattern, (source) => {
      const properties = source.match(/<p:cNvPr\b[^>]*>/)?.[0];
      const id = Number(properties?.match(/\bid="(\d+)"/)?.[1]);
      const name = properties?.match(/\bname="([^"]*)"/)?.[1];
      const media = /<(?:p14:media|a:videoFile|a:audioFile)\b/.test(source);
      if (!media) {
        if (used.has(id))
          source = source.replace(
            properties,
            properties.replace(/\bid="\d+"/, `id="${nextId++}"`),
          );
        else used.add(id);
      }
      if (audioNames.has(name)) {
        audioIds.add(id);
        source = source
          .replace(/<a:videoFile\b/g, "<a:audioFile")
          .replace(/<\/a:videoFile>/g, "</a:audioFile>");
      }
      return source;
    });
    xml = xml.replace(/<p:video\b[^>]*>[\s\S]*?<\/p:video>/g, (source) => {
      const target = Number(source.match(/<p:spTgt\b[^>]*\bspid="(\d+)"/)?.[1]);
      return audioIds.has(target)
        ? source
            .replace(/<p:video\b/, "<p:audio")
            .replace(/<\/p:video>$/, "</p:audio>")
        : source;
    });
    zip[file] = strToU8(addPptxMediaTiming(xml, slide.objects));
  });
  return Buffer.from(zipSync(zip, { level: 6 }));
}

// Decode a stable current frame before metadata, CSS-fit decisions and cover
// capture. The export browser is disposable; pausing does not change source HTML.
export async function preparePptxMediaElements(page, index) {
  await page.evaluate(async (index) => {
    const root = document.querySelector("deck-stage").slides[index];
    const media = [...root.querySelectorAll("video,audio")];
    await Promise.all(
      media.map((element) => {
        for (
          let parent = element.parentElement;
          parent && parent !== root;
          parent = parent.parentElement
        ) {
          const style = getComputedStyle(parent);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity) === 0
          )
            return;
        }
        if (
          !element.currentSrc &&
          !element.src &&
          !element.querySelector("source[src]")
        )
          return;
        element.pause();
        return new Promise((resolve, reject) => {
          const events = [
            "loadeddata",
            "canplay",
            "seeked",
            "loadedmetadata",
            "error",
          ];
          let timer;
          const done = (error) => {
            clearTimeout(timer);
            for (const event of events)
              element.removeEventListener(event, check);
            if (error) reject(error);
            else resolve();
          };
          const check = () => {
            if (element.error)
              return done(
                new Error(
                  `PowerPoint ${element.localName} could not decode its local media source.`,
                ),
              );
            if (
              element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
              !element.seeking
            )
              done();
          };
          timer = setTimeout(
            () =>
              done(
                new Error(
                  `PowerPoint ${element.localName} did not decode a stable frame within 8 seconds.`,
                ),
              ),
            8000,
          );
          for (const event of events) element.addEventListener(event, check);
          if (
            element.readyState === HTMLMediaElement.HAVE_NOTHING &&
            (element.preload === "none" ||
              element.networkState === HTMLMediaElement.NETWORK_EMPTY)
          )
            element.load();
          check();
        });
      }),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  }, index);
  return settlePptxControls(page, index);
}
