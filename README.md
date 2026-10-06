# Forma

**Turn ideas into media.**

A local design skill for editable prototypes, presentations, documents, motion and source-grounded audio with podcast, explanation, video narration, tutorial and summary presets. Use your preferred agent, keep your files local, and explore the [working examples](https://j0nl1.github.io/forma/).

## Workflow and project preferences

Give the agent a brief or source material and choose the intended result: a visual artifact or audio with podcast, explanation, video narration, tutorial, or summary guidance. The model interprets the sources and creates the content; local helpers handle repeatable build, validation, measurement, and assembly work.

An optional `forma.toml` stores the output directory, artifact language, audio preset, and selected generation tools. The current brief takes precedence. Voice, image, video, and transcription production use the tools actually available in your harness, your selected local engine or provider, or supplied assets. See [project preferences](skills/forma/references/configuration.md) for setup.

## Dependencies

Run `npm ci --ignore-scripts` from the repository root for development, or from an installed skill folder for standalone use. React and ReactDOM 18.3.1 are ordinary pinned dependencies in both manifests. All React authoring and imported components use that single pair; there is no separate React package, runtime folder, or setup step. Browser exports additionally need Playwright Chromium; decoded audio and video operations need FFmpeg.

## Tutorial

See how to let your agent install the skill, write a useful brief, compare design directions, build working flows, animate and export. The English walkthrough demonstrates Codex; the skill also supports other harnesses with local file and terminal access.

[![Watch the Forma tutorial](https://j0nl1.github.io/forma/tutorial/poster.png)](https://j0nl1.github.io/forma/tutorial/watch.html)

[Watch the tutorial](https://j0nl1.github.io/forma/tutorial/watch.html) · [Download the MP4](https://j0nl1.github.io/forma/tutorial/studio-design-tutorial-en.mp4)

## Example prompt

```text
Use the forma skill to build a working reading-app prototype.
Create a calm, editorial interface with onboarding, article saving and search.
Include empty and error states, keyboard navigation, and a mobile layout.
Save editable HTML and local assets in designs/reader. Preview the result
and verify the main flow before handing it over.
```

## Let your agent install

Copy this into your agent chat:

```text
Install Forma from https://github.com/j0nl1/forma for this agent.

1. Review the repository's README, docs/installation.md and tools/install.mjs
   before executing setup commands.
2. Choose a user-level skills directory recognized by the current harness.
   Use the documented installer target, or --dest for a custom directory.
   If native skill discovery is unavailable, prepare direct SKILL.md loading.
3. Check Node.js 22+, run the installer in dry-run mode, then install the skill.
   Inspect any existing installation first and preserve local customizations.
   Only use a managed update when its checks confirm it is safe.
4. Run npm ci --ignore-scripts inside the installed skill directory. Prepare
   Playwright Chromium for browser checks and exports; add FFmpeg/FFprobe
   when video or adjusted PowerPoint media is needed. Follow host permissions.
5. Verify the installed entry point and local helpers. Explain how to activate
   the skill, whether a reload is needed, and report the installation path
   and any missing prerequisites.
```

## Documentation

- [Optional TOML project preferences](skills/forma/references/configuration.md)
- [Installation, updates and removal](docs/installation.md)
- [Usage and example prompts](docs/usage.md)
- [Capabilities and output formats](docs/capabilities.md)
- [Known limitations](docs/limitations.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Architecture and runtime contracts](docs/architecture.md)
- [Source provenance and licenses](docs/provenance.md)
- [Contributing](CONTRIBUTING.md)

MIT licensed.

## Packages and reusable resources

Forma separates creative recipes by medium and technical implementations into eight local packages. Each catalog resource contains its manifest, editable source, styles or assets when needed, parameter schema and local preview. Shared execution stays in the packages; copying dependencies and recording provenance are mechanical. See [packages and adapters](docs/packages-and-adapters.md) for the layout and command interface. Generate the browsing page with `npm run catalog:site -- /absolute/output-directory`; its filters use the same data as `forma catalog list`.
