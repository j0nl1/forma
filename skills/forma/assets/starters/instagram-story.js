// Compose the locally supplied phone and image editor before defining the viewer.
window.CodexStoriesReady = (async () => {
  if (!customElements.get("ios-shell")) await import("./platform-shells.js");
  if (!customElements.get("image-slot")) await import("./image-runtime.js");
  await import("./instagram-story-runtime.js");
  await Promise.all(
    [...document.querySelectorAll("instagram-story")].map((story) =>
      story.image?.settled?.(),
    ),
  );
})();
