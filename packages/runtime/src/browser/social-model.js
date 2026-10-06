export const postPlatforms = {
  x: { sub: "@yourbrand · 2h", reactions: ["♡ 1.2K", "↺ 340", "💬 88"] },
  linkedin: { sub: "Company · 2h", reactions: ["👍 847", "💬 63", "↗ Share"] },
  facebook: { sub: "2h · 🌐", reactions: ["👍 Like", "💬 Comment", "↗ Share"] },
  reddit: {
    sub: "r/design · Posted by u/yourbrand · 5h",
    reactions: ["💬 128 Comments", "↗ Share", "⭐ Award"],
  },
};
export const assetOnly = (node) =>
  ["", "true"].includes(node?.getAttribute("image-only"));
export const frameSelector = "[data-codex-frame-export],[data-om-frame-export]";
export const frameLabel = (frame) =>
  frame.getAttribute("data-codex-frame-label") ||
  frame.getAttribute("data-om-frame-label") ||
  "Frame";
export function nominalFrame(frame) {
  const label = frameLabel(frame),
    match = label.match(/(?:^|\s|·)(\d+)\s*[×x]\s*(\d+)\s*$/i);
  const width = Number(
      frame.getAttribute("data-codex-frame-width") ||
        match?.[1] ||
        frame.offsetWidth,
    ),
    height = Number(
      frame.getAttribute("data-codex-frame-height") ||
        match?.[2] ||
        frame.offsetHeight,
    );
  if (
    ![width, height].every((value) => Number.isSafeInteger(value) && value > 0)
  )
    throw new Error("Choose positive integer nominal frame dimensions.");
  return {
    label,
    title: label.replace(/\s*·?\s*\d+\s*[×x]\s*\d+\s*$/i, "").trim() || "Frame",
    width,
    height,
  };
}
export function assetName(title, used = new Set()) {
  const base =
    title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "Frame";
  let name = base + ".png",
    index = 2;
  while (used.has(name.toLowerCase())) name = `${base}-${index++}.png`;
  used.add(name.toLowerCase());
  return name;
}
