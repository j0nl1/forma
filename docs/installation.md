# Installation

Use Codex desktop, CLI, or IDE with local file access. The Markdown skill and basic native HTML starters have no package dependency. General D3 charts, 3D and React runtimes use the pinned local dependencies and build helper. Node.js 22+ enables helpers. Playwright Chromium is needed for browser checks and exports; FFmpeg is needed for video, and FFprobe is used when including audio.

The [official skill documentation](https://developers.openai.com/codex/skills) describes `SKILL.md` discovery. The inspected local Codex loader supports project and user `.agents/skills` roots. UI metadata lives in `agents/openai.yaml`.

## Install a reviewed local copy

From the repository root:

```sh
node tools/install.mjs --global --dry-run
node tools/install.mjs --global
```

Destination: `~/.agents/skills/codex-design`. For one project:

```sh
node tools/install.mjs --project /absolute/path/to/project --dry-run
node tools/install.mjs --project /absolute/path/to/project
```

Destination: `<project>/.agents/skills/codex-design`. For a custom or legacy root:

```sh
node tools/install.mjs --dest /absolute/path/to/skills/codex-design
```

The installer rejects existing destinations and source symlinks, stages a complete copy, and performs no network calls or package installs. It copies no `node_modules`. Avoid duplicate discovery roots. Reload Codex or start a new chat if needed, then explicitly invoke `$codex-design`.

## Optional dependencies

In the checkout:

```sh
npm ci --ignore-scripts
npx playwright install chromium
```

For the installed global skill:

```sh
cd "$HOME/.agents/skills/codex-design"
npm ci --ignore-scripts
npx playwright install chromium
```

Use the project installation folder instead when applicable. Keep npm workspace installation enabled: the packaged `runtimes/react18` workspace installs the matched React/ReactDOM 18.3.1 pair separately from the native 19.2.4 pair. Do not pass `--workspaces=false`, force peer dependencies, or install a second React version over the primary pair. Both the checkout and installed copy include pinned lockfiles for this graph. Package installation uses pinned versions and integrity hashes from the lockfile. `--ignore-scripts` disables lifecycle hooks; esbuild uses its platform package. Explicit Chromium installation downloads the browser. No model API key is required. Install FFmpeg with the OS package manager only when needed; that package normally includes FFprobe. Confirm `ffmpeg -version` and `ffprobe -version` before exporting marked audio.

For macOS-specific operations in the maintained workspace, use `ssh sirius`. Other users should follow their own host instructions.

Animation captions include Inter Medium 4.1 under the SIL Open Font License; no font download or additional setup is required. When copying the animation starter, retain its companion modules and the complete `assets/starters/fonts/` directory, including its license. The build helper embeds the default font in the output bundle. See [portable fonts](../skills/codex-design/references/motion.md#portable-fonts) for authored fonts and optional provider configuration.

## Update and remove

Review changes, then update the original scope:

```sh
node tools/install.mjs --global --update --dry-run
node tools/install.mjs --global --update
```

An update requires a managed install marker and refuses changed, added, or deleted source files. Preserve local customizations separately. Re-run optional `npm ci --ignore-scripts` after updating; generated dependencies are not retained. Manually copied and symlink installations are not adopted automatically.

To uninstall, inspect and remove only the chosen `codex-design` installation directory with your file manager, then reload Codex. Generated designs stay in their output folders. The installer and removal do not alter Codex configuration.
