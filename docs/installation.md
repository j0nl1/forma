# Installation

Use an agent harness with local file and terminal access. The Markdown skill and basic native HTML starters have no package dependency. Preview, build, verification, export and design-system helpers require the pinned dependencies below, including previewing or exporting plain HTML. General D3 charts, geographic maps, 3D and React runtimes also use those dependencies and the build helper. Use Node.js 22+ for the helpers. Playwright Chromium is needed for browser checks and exports; FFmpeg is needed for video, and FFprobe is used when including audio. Both are also required when PowerPoint media needs a local playback copy for source trims, speed or volume/mute; unadjusted PowerPoint media does not require them.

The portable entry point follows the [Agent Skills specification](https://agentskills.io/specification). `agents/openai.yaml` supplies optional Codex UI metadata; other agents use `SKILL.md` and the same local resources. Native preview, input and generation tools are discovered by capability, with alternatives documented in the [harness workflow](../skills/forma/references/harness.md).

## Install a reviewed local copy

From the repository root:

```sh
node tools/install.mjs --global --dry-run
node tools/install.mjs --global
```

New destination: `~/.agents/skills/forma`. An existing `studio-design` installation in that root is reused by the installer; use `--update` after inspecting it. For one project:

```sh
node tools/install.mjs --project /absolute/path/to/project --dry-run
node tools/install.mjs --project /absolute/path/to/project
```

Destination: `<project>/.agents/skills/forma`. Select another discovery root explicitly:

```sh
node tools/install.mjs --global --harness claude --dry-run
node tools/install.mjs --global --harness claude
node tools/install.mjs --project /absolute/path/to/project --harness gemini
```

| `--harness` | Global destination | Project destination | Activation |
| --- | --- | --- | --- |
| `shared` (default) | `~/.agents/skills/forma` | `<project>/.agents/skills/forma` | Use a recognizing harness's skill mechanism, or load by path |
| `codex` | `~/.agents/skills/forma` | `<project>/.agents/skills/forma` | `$forma` |
| `claude` | `~/.claude/skills/forma` | `<project>/.claude/skills/forma` | `/forma` |
| `gemini` | `~/.gemini/skills/forma` | `<project>/.gemini/skills/forma` | Confirm discovery with `/skills list`, then request Forma |
| `opencode` | `~/.config/opencode/skills/forma` | `<project>/.opencode/skills/forma` | Ask the agent to load the `forma` skill |

These roots are documented by [Codex](https://developers.openai.com/codex/skills), [Claude Code](https://code.claude.com/docs/en/skills), [Gemini CLI](https://geminicli.com/docs/cli/skills/) and [OpenCode](https://opencode.ai/docs/skills/). Gemini CLI and OpenCode also recognize the shared `.agents/skills` root. Avoid duplicate installations of the same skill in roots read by one harness. Presets select the destination only: the installed skill bytes are identical and the installer does not detect, launch or configure any harness.

For any other agent, or a customized configuration root, use its documented skills directory as a destination:

```sh
node tools/install.mjs --dest /absolute/path/to/skills/forma
```

Do not combine `--dest` with `--harness`. An agent without native skills support can use the installed files directly:

```text
Read /absolute/path/to/skills/forma/SKILL.md and use it for this task.
Resolve references, starters and helper commands from that skill folder.
Build a working reading-app prototype in /absolute/path/to/designs/reader.
```

The installer rejects existing destinations and source symlinks, stages a complete copy, and performs no network calls or package installs. It copies no `node_modules`. Reload the harness or start a new session if needed. Discovery paths and helper execution are tested; authenticated end-to-end sessions in every third-party harness are not verified. A harness without local filesystem/process permissions needs an environment that supplies those capabilities before it can execute the workflow.

## Runtime dependencies

In the checkout:

```sh
npm ci --ignore-scripts
npx playwright install chromium
```

For the installed shared global skill:

```sh
cd "$HOME/.agents/skills/forma"
npm ci --ignore-scripts
npx playwright install chromium
```

Use the actual selected installation folder instead when applicable. Keep npm workspace installation enabled: the packaged `runtimes/react18` workspace installs the matched React/ReactDOM 18.3.1 pair separately from the native 19.2.4 pair. Do not pass `--workspaces=false`, force peer dependencies, or install a second React version over the primary pair. Both the checkout and installed copy include pinned lockfiles for this graph. Package installation uses pinned versions and integrity hashes from the lockfile. `--ignore-scripts` disables lifecycle hooks; esbuild uses its platform package. Explicit Chromium installation downloads the browser. No model API key is required. Install FFmpeg with the OS package manager only when needed; that package normally includes FFprobe. Confirm `ffmpeg -version` and `ffprobe -version` before exporting marked audio or adjusted PowerPoint media.

PowerPoint export uses pinned PptxGenJS and Chromium, with no Office installation or external service required. Both lockfiles pin the patched image-size 2.0.4 dependency through an override. Keep that override when updating packages. Supply explicit local static TTF/OTF files through `pptxFonts` to embed fonts for editable text. Unembedded fonts, or applications that ignore embedded fonts, need the corresponding local fonts. See the [PowerPoint guide](../skills/forma/references/powerpoint.md).

For macOS-specific operations in the maintained workspace, use `ssh sirius`. Other users should follow their own host instructions.

The design-system compiler, public module entries and read-only `scripts/adherence.mjs` checker use these same installed dependencies. They require no host service, project compiler plugin or model API key. See the [design-system usage](usage.md#design-systems) for compilation, imports and advisory checks.

Animation captions include Inter Medium 4.1 under the SIL Open Font License; no font download or additional setup is required. When copying the animation starter, retain its companion modules and the complete `assets/starters/fonts/` directory, including its license. The build helper embeds the default font in the output bundle. See [portable fonts](../skills/forma/references/motion.md#portable-fonts) for authored fonts and optional provider configuration.

## Use the installed helpers

Commands in the usage guide show checkout-relative paths. For an installed skill, use its absolute directory instead:

```sh
# Set this to the actual folder printed by the installer.
FORMA_SKILL="$HOME/.agents/skills/forma"
node "$FORMA_SKILL/scripts/preview.mjs" /absolute/path/to/design --port 0
```

Open the reported loopback URL and append your HTML filename. Keep this server running while using a separate terminal for browser exports. HTML export reads a local file; PNG and PDF export read the running loopback URL:

```sh
node "$FORMA_SKILL/scripts/export.mjs" html /absolute/path/to/design/index.html /absolute/path/to/output/design.html
node "$FORMA_SKILL/scripts/export.mjs" png http://127.0.0.1:REPORTED_PORT/index.html /absolute/path/to/output/design.png
```

Replace `REPORTED_PORT` with the printed port. Output files must not already exist. To build copied React or animation source, preserve its local companion imports and run:

```sh
node "$FORMA_SKILL/scripts/build.mjs" /absolute/path/to/design/main.jsx /absolute/path/to/design/app.bundle.js
```

Reference `app.bundle.js` from the design's HTML. The installed helper resolves its own pinned React and build dependencies; the design does not need a second package installation. Follow the [motion recipe](../skills/forma/references/motion.md) when authoring continuous compositions.

## Update and remove

Review changes, then update the original scope and harness target:

```sh
node tools/install.mjs --global --update --dry-run
node tools/install.mjs --global --update
```

Repeat the original `--harness` value when using a non-default root, or the original `--dest` for a custom installation. An update requires a managed install marker and refuses changed, added, or deleted source files. Preserve local customizations separately. Re-run `npm ci --ignore-scripts` after updating; generated dependencies are not retained. Manually copied and symlink installations are not adopted automatically.

To uninstall, inspect and remove only the chosen `forma` installation directory with your file manager, then reload the harness. Generated designs stay in their output folders. The installer and removal do not alter harness configuration.

Geography dependencies are pinned with the other helpers: D3 7.9.0, topojson-client 3.1.0, world-atlas 2.0.2 and Leaflet 1.9.4. Build the vector and street entries as described in the [geography guide](../skills/forma/references/geography.md). Copy/link the street bundle's generated CSS alongside its JavaScript. Country geometry is local; an enabled street tile provider uses the page's normal network connection.

Generated sound uses the Node.js helper and a configured provider credential; it adds no npm SDK dependency. Set `ELEVENLABS_API_KEY` through your process environment and follow the [sound workflow](../skills/forma/references/sound-effects.md) to review an offline plan before `--generate`. FFmpeg is checked before generation and decodes the downloaded MP3 before publication. FFprobe measures exact audio metadata when needed; both are also used by marked animation audio export.

## Rename compatibility

Forma replaces the Studio Design brand and skill name. New installations use `skills/forma` and `$forma` (or the harness equivalent). The repository and published example/tutorial URLs remain at their existing locations. Existing browser identifiers, `design.json`, audio manifests, helper filenames and the `podcast.mjs` alias remain unchanged.

The installer detects an existing `studio-design` folder in the selected harness root and keeps that path during a managed `--update`. It accepts the old managed marker and package identity, checks every recorded file for local edits, and writes the new `.forma-install.json` marker after a successful update. The updated entry point declares `name: forma`; reload the harness and verify discovery. Direct loading by its absolute `SKILL.md` path remains available if a harness requires a matching directory name. Moving an installation to a new path is a separate user choice; custom `--dest` paths continue to work. If both folders exist, inspect them and choose `--dest` explicitly.

When running helpers from a repository checkout, update source paths from `skills/studio-design` to `skills/forma`. This does not rename the GitHub repository or installed local inference services. To save optional project preferences, follow the [configuration guide](../skills/forma/references/configuration.md); the installer never writes `forma.toml` into user projects.
