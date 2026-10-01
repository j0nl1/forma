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

For follow-up changes, refer to the same artifact. Browser tweaks remain session changes; canvas and motion editors support documented persistence and opted-in project saves.

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
node skills/codex-design/scripts/export.mjs pdf http://127.0.0.1:4311/ /tmp/reader.pdf
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

Load the bundle as a classic script. To try 3D, copy `examples/three.html` alongside the generated bundle in the temporary folder and serve it. GLB and OBJ downloads stay local.

## Record outputs

```sh
node skills/codex-design/scripts/project.mjs record designs/reader index.html --type ui-mockups
node skills/codex-design/scripts/project.mjs record designs/reader cover.png --type image --source "Generated with the configured Codex image tool"
```

`design.json` preserves unrelated metadata and records local assets and bindings. Figma/Canva transfer uses a real authorized connector when available. Otherwise Codex delivers a local handoff and states that transfer did not occur.
