# Studio Design

A local design skill for editable prototypes, presentations, documents, motion and source-grounded audio with podcast, explanation, video narration, tutorial and summary presets. Use your preferred agent, keep your files local, and explore the [working examples](https://j0nl1.github.io/studio-design/).

## Tutorial

See how to let your agent install the skill, write a useful brief, compare design directions, build working flows, animate and export. The English walkthrough demonstrates Codex; the skill also supports other harnesses with local file and terminal access.

[![Watch the Studio Design tutorial](https://j0nl1.github.io/studio-design/tutorial/poster.png)](https://j0nl1.github.io/studio-design/tutorial/watch.html)

[Watch the tutorial](https://j0nl1.github.io/studio-design/tutorial/watch.html) · [Download the MP4](https://j0nl1.github.io/studio-design/tutorial/studio-design-tutorial-en.mp4)

## Example prompt

```text
Use the studio-design skill to build a working reading-app prototype.
Create a calm, editorial interface with onboarding, article saving and search.
Include empty and error states, keyboard navigation, and a mobile layout.
Save editable HTML and local assets in designs/reader. Preview the result
and verify the main flow before handing it over.
```

## Let your agent install

Copy this into your agent chat:

```text
Install Studio Design from https://github.com/j0nl1/studio-design for this agent.

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

- [Installation, updates and removal](docs/installation.md)
- [Usage and example prompts](docs/usage.md)
- [Capabilities and output formats](docs/capabilities.md)
- [Known limitations](docs/limitations.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Architecture and runtime contracts](docs/architecture.md)
- [Source provenance and licenses](docs/provenance.md)
- [Contributing](CONTRIBUTING.md)

MIT licensed.
