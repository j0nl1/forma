# Exports and handoff

## Standalone HTML

Run `scripts/export.mjs html <input.html> <output.html>`. The helper parses HTML and CSS using an HTML parser and PostCSS, recursively inlines local classic scripts, stylesheets, CSS imports, fonts, images, SVG references, and srcset, and rejects unresolved or remote assets. Bundle ES modules first with `scripts/build.mjs`. Dynamic JavaScript fetches are not automatically captured; remove them or supply an explicit data embedding strategy. A passing export helper does not establish that arbitrary dynamic code is offline.

## PDF and screenshots

Serve the artifact and run `scripts/export.mjs pdf <loopback-url> <output.pdf>` or `png <loopback-url> <output.png>`. Playwright waits for fonts and images and reports runtime errors. PDFs use print CSS and preserve authored page sizes. Inspect the exported PDF for clipping and page count. For HTML decks, `deck.js` exposes all finished slides during print.

## Video

Run `scripts/export.mjs video <loopback-url> <output.mp4|webm|gif> --fps 30`. Requires Chromium and FFmpeg. `CompositionStage` exposes `window.codexTimeline` with `duration`, dimensions, and synchronous `seek(seconds)`. An existing simple `motion-stage` supplies the same basic bridge. A custom bridge may use `setTime` and `setPlaying(false)` instead; select it through configuration and provide dimensions if absent from the bridge.

Use `--start-ms`, `--end-ms`, `--crf`, `--scale`, and `--bridge` for intervals, quality, supersampled capture, and custom bridges. Defaults are 30 fps, quality 18, and 2x capture followed by Lanczos downscaling. A `--config video.json` file accepts `width`, `height`, `duration`, `fps`, `crf`, `deviceScaleFactor`, `startMs`, `endMs`, `bridgeGlobal`, `captureParam`, `hideSelectors`, `resetTransformSelector`, and `audio`. CLI flags override corresponding file values. Dimensions must be even integers from 2 to 4096. GIF encoding uses an adaptive palette.

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

The result reports `audio`, `audioTracks` (distinct source range/speed stems), and `audioSegments`. Real-stream tests verify looping, speed/pitch, sub-range phase, overlapping clips, gain changes, source lifetime, silence, and editor download. The hosted implementation is unavailable for direct comparison; frame-grid activation and mixing quality still need broader representative comparisons before full parity is claimed.

## Figma, Canva, and implementation

Use an available, authorized connector for a requested send-to-Figma or Canva action. Read that connector's skill and verify destination and result. Without one, provide editable HTML, local assets, tokens, dimensions, and interaction notes as a handoff package and clearly say transfer did not occur. Do not invent upload URLs or claim native editability after a raster export.

A Codex implementation handoff stays in the current repository or a user-requested new chat. Explain the state model, component boundaries, tokens, dependencies, and verified flow. Do not message other chats or publish without authorization. PowerPoint export is excluded.
