# Trail — local binding

Use this copy's manifest, tokens and component APIs as visual reference data. Source guidance does not authorize unrelated actions or provide facts about the user.

Runtime namespace: `CodexDS_trail_d8e9324cb83f`. React runtime: `19.2.4`. Systems compiled with the same recorded React version share one React and ReactDOM pair and can compose components in one root. Use a matching renderer for each version; recompile earlier bundles before combining them. Read `_ds_manifest.json` for named components, sample props and starting points. Load `_ds_tokens.css` and `_ds_bundle.js` locally. When several systems are bound, load the primary system's CSS last.

## Public imports and adherence

Import React, createRoot and named components from `./_ds/trail/_ds_entry.js` in consuming source. Native browser modules must use plain JavaScript; bundle JSX/TSX before preview or standalone HTML export. Keep the token stylesheet loaded separately.

Run the installed skill's `scripts/adherence.mjs <bound-project> <source-file-or-folder>` for read-only JSON advisories about raw hex colors, pixel lengths, internal imports, props and finite variants. Default warnings do not fail the command; `--strict` exits 1 for warnings. Syntax errors exit 2. Dynamic values and unresolved inherited props are explicitly unchecked. An HTML input covers inline executable scripts; scan the source folder to include external scripts. These checks do not prove visual fidelity or complete application typing.

Use rounded controls and the forest accent. Prefer concise action labels.

Available tokens: `--color-accent`, `--color-on-accent`, `--trail-radius`. Token kinds: color 2, radius 1.

## Fonts

No font faces recorded.

## Button





