# Wireframes and options

Explore structure and flows before decoration. Use neutral surfaces, realistic text lengths, one type family, and a clear hierarchy. Show functional layout rather than unlabeled rectangles. Keep fidelity intentionally low.

Use `canvas.js` with `<design-canvas><design-board label="...">...</design-board></design-canvas>` for several options. The canvas supports sections, notes, pan, zoom, focus navigation, renaming, grip reordering, removal/restoration, persistence, and artboard downloads. Follow the [canvas contract](../../references/canvas.md) for React APIs, required companion modules and project-sidecar saving. Choose differences that answer a design question: navigation, content priority, flow length, or information density.

Include concise annotations outside the UI when they explain a tradeoff. Make key transitions clickable if the question concerns behavior. Let the user select a direction before increasing fidelity.

Existing plain HTML comparison pages can keep `design_doc_mode=canvas` metadata and direct body frames. The local preview and standalone exporter provide their viewport while retaining authored nodes and controls; see the [plain HTML canvas contract](../../references/canvas.md#plain-html-metadata-canvas).
