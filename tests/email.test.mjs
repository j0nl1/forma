import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { temporary } from "./helpers.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";

const starter = path.resolve("catalog/documents/email/email.html");

test("email remains readable and responsive with header styles stripped", async (t) => {
  const dir = await temporary(t);
  const source = await fs.readFile(starter, "utf8");
  assert.ok(Buffer.byteLength(source) < 100000);
  assert.match(source, /<!--\[if mso\]>/);
  await fs.writeFile(path.join(dir, "email.html"), source);
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const width of [1440, 360]) {
    await withPage(
      url + "email.html",
      async (page) => {
        for (const stripped of [false, true]) {
          if (stripped)
            await page
              .locator("head style")
              .evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
          const state = await page.evaluate(() => {
            const card = document.querySelector(".email-card");
            const action = document.querySelector("a");
            const preheader = document.body.firstElementChild;
            return {
              overflow: document.documentElement.scrollWidth > innerWidth,
              width: card.getBoundingClientRect().width,
              tables: [...document.querySelectorAll("table")].every(
                (node) =>
                  node.getAttribute("role") === "presentation" &&
                  node.hasAttribute("width") &&
                  node.getAttribute("cellspacing") === "0" &&
                  node.getAttribute("cellpadding") === "0" &&
                  node.getAttribute("border") === "0",
              ),
              unsafe: document.querySelectorAll(
                "script:not([data-codex-fixed-sheet-runtime]),link[rel=stylesheet],button,form,img",
              ).length,
              preheader: {
                tag: preheader.localName,
                visible: getComputedStyle(preheader).display !== "none",
                length: preheader.textContent.trim().replace(/\s+/g, " ")
                  .length,
              },
              action: {
                background: getComputedStyle(action.closest("td"))
                  .backgroundColor,
                display: getComputedStyle(action).display,
                color: getComputedStyle(action).color,
                href: action.getAttribute("href"),
              },
              bodyText: document.body.innerText,
            };
          });
          assert.equal(state.overflow, false);
          assert.ok(Math.abs(state.width - Math.min(600, width - 24)) < 1);
          assert.equal(state.tables, true);
          assert.equal(state.unsafe, 0);
          assert.equal(state.preheader.tag, "span");
          assert.equal(state.preheader.visible, false);
          assert.ok(
            state.preheader.length > 0 && state.preheader.length <= 100,
          );
          assert.deepEqual(state.action, {
            background: "rgb(39, 93, 173)",
            display: "block",
            color: "rgb(248, 246, 241)",
            href: "https://example.com/review",
          });
          assert.match(state.bodyText, /Ready for your next step/);
          assert.match(state.bodyText, /required footer before sending/);
          if (process.env.CODEX_CAPTURE_EMAIL) {
            await fs.mkdir(process.env.CODEX_CAPTURE_EMAIL, {
              recursive: true,
            });
            await page.screenshot({
              path: path.join(
                process.env.CODEX_CAPTURE_EMAIL,
                `email-${width}-${stripped ? "inline" : "full"}.png`,
              ),
              fullPage: true,
            });
          }
        }
      },
      { width, height: 800 },
    );
  }
});
