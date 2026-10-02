# Troubleshooting

| Symptom | Resolution |
| --- | --- |
| Skill missing | Verify `codex-design/SKILL.md` in a recognized root; reload Codex and invoke explicitly. |
| Installer refuses destination | Inspect existing files. Use `--update` only for a managed unchanged installation. |
| Package missing (`ERR_MODULE_NOT_FOUND`, including `parse5`) | Run `npm ci --ignore-scripts` in the checkout or installed skill. Preview and export helpers need packages even when the authored page is plain HTML. |
| Chromium missing | Run `npx playwright install chromium`; install OS browser libraries under local policy if needed. |
| Busy port | Choose another port or `--port 0`; use the reported URL. |
| Remote preview inaccessible | Forward the loopback port with SSH from the host running the server. |
| Blank multi-file page | Serve over HTTP and check console/path errors. Bundle module source as needed. |
| Standalone dependency rejected | Copy permitted assets, fix paths, bundle modules, and explicitly embed dynamically fetched data. |
| PDF clips | Set paper dimensions and print rules, then inspect all exported pages. |
| Video bridge missing | Mount one `CompositionStage`, or configure an existing `motion-stage`, exposing `window.codexTimeline`; custom bridges can be selected through export configuration. |
| Video fails | Check Chromium, FFmpeg, runtime errors, even dimensions, duration <=300 seconds, fps 1..60. |
| Video silent | Choose MP4/WebM with audio enabled. Check that media is inside the export root, has source range markers and a real audio stream, and its volume is nonzero. GIF and `--audio none` are silent. Live Web Audio is not automatically recorded. |
| Figma name ambiguous | Use the stable node id from `outline`. |
| Figma visual differences | Read warnings and reconcile unsupported properties against a real export. |
| System check fails | Fix paths, identifiers, token alias cycles, missing inputs, or remote CSS. Check is read-only. |
| System import stale | Recompile from source and import to a fresh binding. |
| 3D fallback | Bundle source and use a WebGL-capable browser. |
| Tweaks disappear | Download JSON or ask Codex to apply settings to source. |
| Verifier passes but flow fails | Runtime probes are not interaction verification; exercise and inspect the real flow. |

For issues, supply command, package version, OS, error text, and a minimal input without secrets. Keep traces and captures outside the repository unless explicitly requested as committed fixtures.
