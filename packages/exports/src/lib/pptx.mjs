import fs from "node:fs/promises";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import { captureSlide } from "./pptx-capture.mjs";
import { capturePptxImage } from "./pptx-layers.mjs";
import {
  preparePptxMedia,
  preparePptxMediaElements,
  normalizePptxMedia,
} from "./pptx-media.mjs";
import { applyPptxMotion } from "./pptx-motion.mjs";
import { preparePptxCompositingFrames } from "./pptx-motion-frames.mjs";
import {
  loadPptxFonts,
  preparePptxFonts,
  embedPptxFonts,
} from "./pptx-fonts.mjs";

export function pptxOptions(options = {}) {
  const mode = options.pptxMode ?? "editable";
  if (!["editable", "screenshots"].includes(mode))
    throw new Error("pptxMode must be editable or screenshots.");
  const animations = options.pptxAnimations ?? "native";
  if (!["native", "static"].includes(animations))
    throw new Error("pptxAnimations must be native or static.");
  const scale = Number(options.deviceScaleFactor ?? 1);
  if (!Number.isFinite(scale) || scale < 1 || scale > 4)
    throw new Error("PowerPoint capture scale must be between 1 and 4.");
  const fontSwaps = options.fontSwaps ?? [];
  if (
    !Array.isArray(fontSwaps) ||
    fontSwaps.some(
      (s) =>
        !s ||
        typeof s.from !== "string" ||
        !s.from.trim() ||
        typeof s.to !== "string" ||
        !s.to.trim(),
    )
  )
    throw new Error("fontSwaps must contain nonempty from/to font names.");
  const fonts = options.pptxFonts ?? [];
  if (
    !Array.isArray(fonts) ||
    fonts.some(
      (entry) =>
        !entry ||
        typeof entry.path !== "string" ||
        !path.isAbsolute(entry.path),
    )
  )
    throw new Error("pptxFonts must contain absolute local font paths.");
  return { mode, animations, deviceScaleFactor: scale, fontSwaps, fonts };
}

export async function renderPptx(page, output, options = {}) {
  const config = pptxOptions(options);
  const fontPlan = await loadPptxFonts(config.fonts);
  await preparePptxFonts(page, fontPlan);
  const metadata = await page.evaluate(
    async ({ fontSwaps }) => {
      const stages = document.querySelectorAll("deck-stage");
      if (stages.length !== 1 || !stages[0].ready)
        throw new Error(
          "PowerPoint export requires one initialized deck-stage with discrete slides.",
        );
      const stage = stages[0];
      for (const element of stage.querySelectorAll("*")) {
        const families = getComputedStyle(element)
          .fontFamily.split(",")
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
        const swap = fontSwaps.find((s) => families.includes(s.from));
        if (swap) element.style.fontFamily = JSON.stringify(swap.to);
      }
      await document.fonts.ready;
      const slides = stage.slides
        .map((slide, index) =>
          slide.hasAttribute("data-deck-skip") ? null : index,
        )
        .filter((n) => n !== null);
      if (!slides.length)
        throw new Error(
          "PowerPoint export requires at least one non-skipped slide.",
        );
      stage.preparePrint();
      return {
        width: stage.width,
        height: stage.height,
        slides,
        title: document.title || "Forma presentation",
      };
    },
    { fontSwaps: config.fontSwaps },
  );
  // Keep dimensions within PowerPoint's 56-inch limit, preserving the source ratio.
  const unit = 1 / Math.max(96, metadata.width / 56, metadata.height / 56);
  const deck = new PptxGenJS();
  deck.defineLayout({
    name: "STUDIO",
    width: metadata.width * unit,
    height: metadata.height * unit,
  });
  deck.layout = "STUDIO";
  deck.author = "Forma";
  deck.subject = "Local HTML presentation export";
  deck.title = metadata.title;
  deck.lang = "en-US";
  const warnings = new Set(),
    signatures = [],
    capturedSlides = [],
    mediaPlayback = [];
  let editableObjects = 0,
    rasterObjects = 0,
    mediaObjects = 0,
    animationCount = 0;
  try {
    await page.emulateMedia({ media: "print" });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    for (const index of metadata.slides) {
      for (const warning of (await preparePptxMediaElements(page, index)) ?? [])
        warnings.add(`Slide ${index + 1}: ${warning}`);
      const captured = await page.evaluate(captureSlide, index);
      captured.sourceIndex = index;
      // Stable names connect captured artwork with generated native shapes.
      captured.objects.forEach((object, ordinal) => {
        object.objectName = `studio-object-${index}-${ordinal}`;
      });
      capturedSlides.push(captured);
      if (
        Math.abs(captured.width - metadata.width) > 1 ||
        Math.abs(captured.height - metadata.height) > 1
      )
        throw new Error(
          `Slide ${index + 1} does not match the authored stage dimensions.`,
        );
      const locator = page.locator("deck-stage > [data-deck-slide]").nth(index);
      const preview = await locator.screenshot({
        type: "png",
        animations: "disabled",
      });
      // Compare small rendered samples rather than PNG bytes, which can differ
      // after subpixel scrolling even for the same authored artwork.
      signatures.push(
        await page.evaluate(async (data) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 32;
          canvas.height = 18;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, 32, 18);
          return [...context.getImageData(0, 0, 32, 18).data];
        }, preview.toString("base64")),
      );
      const slide = deck.addSlide();
      slide.addNotes(captured.notes);
      animationCount += captured.animationCount;
      for (const warning of captured.warnings.filter((w) =>
        w.startsWith("Speaker note"),
      ))
        warnings.add(warning);
      if (config.mode === "screenshots") {
        slide.addImage({
          data: `image/png;base64,${preview.toString("base64")}`,
          x: 0,
          y: 0,
          w: metadata.width * unit,
          h: metadata.height * unit,
        });
        rasterObjects++;
        continue;
      }
      for (const warning of captured.warnings)
        warnings.add(`Slide ${index + 1}: ${warning}`);
      if (config.animations === "native") {
        const frames = await preparePptxCompositingFrames(page, captured);
        for (const warning of frames.warnings)
          warnings.add(`Slide ${index + 1}: ${warning}`);
      }
      for (const object of captured.objects) {
        const geometry = {
          objectName: object.objectName,
          x: (object.x + (object.parked ? metadata.width * 2 : 0)) * unit,
          y: object.y * unit,
          w: object.w * unit,
          h: object.h * unit,
          rotate: object.rotate ?? 0,
        };
        if (object.kind === "text") {
          const { kind, text, x, y, w, h, fontSize, charSpacing, ...style } =
            object;
          slide.addText(text, {
            ...style,
            ...geometry,
            fontSize: fontSize * unit * 72,
            charSpacing: charSpacing * unit * 72,
            margin: 0,
            breakLine: false,
            valign: "mid",
            fit: "none",
            wrap: false,
          });
          editableObjects++;
        } else if (object.kind === "shape") {
          slide.addShape(deck.ShapeType.rect, {
            ...geometry,
            fill: object.fill || { color: "FFFFFF", transparency: 100 },
            line: { ...object.line, width: object.line.width * unit * 72 },
          });
          editableObjects++;
        } else {
          const image =
            object.png ?? (await capturePptxImage(page, locator, object));
          if (object.kind === "media") {
            const media = await preparePptxMedia(page, object, image);
            if (media.playback)
              mediaPlayback.push({
                ...media.playback,
                sourceSlide: index + 1,
                objectName: object.objectName,
              });
            for (const warning of media.warnings)
              warnings.add(`Slide ${index + 1}: ${warning}`);
            // Automatic media uses its own cover. Native timing hides the
            // conditional manual-video cover as its click starts playback.
            slide.addMedia({ ...media.options, ...geometry });
            mediaObjects++;
            rasterObjects += media.playback?.posterObjects ?? 0;
            continue;
          }
          slide.addImage({
            ...geometry,
            data: `image/png;base64,${image.toString("base64")}`,
            altText: object.alt,
          });
          rasterObjects++;
        }
      }
    }
    let buffer = await deck.write({
      outputType: "nodebuffer",
      compression: true,
    });
    if (config.mode === "editable")
      buffer = normalizePptxMedia(buffer, capturedSlides);
    let nativeAnimations = 0,
      rasterAnimations = 0;
    if (config.mode === "editable" && config.animations === "native") {
      const motion = applyPptxMotion(buffer, capturedSlides);
      buffer = motion.buffer;
      nativeAnimations = motion.animationCount;
      rasterAnimations = motion.rasterAnimationCount;
      for (const warning of motion.warnings) warnings.add(warning);
    } else if (animationCount)
      warnings.add(
        `${animationCount} HTML build animations are retained in the HTML source; PowerPoint contains their finished static artwork.`,
      );
    if (
      signatures.some(
        (sample, i) =>
          i > 0 &&
          sample.reduce(
            (difference, value, p) =>
              difference + Math.abs(value - signatures[i - 1][p]),
            0,
          ) /
            sample.length <
            1,
      )
    )
      warnings.add(
        "Adjacent slides have identical artwork. Check whether the repetition is intentional.",
      );
    let embeddedFonts = [];
    if (config.mode === "editable") {
      const fonts = embedPptxFonts(buffer, fontPlan, capturedSlides);
      buffer = fonts.buffer;
      embeddedFonts = fonts.embeddedFonts;
      for (const warning of fonts.warnings) warnings.add(warning);
    }
    await fs.writeFile(output, buffer);
    return {
      mode: config.mode,
      slides: metadata.slides.length,
      width: metadata.width,
      height: metadata.height,
      editableObjects,
      rasterObjects,
      mediaObjects,
      mediaPlayback,
      embeddedFonts,
      nativeAnimations,
      rasterAnimations,
      staticAnimations: animationCount - nativeAnimations - rasterAnimations,
      warnings: [...warnings],
    };
  } finally {
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() =>
      document.querySelector("deck-stage")?.restorePrint(),
    );
  }
}
