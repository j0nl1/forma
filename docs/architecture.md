# Architecture

`skills/codex-design/SKILL.md` is the entry point. `agents/openai.yaml` describes Codex UI and invocation. `project-types.json` maps thirteen modes to resources. `references/` holds original task recipes; `assets/starters/` holds editable runtime source. `scripts/` contains deterministic helpers and `scripts/lib/` their shared primitives.

The root contains documentation, tests, examples, and packaging. It is an npm workspace; the skill also has its own lockfile for independent installed-copy setup. Packages are pinned dependencies rather than opaque vendored bundles.

## Contracts

| Surface | Contract |
| --- | --- |
| Project | `design.json`, schemaVersion 1, `assets` and `designSystems` |
| System source | `system.json`, CSS entry, optional named React exports and sample props |
| Compiled system | `_ds_manifest.json`, `_ds_tokens.css`, optional `_ds_bundle.js`, SHA-256 hashes |
| System browser runtime | `window.CodexDesignSystem` with `React`, `createRoot`, `Components` |
| Canvas | Native `design-canvas`/`design-section`/`design-board`/`design-note` and React `DesignCanvas`/`DCSection`/`DCArtboard`/`DCPostIt`; source identities scope versioned sidecar state |
| Slides | `deck-stage` with direct element slides and finished base styles; 44 declarative effects, complete click groups and runtime-owned WAAPI state |
| Motion | One shared React `Stage`, with continuous `CompositionStage` or active-index `SceneStage`; `window.codexTimeline`/`__animStage` share duration, dimensions and synchronous seek; the simple `motion-stage` remains for existing examples |
| Tweaks | React `useTweaks` and typed controls, a shared JSON-only store, local draft handoff and versioned root-HTML JSON source writes |
| Charts | General light-DOM `chart-stage`, full local D3/Sankey bundle, keyed redraw context, view scales, refresh transitions, pointer tooltips and actual SVG/2× PNG downloads; basic `data-chart` retained |
| Data overlay | Authored `data-overlay` views, independent geometry/layout/paint/control modules, exact sentence navigation, JSON or reviewed JS source reload, local request drafts and scoped opacity restoration |
| 3D | Bundled `three-stage` with local Three.js and exporters |
| Component gallery | Ordinary local `.dc.html`, without hosted import protocol |

Native DOM starters are classic scripts except the explicitly bundled 3D module and chart library entry. The canvas, deck and data overlay loaders import editable ES modules; copy their companions or bundle each loader for a single-file runtime. React systems and the continuous-composition animation engine use a local build step. Browser edits persist locally where supported. The motion preview service can write scene/playback literals to one explicitly selected HTML document, with same-origin tokens and content-version checks. The canvas preview service can write a versioned state sidecar beside one explicitly selected HTML document. It connects the first canvas in that document and leaves other canvases on browser storage. The deck preview service writes structural edits to literal slides in the first deck of one explicitly selected HTML file, with tokens, content versions, a count witness, serialized writes and in-memory undo. Static decks retain session edits. The typed tweaks service batches partial JSON edits into one root HTML defaults block, accepting the data-only legacy marker boundary as well as the native JSON-script binding. Static controls retain explicit browser/session state; draft handoff copies text for review. The motion service also renders video from its selected document; no caller-selected URL or output path is accepted by the browser endpoint.

## Tools

- `preview.mjs`: loopback HTTP, host validation, traversal and realpath checks.
- `project.mjs`: preserve metadata while registering assets.
- `design-system.mjs`: read-only inspection, compilation, review generation, hashed portable bindings.
- `figma.mjs`: offline inventory, raw mount, selected HTML, and system extraction.
- `build.mjs`: local JSX/TSX/module bundling.
- `export.mjs`: parsed HTML/CSS inlining, Chromium PDF/PNG, deterministic video.
- `lib/audio.mjs`: frame-grid media inventory, temporary local source snapshots, source-range/pitch-preserving loops and AAC/Opus mixing; the final video stream is copied during muxing.
- `verify.mjs`: runtime and screenshot probes, not semantic flow verification.
- `tools/install.mjs`: staged local copy and conflict-aware managed update.

File writes use sibling temporary files and atomic rename. Multi-file generation is not a database transaction; use fresh folders. Compiler output deliberately replaces its own generated files.

## Trust boundary

Figma schemas are interpreted as data with ByteBuffer, never compiled into JavaScript. Inspection does not evaluate source. Browser previews execute page scripts, so reviewed source and an appropriate environment remain necessary. Browser exporters restrict HTTP input and subresources to loopback; Codex browser tools have their own permissions. This package is not a sandbox for arbitrary imported code.
