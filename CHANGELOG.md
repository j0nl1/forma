# Changelog

## Unreleased

- Fixed progressive native box-out clipping and stale outlines in Impress through a bounded one-angular-unit animation adjustment, with strict pixel and repeat regression coverage.

- Added explicit static TTF/OTF font snapshots and full PowerPoint font embedding, with actual family/style/glyph coverage diagnostics.
- Retained editable foreground under uniform positive 2D scale/translation and safely inset rounded clips; corrected native border bounds and translucent-border paint.

- Added local PowerPoint export from HTML decks: native editable text/shapes, individual pictures, screenshot mode, slide order/skip handling, notes, font substitutions and explicit fidelity warnings.
- Extended editable PowerPoint export with isolated CSS background layers, native build timing, embedded local audio/video and an explicit static-build option.
- Fixed stale first-visible nested-video frames by retrying paused Chromium surface submission after visibility paint, with actual encoded entry/held-frame regression coverage.
- Fixed CI verification by installing Poppler and removing a personal screenshot path from a deck test.

- Renamed the project and skill to Studio Design, with `$studio-design` invocation, updated package metadata, installation paths and examples.
- Consolidated product documentation around supported capabilities and known limitations.

- Restored authored data/feedback overlays with live planar geometry, deterministic callouts, spectra, scoped fading, sentence navigation, provenance, source reloads, review drafts and standalone JSON/JS data exports.

- Restored the general chart stage contract with local pinned D3/Sankey, keyed redraws, container resizing, zoom/pan/pinch, inert hover/tap tooltips, refresh transitions, empty/error recovery and real SVG/2× PNG downloads. Added the chart laboratory and installation/authoring guide.

- Restored the continuous React composition model, named authored cues, persistent shots, single captions, full easing families, section duration/speed editing, finite repetition, keyboard controls, hover previews, and browser timing/playhead/editor persistence.
- Added opt-in local timing source write-back with version conflict detection and an actual video export/download panel.
- Restored video intervals, configurable quality, supersampling/downscaling, custom timeline bridges, palette-optimized GIF encoding, and duplicate-frame/font diagnostics.
- HTML presentations and editable/image-based PowerPoint exports are supported.

## 1.0.0 — October 1, 2026

- Independently implemented a Codex-native design skill with 13 routed project types.
- Added native browser starters, local preview, design systems, offline Figma inventory, parsed standalone export, PDF/image capture, and deterministic silent video export.
- Added staged installation, conflict-aware updates, examples, tests, and installation/usage/maintenance documentation.
- Kept orchestration specific to Codex and explicitly configured providers.
- Documented Figma, animation vocabulary, platform-shell fidelity, connector, and audio limitations.
