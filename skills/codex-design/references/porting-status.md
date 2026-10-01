# Functional inventory and port acceptance

Reference snapshot: `JimLiu/baoyu-design`, commit `6530033592bf7fa58bc1a5a2a2ad278da45213a9`. Source inspection informs independently written replacements; reference executables and bundled assets are not installed or run. The complete functional port remains in progress.

## Rules

- Preserve each user-visible function, input, output, editing action, persistence behavior, and export behavior. A new API may adapt integration to Codex; it must not silently remove these behaviors.
- PowerPoint creation/export and native PowerPoint XML are the only agreed exclusions. HTML presentations remain required. Review Google Slides workflows individually rather than assuming they are excluded.
- Understand the reference contract before implementation. For each function, specify what a user can do, what state changes, where that state is stored, how errors behave, and how the result is verified.
- Separate implementation from verification. Behavioral tests for the new code and representative visual checks are required; neither proves full parity alone.
- Preserve unresolved features as required work. Do not substitute a smaller generic component and describe its category as complete.
- Proprietary host messages require a real local or available Codex-tool replacement. A guidance-only recipe does not count as an implemented transfer or editor action.

## Animation acceptance

| Reference behavior | Current port | Acceptance / remaining work |
| --- | --- | --- |
| Continuous v3 composition, one persistent tree | `animations.jsx`, `CompositionStage` | Implemented; tests confirm node identity across cuts and synchronous seek. Broader visual comparisons remain required. |
| Authored `T`, named `CUES`, separate playback time | `motion-model.js`, `useComposition` | Tested retiming keeps authored cue positions and all section choreography, including second retimes and boundary continuity. |
| `Shot` visibility without unmounting | `Shot` | Implemented; shared-node persistence is tested. More nested-media readiness checks remain. |
| Single caption with inferred end and fades | `Captions` | Implemented; seek tests check at most one caption. Typography and boundary fade comparisons remain. |
| Linear, quad/cubic/quart, sine/expo/back, elastic easing; keyframe tweens | `Easing`, `interpolate`, `animate` | Endpoint, overshoot, missing segment easing, and zero-length tween behavior tested. Curve sampling against reference formulas remains. |
| Section trim/time-stretch, speed, descriptions | Local editor | Edge dragging and duration/speed edits tested. Complete authored motion survives stretching. Exact host editor appearance is not claimed. |
| Infinite or finite repeat, hold on final frame | Local playback | Pure-clock cases and actual two-pass playback tested. Resume and external-clock edge cases require further tests. |
| Scrub, hover preview, keyboard, scaling | Local transport | Keyboard, synchronous seek, and narrow layouts tested. Touch/hover cancellation and extreme sizes require further tests. |
| Playhead, editor visibility and timing persistence | Browser storage plus local source service | Reload tested. Authored input changes invalidate obsolete browser timing. Storage-unavailable behavior requires more checks. |
| Host timing write-back | Opt-in `--motion-file`, same-origin/versioned save | Actual HTML update and stale/foreign write rejection tested. Source binding supports dedicated plain inline scene/playback literals. |
| External seek/playback transport | `codex-seek-to-time`, validated timing update events | Implemented with one clock, synchronous commit and external-play watchdog. Additional latch-decay/media tests remain. |
| SVG/foreignObject, portable fonts, capture without editor | SVG root, local font embedding, `?capture` | Implemented; export and small-layout tests pass. Dedicated font/SVG serialization comparisons remain. |
| Video export action | Connected local export panel and CLI | Real MP4 download tested. MP4/WebM/GIF frame changes, ranges, custom bridge and 2x capture tested. More quality comparisons remain. |
| Export quality, sub-range, supersampling, GIF palette, warnings | `export.mjs`, `lib/video.mjs` | Implemented and exercised. Remote fonts are not fetched automatically; localize assets for portable export. |
| WatercolorPainting/Sheet/Stroke/Reveal and layer hook | `watercolor-components.jsx`, `watercolor-kit.js` | Implemented. Tests exercise synchronous seek, whole-painting retiming, baked frames, real PNG download, and flattened/layered composition equivalence. Visual texture comparison against reference artifacts remains required. |
| Older Stage/Sprite/TextSprite/ImageSprite/RectSprite/VideoSprite and SceneStage/useScene APIs | `scene-components.jsx` on the shared engine | Implemented. Tests cover inclusive mount gates, curves, style overrides, active-index mounting, authored local time, metadata, diagnostics, frozen overlap, loop/reset/finite policies and decoded nested-video frames in real MP4 output. Broader reference visual comparison remains required. |
| Hosted nested-video audio mixing | `lib/audio.mjs` plus shared local export | Implemented for marked source intervals, speed, loops and multiple clips; MP4/AAC and WebM/Opus streams, sub-range phase, pitch, gain/mount changes, data/blob source lifetime and editor mute/download have real-output tests. Silent mode remains available. Activation/gain changes use the video frame grid; hosted implementation and broader mixing quality comparison remain unverified. |

## Runtime component inventory

The following source surfaces have been identified. Rows marked partial require deeper per-function inspection before they can pass acceptance.

| Source surface | Current replacement | Required outstanding work |
| --- | --- | --- |
| `animations-v3.jsx` | Continuous React engine | Remaining checks and integrations listed above. |
| `animations.jsx`, `animations-v2.jsx` | Shared Stage, sprites and SceneStage | Older scene/sprite authoring and synchronized video implemented with local timing/editor/export integration. Transition and clip seek behaviors have browser tests; reference visual/scale comparisons remain. |
| `watercolor-kit.js` | Independent `watercolor-kit.js` | All nine operations, six shape types, named pigments, paper/texture, seeded seek, weighted timelines, cropped layers and baking implemented. Tests cover pigment multiplication, paper restoration, deterministic replay, layer reconstruction, cache identity and live replay/detach. Brush texture is independently generated; reference visual comparison and larger performance checks remain. |
| `design-canvas.jsx`, canvas patch | Native elements and `canvas-components.jsx` | Sections/notes, scoped IDs, grip drag, focus navigation, source-aware state, project sidecar writes and 3× PNG/HTML exports restored. Tests and representative visual checks pass; reference visual comparison, hardware gestures, broader fonts/media, multiple canvases and legacy plain-HTML canvas metadata remain pending. See [canvas contract](canvas.md). |
| `deck-stage.js`, deck patch, effects demo | Modular `deck.js` build engine | All 44 effects, directional masks, millisecond timing, complete repeat/reverse chains, group gating, held states, navigation/print/capture, skip/notes/events and native fullscreen restored with browser, rendered-pixel and PDF tests. Lazy styled thumbnails, multi-selection, confirmation, move/skip/duplicate/delete, native drag, undo and versioned literal-HTML source writes restored and tested. Full reference comparison, renderer-backed source bindings and presenter refinements remain pending; see the [deck contract](deck-runtime.md) for the complete outstanding list. |
| `tweaks-panel.jsx`, tweaks protocols | `controls.js` | React controls/hook, curated palettes, panel drag/visibility, source write-back, and full typed defaults. |
| `chart-stage.js` | `chart.js` | General redraw API, container sizing, zoom/pan/pinch, touch/mouse tooltips, transitions, empty/error states, SVG/2x PNG download. |
| `data-overlay.js` | `sources.js` only covers citations | Metric overlays, live transformed/rounded/occluded element geometry, washes/tags/pins/rings, view switching, denominator/source/date metadata and refresh requests. |
| `three-d-stage.js` | `three-stage.js` | Compare readiness, camera framing, interaction, turntable interruption, lighting/shadows, units and actual GLB/OBJ outputs. |
| `image-slot.js` | `image-slot.js` | Compare all loading, fit, upload/edit, storage and failure behaviors; local upload is tested. |
| `doc-page.js` | `document.js` | Verify page-size/margin/print/pagination and document editing against the source contract. |
| `ios-frame.jsx`, `android-frame.jsx`, `ios-shell.js` | `frames.js` | Exact individual device frame APIs and chrome, overlays, sizes and orientation behavior. |
| `browser-window.jsx`, `chrome-shell.js` | `frames.js` | Browser-specific tabs/toolbars/content sizing and configuration. |
| `macos-window.jsx`, `file-window.js` | `frames.js` | Window/file chrome, individual APIs and behavior. |
| `social-frames.js`, `post-card.js`, `instagram-story.js` | `social.js` | Separate frame/post/story contracts, data inputs and visual fidelity. |
| `x-shell.js`, `instagram-shell.js`, `tiktok-shell.js` | `social.js` | Each platform's individual inputs, layouts, interactions and responsive behavior. |
| `facebook-shell.js`, `linkedin-shell.js`, `pinterest-shell.js` | `social.js` | Each platform's individual inputs, layouts, interactions and responsive behavior. |
| `reddit-shell.js`, `youtube-shell.js` | `social.js` | Each platform's individual inputs, layouts, interactions and responsive behavior. |

## Workflow and tool inventory

| Source workflow/tool family | Available port | Acceptance / remaining work |
| --- | --- | --- |
| Hi-fi/frontend, website, interactive/mobile prototype, wireframe | Interface/prototype/mobile/wireframe recipes and examples | Preserve brief/constraints, real flows, device behavior and visual acceptance. Recipes alone do not verify generated results. |
| Document, resume, flier, trifold, HTML email | Document/email recipes and starters | Compare page/fold order, editable content and print; test email in actual target clients. |
| Data science/visualization, maps/geography, web research | Data/research recipes | Preserve real-source analysis, geographic assets, plot interactions and source methodology. Chart and overlay runtimes remain partial. |
| Social content and variants/options stack | Campaign/review recipes and canvas editor | Section-based option editing, persistence, focus and artboard export restored. Platform runtimes, legacy plain-HTML canvas metadata and full workflow comparison remain pending. |
| Design feedback, experiments, tweak APIs | Review recipe and local controls | Preserve experiment variants, feedback application and typed source edits. Generic CSS controls are insufficient. |
| Create/use/import design system, authoring guide/checker/compiler/preview | New explicit schema and local tools | Compare tokens, aliases, fonts, components, variants, examples, binding metadata and compatibility. No automatic legacy conversion is implemented. |
| Import Figma offline | Independent decoder, raw mount, selected rendering, system extraction | Effects, masks, instances, constraints, variable modes, fonts and inferred component/variant models remain partial. Raw preservation is not faithful rendering. |
| Import HTML/GitHub, record assets | Local inliner/project metadata and import recipes | Compare preserved behavior, asset paths/provenance and handoff; conversion requires explicit reviewed source changes. |
| Standalone HTML, PDF/PNG | Local parser/inliner and Chromium exporter | Representative local asset and print tests pass. Broader dynamic asset/font/form/embedded-media comparisons remain. |
| Video/exportable animation and sound effects | New engine/exporter and motion recipe | Scene/sprite APIs and local audio mixing restored; remaining animation verification above. Generated-sound provider workflow still needs an actual configured integration. |
| Generated images, provider-backed image edits, PDF input, model-backed prototype | Available Codex tools and configured backend recipes | Preserve input/reference-image behavior, real outputs and provenance. Never claim a simulated service as a functional port. |
| Design-components pages, Figma/Canva/Google Slides transfers, implementation handoff | Local galleries plus connector guidance | Implement and verify real available connector actions or explicitly document missing environment support. Original hosted protocols are not available in Codex. |
| Ask-user workflow, surprise/exploration, project routing | Skill entry point and thirteen project modes | Verify task routing and preference handling without imposing a reduced feature set. |
| Editable/screenshot PowerPoint, native animation XML | Excluded by user | No port required. |

## Completion gate

Every non-excluded row must have an understood contract, an implementation or real configured integration, and verification covering its important interactions and output. Current tests cover the replacement's stated behavior and selected reference contracts. The overall port and animation family must remain incomplete until their outstanding rows are resolved.
