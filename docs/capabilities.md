# Capabilities and migration

This implementation is being corrected toward a full functional Codex port. Its first version covered workflow categories but simplified several components. The table describes available resources, not completed parity. [Porting status](porting-status.md) records the remaining required work. It uses a new API and schema; source compatibility and identical rendering remain unverified.

| Reference workflow | New resources | Behavior |
| --- | --- | --- |
| Hi-fi, frontend direction, prototype, website | `interface.md`, `prototype.md` | Native HTML and real flows; React bundled when useful |
| Mobile and device/browser/desktop shells | `mobile.md`, `platforms.md`, separate React entries and `platform-shells.js` | Distinct device/window composition, visual keyboards, lists, tabs, sidebars, fixed shells, image-only and actual local asset snapshots; full visual/browser comparison remains pending |
| Live HTML / component-gallery previews | `file-windows.md`, modular `file-window.js` | Actual existence/rewrite detection, isolated crops, waiting animation/patience, native updates, recovery, expanded scrolling and pick/action events; reference visual and automatic Codex handoff pending |
| Wireframes, options stack, canvas | `wireframe.md`, `canvas.md`, `canvas-components.jsx` | Sections, notes, pan/zoom, scoped persistent edits, grip reorder, navigable focus, project sidecar saves and PNG/HTML downloads; plain metadata HTML preserves direct body frames with browser viewport state and portable runtime; further reference comparisons pending |
| Decks and speaker notes | `slides.md`, `deck-runtime.md`, `deck.js` | 44 effects, directional masks, timed groups, repeat/reverse, held states, navigation, notes, skip, native fullscreen and print; lazy styled thumbnails, multi-selection, move/duplicate/delete, confirmation, undo and opt-in HTML source saves; further reference comparisons and renderer bindings pending |
| Design feedback and typed tweaks | `tweaks.md`, `tweaks-components.jsx`, `tweaks-store.js` | All typed controls, palette cards, scrub/drag, local persistence, actual root-HTML source writes and clipboard drafts; broader visual and native composer integration pending |
| Documents, resume, flier, trifold | `documents.md`, modular `document.js` | Flowing/explicit/true-size/scaled-fit layouts, exact Letter/A4/Legal geometry, live running slots, automatically fitted true-size screen sheets and actual chosen-paper PDF output; literal-text source editing restored; further reference/client checks pending |
| Email | `email.md`, `email.html` | Tables and inline CSS; client compatibility requires actual client testing |
| Social assets and platform context | `campaigns.md`, `social-assets.md`, bundled `social.js` | Dynamic board, four feed anatomies, physical letterboxed story, source-backed image editing and actual nominal PNG/ZIP downloads; all eight distinct platform phone screens and fourteen-placement campaign controls restored, including desktop feeds and grouped carousel; further visual/integration checks remain pending |
| Data science, charts, diagrams, maps | `data.md`, `chart.js`, `sources.js` | Source-driven analysis, local SVG charts and tables; supplied/configured geography |
| Research and sourced overlays | `research.md`, `sources.js` | Live sources through Codex, local citations |
| Animation and video | `motion.md`, `animations.jsx`, `scene-components.jsx` | Continuous composition and older sprite/scene APIs, authored cues/local time, persistent shots, captions, frozen scene overlap, local editor, timing write-back, deterministic seek and decoded nested-video export |
| Sound | `motion.md`, `exports.md`, `lib/audio.mjs` | Marked media loops/ranges/speed, multi-clip local mixing and actual AAC/Opus output; interactive Web Audio guidance |
| Watercolor | `watercolor.md`, `watercolor-kit.js`, `watercolor-components.jsx` | Seeded paper, all nine painting operations, six shapes, pigments, weighted seek, cropped layers, baked frames, live replay and authored-time React reveals |
| 3D | `three-stage.js` and editable companions | Original `three-d-stage` readiness, orbit/pan/zoom, interrupted turntable, studio shadows, meter-scale framing, reconnect, GLB loading and actual GLB / OBJ + MTL download; earlier `three-stage` retained |
| Create/use/import systems | `design-system.mjs` | Check, compile, review, hashed local binding; new explicit schema |
| Design Components and preview | `design-systems.md` | Local `.dc.html` galleries without hosted protocols |
| Offline Figma | `figma.mjs` | Raw/ZIP, deflate/Zstd, inventory, mount, selected HTML and system extraction |
| GitHub and HTML imports | `imports.md` | Read-only source analysis and explicit conversion |
| Standalone, PDF, PNG | `export.mjs` | Structured local inlining, Chromium print/capture |
| MP4/WebM/GIF | `export.mjs` | Deterministic video through FFmpeg, optional marked-media audio in MP4/WebM, GIF without audio |
| Figma, Canva, implementation handoff | `exports.md` | Real authorized connector, or clearly identified local handoff |
| Images, PDF input, model interactions | `assets-ai.md` | Actual Codex tools, source provenance, configured backend or labeled simulation |
| Feedback, experiments, tweaks protocols | `review.md`, `controls.js` | Local CSS controls, variants, reset, download; no host injection |
| Surprise / something cool | `SKILL.md` | Opt-in concept exploration |

## Exclusions and fidelity

PowerPoint editable/screenshot export, native PowerPoint animation XML, and PptxGenJS are excluded. HTML decks remain in scope. Multi-harness references, provider-specific APIs/handoffs, and hosted protocols need Codex-native equivalents that preserve their user-visible behavior; they are not grounds for dropping functionality. Older animation APIs and Google Slides workflows remain in the port review rather than being silently excluded.

Figma rendering supports saved geometry, common solid/image fills, text, transforms, and vector path blobs. Effects, masks, instance overrides, constraints, variable modes, and some fonts need manual reconciliation. Raw mount preserves those properties. System extraction creates HTML examples rather than inferred React prop models.

The deck implements common entrance and path builds, with expanded browser equivalents for the reference vocabulary. Timing follows local click/with/after sequencing; it does not export native PowerPoint semantics. Social boards, feed cards, stories and all eight distinct platform phone screens have restored contracts; full visual comparison remains pending. Distinct device/window primitives and live file previews have been restored with further reference checks pending. The full watercolor operations and layer contracts have been restored, but independently generated brush texture has not passed reference visual comparison yet. For an exact artifact recreation, reconcile these differences against supplied visual references.

Connectors are conditional on the current Codex environment. The package does not invent services, bundle credentials, or claim transfers that did not happen. Video export can mix marked local media audio; arbitrary live Web Audio and unmarked playback are not recorded.

## Migrate an existing project

1. Preserve the original and inspect its source, assets, `_d_meta.json`, bound systems, and dependencies.
2. Retain useful working HTML; installation alone does not require a rewrite.
3. Author native `system.json`, declare CSS and named component exports, provide props, compile, review, and import.
4. Map animation scenes to one deterministic timeline and verify boundaries.
5. Replace injected host controls with local controls. Apply downloaded changes to source deliberately.
6. Record outputs in `design.json`, verify actual flows, and state remaining differences.

No automatic translator overwrites old projects or claims legacy schema compatibility.
