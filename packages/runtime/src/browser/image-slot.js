window.CodexImagesReady = import("./image-runtime.js").then(
  async ({ imageStore }) => {
    await imageStore.ready;
    await Promise.all(
      [...document.querySelectorAll("image-slot")].map((slot) =>
        slot.settled?.(),
      ),
    );
  },
);
