// Frame capture adapter. Timeline readiness and frame verification belong to the workflow.
export async function chromiumCapture(page, { method, width, height, scale }) {
  let session;
  const flags = [];
  const fast = method === "fast";
  try {
    if (fast) {
      session = await page.context().newCDPSession(page);
      await page.evaluate(() => {
        const style = document.createElement("style");
        style.dataset.studioCaptureCaret = "";
        style.textContent =
          "input,textarea,[contenteditable]{caret-color:transparent!important}";
        document.head.append(style);
      });
    }
  } catch (error) {
    await session?.detach().catch(() => {});
    throw error;
  }
  return {
    get method() {
      return method;
    },
    flags,
    async capture() {
      if (session) {
        const response = await session.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: false,
          optimizeForSpeed: true,
          clip: { x: 0, y: 0, width, height, scale },
        });
        const png = Buffer.from(response.data, "base64");
        // A separate session can differ across Chromium versions: preserve supersampling.
        if (
          png.length >= 24 &&
          png.readUInt32BE(16) === Math.round(width * scale) &&
          png.readUInt32BE(20) === Math.round(height * scale)
        )
          return png;
        await session.detach();
        session = undefined;
        method = "standard";
        flags.push({
          kind: "fast_capture_fallback",
          message:
            "Fast PNG dimensions differed from the requested capture scale; standard capture preserved framing",
        });
      }
      return page.screenshot({ type: "png" });
    },
    async close() {
      await session?.detach().catch(() => {});
      if (fast)
        await page
          .evaluate(() => {
            document
              .querySelectorAll("style[data-studio-capture-caret]")
              .forEach((style) => style.remove());
          })
          .catch(() => {});
    },
  };
}
