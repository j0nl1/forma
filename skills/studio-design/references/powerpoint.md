# PowerPoint presentations

Author and preview a discrete HTML deck using the [slides recipe](slides.md), then export a real `.pptx` locally. The exporter requires exactly one initialized `deck-stage`; a scrolling web page is not a slide deck. Copy all companion modules or bundle `deck.js` first. Do not change the user's existing HTML design merely to simplify export.

## Install and export

Run `npm ci --ignore-scripts` in the checkout or installed skill, then `npx playwright install chromium`. PowerPoint generation uses pinned PptxGenJS 4.0.1 and Chromium on Linux, macOS and Windows. It does not require Office, a connector, a model key or an upload. Install local fonts used by the deck. PowerPoint recipients need the corresponding fonts for editable text.

Keep the preview server running while exporting:

```sh
node <skill>/scripts/preview.mjs /absolute/path/to/design --port 4311
node <skill>/scripts/export.mjs pptx http://127.0.0.1:4311/deck.html /absolute/path/to/deck.pptx
```

The default `editable` mode converts visible text into native PowerPoint text boxes, solid backgrounds and uniform borders into native shapes, and images into individual PowerPoint pictures. Measured text lines retain the browser's authored line breaks; inline formatting and HTTP(S)/mailto text links are preserved. SVG, canvas, custom elements, gradients, transforms, shadows, masks, complex borders and other unsupported CSS subtrees become pictures. The result reports how many native and raster objects were created and identifies those fallbacks. Tables retain editable cell text and simple cell shapes rather than becoming native PowerPoint tables; charts remain rendered artwork rather than editable data series.

Choose `screenshots` when the required handoff is the rendered appearance rather than editing individual objects:

```sh
node <skill>/scripts/export.mjs pptx http://127.0.0.1:4311/deck.html /absolute/path/to/deck-images.pptx --pptx-mode screenshots --scale 2
```

This places one full-slide PNG on each PowerPoint slide. Scale is 1–4 and affects capture resolution, not the physical slide size. The default is 1. Never describe a screenshot deck as independently editable text or shapes.

## Slides, notes and fonts

Both modes retain source slide order and aspect ratio, omit `data-deck-skip` slides, capture the finished print composition without stage navigation, and attach speaker notes. Notes resolve in this order: `data-speaker-notes`, a descendant `[data-notes]`, then the original slide index in `#speaker-notes` JSON. Empty authored notes override the indexed fallback. Notes stay out of the slide artwork. Malformed notes fail rather than silently attaching misleading text. A deck with no visible slides fails. Output must end in `.pptx`; existing files are never overwritten, and failed exports remove their temporary file.

Use local fonts by default. For an explicit font substitution, pass an export configuration:

```json
{
  "pptxMode": "editable",
  "deviceScaleFactor": 2,
  "fontSwaps": [{ "from": "BrandSans", "to": "Arial" }]
}
```

```sh
node <skill>/scripts/export.mjs pptx http://127.0.0.1:4311/deck.html /absolute/path/to/deck.pptx --config export.json
```

Substitution happens before capture so the source layout reflows with the chosen font. Ensure that replacement font is installed and inspect the result; substitution does not embed fonts into PowerPoint. The existing `fontOrigins` configuration permits explicitly reviewed read-only font providers. It grants no remote scripts or transfers. The browser exporter retains its loopback-input and local-asset rules.

## Verify and deliver

Read the export result's `warnings`. Identical adjacent artwork can be intentional, but may indicate repeated content. Raster fallback warnings identify which parts cannot be edited separately. Open the `.pptx` in the recipient's application, inspect first/middle/final slides, edit a text box, verify image placement and private notes, and check clipping, fonts and line wrapping. A valid ZIP alone does not prove visual fidelity. Keep the editable HTML and local assets with the PowerPoint handoff.

HTML's 44 build effects remain available in the browser. PowerPoint exports currently contain their finished static artwork; they do not translate those effects into native PowerPoint animations or embed playable video/audio. Raster fallback can flatten overlapping or complex subtrees. Editable typography is approximate across different font engines, and CSS stacking/layout combinations need visual inspection. Use screenshot mode when that tradeoff is inappropriate. Report these specific constraints without claiming that PowerPoint itself is unsupported.
