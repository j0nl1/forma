# Codex Design

A local design skill built specifically for Codex. Create editable HTML mockups, working prototypes, wireframes, mobile screens, presentations, documents, campaigns, design systems, charts, and motion pieces, then inspect and export them with local tools.

The complete functional port is in progress. The initial rewrite simplified several reference components; those reductions are being corrected. Only PowerPoint is excluded from the target scope. See [porting status](docs/porting-status.md) for remaining work; thirteen routed project types do not establish full parity.

This is an independent rewrite using [baoyu-design](https://github.com/JimLiu/baoyu-design) as a behavioral reference. The instructions, helpers, and starters were written anew. There is no harness detection, copied hosted prompt, opaque vendored runtime, provider-specific brand default, or PowerPoint exporter. HTML presentations remain supported.

## Quick start

Requires Codex. Node.js 22 or newer is needed for the included helpers; the Markdown skill and basic native HTML starters have no package dependency. General D3 charts, 3D and React runtimes use the pinned local dependencies and build helper.

From this checkout:

```sh
node tools/install.mjs --global --dry-run
node tools/install.mjs --global
```

This installs to `~/.agents/skills/codex-design`. Restart or reload Codex if the skill does not appear. Invoke it in a chat:

```text
Use $codex-design to build a working onboarding prototype for a local reading app.
Use the attached screenshot as the visual reference. Include validation, empty
states, keyboard navigation, and two layout variations. Save it in designs/reader.
```

For a project-only installation:

```sh
node tools/install.mjs --project /absolute/path/to/project
```

The installer copies inspected local files. It does not fetch a remote project, install packages, change Codex configuration, or overwrite an existing skill. Run `npm ci --ignore-scripts` in the installed skill before using preview, build, verification, export or design-system helpers. Review [installation](docs/installation.md) for runtime setup, updates, and removal.

## What is included

- A concise Codex entry point, UI metadata, and focused task references.
- Thirteen routed project types, including HTML slides, mobile, documents, research, email, diagrams, and 3D.
- Independently written starters with native local controls, continuous composition, scene/sprite authoring, and deterministic watercolor painting.
- Read-only design-system inspection, compilation, portable imports, and review pages.
- Offline Figma inventory, materialization and editable React variant generation with explicit fidelity warnings.
- A loopback preview server, browser verification, standalone HTML, PDF, PNG, and MP4/WebM/GIF export with optional marked-media audio.
- Pinned package versions and lockfiles, meaningful tests, and runnable examples.

See the [capability map](docs/capabilities.md) for retained workflows, exclusions, and differences. This is a new implementation and file format, not binary or source compatibility with the reference project.

## Documentation

- [Installation and updates](docs/installation.md)
- [Usage and example prompts](docs/usage.md)
- [Capabilities and migration](docs/capabilities.md)
- [Architecture and runtime contracts](docs/architecture.md)
- [Source provenance and trust model](docs/provenance.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Contributing and validation](CONTRIBUTING.md)

## Try the examples

```sh
npm ci --ignore-scripts
npx playwright install chromium
node tools/demo.mjs --port 4311
```

Open [the local showcase](http://127.0.0.1:4311/) and exercise its flows. The examples include an onboarding prototype, comparison canvas, deck, timeline, charts, and print document. Build the 3D example separately with the documented command in [usage](docs/usage.md).

MIT licensed. Original reference authorship is credited in [provenance](docs/provenance.md). No affiliation or endorsement by OpenAI, Anthropic, or the reference project's authors is implied.
