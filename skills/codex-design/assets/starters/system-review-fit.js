export function fitCard(section, viewport, host, body, card) {
  let height = card.height,
    queued = false;
  function fit() {
    queued = false;
    const scale = Math.min(1, section.clientWidth / card.width);
    if (!(scale > 0)) return;
    // Measure in author coordinates. Width alone determines scaling.
    const extent = Math.max(
      body.scrollHeight + body.offsetTop,
      ...[...body.children].map(
        (node) =>
          (node.getBoundingClientRect().bottom -
            host.getBoundingClientRect().top) /
          (Number(host.dataset.scale) || 1),
      ),
    );
    if (extent > height + 1)
      height = Math.min(Math.max(extent, height), Math.max(card.height, 4000));
    host.style.width = card.width + "px";
    host.style.minHeight = card.height + "px";
    host.style.height = height + "px";
    host.style.transform = `scale(${scale})`;
    host.dataset.scale = String(scale);
    viewport.style.width = Math.ceil(card.width * scale) + "px";
    viewport.style.height = Math.ceil(height * scale) + "px";
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(fit);
  }
  const resize = new ResizeObserver(schedule);
  resize.observe(section);
  resize.observe(body);
  new MutationObserver(schedule).observe(body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  body.addEventListener("load", schedule, true);
  window.addEventListener("resize", schedule);
  document.fonts.ready.then(schedule);
  schedule();
  return schedule;
}
