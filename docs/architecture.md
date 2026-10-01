# Architecture

`skills/codex-design/SKILL.md` is the entry point. `agents/openai.yaml` describes Codex UI and invocation. `project-types.json` maps thirteen modes to resources. `references/` holds original task recipes; `assets/starters/` holds editable runtime source. `scripts/` contains deterministic helpers and `scripts/lib/` their shared primitives.

The root contains documentation, tests, examples, and packaging. It is an npm workspace; the skill also has its own lockfile for independent installed-copy setup. Packages are pinned dependencies rather than opaque vendored bundles.

## Contracts

| Surface | Contract |
| --- | --- |
| Project | `design.json`, schemaVersion 1, `assets` and `designSystems` |
| System source | `system.json`, CSS entry, optional named React exports and sample props |
| Compiled system | `_ds_manifest.json`, `_ds_tokens.css`, optional `_ds_bundle.js`, SHA-256 hashes |
| System browser runtime | `window.CodexDesignSystem` with `React`, `createRoot`, `Components` |
| Canvas | `design-canvas` containing named `design-board` elements |
| Slides | `deck-stage` with direct child `section` elements and finished base styles |
| Motion | One `motion-stage` and `window.codexTimeline`: duration, dimensions, synchronous seek |
| 3D | Bundled `three-stage` with local Three.js and exporters |
| Component gallery | Ordinary local `.dc.html`, without hosted import protocol |

Native starters are classic scripts except the explicitly bundled 3D module. They need no React or remote service. React systems use a build step. Browser edits are local; Codex applies source changes.

## Tools

- `preview.mjs`: loopback HTTP, host validation, traversal and realpath checks.
- `project.mjs`: preserve metadata while registering assets.
- `design-system.mjs`: read-only inspection, compilation, review generation, hashed portable bindings.
- `figma.mjs`: offline inventory, raw mount, selected HTML, and system extraction.
- `build.mjs`: local JSX/TSX/module bundling.
- `export.mjs`: parsed HTML/CSS inlining, Chromium PDF/PNG, deterministic video.
- `verify.mjs`: runtime and screenshot probes, not semantic flow verification.
- `tools/install.mjs`: staged local copy and conflict-aware managed update.

File writes use sibling temporary files and atomic rename. Multi-file generation is not a database transaction; use fresh folders. Compiler output deliberately replaces its own generated files.

## Trust boundary

Figma schemas are interpreted as data with ByteBuffer, never compiled into JavaScript. Inspection does not evaluate source. Browser previews execute page scripts, so reviewed source and an appropriate environment remain necessary. Browser exporters restrict HTTP input and subresources to loopback; Codex browser tools have their own permissions. This package is not a sandbox for arbitrary imported code.
