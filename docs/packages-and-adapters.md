# Packages, generations and reusable resources

Forma separates technical ownership from creative guidance. Packages are npm workspaces with programmatic entry points. Generation folders contain task recipes, not copies of the engine. The local catalog describes reusable modules and editorial presets; complete demonstrations remain in `examples/`.

```text
packages/
  core/       project metadata, preferences, contained files and source transactions
  runtime/    editable browser modules, source editing and local bundling
  media/      video capture, encoding, audio planning and assembly
  exports/    format workflows, PowerPoint, source imports and design systems
  catalog/    local discovery, dependency copies and the static browsing page
  cli/        command parsing, local preview server and application composition
skills/forma/
  generations/  audio, video, slides, documents, interfaces and data recipes
  references/   shared authoring and integration contracts
  scripts/forma.mjs
catalog/
  index.json
  items/<id>/item.json
examples/
```

`@forma/core` has no dependency on the other Forma packages. Runtime depends on core; media depends on core and runtime; exports depends on core, runtime and media; catalog depends on core. CLI composes these packages. Neither a workflow nor a browser module imports the CLI. The preview server is an application composition root: it connects source editing and export without making the browser runtime depend on the exporter.

The runtime package contains editable JavaScript and JSX implementations. It is not a separate React installation or version selector. Root and installed-skill manifests retain the single pinned React/ReactDOM 18.3.1 pair.

## Ports and adapters

A port belongs to the workflow consuming it. An adapter supplies the concrete execution. Dependency injection is explicit in the programmatic interface; a JSON configuration cannot load executable adapters.

- `renderVideo(page, errors, output, temporary, options, adapters)` accepts `capture(page, settings)` and `encode(settings)`. A capture session provides `capture()`, `close()`, its effective `method` and diagnostics. `capture()` returns a PNG buffer. Chromium is the current adapter, with standard and explicitly selected fast capture paths. Timeline seeking, decoded-media readiness, frame-token verification, cancellation, backpressure and output diagnostics remain in the workflow. The encoder adapter starts a child process with an input stream and completion/error events; the workflow owns its lifetime. FFmpeg supplies that implementation.
- `exportArtifact(mode, input, output, options, adapters)` accepts a page-session adapter and format implementations. The page-session interface calls the supplied work with a prepared page and runtime-error collection, then closes its owned resources on success or failure. Defaults retain the existing loopback/local-resource restrictions and supported font grants. Format adapters write to the workflow's temporary target; the workflow retains non-overwrite checks, cancellation checks and final publication.
- Source-to-audio keeps source-grounded script planning separate from external voice production. The capability snapshot and episode/clip manifests are the data contract with the harness. No bundled inference adapter, automatic MCP connection, voice selection or model installation is introduced.

The contracts are deliberately specific to current behavior. Replacing Chromium with a native scene renderer would require defining which authored content it supports; a Rust implementation cannot automatically render arbitrary HTML/CSS/React with the same fidelity. A native implementation is worth experimenting with only after measured work identifies an appropriate target. FFmpeg already performs native media processing.

## Catalog interface

From a checkout:

```bash
node skills/forma/scripts/forma.mjs catalog list --target video
node skills/forma/scripts/forma.mjs catalog show native-composition
node skills/forma/scripts/forma.mjs catalog add native-composition /absolute/project --dry-run
node skills/forma/scripts/forma.mjs catalog add native-composition /absolute/project
npm run catalog:site -- /absolute/preview-directory
```

The installed launcher uses the same commands. `list` returns concise JSON metadata with filters for medium, kind and tag. `show` expands only the selected item, including its file list or canonical preset instructions. `add` copies reviewed local files into `assets/catalog/<id>/`, records SHA-256 provenance and registers the entry in `design.json` while preserving unrelated metadata. A component's file closure is explicit in its manifest; copying does not evaluate the source. Presets copy local Markdown dependencies and keep repository-only references as links. These links are not fetched by the helper. Existing destinations, escaping paths and escaping symlinks are rejected. Multi-file publication is not a database transaction; use fresh project folders for concurrent production.

Each item has an ID, kind, description, supported targets, tags, requirements and either an entry with its files or an editorial guide. Requirements describe the necessary capabilities; the catalog does not discover or install them. The first collection contains five reusable modules and the five spoken-audio presets. These are editable starting resources, not a claim of complete compositions or universal export support.

The static catalog page is generated from that same index and filters entirely in the browser. Example links are optional and require network access; no hosted registry is required to list, inspect or copy resources. The agent searches concise metadata, reads the selected recipe and authors content. Copying dependencies, validation, hashing, recording and media assembly remain mechanical.

## Installation and verification

The installer stages the skill, all six packages and the local catalog into one self-contained distribution. Its own workspace lockfile supports `npm ci --ignore-scripts` without reaching back into the checkout. Managed updates still reject local changes; no earlier command aliases are retained. Authoring source lives in `packages/runtime/src/browser/` in a checkout and the corresponding path inside an installed skill.

The refactor incorporates the previously separate native-motion worktree's typed compositions, audio scheduling, frame readiness, cancellation, fast PNG option and phase diagnostics. Standard capture remains the default and fast capture preserves its dimension fallback. Phase times distinguish seeking/rendering, capture, encoder backpressure and audio; encoder backpressure time is not total encoder CPU time and phases do not account for every setup operation. Existing fast-versus-standard tests compare decoded output and nested-video frames. No new end-to-end speed or RAM improvement is claimed by moving files into packages.

Paused nested videos require a priming snapshot before their final frame capture so a retained surface cannot contribute an older decoded image. This adds capture work only to frames with visible nested video; the ordinary artwork-only fast path is unchanged.
