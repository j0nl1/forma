# Capabilities

Studio Design creates local, editable design artifacts through any agent harness with the required local capabilities. Read the relevant skill recipe for authoring and the [known limitations](limitations.md) before choosing an export or external integration.

| Workflow | Available tools | Output and interaction |
| --- | --- | --- |
| Interface, website, prototype and wireframe | Interface/prototype/mobile recipes and native HTML | Responsive layouts, working flows, keyboard access, optional comparison variants |
| Comparison canvas | Native elements or React canvas | Pan/zoom, sections, notes, focus, reorder/hide, browser state, opted-in project saves and PNG/HTML snapshots |
| Presentations | Deck runtime and PowerPoint exporter | 44 HTML build effects, click groups, thumbnails, notes, fullscreen, structural editing, undo, PDF print and editable/image-based PPTX with supported native builds and local media |
| Documents and print | Document and fixed-sheet runtimes | Flow/explicit/fixed/fit layouts, Letter/A4/Legal geometry, running content, text editing and real PDF output |
| HTML email | Table-based starter and email recipe | Inline styles, preheader and dark palette; verify in actual target clients |
| Mobile, browser and desktop contexts | Device/window components | iOS/Android/Chrome/macOS shells, authored content, live controls and image-only exports |
| Social campaigns | Social boards, feed/story/phone shells | Fourteen placements, grouped carousels, format controls, image editing and nominal-size PNG/ZIP downloads |
| Charts, diagrams and geography | Local D3/Sankey/TopoJSON/Leaflet and overlays | Interactive charts, real country geometry, optional configured street tiles, annotations and SVG/PNG exports |
| Research and review | Available harness tools and authored overlays | Cited sources, provenance, feedback views, local clipboard drafts and typed design controls |
| Animation and video | Continuous composition, scene/sprite APIs and watercolor | Authored cues, persistent shots, captions, timing editor, source saves and MP4/WebM/GIF export |
| Audio | Marked-media mixer and configured sound-effects helper | Local ranges/loops/speed/gain, AAC/Opus mixing and generated MP3 assets |
| Source-to-audio | Shared production workflow with podcast, explanation, video narration, tutorial and summary presets; user-selected voice tools and existing offline podcast helper | Canonical editable scripts, target or recommended duration, reusable render blocks, local clip checks, MP3/WAV assembly and optional verified speech levels; video narration adds scene-linked handoffs using the motion/export contracts |
| 3D | Three.js stage | Orbit/pan/zoom, turntable, studio framing, GLB loading and GLB / OBJ + MTL downloads |
| Design systems | Source checker, compiler, imports and review | Tokens, typed component contracts, scoped libraries, portable interactive guides and advisory adherence checks |
| Figma import | Offline decoder and component generator | Inventory, raw mount, selected rendering, editable React variants and system extraction, with fidelity warnings |
| Existing HTML/GitHub source | Read-only inspection and import recipe | Reviewed source conversion, localized assets and retained attribution |
| File previews | Live-file runtime | Existence/rewrite detection, physical crops, waiting states, expanded views and local action events |
| Images and AI prototypes | Available tools or configured backend | Real image assets, image-slot editing, supplied PDF input and explicitly labeled local simulations |
| Delivery | Local export helpers and available connectors | Standalone HTML, PPTX, PNG, PDF and video; authorized transfers require an actual connector |

## Editing and persistence

Generated artifacts belong to the user's project. Browser controls retain state as documented; the preview server can write selected canvas, deck, timing, text, image and typed-tweak edits to project files through explicit options. Static/public previews do not write source files. Keep the authored folder and assets when delivering an editable application.

Runtime identifiers, event names and storage keys remain stable across the Studio Design rename so existing authored artifacts and saved browser settings continue to work.

## Boundaries

PowerPoint exports support native text/shapes, individual pictures, isolated CSS background layers, composed uniform 2D scaling/translation/rotation, safe rounded foreground, explicit embedded font faces, supported native builds with authored pivots, explicit nested repeat resets, disjoint group opacity and leaf masks, plus bounded transparent picture builds for overlapping fade/wipe composition, local playable media with source-range/rate/gain copies and verified click activation for eligible visible videos and screenshot decks with notes. Inseparable CSS and unsupported animation targets use explicit static fallbacks. See the [PowerPoint guide](../skills/studio-design/references/powerpoint.md). External generation, live model interactions, tiles and transfers use the actual available tools or explicitly configured providers. No simulated integration is described as a completed transfer or provider result. See [known limitations](limitations.md) for specific export, editing and import constraints.
