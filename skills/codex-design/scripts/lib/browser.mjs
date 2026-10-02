import { chromium } from "playwright";
import { localUrl } from "./files.mjs";
import {
  fontOrigins as normalizeFontOrigins,
  fontRequestAllowed,
  fulfillFontRequest,
} from "./font-network.mjs";
export async function withPage(
  url,
  fn,
  { width = 1440, height = 1000, deviceScaleFactor = 1, fontOrigins = [] } = {},
) {
  url = localUrl(url);
  fontOrigins = normalizeFontOrigins(fontOrigins);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor,
      serviceWorkers: "block",
    });
    await context.route("**/*", async (route) => {
      try {
        const u = new URL(route.request().url());
        if (["data:", "blob:"].includes(u.protocol)) return route.continue();
        const request = route.request();
        let local = false;
        try {
          localUrl(u.href);
          local = true;
        } catch {
          /* Consult the configured font origins below. */
        }
        if (local && !["font", "stylesheet"].includes(request.resourceType()))
          await route.continue();
        else {
          if (
            !fontRequestAllowed(
              u.href,
              request.method(),
              request.resourceType(),
              fontOrigins,
            )
          )
            throw new Error("Unconfigured remote resource");
          await fulfillFontRequest(route, fontOrigins);
        }
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("response", (res) => {
      if (res.status() >= 400)
        errors.push(`HTTP ${res.status()}: ${res.url()}`);
    });
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.evaluate(async () => {
      const readiness = [
        window.CodexDeckReady,
        window.CodexCanvasReady,
        window.CodexPlainCanvasReady,
        window.CodexCampaignReady,
        window.CodexOverlayReady,
        window.Codex3DReady,
        window.CodexDocumentReady,
        window.CodexFixedSheetReady,
        window.CodexTextReady,
        window.CodexImagesReady,
        window.CodexFramesReady,
        window.CodexFileWindowsReady,
        window.CodexSocialReady,
        window.CodexPostsReady,
        window.CodexSystemReviewReady,
        window.CodexStoriesReady,
        window.CodexSocialFramesReady,
        window.CodexXReady,
        window.CodexInstagramReady,
        window.CodexTikTokReady,
        window.CodexFacebookReady,
        window.CodexLinkedInReady,
        window.CodexPinterestReady,
        window.CodexRedditReady,
        window.CodexYouTubeReady,
      ].filter(Boolean);
      if (readiness.length)
        await Promise.race([
          Promise.all(readiness),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Design runtime did not initialize")),
              8000,
            ),
          ),
        ]);
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
      await Promise.all(
        [...document.images]
          .filter((i) => i.getAttribute("src"))
          .map((i) => i.decode()),
      );
    });
    const result = await fn(page, errors);
    if (errors.length)
      throw new Error(`Browser errors: ${[...new Set(errors)].join("; ")}`);
    return result;
  } finally {
    await browser.close();
  }
}
