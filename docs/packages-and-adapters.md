# Packages, generations and reusable resources

Forma separates technical workflows from reusable creative resources. Packages own execution and integration logic. Catalog resources own their editable source, styles, assets, parameter schema, usage notes and local preview. Generation folders guide creative decisions.

```text
packages/
  core/            project preferences, metadata, timeline data and source transactions
  runtime/         browser execution, controls, local bundling and source editing
  media/           capture, encoding, audio planning and assembly
  exports/         HTML, PDF, PNG and PowerPoint output
  design-systems/  source inspection, CSS, compilation, project bindings and review
  figma/           decoding, rendering and component extraction
  catalog/         data inventory, contained copies and local browsing pages
  cli/             command parsing and application composition
catalog/
  audio/<resource>/
  video/<resource>/
  slides/<resource>/
  documents/<resource>/
  interfaces/<resource>/
  data/<resource>/
    manifest.json
    source files, styles and assets as required
    README.md
    preview.html
skills/forma/
  generations/     creative guides by medium
  references/      shared authoring and integration contracts
  scripts/forma.mjs
examples/          complete compositions
```

## Ownership

Core has no dependency on another Forma package. Runtime and Figma depend on core; Figma may use runtime helpers. Media depends on core and runtime. Exports depends on core, runtime and media. Design systems depends on core, runtime and exports for portable HTML output. Catalog depends on core and runtime for optional preview compilation. CLI composes these packages. Workflows do not import the CLI.

The runtime browser source is grouped into motion, slides, canvas, documents, data, images, interfaces, three-dimensional execution, controls, editing, design-system review and shared font helpers. Pure scene, clip and audio-plan contracts live in `core/src/timeline/`. These contracts can be used by the browser and local workflows without browser execution.

The Figma package groups decoding, rendering and component extraction. Design systems groups source/contracts, CSS/token interpretation, compilation, project bindings, review and adherence. Binding a design system means copying verified artifacts into a project and registering their identity; it is separate from rendering the project's final output.

React and ReactDOM use the single pinned 18.3.1 pair. Browser source introduces no alternate React installation. The harness remains responsible for user-selected speech and image inference.

## Resource manifests

Every indexed resource has a `manifest.json` beside its primary source. It declares an ID, kind (`primitive`, `component`, `template` or `preset`), description, supported targets, tags, requirements, editable parameter schema, dependency IDs, entry and explicit source inventory. The inventory includes the resource's manifest and local preview. Supporting assets are present when the implementation needs them; empty asset folders are not required.

Existing canvas and platform authoring modules now live with their resource manifests. Shared clocks, controls and processing stay in packages. The video title and lower-third primitives accept authored time as a prop; the native composition template combines them with the shared timeline. Audio presets contain an editable authoring blueprint and the canonical editorial guide. A blueprint requires source and script work before it becomes a valid production episode; it does not select voices or install an inference engine.

Parameter schemas describe the resource's editable interface. JSX previews expose scalar controls where provided. They are usage examples, not automatic adapters for arbitrary prop types or a comprehensive schema validator. Dependencies expose which other resources are reused, while the explicit inventory supplies the exact files to copy. A dependency's manifest accompanies its source. Implementations have one canonical source; the catalog does not duplicate the runtime.

## Mechanical discovery and copying

```bash
node skills/forma/scripts/forma.mjs catalog list --target video --kind primitive
node skills/forma/scripts/forma.mjs catalog show video-title
node skills/forma/scripts/forma.mjs catalog add native-composition /absolute/project --dry-run
node skills/forma/scripts/forma.mjs catalog add native-composition /absolute/project
npm run catalog:site -- /absolute/preview-directory
```

`list` reads concise metadata without installing the source parser. `show` reads only the selected manifest and its usage or canonical guide. `add` copies the selected source, dependencies and manifest into `assets/catalog/<id>/`, records SHA-256 provenance and registers its entry in `design.json`. Existing metadata is preserved. Source and destination symlink escapes and existing destinations are rejected.

Literal JavaScript/TypeScript imports, exports, dynamic imports and `new URL(..., import.meta.url)` asset references are parsed as data and rebased to the copied layout. Ordinary strings, comments and authored content are preserved. Bare package imports remain dependencies of the consuming project. Executable imports must be in the declared source inventory; this is not automatic package resolution. Preset guide dependencies are copied mechanically, with repository-only references retained as links.

The browsing page and CLI share the same index. Page generation copies the declared resources and bundles reviewed local preview entries. Browsing, filtering and local previews require no hosted registry. Complete demonstrations remain in `examples/`. The agent chooses a resource and writes content; copying, path rebasing, hashing, validation and media assembly are mechanical.

## Execution ports

`renderVideo(page, errors, output, temporary, options, adapters)` accepts capture and encoding implementations. A capture session supplies `capture()`, `close()`, its effective method and diagnostics. Chromium provides standard and opt-in fast PNG capture. FFmpeg provides the owned encoder process. Seeking, decoded-media readiness, frame verification, cancellation, backpressure and diagnostics belong to the workflow.

`exportArtifact(mode, input, output, options, adapters)` accepts a page-session implementation and format implementations. Defaults preserve local-resource restrictions and configured font grants. Temporary output, non-overwrite checks, cancellation and final publication remain in the workflow. JSON configuration cannot load executable adapters.

Source-to-audio uses capability snapshots and episode/clip manifests to communicate with the harness. Voice production stays external. There is no bundled speech engine, automatic MCP connection or Rust renderer.

## Installation and verification

The installer stages the skill, all eight packages and catalog into one independent distribution. Its workspace lockfile supports `npm ci --ignore-scripts` without reaching into the checkout. Managed updates reject local changes. Earlier script locations and resource locations have no compatibility aliases.

The existing native composition, audio scheduling, frame readiness, cancellation, progress and phase diagnostics are preserved. Standard capture remains the default; fast capture retains its dimension fallback. Visible paused nested videos require a priming snapshot before final capture to avoid older retained surfaces. That adds capture work only to frames with visible nested video.

Phase times distinguish seeking/rendering, capture, encoder backpressure and audio; encoder backpressure is not total encoder CPU time. Reorganizing files does not establish an end-to-end speed or RAM improvement. Multi-file project publication is not a database transaction; use fresh folders for concurrent production.
