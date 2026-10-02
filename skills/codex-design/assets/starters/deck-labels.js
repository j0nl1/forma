// Keep authored names stable while the deck assigns their current position.
export function slideLabel(slide) {
  const explicit = slide.getAttribute("data-label");
  if (explicit) return explicit;
  const prior = slide.getAttribute("data-screen-label");
  if (prior) return prior.replace(/^\s*\d+\s*/, "").trim() || prior;
  const heading = slide.querySelector("h1,h2,h3,[data-title]");
  return heading?.textContent?.trim().slice(0, 40) || "Slide";
}
