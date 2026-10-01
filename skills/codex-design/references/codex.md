# Codex workflow

Use the tools exposed in the current Codex session. Tool names vary between CLI, IDE, and desktop; capability discovery is more reliable than copying an API bootstrap from another environment.

## Questions and files

Use `request_user_input_async` when exposed for missing preferences and continue independent work. A text input tool cannot accept screenshot uploads. In Plan mode, use the exposed structured input tool for suitable optional questions. Otherwise ask a concise question in chat when the answer is required. Respect prior authorization and do not repeat permission requests for routine local edits.

Read and edit with Codex's normal filesystem tools. Use `rg` for discovery. Resolve skill paths from the installed skill directory, never assume the working directory is the skill. Do not install the skill into the user's environment merely to build a design.

## Preview

Start `node <skill>/scripts/preview.mjs <output-folder> --port 4311`. The helper binds `127.0.0.1`, rejects paths and symlinks outside the root, and prints its actual URL. Keep the process running while the preview is in use. It never publishes or creates a public tunnel.

If `open_in_codex` is exposed, open the URL as a browser target in the current chat. If unified browser control is exposed, follow its returned documentation and use the in-app browser for local pages. Initialize exactly as that tool requires. Use Chrome only when the task needs the user's existing signed-in session. Do not invent a Playwright API on top of an unrelated browser tool.

Prefer browser clicks and keyboard input to exercise behavior. Check DOM, runtime errors, mobile dimensions, and rendered screenshots. Without browser control, run `scripts/verify.mjs <url>` when Playwright is installed. Place its captures under the user's home artifact root or an OS temporary directory, never the source tree by default.

If browser verification is unavailable, run static checks, deliver the file and loopback URL, and explicitly state that visual and runtime verification remain unperformed. Do not call the output fully verified.

## Assets and delivery

Use installed image, PDF, Figma, or other capabilities only when relevant. Read their associated skills when required. The core workflow needs no connector or API key. Do not change model, approval settings, plugins, or unrelated Codex configuration.

Use absolute Markdown file links. Embed local media with absolute paths. Present the visible live preview when available. A local server running on a remote host requires an SSH port forward before the user's browser can reach it.

For macOS-specific work in the maintained workspace, run commands through `ssh sirius` when the project's instructions require it. The cross-platform helpers also work on Linux.
