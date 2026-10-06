# Usage

Activate Forma using your harness's skill mechanism, or ask the agent to read its absolute `SKILL.md` path. Codex supports `$forma`; Claude Code supports `/forma`. Provide the audience, primary task, references, fidelity, and output folder. Supply real screenshots or source for a faithful recreation. With enough context, the agent proceeds without a questionnaire.

```text
Use the forma skill to recreate this dashboard from the screenshot. Preserve
layout, density, typography, and colors. Make filters and the detail drawer work
with labeled sample data. Save to designs/dashboard.
```

```text
Use the forma skill to wireframe three navigation options for a mobile expense
tracker. Compare them in one canvas and include a working add-expense flow.
```

```text
Use the forma skill to build an eight-slide HTML presentation from this PRD for
engineering. Include a staged chart reveal, print-to-PDF, and an editable PowerPoint handoff. No speaker notes.
```

```text
Use the forma skill to create a reusable color and typography system from this
codebase, compile it, and verify a review page with real component states.
```

```text
Use the forma skill to create a 12-second product walkthrough at 1280 by 720.
Provide timeline controls, inspect scene boundaries, and export MP4 with marked media audio.
```

For follow-up changes, refer to the same artifact. Canvas, motion, deck, literal-text and typed tweak editors support their documented persistence and opted-in project saves. The older native CSS controls remain session-only.

For an HTML email, follow the [email recipe](../skills/forma/generations/documents/email.md) and copy `packages/runtime/src/browser/email.html` from the installed skill. Supply the actual destinations and sender/footer details. The showcase's `starters/email.html` demonstrates the table-based template; browser preview is one check, and actual target email-client rendering remains required before describing delivery readiness.

## Preview and verify

From the checkout:

```sh
node packages/cli/src/commands/preview.mjs designs/reader --port 4311
node packages/cli/src/commands/verify.mjs http://127.0.0.1:4311/ --out /tmp/reader-check
```

For installed skills, replace `skills/forma` with the absolute installed folder. Stop the server with Ctrl+C. A busy port fails clearly; `--port 0` requests an available port. Use the reported URL. The verifier checks runtime errors, overflow, and screenshots, but the agent must exercise the user flow and inspect captures separately.

## Comparison canvases

Use the [canvas authoring guide](../skills/forma/references/canvas.md) for native elements or the React authoring components. `canvas-react.html` demonstrates sections, notes, grip dragging, focus navigation and working artboard content. The editor retains names, ordering and hidden boards after reload, and each artboard offers PNG/HTML downloads.

```sh
node packages/cli/src/commands/preview.mjs /path/to/design --canvas-file canvas.html
```

This explicitly enables real project saving to `canvas.design-canvas.state.json` beside the selected document. Static/public previews save in the browser and can download/import their state. Source changes invalidate obsolete hides while retaining matching edits. Focus is never persisted. Copy every companion canvas module or bundle `canvas.js` before a standalone full-page export.

For existing plain HTML options, keep `<meta name="design_doc_mode" content="canvas">` and place frames directly in `body`. The local preview activates pan/zoom automatically without rewriting the file or reparenting authored nodes. `canvas-html.html` demonstrates working forms, cross-option links, viewport persistence and natural-size 3× PNG/styled HTML downloads. A standalone HTML export embeds the metadata runtime. This mode preserves authored layout; section names/order/hides and source-sidecar edits belong to the native/React canvas described above.

## HTML deck builds

Follow the [deck runtime guide](../skills/forma/references/deck-runtime.md). Canonical `data-anim-duration` and `data-anim-delay` use milliseconds; older short aliases use seconds. The local `deck-effects.html` gallery demonstrates every effect family, directional masks and repeat/reversal. Use Replay to restart the current group. Reduced motion retains click steps; print shows authored base artwork. The thumbnail rail supports range/toggle selection, skip, move, duplicate, confirmed deletion, native drag and undo. Drag its separator to resize; width and visibility persist in the browser. Static previews report that structural edits stay in the page.

```sh
node packages/cli/src/commands/preview.mjs /path/to/design --deck-file deck.html
```

This connects the first literal HTML deck to actual source writes. Actions preserve metadata and speaker notes, reject stale versions and use the server's undo history. Reload retains saved structural edits; restarting the server clears undo history. Renderer-generated slides and richer presenter workflows remain required work. See the runtime guide for duplicate image state and portability limitations.

Copy all companion deck modules or bundle `deck.js` before full-page standalone export. The demo helper produces a bundled deck runtime automatically.

## PowerPoint export

Follow the [PowerPoint guide](../skills/forma/generations/slides/powerpoint.md). Author a discrete HTML deck, keep its preview server running, then export locally:

```sh
node packages/cli/src/commands/export.mjs pptx http://127.0.0.1:4311/deck.html /absolute/path/to/deck.pptx
node packages/cli/src/commands/export.mjs pptx http://127.0.0.1:4311/deck.html /absolute/path/to/deck-images.pptx --pptx-mode screenshots --scale 2
```

Editable mode retains native text and simple shapes, uses separate picture layers for eligible complex backgrounds, retains composed uniform 2D scaling/translation/rotation and safely inset rounded foreground, translates supported builds into native PowerPoint timing, and embeds local video/audio. Source trims, speed and volume/mute can use a bounded local FFmpeg/FFprobe playback copy; inspect `mediaPlayback` for the applied settings and original/derived hashes. Eligible nested repeats, disjoint opacity and leaf masks retain native builds; overlapping fade/wipe composition can use bounded transparent pictures while surrounding objects remain editable. Inspect `nativeAnimations`, `rasterAnimations` and `staticAnimations`. Eligible visible videos retain their cover until a click starts playback, verified in Impress 24.2 and 25.8. Native looping and other manual-media variants retain explicit receiver warnings. Supply absolute local static TTF/OTF paths in `pptxFonts` to use the same font bytes in browser measurement and the embedded PowerPoint font payload; inspect variant/glyph coverage warnings. Screenshot mode retains the finished composition as one image per slide. Both preserve notes and omit skipped slides. Use `--pptx-animations static` for finished artwork without native builds. Inspect the result and media playback in the target application; fonts, CSS and animation rendering can vary. Read fallback warnings and keep the original source folder.

## Typed design controls

The [typed tweaks guide](../skills/forma/references/tweaks.md) documents all React controls, palette selection, number/segment dragging, browser state and the movable panel. `tweaks.html` demonstrates live edits without remounting the design. Bundle `tweaks-components.jsx` and its companions locally.

```sh
node packages/cli/src/commands/preview.mjs /path/to/design --tweaks-file prototype.html
```

One root HTML JSON defaults block becomes the real save target. Partial updates retain value types and use version checks; reload retains source edits. Suggestion drafts are copied to the clipboard for the user to paste, review and send in the agent chat. Automatic composer insertion is optional and requires an explicitly configured integration.

## Compose device and desktop contexts

The [platform guide](../skills/forma/references/platforms.md) lists every iOS, Android, Chrome and macOS composition primitive and prop. Bundle a React entry or use the native `ios-shell` / `chrome-shell` with their fixed physical sizes. `platforms.html` demonstrates live keyboards, titles, tabs and sidebar state without replacing authored input nodes. The native shells support `image-only="true"` and actual `exportAsset("png"|"html")` downloads at the chosen content region's exact size. The earlier generic `frames.js` wrappers remain available.

The [live file guide](../skills/forma/references/file-windows.md) explains `file-window.js`: physical crops of actual local HTML, missing/reappearing files, waiting pencil sketches, updates and scrollable expanded views. Copy its companion modules or bundle the loader. `files.html` demonstrates real crops, embedded updates and local pick/action events. Whole-page export settles available frames; portable HTML retains its project-file dependencies.

## Compose and export social assets

The [social asset guide](../skills/forma/references/social-assets.md) documents the separate board, four feed-card platforms and letterboxed story viewer. Bundle `social.js`, compose authored media in `post-card` or `instagram-story`, and place units in `social-frames`. The board provides actual per-format PNG and all-format ZIP downloads at the nominal dimensions in each label. `social.html` demonstrates live copy, format visibility and image-only toggles. Story uploads use the existing image source service; static session editing is explicit. The [social phone screen guide](../skills/forma/references/social-phone-shells.md) documents all eight restored platform screens, including every attribute and aspect variant. `social-shells.html` demonstrates their live copy/aspect/image-only changes, source-compatible image editors and real PNG/ZIP downloads. `social-feeds.html` demonstrates Facebook, LinkedIn, Pinterest, Reddit and YouTube, including the three square variants and viewer controls omitted from downloads. Full reference visual comparison remains pending.

`campaign.html` demonstrates the complete fourteen-placement roster with typed Formats/Display toggles and an optional five-frame carousel. The [campaign guide](../skills/forma/generations/interfaces/campaigns.md) explains platform selection, author-owned unit callbacks and actual source/portable delivery. Use `--tweaks-file campaign.html --image-file campaign.html` together to retain format flags in the HTML and all uploaded images in the directory sidecar. JSX image/font module imports are embedded by the build helper; arbitrary runtime URL strings still require localization.


## Replace and frame images

```sh
node packages/cli/src/commands/preview.mjs /path/to/design --image-file artwork.html
```

The [image guide](../skills/forma/references/images.md) documents authored shapes, masks, safe credits, cover/contain baselines and the full reframe editor. Drop or browse a raster image; double-click or choose Edit to drag, zoom or resize it. Actual state is saved in `image-slots.state.json` beside the selected HTML. Deck/canvas source previews also connect this service for image persistence. Static pages are read-only, and `images.html` is an explicit browser-session demonstration. Portable HTML embeds the saved shared state.

## Edit literal text

```sh
node packages/cli/src/commands/preview.mjs /path/to/design --text-file document.html
```

The selected HTML response gets the local editor automatically. Choose **Edit text**, click a literal heading, paragraph, bullet or formatted run, and type. Saves update the actual file while retaining links, emphasis and other markup. Undo/redo also update that file. Conflicting edits stop saves and retain a copyable draft; recovered drafts require review. Renderer-created content is edited in its authoring code. The [text editing guide](../skills/forma/references/text-editing.md) explains persistence, cancellation, identity, storage failures and combined editor services. `editing.html` is a session-only public demonstration.

## Design systems

Generate example outputs outside the repository:

```sh
cp -R examples/design-system /tmp/harbor-system
node packages/cli/src/commands/design-system.mjs check /tmp/harbor-system
node packages/cli/src/commands/design-system.mjs compile /tmp/harbor-system
node packages/cli/src/commands/design-system.mjs preview /tmp/harbor-system
node packages/cli/src/commands/design-system.mjs import /tmp/harbor-system /tmp/reader-design
node packages/cli/src/commands/design-system.mjs wiring /tmp/reader-design
# After authoring a consumer entry:
node packages/cli/src/commands/adherence.mjs /tmp/reader-design /tmp/reader-design/main.jsx
```

Named default classes and functions are discovered by their declaration names. Their source imports retain `default`, while the catalog, copied registry and public module expose their component names. Review samples preserve each component's identity and class state, including systems with several defaults.

Use `design-system.mjs check <system> --verbose` for token kinds, aliases, declaration provenance, conditional font faces and brand-font advisories. This is read-only; compilation remains a separate action. Explicit `/* @kind radius|font|other */` comments give ambiguous tokens a role. The portable review contains typed previews and a font inventory, including systems without component cards. Narrow tables support horizontal scrolling and keyboard focus. See the [token/font contract](../skills/forma/references/design-systems.md#token-and-font-inventory) for advisory versus structural-error behavior and cascade limits.

Include copied `_ds/harbor/_ds_tokens.css` and the bundle when using React components. Read each compiled namespace or use `window.CodexDesignSystems.harbor`; component namespaces stay independent when several systems are loaded. Compiled systems share the pinned React/ReactDOM 18.3.1 pair, so their actual components can be combined in one root. `check` and `discover <designs-folder>` are read-only. Compilation does not evaluate component code; browser preview executes it normally. The first imported system is primary; `primary <project> <bound-slug>` changes that choice, and `wiring <project>` supplies CSS tags with the primary last. Apply those tags to authored pages. After recompiling a source, use `import <system> <project> --update` to replace its unchanged managed copy. See the [design-system contract](../skills/forma/references/design-systems.md) for metadata, conflicts and legacy compatibility. The `systems.html` showcase compares two compiled systems interactively.

New component compilations provide `_ds_entry.js`: import `{React, createRoot, Button}` from `./_ds/harbor/_ds_entry.js` rather than component internals. Keep token CSS loaded. Browser-native module input must be plain JavaScript; bundle JSX/TSX with `build.mjs` before preview, and bundle any module consumer before standalone HTML export. The copied entry and policy stay usable after deleting the original source.

Run `adherence.mjs <compiled-system-or-bound-project> <source-file-or-folder>` to inspect authoring source without executing or rewriting it. Its JSON report warns about raw hex colors, pixel lengths, internal imports, props and finite variants. Default warnings return exit code 0; add `--strict` for exit code 1 on warnings. Syntax errors return 2. Dynamic values and unresolved inherited props are reported as unchecked. HTML input covers inline executable scripts; scan the source folder for external scripts. Read the [adherence scope](../skills/forma/references/design-systems.md#advisory-adherence-checks) before interpreting a clean report as coverage.

## Offline Figma

```sh
node packages/cli/src/commands/figma.mjs outline /path/to/reference.fig
node packages/cli/src/commands/figma.mjs mount /path/to/reference.fig /tmp/fig-reference
node packages/cli/src/commands/figma.mjs render /path/to/reference.fig /tmp/frame.html --node 1:2
node packages/cli/src/commands/figma.mjs materialize /path/to/reference.fig /tmp/fig-node --node "Button"
node packages/cli/src/commands/figma.mjs components /path/to/reference.fig /tmp/fig-components --node "Button"
node packages/cli/src/commands/figma.mjs design-system /path/to/reference.fig /tmp/fig-system
```

Use exact names or node ids. Ambiguous names and existing destinations fail. Inventory and mount preserve raw properties; materialize writes selected HTML and tokens. The components command emits editable React JSX and sibling declarations; design-system includes these modules alongside static examples. Read components.json for names, defaults, variant props and dependency names, then import the emitted JSX into a local React build. A selected component includes the local modules it needs; selecting a variant node ID emits its owning component set. Horizontal/vertical stacks resize through flex layout; GRID retains ordered tracks, anchors/spans and explicit self-alignment. Eligible unbound content exposes numbered text1–text4 and icon1–icon4 props, with per-variant defaults; inspect the emitted declarations for the slots actually used. Existing declared textN props disable synthesis, and iconN props disable synthetic icons. Icon-font outlines remain SVG in layout flow and follow currentColor. Local instances pass declared properties and variant choices; complex overrides remain editable baked JSX with advisories. Supply React content for external instance slots. Render and component geometry support the contracts and limitations in the [Figma import guide](../skills/forma/references/imports.md). Read returned warnings and compare a real Figma export when fidelity matters.

## Exports

For full continuous animation authoring, use the [motion recipe](../skills/forma/generations/video/motion.md) and the React `CompositionStage` example. The basic DOM timeline is retained for existing artifacts. To try local source editing and the video export panel, prepare the demo, then start `preview.mjs <demo-folder> --motion-file animation.html` and open `animation.html?edit-source`. Timing edits save automatically to the selected HTML file. Static/public previews save timing only in the browser.

The showcase is a collection of working examples, not the skill's product interface. `scenes.html` demonstrates older scene/sprite authoring, with `?transition=overlap` for frozen outgoing layers. Enable source editing for that document with `--motion-file scenes.html`. `watercolor.html` compares layered strokes with flattened frames and provides a PNG download; its complete authoring API is documented in the [watercolor recipe](../skills/forma/generations/video/watercolor.md).

```sh
node packages/cli/src/commands/export.mjs html designs/reader/index.html /tmp/reader.html
node packages/cli/src/commands/export.mjs pdf http://127.0.0.1:4311/ /tmp/reader.pdf --paper a4
node packages/cli/src/commands/export.mjs png http://127.0.0.1:4311/ /tmp/reader.png
node packages/cli/src/commands/export.mjs video http://127.0.0.1:4311/animation.html /tmp/walkthrough.mp4 --fps 30
node packages/cli/src/commands/export.mjs video http://127.0.0.1:4311/animation.html /tmp/section.mp4 --start-ms 2000 --end-ms 4000 --scale 2 --crf 18
```

Standalone export rejects unresolved/remote assets and module scripts. Bundle ES modules first. Dynamic fetches need explicit embedding. Browser exports use local resources by default. The [portable font contract](../skills/forma/generations/video/motion.md#portable-fonts) explains the packaged Inter caption font, SVG font embedding and optional `fontOrigins` configuration for read-only font providers. Connected editor exports receive that configuration from the preview server's `--font-origins` option. Existing outputs are refused. MP4/WebM can retain marked media audio; `--audio none` and GIF are silent. Inspect PDF pages for print fidelity.

Video duplicate-frame warnings require at least eight captured frames and more than 85% of the total frame count to match the preceding frame. Short static sub-ranges and normal held beats remain valid. A warning is advisory: check the bridge and intended timing against the encoded output.

## Build React or 3D source

```sh
node packages/cli/src/commands/build.mjs /path/to/app.jsx /path/to/app.bundle.js
node packages/cli/src/commands/build.mjs packages/runtime/src/browser/three-stage.js /tmp/three-stage.bundle.js
```

Load the bundle as a classic script. To try the full 3D contract, copy `examples/objects.html` and `examples/objects.js` alongside the generated bundle in the temporary folder and serve it. The [3D guide](../skills/forma/generations/video/three-dimensional.md) explains readiness, meter-scale authoring, studio lighting, camera gestures and actual GLB / OBJ + MTL exports. The earlier `examples/three.html` remains compatible.

## Record outputs

```sh
node packages/cli/src/commands/project.mjs record designs/reader index.html --type ui-mockups
node packages/cli/src/commands/project.mjs record designs/reader cover.png --type image --source "Generated with the configured image tool"
```

`design.json` preserves unrelated metadata and records local assets and bindings. Figma/Canva transfer uses a real authorized connector when available. Otherwise the agent delivers a local handoff and states that transfer did not occur.

General interactive charts use the [chart stage contract](../skills/forma/references/charts.md) and pinned local D3/Sankey dependencies. Open `charts.html` in the showcase to try wheel/pinch zoom, exact-value tooltips, data updates, explicit empty states and actual SVG/2× PNG downloads. `data.html` retains the basic bar/line API.

The [data overlay guide](../skills/forma/references/data-overlay.md) documents live metric/feedback annotations, exact authored-view switching, provenance, reloads and local review drafts. Open `overlay.html` to inspect the explicitly synthetic fixture, turn paint/chrome on and off, and test modal occlusion. Real products require measured values and a reproducible analytics source.

The [document guide](../skills/forma/generations/documents/documents.md) distinguishes flowing text, explicit pages, true-size designs and scaled-fit layouts. `sheet.html` demonstrates a raw fixed HTML root: preview fitting and PDF paper sizing derive from its actual border box, without a document component. Width-only roots use their measured content height; portable output embeds the independent detector. `documents.html` exercises all four contracts, running slots and native print. Explicit true-size sheets fit their viewport automatically; `preview="actual-size"` restores natural screen dimensions, while PDF keeps the actual physical size; PDF export accepts `--paper letter|a4|legal` and `--orientation portrait|landscape`.

## Geographic maps

Follow the [geography guide](../skills/forma/references/geography.md) to bundle real country topology, choose world/regional projections, export SVG/2× PNG, and author interactive Leaflet street maps. `maps.html` is an ordinary HTML example with named selection and an opt-in street section. The demo helper builds both local library entries and the required `street.bundle.css`; tile requests start only on button activation. Vector standalone HTML retains its data after source deletion. Configure tile URL/attribution for your actual provider; synthetic fixture tests cover behavior, and live delivery remains a separate check.

## Source-to-audio presets

Follow the [shared audio workflow](../skills/forma/generations/audio/source-to-audio.md) and load only the preset that matches the listener's goal:

| Preset | Use when |
| --- | --- |
| [Podcast](../skills/forma/generations/audio/podcast.md) | The material benefits from a conversation or a requested solo episode |
| [Explanation](../skills/forma/generations/audio/explanation.md) | The listener needs to understand a concept or mechanism |
| [Video narration](../skills/forma/generations/audio/video-narration.md) | Speech must support a visual composition and its real timing |
| [Tutorial](../skills/forma/generations/audio/tutorial.md) | The listener needs ordered actions, prerequisites and checkpoints |
| [Summary](../skills/forma/generations/audio/summary.md) | The listener needs the essential findings quickly |

Presets guide editorial choices. They share source-linked scripts, duration planning, voice production and local assembly. Keep one canonical structured script and derive other representations mechanically. Retain completed clips and request outcomes, and send only changed or problematic blocks back for creative correction. Choose the output language and voice-production method per project: an available MCP or harness tool, a local engine, a configured provider or supplied recordings. The agent writes the script; `scripts/forma.mjs source-to-audio` checks the data and measures/assembles local clips without contacting a speech service. No HTML companion or browser is required for audio-only delivery.

```text
Use the forma skill to turn this document into a five-minute English podcast
for a general audience, with two presenters. Use my available speech MCP for voices.
Keep the script editable with source references, measure the finished duration, and
deliver the audio and transcript in designs/document-podcast. If the voice tool is
unavailable, deliver the script and a clear clip-production handoff.
```

For a tutorial, request follow-along or listen-through delivery and any intended pauses. For a summary, specify the audience and information priorities. For video narration, supply the storyboard or composition, identify fixed versus flexible scene timing, and request measured clips plus a scene-linked handoff or an actual integrated export. The sequential audio helper does not place audio at absolute scene times.

An automatic-duration brief can instead ask for the shortest useful explanation of the selected concepts. The agent recommends the scope and duration; word-rate estimates remain separate from measured playback. Duration correction revises source-supported blocks rather than cutting off speech or hiding a mismatch with padding.

For consistent playback levels, use `assemble --level-speech`; its adjustable mono preset targets −19 LUFS and a −2 dBTP ceiling. The helper measures individual clips and the encoded output, reports the results, and refuses to publish an unverified leveled result. Raw assembly remains available without the flag. See the recipe for target overrides and short/silent-clip handling.

## Generated sound assets

The [sound workflow](../skills/forma/generations/audio/sound-effects.md) describes `scripts/forma.mjs sound-effects`: descriptive prompts, optional duration, prompt influence, MP3 output and project provenance. Its default invocation prints an offline request plan. Add `--generate` only when making the configured provider request, with `ELEVENLABS_API_KEY` in the process environment. Use the resulting local MP3 with the existing animation audio markers. No native sound-generation tool or live provider result is assumed.

## Optional project preferences

Use `forma.toml` to retain the output directory, artifact language, audio preset and selected generation capabilities. Explicit task instructions and applicable project policies take precedence. The agent checks the actual session and asks only for missing choices needed for the requested medium. Generation can use the user's MCP, local engine, provider or supplied assets; Forma does not bundle inference. See the [configuration guide](../skills/forma/references/configuration.md) for the commented template and offline `init`, `check` and `resolve` commands.
