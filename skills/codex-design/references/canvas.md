# Canvas authoring, editing and export

A canvas compares functioning artboards in a shared pan/zoom world. Sections organize options; notes explain a tradeoff outside the product UI. Stable section and artboard identities keep edits attached to the intended source content. The independently written runtime supports both native DOM authoring and the reference's React authoring names.

## React authoring

Copy `canvas-components.jsx` and its imported `canvas-*.js` modules into the project, then bundle the application with the local build helper. Import the four public components:

```jsx
import { DesignCanvas, DCSection, DCArtboard, DCPostIt } from "./canvas-components.jsx";

<DesignCanvas id="navigation-options" minScale={0.1} maxScale={8}>
  <DCSection id="navigation" title="Navigation directions" subtitle="Compare the same task" gap={48}>
    <DCArtboard id="compact" label="Compact" width={360} height={640}>
      <WorkingPrototype />
    </DCArtboard>
    <DCArtboard id="spacious" label="Spacious" width={360} height={640}>
      <WorkingPrototype spacious />
    </DCArtboard>
    <DCPostIt top={-10} left={810} width={180} rotate={3}>
      Compare task completion before choosing the density.
    </DCPostIt>
  </DCSection>
</DesignCanvas>
```

Direct fragments are flattened. Only direct `DCSection` children participate in the registry, and only direct `DCArtboard` children in each section participate in ordering/focus. Other section children are preserved. A section defaults to `id ?? title`; an artboard to `id ?? label`. Use explicit nonempty unique IDs; board IDs are scoped to their section. React artboards default to 260 × 480. Artboard `style` applies to the card; canvas and section `style` apply to their containers. Post-it props support `top`, `left`, `right`, `bottom`, `width`, and `rotate` (default −2 degrees). Notes retain authored text and placement.

React keeps ownership of its artboard DOM. Reordering does not remount a keyed prototype; hiding unmounts it and restoring mounts it again. Focus renders another instance through a portal to the document body, matching the reference's separate focus instance. Native focus moves the existing board temporarily, retaining its DOM event listeners and restoring it on close. Focus is session state and is never saved.

## Native DOM authoring

Copy `canvas.js` and all `canvas-*.js` modules beside it, or bundle `canvas.js` into a single classic script. Serve the document over HTTP. The unbundled loader supports classic and module script tags; `window.CodexCanvasReady` resolves when the elements are registered.

```html
<design-canvas id="navigation-options" min-scale="0.1" max-scale="8">
  <design-section id="navigation" title="Navigation directions" subtitle="Compare the same task" gap="48">
    <design-board id="compact" label="Compact" width="360" height="640">
      <article>Working prototype content</article>
    </design-board>
    <design-note top="-10" left="420" rotate="3">Keep the main action visible.</design-note>
  </design-section>
</design-canvas>
<script src="canvas.js"></script>
```

Flat `design-board` children remain supported as an implicit section. Native boards retain the previous 420px/automatic-height defaults and accept numeric or pixel width/height values. Use `::part(card)` for native card styling. `canvas-id` overrides an element's DOM ID when those identities need to differ. The examples include both the flat native canvas and `canvas-react.html` with sections, notes and live controls.

## Plain HTML metadata canvas

The documented HTML host contract uses `<meta name="design_doc_mode" content="canvas">` with absolutely positioned frames directly in `body`. The local preview now recognizes that metadata and adds an independently authored viewport without reparenting those frames. Existing `body > ...` selectors, IDs, inputs, event listeners and authored positions remain usable. Keep each frame's left/top nonnegative; fixed design frames may extend beyond the preview viewport.

```html
<head>
  <meta name="design_doc_mode" content="canvas">
  <style>
    body > article { position:absolute; width:360px; height:500px; }
    #one { left:44px; top:100px; }
    #two { left:452px; top:100px; }
  </style>
</head>
<body>
  <article id="one">First working direction</article>
  <article id="two">Second working direction</article>
</body>
```

Serve ordinary local HTML with `preview.mjs`; no source mutation or starter copying is required for metadata activation. The preview injects its own bundled runtime only into marked HTML responses. `export.mjs html` embeds that runtime in standalone output, which continues working after source removal. For another static server, bundle `plain-canvas.js`, include it with `data-codex-plain-canvas-runtime` on the script, and keep the metadata. The marker avoids duplicate automatic injection. Raw classic loading requires the editable companions, including `canvas-viewport.js` and `canvas-export.js`.

The body is the transformed world; local toolbar chrome sits outside it. Background dragging and middle-button dragging pan, trackpad scrolling pans, mouse notches and Ctrl/Meta scrolling zoom, and Safari gesture events use the shared viewport module. Ordinary pointer actions inside a direct body frame remain with its authored controls. Plain wheel events on `data-dc-wheel-passthru` or `data-codex-wheel-passthru` content pass through; modifier zoom still works. Toolbar wheel input leaves the artwork unchanged.

Fit uses the authored content extents. Reset view restores 100% at the origin. The viewport persists in browser storage separately from native/React canvases, and an offscreen saved view resets after two visibility checks. Unavailable storage does not prevent interaction. Same-document `#id` links reveal their target at the current scale, retaining the IDs and browser history. Dynamic body frames update the export selector. Disabling metadata restores the original inline body transform and removes owned styles/controls. A native `design-canvas` takes over without a second viewport.

Choose a direct body frame for actual 3× PNG or styled HTML downloads. Those exports normalize the selected root's authored left/top offsets, use natural dimensions independently of viewport zoom, embed local assets, retain current form values and omit runtime chrome. HTML downloads are snapshots with the same script/closure limitations described below. This frame selector is a local addition; it does not invent section titles, reorder state or hidden options for plain HTML. Native/React section editing and its project sidecar remain separate contracts. Metadata activation alone does not enable project-file writes. Opt-in `--text-file` source editing composes with this viewport: its owned editor chrome and typed tweak panels stay outside the transformed body, and literal edits use the original file version rather than injected response content. Print removes viewport transforms and chrome, using authored layout.

`window.CodexPlainCanvasReady` resolves after installation. `window.CodexPlainCanvas.viewport` exposes `.value`, `.set()`, `.zoom()` and `.fit()`. Metadata changes, native canvas insertion and complete installation teardown restore ownership. `canvas-html.html` demonstrates three original directions with working controls and cross-option links.

## Interaction

- Drag the background to pan. Middle-button dragging also pans over an artboard. Drag the grip to reorder within a section; the grip supports Left/Right keys. Separate move buttons remain available.
- Trackpad scrolling pans. A notched mouse wheel zooms by a factor of 1.1 per click. A burst starting as trackpad scrolling remains a pan when its momentum tail resembles wheel clicks. Ctrl/Meta smooth scrolling zooms around the pointer; native gesture events support Safari pinch. Plain scrolling over a `deck-stage` passes through to the deck.
- Zoom buttons, Fit and the percentage readout provide local controls. Transform changes emit `codex-canvas-viewport`; `canvas.viewport.value`, `.set({x,y,scale})`, `.fit()` and `canvas.zoom` allow local integration. No proprietary host messages are required.
- Edit a section title and blur or press Enter to commit it. Artboard labels update while typing. The actions menu includes PNG/HTML download and a two-step delete; the earlier direct remove button remains available. Restore removed unhides all boards.
- Focus fits the artboard to the window and provides a section selector, board dots, previous/next buttons and keyboard navigation. Left/Right wrap within the section; Up/Down wrap across nonempty sections and select the first visible board. Escape or the backdrop closes focus.

Chrome stays readable as the canvas zooms. Viewport transforms persist per document and canvas ID, independently of content edits. An offscreen restored viewport is reset after two checks so regenerated content remains reachable. Pointer cancellation releases an active pan or reorder without committing a cancelled drag.

## Persistence and source changes

Static previews save edits in browser storage. Save canvas state downloads JSON; Load canvas state imports that JSON, including partial section overrides from the reference sidecar format. If browser storage is unavailable, the controls still work and the status explains how to retain the state. `stateFile` / `state-file` optionally reads an authored JSON sidecar; it does not grant browser writes to that file.

For actual project persistence, explicitly select the HTML document:

```sh
node skills/codex-design/scripts/preview.mjs /path/to/design --canvas-file canvas.html
```

The preview connects the first canvas in that document to its fixed sibling `canvas.design-canvas.state.json`. Edits save after a 250ms debounce; a new empty sidecar is not written on initial load. State hydration settles before editing becomes active. Saves require the preview's origin and token, validate the state as data, and compare both HTML and sidecar versions before an atomic write. A conflicting source change is reported instead of overwriting it; download the browser state before reloading. Other canvases in the document retain browser persistence. Public static previews do not write project files.

The state has a `sections` object, keyed by source section identity. Each section stores optional `title`, `labels`, `order`, `hidden`, and `srcKey`. The source key joins authored board IDs with a unit separator. Unknown ordering IDs are discarded; new source boards are appended. Saved hides apply only when the authored ID sequence still matches. Changing that sequence reveals the source boards again, while matching labels, title overrides and ordering remain. Renaming a display label never changes the board's identity. Unedited section titles follow the source. The native API captures authored boards on load; React also reconciles dynamic authoring changes.

## Artboard exports

The actions menu downloads the card at its natural dimensions, independently of canvas zoom. PNG renders at 3× resolution. HTML is a styled snapshot with images, background assets and font faces embedded. Canvas paintings become images, and current form values are preserved. Script elements are excluded; inline handlers already authored in the page are retained in HTML. React event closures and JavaScript application bundles are not exported by this snapshot action. Use the full application bundle when delivering an interactive React artifact.

Inline SVG snapshots preserve attribute namespaces, including local `<use xlink:href="#id">` and SVG2 `<use href="#id">` references. Both forms retain their defined geometry in PNG and portable HTML. Tests download actual 3× PNGs at different canvas zoom levels and compare every solid pixel, then decode the portable SVG after deleting the copied source and runtime.

Assets are local by default. An explicit native `allow-external-assets` attribute or React `allowExternalAssets` prop allows browser fetches of external assets and inaccessible stylesheet/font rules; those servers must permit the fetch. An unresolved asset reports an export error. Font, image and shadow-component edge cases still require broader visual comparisons; a successful download alone does not prove reference fidelity.

## Verification status

Tests cover scoped identities, title/label/order/hide persistence, changed-source reconciliation, dynamic React updates, live focus controls, wrapping and empty-section skipping, wheel latching/pinch, scaled grip reordering, cancellation, offscreen recovery, storage failure, versioned source writes and real 3× PNG/HTML output with embedded image pixels. Representative desktop/mobile and focus views have been inspected. Full reference visual comparison, Safari hardware gesture testing, broader font/media exports, multi-canvas layouts and original host appearance remain pending. The plain HTML metadata contract now has tests for direct-node retention, selectors/listeners/form state, dynamic activation, storage/recovery, hash navigation, native handoff, gesture routing, real positioned-frame PNG pixels/HTML and portable source removal. Keep those requirements in the functional inventory.
