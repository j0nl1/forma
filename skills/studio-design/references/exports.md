# Exports and handoff

## Standalone HTML

Run `scripts/export.mjs html <input.html> <output.html>`. The helper parses HTML and CSS using an HTML parser and PostCSS, recursively inlines local classic scripts, stylesheets, CSS imports, fonts, images, SVG references, and srcset, and rejects unresolved or remote assets. Bundle ES modules first with `scripts/build.mjs`. Local raster/SVG image and font imports in JSX are embedded as data URLs by the build helper. Use imports for bundle-authored assets that must travel with the document. Arbitrary JavaScript URL strings and dynamic fetches are not automatically captured; remove them or supply an explicit data embedding strategy. A passing export helper does not establish that arbitrary dynamic code is offline.

## PDF and screenshots

Serve the artifact and run `scripts/export.mjs pdf <loopback-url> <output.pdf>` or `png <loopback-url> <output.png>`. Playwright waits for fonts and images and reports runtime errors. PDFs use print CSS and preserve authored page sizes. Inspect the exported PDF for clipping and page count. For HTML decks, `deck.js` exposes all finished slides during print.

## PowerPoint

Run `scripts/export.mjs pptx <loopback-deck-url> <output.pptx>`. The default mode creates native editable text and simple shapes, isolated CSS paint layers, supported native builds and embedded local media, with explicit fallback warnings. `--pptx-mode screenshots` creates one finished full-slide image per slide; `--pptx-animations static` disables native builds in editable mode. Both modes preserve source order, skip flags, dimensions and speaker notes. Read the [PowerPoint guide](powerpoint.md) for font substitution, media/playback constraints and verification.

## Video

Run `scripts/export.mjs video <loopback-url> <output.mp4|webm|gif> --fps 30`. Requires Chromium and FFmpeg. `CompositionStage` exposes `window.codexTimeline` with `duration`, dimensions, and synchronous `seek(seconds)`. An existing simple `motion-stage` supplies the same basic bridge. A custom bridge may use `setTime` and `setPlaying(false)` instead; select it through configuration and provide dimensions if absent from the bridge.

Use `--start-ms`, `--end-ms`, `--crf`, `--scale`, and `--bridge` for intervals, quality, supersampled capture, and custom bridges. Defaults are 30 fps, quality 18, and 2x capture followed by Lanczos downscaling. A `--config video.json` file accepts `width`, `height`, `duration`, `fps`, `crf`, `deviceScaleFactor`, `startMs`, `endMs`, `bridgeGlobal`, `captureParam`, `hideSelectors`, `resetTransformSelector`, `audio`, and `fontOrigins`. CLI flags override corresponding file values. Dimensions must be even integers from 2 to 4096. GIF encoding uses an adaptive palette.

For an older authored page without active capture framing, `hideSelectors` hides selected chrome and `resetTransformSelector` restores the selected artwork to the requested width/height with no transform or shadow. Persistent selector rules retain those overrides when the renderer recreates artwork between frames. Its first matched parent's flex alignment moves to the top-left, transitions are disabled and page backgrounds become transparent. These fallbacks apply only while capture is inactive. A bridge reporting `captureActive: true` owns its framing and retains its authored layout, even when fallback selectors are configured. Real encoded-frame tests cover both paths.

Local fonts and the engine's packaged Inter work without network configuration. For a reviewed remote font provider, put an explicit origin array in the export configuration, for example `{"fontOrigins":["https://fonts.example","https://assets.example"]}`. This also applies to PNG/PDF exports through `--config`. The document's animation stage needs the same `fontOrigins` prop to embed remote rules into its SVG. These grants permit GET/HEAD font, stylesheet and font-embedding fetch requests, retain CORS, validate each font redirect and rebase CSS against the final response URL. They do not enable remote scripts or writes. The connected editor reads grants from `preview.mjs --font-origins https://fonts.example,https://assets.example`; its browser endpoint refuses caller-supplied grants. Standalone HTML export continues to require local assets, rather than consulting an external font provider during packaging. See [portable motion fonts](motion.md#portable-fonts).

The exporter captures each requested frame, encodes locally, and fails on page errors, invalid timing, or encoding failure. Results include warnings for repeated frames, unfinished fonts, and unrecognized capture framing. Review those warnings against the actual animation before reporting success. A connected local motion editor can invoke the same exporter and download the result; see [motion](motion.md). Recording does not upload the design.

### Audio

`audio: "auto"` is the default for MP4/WebM. Marked media inside the export root contributes its audio stream. `VideoSprite` supplies the markers automatically; native `muted` prevents independent preview sound and does not disable this explicit export contract. A clip without an audio stream produces silent output. Use `--audio none`, `audio: "none"` in configuration, or uncheck **Include marked media audio** in the editor for the earlier silent encoder behavior. GIF cannot contain audio and reports that limitation when marked sound is present.

Source markers are `data-codex-exportable-video-play-start` and `data-codex-exportable-video-play-end` in source seconds, plus optional `data-codex-exportable-video-play-speed` (positive, default 1). The source interval loops with phase `globalTime % ((end - start) / speed)`. Sub-range exports preserve that phase. Speed changes preserve pitch. An optional nonnegative `data-codex-exportable-video-volume` overrides the media element's `volume`; otherwise its volume is used. Multiple tracks add together; samples exceeding full scale are clipped, so balance loud tracks before export.

Standalone sound can use an `<audio>` element with the same markers:

```html
<audio src="./ambience.wav" muted
  data-codex-exportable-video-play-start="0"
  data-codex-exportable-video-play-end="8"
  data-codex-exportable-video-volume="0.4"></audio>
```

Keep it inside the stage. Marked media contributes while present in the exported tree, including media hidden by CSS; remove it or set its export volume to zero for silence. Mount/unmount and gain changes are sampled on the selected video frame grid; the audio itself is mixed at 48 kHz. Export snapshots a source on its first audible appearance, before scene removal can revoke a blob URL. Local HTTP, data and blob media are supported; remote/file URLs and remote redirects are refused. Sources remain local temporary files and are deleted on completion or failure. FFmpeg and FFprobe are required. MP4 uses AAC, WebM uses Opus, and the video stream is preserved during muxing.

The result reports `audio`, `audioTracks` (distinct source range/speed stems), and `audioSegments`. Real-stream tests verify looping, speed/pitch, sub-range phase, overlapping clips, gain changes, source lifetime, silence, and editor download. Activation uses the selected frame grid; listen to the final encoded audio when timing or mixing quality matters.

## Figma, Canva, and implementation

Use an available, authorized connector for a requested send-to-Figma or Canva action. Read that connector's skill and verify destination and result. Without one, provide editable HTML, local assets, tokens, dimensions, and interaction notes as a handoff package and clearly say transfer did not occur. Do not invent upload URLs or claim native editability after a raster export.

A Codex implementation handoff stays in the current repository or a user-requested new chat. Explain the state model, component boundaries, tokens, dependencies, and verified flow. Do not message other chats or publish without authorization. PowerPoint handoff uses the local editable or screenshot exporter described above.
