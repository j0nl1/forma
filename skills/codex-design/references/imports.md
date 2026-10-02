# Importing design context

## Local Figma files

`scripts/figma.mjs outline <file.fig>` inventories pages, frames, and components offline. `mount <file.fig> <destination>` saves a navigable JSON tree and assets. `render <file.fig> <destination.html> --node <id-or-exact-name>` materializes a selected node as HTML. `materialize <file.fig> <destination> --node <id-or-exact-name>` writes selected HTML plus tokens. `design-system <file.fig> <destination>` creates a native system with extracted colors and HTML component examples, ready for the design-system compiler.

The independent decoder supports raw `fig-kiwi` and ZIP `canvas.fig`, deflate and Zstandard. It reconstructs parent-child order and preserves raw node properties and blob data in the mount. The renderer supports saved geometry, ordered solid/gradient/image fills, real text, vector path blobs, transforms, and common layout properties. Unsupported effects, masks, constraints, and complex instance overrides are recorded as warnings, so do not claim pixel-perfect conversion. Compare with supplied Figma exports when fidelity matters. Keep original files unchanged.

Visible drop/inner shadow stacks now render with their offsets, color alpha, radius and box spread. Text and solid vectors use their painted alpha shape; vector corners remain transparent instead of becoming a filled rectangle. SVG inner filters are embedded with the HTML and work in compiled review shadow roots. Normal layer/foreground blur and backdrop blur retain their ordered filter chains. Hidden effects do not render or produce unsupported-effect warnings. The effect fields follow the inspected source contract and [Figma's documented effect inputs](https://developers.figma.com/docs/plugins/api/Effect/); that does not establish exact rendering equivalence across all Figma exports.

Run `materialize` or `render`, inspect returned warnings, then serve the selected HTML. Geometry retains its source dimensions while the preview can fit it to the screen; pixel checks must account for that presentation scale. Normal shadow/blur output remains usable after deleting the original `.fig`. The exported HTML contains its filter definitions; PNG export captures the painted result. Tests cover raw/ZIP imports, a separately authored box-shadow rendition, actual text/vector inner pixels, blurred foreground/background pixels, source deletion and compiled reviews.

Non-normal effect blend modes, bound variables, progressive blur, noise/glass/texture/shader effects, spread on text/vector silhouettes and explicit shadow-behind-translucent-geometry behavior still need visual review. These are pending behaviors, not silently discarded acceptance requirements. Masks, complex vector paints/compositing, instance overrides, constraints, variable modes, typography and broader Figma/reference comparisons also remain incomplete. Generated geometry is not yet the full component/variant authoring model.

Visible paint layers now render in source order, with the last layer on top, retaining color alpha and paint opacity. Linear gradients use their transformed start/end coordinates; radial and angular gradients retain their center, size and direction. A missing transform uses the documented default geometry, while malformed/singular transforms produce an explicit advisory and default rendering. Diamond gradients retain the source materializer's radial approximation with a warning. Rotated/skewed radial ellipses also need visual review. Hidden paints neither render nor enter the extracted color inventory; gradient stop colors now enter that inventory with their paint alpha.

Image fills embed their assets in a separate SVG background layer so opacity affects only that image and does not cover children or inset shadows. FILL uses centered cover; FIT uses centered contain and retains underlying layers in the letterbox area. TILE repeats at the saved original dimensions multiplied by the saved scale, using intrinsic PNG/GIF/JPEG/WebP dimensions when the hints are absent. CROP/STRETCH use the inverse normalized paint transform. Missing or invalid crop transforms retain cover fallback with a warning. Paint blend modes use native CSS composition; unknown modes remain normal fallback advisories. Image filters and separate rotation fields remain pending and explicitly warned.

Solid and linear vector layers paint the actual paths in order, with embedded SVG gradient definitions and transparent corners. Other vector paint types remain explicit unsupported warnings. Text keeps its literal glyphs and typography while gradient/image layers clip to the glyphs. Tests compare independently authored solid-stack, gradient, blend and text regions byte for byte, sample actual image fitting/tiling/crop/stretch/alpha pixels, and verify intrinsic PNG/JPEG/WebP tile sizes. Materialized, portable HTML/PNG and compiled system reviews retain their paints after deleting the original Figma file. These checks verify the stated contracts rather than full Figma fidelity.

For live Figma access or a faithful screenshot, use the installed Figma connector if available and authorized; follow its skill requirements. Do not silently require an account for offline inventory.

## GitHub and codebases

Read repository metadata, license, and selected files with `gh api` or ordinary read-only HTTP. Pin the commit and keep a source snapshot outside the project. Do not execute install hooks, examples, or upstream scripts merely to obtain context. Extract typography, tokens, component contracts, states, and assets from source, then write a native system or prototype.

## Existing HTML/CSS

Inspect source and local dependency paths before rendering. Preserve useful tokens, layout, content, and interactions. Imported JavaScript is active code; inventory can be done without executing it. Copy permitted assets into the deliverable and retain attribution. For a faithful recreation, compare screenshots after rebuilding.

`.napkin` or other sketch files should use supplied thumbnails when available. Raw sketch JSON is supporting data, not a ready-made screen.
