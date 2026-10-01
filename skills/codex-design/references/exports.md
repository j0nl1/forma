# Exports and handoff

## Standalone HTML

Run `scripts/export.mjs html <input.html> <output.html>`. The helper parses HTML and CSS using an HTML parser and PostCSS, recursively inlines local classic scripts, stylesheets, CSS imports, fonts, images, SVG references, and srcset, and rejects unresolved or remote assets. Bundle ES modules first with `scripts/build.mjs`. Dynamic JavaScript fetches are not automatically captured; remove them or supply an explicit data embedding strategy. A passing export helper does not establish that arbitrary dynamic code is offline.

## PDF and screenshots

Serve the artifact and run `scripts/export.mjs pdf <loopback-url> <output.pdf>` or `png <loopback-url> <output.png>`. Playwright waits for fonts and images and reports runtime errors. PDFs use print CSS and preserve authored page sizes. Inspect the exported PDF for clipping and page count. For HTML decks, `deck.js` exposes all finished slides during print.

## Video

Run `scripts/export.mjs video <loopback-url> <output.mp4|webm|gif> --fps 30`. Requires Chromium and FFmpeg. The page must expose `window.codexTimeline` with `duration`, `width`, `height`, and a synchronous `seek(seconds)` that renders a deterministic frame. The timeline starter supplies this bridge. The exporter captures each requested frame, encodes locally, and fails on page errors, invalid duration, or encoding failure. Output is silent; do not imply audio was preserved. Recording does not upload the design.

## Figma, Canva, and implementation

Use an available, authorized connector for a requested send-to-Figma or Canva action. Read that connector's skill and verify destination and result. Without one, provide editable HTML, local assets, tokens, dimensions, and interaction notes as a handoff package and clearly say transfer did not occur. Do not invent upload URLs or claim native editability after a raster export.

A Codex implementation handoff stays in the current repository or a user-requested new chat. Explain the state model, component boundaries, tokens, dependencies, and verified flow. Do not message other chats or publish without authorization. PowerPoint export is excluded.
