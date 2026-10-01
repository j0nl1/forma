import { IMAGE_TYPES } from "./image-model.js";
export async function encodeImage(file, renderedWidth, legacy = false) {
  if (
    !IMAGE_TYPES.includes(file?.type) &&
    !(legacy && file?.type === "image/gif")
  )
    throw new Error("Choose a PNG, JPEG, WebP, or AVIF image.");
  if (legacy && file.type === "image/gif") {
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read that image."));
      reader.readAsDataURL(file);
    });
    const image = new Image();
    image.src = url;
    await image.decode();
    return url;
  }
  const bitmap = await createImageBitmap(file);
  try {
    const cap = Math.min(
        1200,
        Math.max(1, Math.round((renderedWidth || 1200) * 2)),
      ),
      scale = Math.min(1, cap / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image encoding is unavailable.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.85);
  } finally {
    bitmap.close?.();
  }
}
