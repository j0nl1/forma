import { chromium } from "playwright";
import { localUrl } from "./files.mjs";
export async function withPage(
  url,
  fn,
  { width = 1440, height = 1000, deviceScaleFactor = 1 } = {},
) {
  url = localUrl(url);
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
        localUrl(u.href);
        await route.continue();
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
      const readiness = [window.CodexDeckReady, window.CodexCanvasReady].filter(
        Boolean,
      );
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
