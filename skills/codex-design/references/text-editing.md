# Literal HTML text editing

The reference editor permits direct editing of literal static headings, paragraphs and repeated items, then splices the edited text into the original HTML. Renderer-created text has no literal source range. The Codex replacement implements this as an explicitly selected local HTML save target; it does not depend on the reference host.

## Start a source editor

```sh
node skills/codex-design/scripts/preview.mjs /path/to/artifact --text-file document.html --port 4311
```

Open the reported origin and `document.html`. The service injects its owned runtime and temporary source identity markers into that response. No authoring library or extra script is required in the document. Source markers, editor controls and credentials are never written to the original HTML. For an installed skill, use its absolute script path.

Choose **Edit text**, then click a literal heading, paragraph, bullet, link or formatted fragment. A plain leaf can be edited directly on the page; the **Selected text** field also supports longer text and individual runs surrounding inline markup. Ordinary typing is batched for 250 milliseconds; composition input waits until composition ends. **Done**, inline Enter and leaving the page trigger a pending save. Shift+Enter retains a newline. **Cancel edit** or Escape restores the text from the start of that selection, including reversing a completed autosave. The status distinguishes saving, unsaved drafts and confirmed file saves.

Edits escape text, including `<`, `>` and `&`. They do not replace parent markup: links, emphasis, line breaks, comments, attributes, styles and other source bytes stay intact. Identical repeated bullets use separate source identities. Clearing a run preserves an insertion slot for retyping. The DOM retains its authored elements and listeners; direct leaf editing restores pre-existing `contenteditable` and `tabindex` attributes.

The runtime binds actual DOM elements through response-only marks. It can therefore find literal text after document layout moves it into print wrappers. Replacing a marked element, duplicating its mark or changing its text outside the editor invalidates that binding. Generated React/script content remains a code-editing task in Codex. This service does not rewrite arbitrary JSX, templates, Markdown or script expressions.

## History and conflicts

**Undo** and **Redo** write real HTML through the same service. The server retains at most 100 edits; restarting it clears that history. History does not cross unrelated source changes. Other editor services targeting the same file use one shared write queue. A whole-file content version is checked inside that queue and again before the temporary file is renamed. Conflicting text, deck, tweaks or timing saves are rejected instead of overwriting one another. A stale editor needs a reload even when another editor changed a different part of the file.

A failed or uncertain save leaves the current text and draft in the page. Autosaving pauses. **Copy draft** copies real text; when clipboard access fails, a selectable draft remains visible. **Reload source** retains pending drafts in session storage, then reloads the current file. Recovered drafts are displayed for review and are never automatically applied to a different source version. If browser storage is unavailable, reload is blocked while an unsaved draft exists; copy it first. If clipboard access also fails, manually preserve the selectable text and then choose **Draft preserved — reload**. Closing the browser with both file saving and draft storage unavailable cannot guarantee recovery. Unloading during an in-flight save can retain an already-saved draft for review; inspect the file rather than assuming another save is needed.

Only the selected `.html` file can be written. Writes require the loopback preview's exact origin, token and source version. Unknown keys, overlapping ranges, malformed Unicode, duplicate edits, path redirection and oversized requests fail explicitly. These checks coordinate this application's writers; they are not an operating-system transaction with unrelated external editors.

## Static and public previews

A static artifact can use the editor as a clearly labeled session preview:

```html
<text-editor></text-editor>
<script src="text-editor.js"></script>
```

Copy every `text-editor-*.js` companion and `text-editor.js`, or bundle the loader with the local build helper. Session mode changes the view, offers session undo/redo and copies a draft, but does not claim to update an authoring file. It cannot determine whether a displayed run was authored or rendered. The local source service makes that distinction from parsed source ranges.

`examples/editing.html` is the public session demonstration. Keep a public tunnel on the ordinary read-only preview; use `--text-file` on a separate local origin. The editor is hidden in print and `?capture` output. Export the saved source file to carry edits into portable HTML, PDF or PNG.

## Verification and remaining work

Tests exercise exact source bytes, mixed runs, entities, repeated bullets, clear/retype, real undo/redo/cancel, composition input, newer typing during a delayed save, document reparenting, renderer mutations during an active edit, retained conflicts, failed clipboard/storage, generated-content rejection, reload, actual edited PDF text, print/capture exclusion, origin/token/path/size guards and competing source writers. The runtime and server are independently written. Full reference visual comparison, actual IME hardware, touch selection and other browser engines remain required checks.
