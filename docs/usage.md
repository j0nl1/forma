# Usage

Invoke `$codex-design` with the audience, primary task, references, fidelity, and output folder. Supply real screenshots or source for a faithful recreation. With enough context, Codex proceeds without a questionnaire.

```text
Use $codex-design to recreate this dashboard from the screenshot. Preserve
layout, density, typography, and colors. Make filters and the detail drawer work
with labeled sample data. Save to designs/dashboard.
```

```text
Use $codex-design to wireframe three navigation options for a mobile expense
tracker. Compare them in one canvas and include a working add-expense flow.
```

```text
Use $codex-design to build an eight-slide HTML presentation from this PRD for
engineering. Include a staged chart reveal and print-to-PDF. No speaker notes.
```

```text
Use $codex-design to create a reusable color and typography system from this
codebase, compile it, and verify a review page with real component states.
```

```text
Use $codex-design to create a 12-second product walkthrough at 1280 by 720.
Provide timeline controls, inspect scene boundaries, and export MP4 with marked media audio.
```

For follow-up changes, refer to the same artifact. Canvas, motion, deck, literal-text and typed tweak editors support their documented persistence and opted-in project saves. The older native CSS controls remain session-only.

## Preview and verify

From the checkout:

```sh
node skills/codex-design/scripts/preview.mjs designs/reader --port 4311
node skills/codex-design/scripts/verify.mjs http://127.0.0.1:4311/ --out /tmp/reader-check
```

For installed skills, replace `skills/codex-design` with the absolute installed folder. Stop the server with Ctrl+C. A busy port fails clearly; `--port 0` requests an available port. Use the reported URL. The verifier checks runtime errors, overflow, and screenshots, but Codex must exercise the user flow and inspect captures separately.

## Comparison canvases

Use the [canvas authoring guide](../skills/codex-design/references/canvas.md) for native elements or the reference-compatible React names. `canvas-react.html` demonstrates sections, notes, grip dragging, focus navigation and working artboard content. The editor retains names, ordering and hidden boards after reload, and each artboard offers PNG/HTML downloads.

```sh
node skills/codex-design/scripts/preview.mjs /path/to/design --canvas-file canvas.html
```

This explicitly enables real project saving to `canvas.design-canvas.state.json` beside the selected document. Static/public previews save in the browser and can download/import their state. Source changes invalidate obsolete hides while retaining matching edits. Focus is never persisted. Copy every companion canvas module or bundle `canvas.js` before a standalone full-page export.

For existing plain HTML options, keep `<meta name="design_doc_mode" content="canvas">` and place frames directly in `body`. The local preview activates pan/zoom automatically without rewriting the file or reparenting authored nodes. `canvas-html.html` demonstrates working forms, cross-option links, viewport persistence and natural-size 3× PNG/styled HTML downloads. A standalone HTML export embeds the metadata runtime. This mode preserves authored layout; section names/order/hides and source-sidecar edits belong to the native/React canvas described above.

## HTML deck builds

Follow the [deck runtime guide](../skills/codex-design/references/deck-runtime.md). Canonical `data-anim-duration` and `data-anim-delay` use milliseconds; older short aliases use seconds. The local `deck-effects.html` gallery demonstrates every effect family, directional masks and repeat/reversal. Use Replay to restart the current group. Reduced motion retains click steps; print shows authored base artwork. The thumbnail rail supports range/toggle selection, skip, move, duplicate, confirmed deletion, native drag and undo. Drag its separator to resize; width and visibility persist in the browser. Static previews report that structural edits stay in the page.

```sh
node skills/codex-design/scripts/preview.mjs /path/to/design --deck-file deck.html
```

This connects the first literal HTML deck to actual source writes. Actions preserve metadata and speaker notes, reject stale versions and use the server's undo history. Reload retains saved structural edits; restarting the server clears undo history. Renderer-generated slides and richer presenter workflows remain required work. See the runtime guide for duplicate image state and portability limitations.

Copy all companion deck modules or bundle `deck.js` before full-page standalone export. The demo helper produces a bundled deck runtime automatically.

## Typed design controls

The [typed tweaks guide](../skills/codex-design/references/tweaks.md) documents all React controls, palette selection, number/segment dragging, browser state and the movable panel. `tweaks.html` demonstrates live edits without remounting the design. Bundle `tweaks-components.jsx` and its companions locally.

```sh
node skills/codex-design/scripts/preview.mjs /path/to/design --tweaks-file prototype.html
```

One root HTML JSON defaults block becomes the real save target. Partial updates retain value types and use version checks; reload retains source edits. Suggestion drafts are copied to the clipboard for the user to paste, review and send in Codex. Automatic composer insertion remains under integration review.

## Compose device and desktop contexts

The [platform guide](../skills/codex-design/references/platforms.md) lists every iOS, Android, Chrome and macOS composition primitive and prop. Bundle a React entry or use the native `ios-shell` / `chrome-shell` with their fixed physical sizes. `platforms.html` demonstrates live keyboards, titles, tabs and sidebar state without replacing authored input nodes. The native shells support `image-only="true"` and actual `exportAsset("png"|"html")` downloads at the chosen content region's exact size. The earlier generic `frames.js` wrappers remain available.

The [live file guide](../skills/codex-design/references/file-windows.md) explains `file-window.js`: physical crops of actual local HTML, missing/reappearing files, waiting pencil sketches, updates and scrollable expanded views. Copy its companion modules or bundle the loader. `files.html` demonstrates real crops, embedded updates and local pick/action events. Whole-page export settles available frames; portable HTML retains its project-file dependencies.

## Compose and export social assets

The [social asset guide](../skills/codex-design/references/social-assets.md) documents the separate board, four feed-card platforms and letterboxed story viewer. Bundle `social.js`, compose authored media in `post-card` or `instagram-story`, and place units in `social-frames`. The board provides actual per-format PNG and all-format ZIP downloads at the nominal dimensions in each label. `social.html` demonstrates live copy, format visibility and image-only toggles. Story uploads use the existing image source service; static session editing is explicit. The [social phone screen guide](../skills/codex-design/references/social-phone-shells.md) documents all eight restored platform screens, including every attribute and aspect variant. `social-shells.html` demonstrates their live copy/aspect/image-only changes, source-compatible image editors and real PNG/ZIP downloads. `social-feeds.html` demonstrates Facebook, LinkedIn, Pinterest, Reddit and YouTube, including the three square variants and viewer controls omitted from downloads. Full reference visual comparison remains pending.

## Replace and frame images

```sh
node skills/codex-design/scripts/preview.mjs /path/to/design --image-file artwork.html
```

The [image guide](../skills/codex-design/references/images.md) documents authored shapes, masks, safe credits, cover/contain baselines and the full reframe editor. Drop or browse a raster image; double-click or choose Edit to drag, zoom or resize it. Actual state is saved in `image-slots.state.json` beside the selected HTML. Deck/canvas source previews also connect this service for image persistence. Static pages are read-only, and `images.html` is an explicit browser-session demonstration. Portable HTML embeds the saved shared state.

## Edit literal text

```sh
node skills/codex-design/scripts/preview.mjs /path/to/design --text-file document.html
```

The selected HTML response gets the local editor automatically. Choose **Edit text**, click a literal heading, paragraph, bullet or formatted run, and type. Saves update the actual file while retaining links, emphasis and other markup. Undo/redo also update that file. Conflicting edits stop saves and retain a copyable draft; recovered drafts require review. Renderer-created content is edited in its authoring code. The [text editing guide](../skills/codex-design/references/text-editing.md) explains persistence, cancellation, identity, storage failures and combined editor services. `editing.html` is a session-only public demonstration.

## Design systems

Generate example outputs outside the repository:

```sh
cp -R examples/design-system /tmp/harbor-system
node skills/codex-design/scripts/design-system.mjs check /tmp/harbor-system
node skills/codex-design/scripts/design-system.mjs compile /tmp/harbor-system
node skills/codex-design/scripts/design-system.mjs preview /tmp/harbor-system
node skills/codex-design/scripts/design-system.mjs import /tmp/harbor-system /tmp/reader-design
```

Include copied `_ds/harbor/_ds_tokens.css` and the bundle when using React components. `check` is read-only. Compilation does not evaluate component code; browser preview executes it normally.

## Offline Figma

```sh
node skills/codex-design/scripts/figma.mjs outline /path/to/reference.fig
node skills/codex-design/scripts/figma.mjs mount /path/to/reference.fig /tmp/fig-reference
node skills/codex-design/scripts/figma.mjs render /path/to/reference.fig /tmp/frame.html --node 1:2
node skills/codex-design/scripts/figma.mjs materialize /path/to/reference.fig /tmp/fig-components --node "Button"
node skills/codex-design/scripts/figma.mjs design-system /path/to/reference.fig /tmp/fig-system
```

Use exact names or node ids. Ambiguous names and existing destinations fail. Inventory and mount preserve raw properties; render supports a documented subset. Read returned warnings and compare a real Figma export when fidelity matters.

## Exports

For full continuous animation authoring, use the [motion recipe](../skills/codex-design/references/motion.md) and the React `CompositionStage` example. The basic DOM timeline is retained for existing artifacts. To try local source editing and the video export panel, prepare the demo, then start `preview.mjs <demo-folder> --motion-file animation.html` and open `animation.html?edit-source`. Timing edits save automatically to the selected HTML file. Static/public previews save timing only in the browser.

The showcase is a collection of working examples, not the skill's product interface. `scenes.html` demonstrates older scene/sprite authoring, with `?transition=overlap` for frozen outgoing layers. Enable source editing for that document with `--motion-file scenes.html`. `watercolor.html` compares layered strokes with flattened frames and provides a PNG download; its complete authoring API is documented in the [watercolor recipe](../skills/codex-design/references/watercolor.md).

```sh
node skills/codex-design/scripts/export.mjs html designs/reader/index.html /tmp/reader.html
node skills/codex-design/scripts/export.mjs pdf http://127.0.0.1:4311/ /tmp/reader.pdf --paper a4
node skills/codex-design/scripts/export.mjs png http://127.0.0.1:4311/ /tmp/reader.png
node skills/codex-design/scripts/export.mjs video http://127.0.0.1:4311/animation.html /tmp/walkthrough.mp4 --fps 30
node skills/codex-design/scripts/export.mjs video http://127.0.0.1:4311/animation.html /tmp/section.mp4 --start-ms 2000 --end-ms 4000 --scale 2 --crf 18
```

Standalone export rejects unresolved/remote assets and module scripts. Bundle ES modules first. Dynamic fetches need explicit embedding. Browser exports block remote subresources. Existing outputs are refused. MP4/WebM can retain marked media audio; `--audio none` and GIF are silent. Inspect PDF pages for print fidelity.

## Build React or 3D source

```sh
node skills/codex-design/scripts/build.mjs /path/to/app.jsx /path/to/app.bundle.js
node skills/codex-design/scripts/build.mjs skills/codex-design/assets/starters/three-stage.js /tmp/three-stage.bundle.js
```

Load the bundle as a classic script. To try the full 3D contract, copy `examples/objects.html` and `examples/objects.js` alongside the generated bundle in the temporary folder and serve it. The [3D guide](../skills/codex-design/references/three-dimensional.md) explains readiness, meter-scale authoring, studio lighting, camera gestures and actual GLB / OBJ + MTL exports. The earlier `examples/three.html` remains compatible.

## Record outputs

```sh
node skills/codex-design/scripts/project.mjs record designs/reader index.html --type ui-mockups
node skills/codex-design/scripts/project.mjs record designs/reader cover.png --type image --source "Generated with the configured Codex image tool"
```

`design.json` preserves unrelated metadata and records local assets and bindings. Figma/Canva transfer uses a real authorized connector when available. Otherwise Codex delivers a local handoff and states that transfer did not occur.

General interactive charts use the [chart stage contract](../skills/codex-design/references/charts.md) and pinned local D3/Sankey dependencies. Open `charts.html` in the showcase to try wheel/pinch zoom, exact-value tooltips, data updates, explicit empty states and actual SVG/2× PNG downloads. `data.html` retains the basic bar/line API.

The [data overlay guide](../skills/codex-design/references/data-overlay.md) documents live metric/feedback annotations, exact authored-view switching, provenance, reloads and local review drafts. Open `overlay.html` to inspect the explicitly synthetic fixture, turn paint/chrome on and off, and test modal occlusion. Real products require measured values and a reproducible analytics source.

The [document guide](../skills/codex-design/references/documents.md) distinguishes flowing text, explicit pages, true-size designs and scaled-fit layouts. `documents.html` exercises all four contracts, running slots and native print; PDF export accepts `--paper letter|a4|legal` and `--orientation portrait|landscape`.
