// Chromium's native media controls can keep a loading animation after the frame
// is decoded. Their internal animations are not exposed by getAnimations().
export async function settlePptxControls(page, index) {
  const boxes = await page.evaluate((index) => {
    const root = document.querySelector("deck-stage").slides[index];
    const origin = root.getBoundingClientRect();
    return [
      ...root.querySelectorAll("video[controls],audio[controls]"),
    ].flatMap((element) => {
      const box = element.getBoundingClientRect(),
        style = getComputedStyle(element);
      if (
        !box.width ||
        !box.height ||
        style.visibility === "hidden" ||
        !Number(style.opacity)
      )
        return [];
      const x = Math.max(0, box.x - origin.x),
        y = Math.max(0, box.y - origin.y);
      const w = Math.min(origin.width, box.right - origin.x) - x,
        h = Math.min(origin.height, box.bottom - origin.y) - y;
      return w > 0 && h > 0 ? [{ x, y, w, h, width: origin.width }] : [];
    });
  }, index);
  if (!boxes.length) return [];
  const locator = page.locator("deck-stage > [data-deck-slide]").nth(index);
  const deadline = Date.now() + 2500;
  let previous,
    stable = 0;
  while (Date.now() < deadline) {
    const data = await locator.screenshot({
      type: "png",
      animations: "disabled",
    });
    const fingerprint = await page.evaluate(
      async ({ data, boxes }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        let hash = 2166136261;
        for (const box of boxes) {
          const scale = image.width / box.width;
          const pixels = context.getImageData(
            Math.floor(box.x * scale),
            Math.floor(box.y * scale),
            Math.max(1, Math.floor(box.w * scale)),
            Math.max(1, Math.floor(box.h * scale)),
          ).data;
          for (const byte of pixels)
            hash = Math.imul(hash ^ byte, 16777619) >>> 0;
        }
        return hash;
      },
      { data: data.toString("base64"), boxes },
    );
    stable = fingerprint === previous ? stable + 1 : 1;
    if (stable >= 3) return [];
    previous = fingerprint;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return [
    "Native HTML media controls did not settle within 2.5 seconds; the poster may include a transient control animation.",
  ];
}
