# Installation

Use Codex desktop, CLI, or IDE with local file access. The Markdown skill and basic native HTML starters have no package dependency. Preview, build, verification, export and design-system helpers require the pinned dependencies below, including previewing or exporting plain HTML. General D3 charts, geographic maps, 3D and React runtimes also use those dependencies and the build helper. Use Node.js 22+ for the helpers. Playwright Chromium is needed for browser checks and exports; FFmpeg is needed for video, and FFprobe is used when including audio.

The [official skill documentation](https://developers.openai.com/codex/skills) describes `SKILL.md` discovery. The inspected local Codex loader supports project and user `.agents/skills` roots. UI metadata lives in `agents/openai.yaml`.

## Install a reviewed local copy

From the repository root:

```sh
node tools/install.mjs --global --dry-run
node tools/install.mjs --global
```

Destination: `~/.agents/skills/studio-design`. For one project:

```sh
node tools/install.mjs --project /absolute/path/to/project --dry-run
node tools/install.mjs --project /absolute/path/to/project
```

Destination: `<project>/.agents/skills/studio-design`. For a custom or legacy root:

```sh
node tools/install.mjs --dest /absolute/path/to/skills/studio-design
```

The installer rejects existing destinations and source symlinks, stages a complete copy, and performs no network calls or package installs. It copies no `node_modules`. Avoid duplicate discovery roots. Reload Codex or start a new chat if needed, then explicitly invoke `$studio-design`.

## Runtime dependencies

In the checkout:

```sh
npm ci --ignore-scripts
npx playwright install chromium
```

For the installed global skill:

```sh
cd "$HOME/.agents/skills/studio-design"
npm ci --ignore-scripts
npx playwright install chromium
```

Use the project installation folder instead when applicable. Keep npm workspace installation enabled: the packaged `runtimes/react18` workspace installs the matched React/ReactDOM 18.3.1 pair separately from the native 19.2.4 pair. Do not pass `--workspaces=false`, force peer dependencies, or install a second React version over the primary pair. Both the checkout and installed copy include pinned lockfiles for this graph. Package installation uses pinned versions and integrity hashes from the lockfile. `--ignore-scripts` disables lifecycle hooks; esbuild uses its platform package. Explicit Chromium installation downloads the browser. No model API key is required. Install FFmpeg with the OS package manager only when needed; that package normally includes FFprobe. Confirm `ffmpeg -version` and `ffprobe -version` before exporting marked audio.

PowerPoint export uses pinned PptxGenJS and Chromium, with no Office installation or external service required. Both lockfiles pin the patched image-size 2.0.4 dependency through an override. Keep that override when updating packages. Editable text uses the recipient's installed fonts. See the [PowerPoint guide](../skills/studio-design/references/powerpoint.md).

For macOS-specific operations in the maintained workspace, use `ssh sirius`. Other users should follow their own host instructions.

The design-system compiler, public module entries and read-only `scripts/adherence.mjs` checker use these same installed dependencies. They require no host service, project compiler plugin or model API key. See the [design-system usage](usage.md#design-systems) for compilation, imports and advisory checks.

Animation captions include Inter Medium 4.1 under the SIL Open Font License; no font download or additional setup is required. When copying the animation starter, retain its companion modules and the complete `assets/starters/fonts/` directory, including its license. The build helper embeds the default font in the output bundle. See [portable fonts](../skills/studio-design/references/motion.md#portable-fonts) for authored fonts and optional provider configuration.

## Use the installed helpers

Commands in the usage guide show checkout-relative paths. For an installed skill, use its absolute directory instead:

```sh
STUDIO_DESIGN_SKILL="$HOME/.agents/skills/studio-design"
node "$STUDIO_DESIGN_SKILL/scripts/preview.mjs" /absolute/path/to/design --port 0
```

Open the reported loopback URL and append your HTML filename. Keep this server running while using a separate terminal for browser exports. HTML export reads a local file; PNG and PDF export read the running loopback URL:

```sh
node "$STUDIO_DESIGN_SKILL/scripts/export.mjs" html /absolute/path/to/design/index.html /absolute/path/to/output/design.html
node "$STUDIO_DESIGN_SKILL/scripts/export.mjs" png http://127.0.0.1:REPORTED_PORT/index.html /absolute/path/to/output/design.png
```

Replace `REPORTED_PORT` with the printed port. Output files must not already exist. To build copied React or animation source, preserve its local companion imports and run:

```sh
node "$STUDIO_DESIGN_SKILL/scripts/build.mjs" /absolute/path/to/design/main.jsx /absolute/path/to/design/app.bundle.js
```

Reference `app.bundle.js` from the design's HTML. The installed helper resolves its own pinned React and build dependencies; the design does not need a second package installation. Follow the [motion recipe](../skills/studio-design/references/motion.md) when authoring continuous compositions.

## Update and remove

Review changes, then update the original scope:

```sh
node tools/install.mjs --global --update --dry-run
node tools/install.mjs --global --update
```

An update requires a managed install marker and refuses changed, added, or deleted source files. Preserve local customizations separately. Re-run `npm ci --ignore-scripts` after updating; generated dependencies are not retained. Manually copied and symlink installations are not adopted automatically.

To uninstall, inspect and remove only the chosen `studio-design` installation directory with your file manager, then reload Codex. Generated designs stay in their output folders. The installer and removal do not alter Codex configuration.

Geography dependencies are pinned with the other helpers: D3 7.9.0, topojson-client 3.1.0, world-atlas 2.0.2 and Leaflet 1.9.4. Build the vector and street entries as described in the [geography guide](../skills/studio-design/references/geography.md). Copy/link the street bundle's generated CSS alongside its JavaScript. Country geometry is local; an enabled street tile provider uses the page's normal network connection.

Generated sound uses the Node.js helper and a configured provider credential; it adds no npm SDK dependency. Set `ELEVENLABS_API_KEY` through your process environment and follow the [sound workflow](../skills/studio-design/references/sound-effects.md) to review an offline plan before `--generate`. FFmpeg is checked before generation and decodes the downloaded MP3 before publication. FFprobe measures exact audio metadata when needed; both are also used by marked animation audio export.
