import { html } from "./files.mjs";
import { inversePaintTransform } from "./figma-paint-gradients.mjs";
function imageMime(bytes) {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6)))
    return "image/gif";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}
function intrinsicSize(bytes, mime) {
  if (mime === "image/png" && bytes.length >= 24)
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (mime === "image/gif" && bytes.length >= 10)
    return [bytes.readUInt16LE(6), bytes.readUInt16LE(8)];
  if (mime === "image/jpeg") {
    let offset = 2;
    const frames = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
      0xcf,
    ]);
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if (frames.has(marker) && size >= 8)
        return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
      offset += size;
    }
  }
  if (mime === "image/webp") {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = bytes.toString("ascii", offset, offset + 4),
        size = bytes.readUInt32LE(offset + 4),
        start = offset + 8;
      if (start + size > bytes.length) break;
      if (kind === "VP8X" && size >= 10)
        return [
          bytes.readUIntLE(start + 4, 3) + 1,
          bytes.readUIntLE(start + 7, 3) + 1,
        ];
      if (
        kind === "VP8 " &&
        size >= 10 &&
        bytes
          .subarray(start + 3, start + 6)
          .equals(Buffer.from([0x9d, 0x01, 0x2a]))
      )
        return [
          bytes.readUInt16LE(start + 6) & 0x3fff,
          bytes.readUInt16LE(start + 8) & 0x3fff,
        ];
      if (kind === "VP8L" && size >= 5 && bytes[start] === 0x2f) {
        const packed = bytes.readUInt32LE(start + 1);
        return [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1];
      }
      offset = start + size + (size % 2);
    }
  }
  return [];
}
export function imagePaint(paint, { doc, w, h, opacity, warn }) {
  const hash = paint.image?.hash;
  const key =
    typeof paint.imageHash === "string"
      ? paint.imageHash
      : Array.isArray(hash) || ArrayBuffer.isView(hash)
        ? Buffer.from(hash).toString("hex")
        : "";
  const asset = Object.hasOwn(doc.images, key) ? doc.images[key] : null;
  if (!asset) {
    warn("image asset missing");
    return null;
  }
  const bytes = Buffer.from(asset),
    mime = imageMime(bytes);
  if (!mime) {
    warn("unsupported image asset format");
    return null;
  }
  const src = `data:${mime};base64,${bytes.toString("base64")}`;
  const mode = paint.imageScaleMode ?? paint.scaleMode ?? "FILL";
  if (paint.filters && Object.values(paint.filters).some((v) => v !== 0))
    warn("image filters need visual review");
  if (paint.rotation) warn("image rotation needs visual review");
  let content;
  const image = (attrs) => `<image href="${html(src)}" ${attrs}/>`;
  if (mode === "TILE") {
    const scale = Number.isFinite(paint.scale ?? paint.scalingFactor)
      ? (paint.scale ?? paint.scalingFactor)
      : 1;
    const dimensions = intrinsicSize(bytes, mime);
    const originalW = paint.originalImageWidth ?? dimensions[0];
    const originalH = paint.originalImageHeight ?? dimensions[1];
    const tw = originalW * scale,
      th = originalH * scale;
    if (!(Number.isFinite(tw) && Number.isFinite(th) && tw > 0 && th > 0)) {
      warn("TILE image dimensions/scale missing or invalid");
      return null;
    }
    content = `<defs><pattern id="tile" patternUnits="userSpaceOnUse" width="${tw}" height="${th}">${image(`width="${tw}" height="${th}" preserveAspectRatio="none"`)}</pattern></defs><rect width="${w}" height="${h}" fill="url(#tile)" opacity="${opacity}"/>`;
  } else if (["CROP", "STRETCH"].includes(mode)) {
    const m = inversePaintTransform(paint.transform ?? paint.imageTransform);
    if (!m) {
      warn(
        `${mode} image has an invalid or singular transform; cover fallback`,
      );
      content = image(
        `width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="${opacity}"`,
      );
    } else
      content = image(
        `width="1" height="1" preserveAspectRatio="none" transform="matrix(${m.a * w} ${m.b * h} ${m.c * w} ${m.d * h} ${m.e * w} ${m.f * h})" opacity="${opacity}"`,
      );
  } else {
    if (!["FILL", "FIT"].includes(mode))
      warn(`unsupported image scale mode ${String(mode)}; cover fallback`);
    content = image(
      `width="${w}" height="${h}" preserveAspectRatio="xMidYMid ${mode === "FIT" ? "meet" : "slice"}" opacity="${opacity}"`,
    );
  }
  // A separate SVG background preserves layer alpha without covering inset shadows or children.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${content}</svg>`;
  return `url("data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}")`;
}
