# Troubleshooting

| Symptom | Resolution |
| --- | --- |
| Skill missing | Verify `codex-design/SKILL.md` in a recognized root; reload Codex and invoke explicitly. |
| Installer refuses destination | Inspect existing files. Use `--update` only for a managed unchanged installation. |
| Package missing | Run `npm ci --ignore-scripts` in the checkout or installed skill. |
| Chromium missing | Run `npx playwright install chromium`; install OS browser libraries under local policy if needed. |
| Busy port | Choose another port or `--port 0`; use the reported URL. |
| Remote preview inaccessible | Forward the loopback port with SSH from the host running the server. |
| Blank multi-file page | Serve over HTTP and check console/path errors. Bundle module source as needed. |
| Standalone dependency rejected | Copy permitted assets, fix paths, bundle modules, and explicitly embed dynamically fetched data. |
| PDF clips | Set paper dimensions and print rules, then inspect all exported pages. |
| Video bridge missing | Configure one `motion-stage` exposing `window.codexTimeline`. |
| Video fails | Check Chromium, FFmpeg, runtime errors, even dimensions, duration <=300 seconds, fps 1..60. |
| Video silent | This is the documented export behavior. Mix audio explicitly afterward when requested. |
| Figma name ambiguous | Use the stable node id from `outline`. |
| Figma visual differences | Read warnings and reconcile unsupported properties against a real export. |
| System check fails | Fix paths, identifiers, token alias cycles, missing inputs, or remote CSS. Check is read-only. |
| System import stale | Recompile from source and import to a fresh binding. |
| 3D fallback | Bundle source and use a WebGL-capable browser. |
| Tweaks disappear | Download JSON or ask Codex to apply settings to source. |
| Verifier passes but flow fails | Runtime probes are not interaction verification; exercise and inspect the real flow. |

For issues, supply command, package version, OS, error text, and a minimal input without secrets. Keep traces and captures outside the repository unless explicitly requested as committed fixtures.
