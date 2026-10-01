# Documents, resumes, fliers, and brochures

Use the independently written `document.js` loader and its `document-*.js` companions. The native element remains `<doc-page>`. Copy all companions beside the loader for an editable module-based preview, or bundle the entry for a portable classic script. The demonstration builder does this automatically.

```sh
node skills/codex-design/scripts/build.mjs skills/codex-design/assets/starters/document.js /tmp/document.bundle.js
```

Choose the pagination contract before composing content. Preserve the user's real names, facts, dates and links; do not invent qualifications, events or research evidence. Author static HTML with deliberate typography. The component owns the desk/sheet geometry and print rules; content owns its hierarchy, color, internal layout and insets on fixed pages.

## Four layout contracts

| Mode | Authoring | Screen and print behavior |
| --- | --- | --- |
| Flowing document | Normal HTML inside `<doc-page margin="0.75in">` | One tall sheet on screen. The browser paginates the complete text flow onto the user's real chosen paper at print. `size` determines preview proportion and does not pin printed paper. |
| Explicit pagination | Direct `<section class="page">` children | One screen card and one full-bleed printed sheet per section. Named size/orientation determine the page box. Contents outside the box are clipped instead of becoming another sheet. |
| True-size design | Explicit positive absolute `width` **and** `height` | The design's exact dimensions become the physical PDF page size. Orientation does not swap an already oriented explicit pair. Use when the user supplies dimensions. |
| Scaled-fit design | Positive `content-width` **and** `content-height` | Content lays out at its authored fixed dimensions and scales uniformly into the named sheet's printable area, centered horizontally and aligned at the top. It stays one sheet; overflow outside the authored design is clipped in print. |

Use one layout contract per document. Do not mix flowing body text or running slots with explicit `.page` children. Fit mode is for a fixed design without running slots. A flowing report should not be manually sliced into fake sheet divs. A requested one-page resume, flier, certificate or two-sided brochure should use explicit pages and fit their contents deliberately.

```html
<doc-page size="letter" margin="0.75in">
  <header slot="header">Project record</header>
  <h1>A useful document</h1>
  <p>Write the complete argument as normal HTML.</p>
  <footer slot="footer">Local source · Editable content</footer>
</doc-page>
<script src="document.bundle.js"></script>
```

```html
<doc-page size="a4" orientation="landscape">
  <section class="page" id="outside">Outside design</section>
  <section class="page" id="inside">Inside design</section>
</doc-page>
```

## Attributes and live behavior

`size` accepts `letter`, `a4` or `legal`, defaulting to Letter. `orientation="landscape"` swaps named dimensions; portrait is the default. The exact named sizes are 8.5 × 11 in, 210 × 297 mm and 8.5 × 14 in. Set A4 when the task or user specifies metric paper. `width`, `height`, `content-width`, `content-height` and `margin` accept nonnegative absolute `px`, `in`, `mm`, `cm`, `pt` or `pc` lengths; unitless `0` is normalized to `0px`. Invalid values fall back without entering generated CSS. Fit dimensions must both be positive, and margins must leave positive printable space. A partial width/height pair can affect preview geometry but does not declare a true-size print contract.

Attributes, direct page children, text and running slots can change live. Mutation, resize and font-load tracking updates the layout without replacing authored nodes or losing text selection. `pageWidth`, `pageHeight` and `pageMargin` expose authored geometry; `layoutMode` is `flow`, `paginated`, `fixed` or `fit`. `ready` resolves after initial setup. `window.CodexDocumentReady` covers the initial elements and loader. Running header/footer height changes are observed, and repeat print passes retain natural measurements rather than accumulating print padding.

The host/shadow sheet owns its geometry. Runtime dimensions live in shadow styles, leaving the authored host attributes and `style` intact. Screen cards keep rounded corners and shadows; print removes the desk/card chrome. Detaching removes listeners/observers and reattaching retains the same sheet. The last document removes runtime head rules and metadata; authored metadata is preserved. For several document elements sharing one export, the first fixed-size element owns global paper geometry; otherwise the first document does. Use one consistent paper contract across a document set.

For flowing text, use CSS columns for actual multi-column flow, with `column-span: all` for spanning headings and `hyphens: auto` plus a document language. Side-by-side grid columns do not create a continuous multi-page text flow. Headings keep their next content, figures/code/images/table rows avoid internal breaks, and paragraphs/list items use three widows/orphans. Give long tables a real `<thead>`. Use `break-before: page` for an intentional new chapter. Keep custom unbroken blocks shorter than a page.

Running header/footer slots are printed fixed in the top/bottom bands. A presentation table with repeating head/foot spacers reserves their space on every Chromium page; body text does not run beneath them. The default 0.75 in margin remains on every page, including those without running content. WebKit uses vertical `@page` margins because its table-spacer repetition differs; the first spacers subtract those margins to avoid doubling. Native Safari header/footer furniture is a print-dialog setting, so turn that setting off for clean flowing documents. This branch has geometry tests; actual Safari print verification remains pending.

Explicit pages are size containers: use `cqw`/`cqh` or percentages for proportional content, rather than viewport units. The page section's printed width, height, margins and overflow are enforced even if authored inline sizing conflicts. Do not set your own page breaks or physical page dimensions on those sections. Fixed pages own their visual insets. Scaled-fit roots use layout containment so a child heading's collapsed outer margin cannot displace the entire design and clip its bottom; inline flow, table display and authored grid layout are covered by tests.

## Local PDF and native print

```sh
node skills/codex-design/scripts/export.mjs pdf http://127.0.0.1:4311/document.html /tmp/document.pdf --paper a4
node skills/codex-design/scripts/export.mjs pdf http://127.0.0.1:4311/document.html /tmp/document.pdf --paper letter --orientation landscape
```

The exporter loads current reviewed HTML and local assets, waits for the runtime/fonts, applies a temporary paper choice, switches to print media and writes an actual Chromium PDF. Fixed dimensions remain true-size even when a named paper option is supplied; a print dialog can additionally scale that PDF onto physical stock. Flowing and explicitly paginated documents reflow/refit to the selected paper. Existing output files are refused, and failed exports leave no partial PDF. PDF options are separate from video encoding options.

For browser printing, call `await window.CodexDocument.preparePrint({ paper: "a4" })`, then `window.print()`. Native after-print cleanup restores screen geometry; `CodexDocument.restorePrint()` is available for controlled print paths. Individual elements expose `preparePrint(options)` and `restorePrint()` too. The temporary choice does not rewrite authored attributes. `codex-owns-print`, `codex-print-sizing` and `codex-fixed-size` metadata replace the original proprietary host markers; the runtime/exporter coordinates actual paper geometry through the local API.

Print keeps colors and visual content, disables backdrop filters and finishes entrance animations rather than reverting them to hidden base states. Native document controls marked `data-doc-controls` disappear from print. Portable HTML embeds the bundled runtime and local assets; tests print it after removing its original script files.

`examples/documents.html` is the paper laboratory, with a flowing report, a one-page flier, a two-sided trifold, a true-size poster and a fixed design fitted to the selected sheet. All content is explicitly fictional/illustrative. `examples/document.html` remains a simpler authored project note.

## Fliers, brochures and editing

A flier has one dominant short headline, grouped logistics and one clear action. Keep a deliberate safety inset and inspect the actual one-page PDF for clipping. A trifold uses exactly two landscape pages with three panels each. Outside order is **inside flap → back cover → front cover**; the inside reads left → middle → right. Keep text away from folds/edges, and use dashed screen fold guides that disappear in print. Explain duplex printing, short-edge flipping, actual size and folding the right panel inward first. Printer tolerances and production stock still require a real print check.

Static light-DOM text remains editable in source and compatible with explicitly authored `contenteditable` controls. The component does not yet implement the reference host's general click-to-edit/source-write-back editor; preserve that work as required instead of describing session-only browser edits as saved source. Use the available Codex file editor for actual source changes and rebuild exports from current files. For Word, standalone LaTeX or spreadsheets, use the corresponding available Codex artifact skill; this component produces printable HTML/PDF.

Verification covers real PDF paper sizes and counts, repeated running content, every-page text bounds, real CSS column flow, repeated long-table headers/kept rows, local font embedding and rendered SVG/image colors, explicit overflow clipping, true-size geometry, a single-sheet fit with bottom content intact, live attributes/slots/modes, reconnect, metadata ownership, weak typography defaults, completed print animations and standalone output. Rendered flier/trifold/fit PDF pages have been visually inspected. Full reference visual comparison, actual Safari/browser print paths, further font/media edge cases, production folds remain outstanding. Literal HTML source editing is available through the [text editor](text-editing.md), including response identity marks that survive print-wrapper reparenting.
