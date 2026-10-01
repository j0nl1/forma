# Contributing

Read `AGENTS.md` and `docs/architecture.md`. Keep the skill Codex-specific and preserve user intent. Add guidance only when it changes a design decision or supports a real operation.

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run check
npm run format:check
npm test
```

Tests use OS temporary directories for generated files. Browser tests exercise native components, a real prototype flow, responsive rendering, design-system preview, PDF, and deterministic video. The installed copy is also tested with an independent lockfile. FFmpeg is required for video tests. Missing Chromium is a test failure so it cannot silently claim browser verification.

For optional macOS verification in the maintained environment, transfer a source checkout to `sirius` and run cross-platform checks there through SSH. Do not run macOS-specific commands on the Linux host.

Keep dependency versions exact and refresh both lockfiles together. Use `npm ci --ignore-scripts` and review dependency changes. Never copy an unknown minified bundle or execute a reference repository's hooks to port a feature. Preserve third-party attribution when intentionally incorporating licensed source in a future change.

When changing contracts, update references, examples, capability limits, and behavioral tests together. Test results and known limits belong in the pull request body. Leave pull requests open for the user to merge; no automatic report archives are needed.

The initial Linux validation passed 28 tests without skips, including an independent installed-copy setup, Figma ZIP/Zstandard input, a three-page deck PDF, and encoded MP4/WebM/GIF frames. Desktop and narrow-viewport screenshots were inspected. Native macOS behavior has not been separately verified.
