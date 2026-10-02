# Studio Design

A local design skill for agent harnesses with file and terminal access. Create editable HTML mockups, working prototypes, wireframes, mobile screens, presentations, documents, campaigns, design systems, charts, and motion pieces, then inspect and export them with local tools.

Studio Design uses the Agent Skills format and keeps generated files local. Codex, Claude Code, Gemini CLI and OpenCode have documented installation targets; other agents can load the same `SKILL.md` by path. Optional Codex integration retains native input and preview conveniences with standard fallbacks. HTML presentations export to PowerPoint as editable objects with supported native builds, embedded local media and explicitly supplied fonts, or as full-slide images, with speaker notes. See [known limitations](docs/limitations.md) for concrete fidelity and integration constraints.

## Watch the tutorial

A narrated walkthrough of installation, design directions, prototyping, motion, and export, with English captions. The video demonstrates Codex; use the installation guide below for other harnesses.

[![Watch the Studio Design tutorial in English](https://j0nl1.github.io/studio-design/tutorial/poster.png)](https://j0nl1.github.io/studio-design/tutorial/watch.html)

[Watch the video](https://j0nl1.github.io/studio-design/tutorial/watch.html) · [Download the MP4](https://j0nl1.github.io/studio-design/tutorial/studio-design-tutorial-en.mp4)

## Quick start

Use an agent with local file and terminal access. Node.js 22 or newer is needed for the included helpers; the Markdown skill and basic native HTML starters have no package dependency. General D3 charts, 3D and React runtimes use the pinned local dependencies and build helper.

From this checkout:

```sh
node tools/install.mjs --global --dry-run
node tools/install.mjs --global
```

This installs to the shared root `~/.agents/skills/studio-design`, retaining the existing Codex destination. For a harness-specific root, add `--harness claude`, `--harness gemini` or `--harness opencode`. Restart or reload the harness if needed. Activate Studio Design with its skill mechanism or ask it to read the installed `SKILL.md`:

```text
Use the studio-design skill to build a working onboarding prototype for a local reading app.
Use the attached screenshot as the visual reference. Include validation, empty
states, keyboard navigation, and two layout variations. Save it in designs/reader.
```

For a project-only installation:

```sh
node tools/install.mjs --project /absolute/path/to/project
```

Codex supports `$studio-design`; Claude Code supports `/studio-design`. The [installation guide](docs/installation.md) covers discovery roots, invocation and manual loading for other agents. A restricted chat without file/process access cannot execute the local workflow.

The installer copies inspected local files. It does not fetch a remote project, install packages, change harness configuration, or overwrite an existing skill. Run `npm ci --ignore-scripts` in the installed skill before using preview, build, verification, export or design-system helpers. Review [installation](docs/installation.md) for runtime setup, updates, and removal.

## What is included

- A portable Agent Skills entry point, standard capability fallbacks, optional Codex UI metadata, and focused task references.
- Thirteen routed project types, including HTML/PowerPoint presentations, mobile, documents, research, email, diagrams, and 3D.
- Independently written starters with native local controls, continuous composition, scene/sprite authoring, and deterministic watercolor painting.
- Read-only design-system inspection, compilation, portable imports, and review pages.
- Offline Figma inventory, materialization and editable React variant generation with explicit fidelity warnings.
- A loopback preview server, browser verification, standalone HTML, PowerPoint, PDF, PNG, and MP4/WebM/GIF export with optional marked-media audio.
- Pinned package versions and lockfiles, meaningful tests, and runnable examples.

See the [capability map](docs/capabilities.md) for supported workflows and output formats.

## Documentation

- [Installation and updates](docs/installation.md)
- [Usage and example prompts](docs/usage.md)
- [Capabilities and output formats](docs/capabilities.md)
- [Architecture and runtime contracts](docs/architecture.md)
- [Source provenance and trust model](docs/provenance.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Contributing and validation](CONTRIBUTING.md)

## Try the examples

Browse the [hosted examples](https://j0nl1.github.io/studio-design/), or run the showcase locally:

```sh
npm ci --ignore-scripts
npx playwright install chromium
node tools/demo.mjs --port 4311
```

Open [the local showcase](http://127.0.0.1:4311/) and exercise its flows. The examples include an onboarding prototype, comparison canvas, deck, timeline, charts, and print document. Build the 3D example separately with the documented command in [usage](docs/usage.md).

MIT licensed. Third-party data and dependency attribution are recorded in [provenance](docs/provenance.md). Studio Design is an independent project and is not affiliated with or endorsed by OpenAI.
