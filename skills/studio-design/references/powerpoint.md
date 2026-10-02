# PowerPoint presentations

Author and preview a discrete HTML deck using the [slides recipe](slides.md), then export a real `.pptx` locally. The exporter requires exactly one initialized `deck-stage`; a scrolling web page is not a slide deck. Copy all companion modules or bundle `deck.js` first. Do not change the user's existing HTML design merely to simplify export.

## Install and export

Run `npm ci --ignore-scripts` in the checkout or installed skill, then `npx playwright install chromium`. PowerPoint generation uses pinned PptxGenJS 4.0.1 and Chromium on Linux, macOS and Windows. It does not require Office, a connector, a model key or an upload. Install local fonts used by the deck or provide their exact files with `pptxFonts` as described below. Unembedded text needs the corresponding fonts in the receiving application.

Keep the preview server running while exporting:

```sh
node <skill>/scripts/preview.mjs /absolute/path/to/design --port 4311
node <skill>/scripts/export.mjs pptx http://127.0.0.1:4311/deck.html /absolute/path/to/deck.pptx
```

The default `editable` mode converts visible text into native PowerPoint text boxes, solid backgrounds and uniform borders into native shapes, and images into individual PowerPoint pictures. Measured text lines retain the browser's authored line breaks; inline formatting and HTTP(S)/mailto text links are preserved. Gradient backgrounds, rounded corners, complex borders and ordinary box shadows use isolated picture layers while foreground text and children remain editable. Composed positive uniform 2D scaling, translation and rotation retain native foreground geometry, including nested transforms, authored pivots, scaled text and borders. Isolated paint is captured in its local frame and receives the native rotation once. Rounded overflow containers and CSS inset clips retain editable foreground when its painted bounds fit safely inside the clip. Skew, nonuniform/3D transforms, masks, boundary-crossing clipping, SVG, canvas, custom elements and inseparable stacking can still require a whole-subtree picture. The result reports editable, raster and media object counts and identifies those fallbacks. Tables retain editable cell text and simple cell shapes rather than becoming native PowerPoint tables; charts remain rendered artwork rather than editable data series.

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

Substitution happens before capture so the source layout reflows with the chosen font. Ensure that replacement font is installed or supplied below and inspect the result; substitution alone does not embed fonts into PowerPoint. The existing `fontOrigins` configuration permits explicitly reviewed read-only font providers. It grants no remote scripts or transfers. The browser exporter retains its loopback-input and local-asset rules.

## Portable editable fonts

Supply explicit local static TTF or OTF files to load the exact source bytes in Chromium and embed the used font families in the PPTX:

```json
{
  "pptxFonts": [
    { "path": "/absolute/path/to/fonts/LiberationSans-Regular.ttf" },
    { "path": "/absolute/path/to/fonts/LiberationSans-Bold.ttf" }
  ],
  "fontSwaps": [{ "from": "BrandSans", "to": "Liberation Sans" }]
}
```

Run the existing export command with `--config export.json`. File paths must be absolute local filesystem paths; the exporter does not discover or download fonts. Supply at most 64 files, with a maximum of 32 MiB per file and 128 MiB in total. Use the files' actual family names in the source; use `fontSwaps` for explicit source aliases. Files load before layout capture, and the embedded full EOT payload contains those same font bytes. Regular, bold, italic and bold-italic variants are matched from font metadata. Include the variants used by the slide text; duplicate faces for the same family/style are rejected. `embeddedFonts` reports the families and faces included; warnings identify unembedded families, missing variants and unavailable glyphs. Unused supplied families are omitted with a warning.

Embedding validates the font's actual embedding flags. Restricted, preview/print-only and bitmap-only fonts are rejected for editable embedding. Variable fonts, collections and WOFF/WOFF2 are not supported by this embedding path; supply static TTF/OTF faces. No Office, Python or font-conversion service is required. Screenshot mode can use supplied fonts to render its images but contains no editable text or embedded-font list.

Applications must support PowerPoint embedded fonts to use them. LibreOffice added PPTX embedded-font import in [version 25.8](https://whatsnew.libreoffice.org/25.8/); earlier versions substitute local fonts even when the PPTX contains valid embedded font parts. Use LibreOffice 25.8 or newer with EOT support, or install the corresponding fonts when using an older receiver. Check the receiving application; this feature packages the fonts without installing them on that system. The HTML source and all font files stay unchanged.

## Verify and deliver

Read the export result's `warnings`. Identical adjacent artwork can be intentional, but may indicate repeated content. Raster fallback warnings identify which parts cannot be edited separately. Open the `.pptx` in the recipient's application, inspect first/middle/final slides, edit a text box, verify image placement and private notes, and check clipping, fonts and line wrapping. A valid ZIP alone does not prove visual fidelity. Keep the editable HTML and local assets with the PowerPoint handoff.

## Native builds and local media

Editable exports provide native counterparts for all 44 `data-anim` effect names on eligible targets. Scalar effects use the shared browser keyframes; mask families use native presentation filters and therefore can differ in geometry or pattern. The exporter reuses the HTML effect parser and click/with/after schedule, including authored order, delays, duration, repeat and eligible auto-reversal. Read the result's `nativeAnimations`, `staticAnimations` and `warnings`; an unsupported target remains static with a specific reason. Eligible scalar builds retain composed base transforms and custom CSS transform origins through sampled native position compensation. Nested transform-only builds can compose `spin`, `grow`, `shrink`, `teeter` and `path` on separate editable artwork groups, preserving the shared click/with/after schedule. This path supports at most eight connected builds and 32 artwork groups, without repeated builds. It avoids native parent/child animation groups because the tested Impress player ignores child motion while its ancestor animates. Nested masks, visibility/group-opacity composition, repeated builds, moving artwork clipped by ancestors, transformed native filters and targets containing playable media retain explicit fallbacks. Flattened or inseparable artwork still cannot animate independently. The HTML's 44 effects remain available in the browser. Native presentation applications can render easing, masks and trajectories differently, so inspect actual slideshow playback. The rectangular `box-out` exit includes a constant native rotation of one OOXML angular unit (1/60000 degree) to bypass an Impress repaint defect for shrinking rectangular clips. The adjustment is reported in the export diagnostics. Playback checks verify progressive center clipping, clean completion and repeat reset without changing the HTML source.

Use `--pptx-animations static` to export the finished artwork without native builds. The equivalent configuration is `"pptxAnimations": "static"`. Screenshot mode always captures finished artwork; it does not animate independent objects.

Eligible local `<video>` and `<audio>` sources are embedded in editable exports as playable media, with a single captured cover on the native media object. A separate overlay poster is omitted because it can obscure playback during native builds. Capture waits for a decoded paused frame and checks visible native controls for a bounded settling period; inspect any settling warning. Inseparable effects such as a shadowed or transformed media subtree can require a static picture instead, with a specific warning. Unadjusted sources retain their original file bytes inside the PPTX. Source ranges, playback speed and volume/mute settings use a bounded local playback copy when required; the HTML and source assets stay unchanged. No hosted link or external transfer is created. HTTP media must use the deck's own loopback origin, redirects are checked, and each snapshot is limited to 128 MiB. Local same-origin blobs and data URLs are also supported. Missing, unreadable or unrecognized sources for an embedded media object fail the export rather than producing a broken player.

Playback reads the HTML element's current position, playback rate, volume/mute, loop and autoplay settings. Existing [VideoSprite](motion.md) audio-export markers take precedence for their authored source range, speed and gain because its native element is deliberately muted during deterministic capture. Plain HTML temporal `#t=` fragments have a one-shot end boundary in Chromium, which differs from VideoSprite's periodic source interval. Before that declared boundary, the native copy trims its first playback and disables repetition. A captured position beyond the boundary continues toward source end. The browser's private consumed-pause state cannot be recovered from the element; native copies cannot reproduce its later manual resume or the browser timer's possible overshoot. Inspect `fragmentEnd`, `fragmentBoundary` and the specific warnings rather than treating this as a periodic VideoSprite range. A local FFmpeg/FFprobe conversion applies source ranges, rate and gain to the embedded media, including pitch preservation when requested. A looping source with a nonzero initial position retains the complete cycle by rotating its source segments. Unadjusted sources do not require these tools.

Adjusted playback copies are H.264/AAC MP4 for video or PCM WAV for audio. Video copies resample frames after retiming, with output frame rate bounded to 1–120 fps, and validate encoded duration and tracks before embedding. Each source and derived output is limited to 128 MiB; conversions reject frames beyond 8192 pixels or 32 megapixels, playback cycles beyond one hour, rates outside 1/16–16 and invalid gains. Plain HTML volume is 0–1; existing audio-export marker gain can be any finite nonnegative value, including an authored boost. Failed conversions remove their temporary files. The export result's `mediaPlayback` entries identify the source slide/object, original or derived embedding, source range, initial position, rate, pitch mode, gain, duration, output frame rate, changes, source/embedded byte counts, SHA-256 hashes and any fragment-boundary diagnostics.

Loop and automatic/manual activation intent are encoded in native PowerPoint timing. These fields are not proof of playback in every receiver: real LibreOffice 25.8.7.3 checks played the clip once despite importing the loop count, and started media on slide entry despite an on-click trigger. Microsoft PowerPoint playback has not been verified. The exporter reports these receiver limits explicitly; an infinite loop cannot be replaced faithfully by a finite derived file. Check the target application's slideshow player. The cover retains HTML appearance, but native playback can differ for CSS decoration, clipping or object fitting; warnings identify these cases. Audio without a visible HTML control is embedded off-slide and requires moving its control onto the slide for manual playback. Codec support depends on the recipient's application; use a supported H.264/AAC MP4 or standard WAV/MP3 when portability matters and verify playback there. Screenshot mode retains only slide artwork.

Raster fallback can flatten overlapping or complex subtrees and prevent independent animation of their children. Editable typography is approximate across different font engines, and CSS stacking/layout combinations need visual inspection. Use screenshot mode when that tradeoff is inappropriate. Report these specific constraints without claiming that PowerPoint itself is unsupported.
