# Harness workflow

Forma uses the Agent Skills directory format and ordinary local files. Read this workflow in any harness. Discover capabilities from the current session; do not assume tool names, a specific model, a host bridge or an embedded browser. In Codex, the optional [Codex integration](codex.md) adds native input and preview conveniences with the same fallbacks.

## Required access and fallbacks

An optional [project profile](configuration.md) records reusable output, language and generation preferences. Check its selected capabilities against this session, using the offline `scripts/config.mjs` resolver when useful. Saved tool names do not establish availability. Recommend missing capabilities from actual harness tools and current provider documentation; retain supplied-media and script/handoff fallbacks.

| Operation | Prefer when available | Standard fallback |
| --- | --- | --- |
| Load instructions | Native skill discovery and activation | Ask the agent to read the absolute `SKILL.md` path and resolve linked resources from that folder |
| Clarify the brief | Structured input; asynchronous questions when supported | A concise question in chat; continue independent work when the answer is optional |
| Read and edit source | Harness filesystem tools | Terminal file operations; resolve paths from the installed skill directory |
| Preview | Harness browser panel or browser automation | Run `scripts/preview.mjs` and open its URL in a standard browser |
| Verify | Browser automation with clicks, keyboard, DOM, errors and screenshots | Run `scripts/verify.mjs` with local Playwright; inspect its captures and exercise the actual flow |
| Send a review draft | An explicitly configured `onRequest` callback or local event consumer | Copy the draft, review it and paste it into the agent chat; selectable text remains available if clipboard access fails |
| Generate images/audio or transfer a design | Available, authorized tools or configured providers | Use supplied local assets or deliver an explicit local handoff; disclose when generation or transfer was not performed |
| Produce spoken audio for any preset | The user's selected MCP, harness tool, local speech engine or configured provider, with supported voices and language | Use supplied recordings or deliver the editable script and clip handoff; the offline audio helper does not synthesize speech |
| Deliver | Harness file/media rendering | Absolute paths and the loopback URL, opened with ordinary local applications |

Full local execution requires source read/write access and a terminal with Node.js 22+. Build, preview, verification and export helpers need the packaged dependencies. Browser checks and captures need Playwright Chromium; video and adjusted PowerPoint media need FFmpeg/FFprobe, while the local audio helper needs FFmpeg for decoded measurement/assembly. Source-to-audio planning and script authoring require no browser or speech-provider SDK. The podcast, explanation, video narration, tutorial and summary presets share the same voice-production boundary; video integration follows the motion/export contracts. A restricted chat environment can read the instructions, but cannot perform missing filesystem, browser or process operations. Do not claim execution or verification in that situation.

## Preview and verification

Start `node <skill>/scripts/preview.mjs <output-folder> --port 0`. The helper binds `127.0.0.1`, rejects paths and symlinks outside the root, and prints its actual URL. Keep the process running while the preview is in use. It never publishes or creates a public tunnel. If the process runs on another host, use an authorized port forward to reach it from the user's browser.

Follow the current browser tool's own documentation. Exercise behavior through real clicks and keyboard input. Without a browser tool, run `node <skill>/scripts/verify.mjs <url>` after installing Playwright. Keep captures in the user's artifact directory or an OS temporary directory. Automated error/overflow checks do not exercise every user flow or establish visual quality. Without screenshot inspection or runtime verification, report the missing checks explicitly.

## Integration and portability

Keep generated HTML and assets local. Resolve helpers from their installed folder rather than assuming a harness-specific skills root. Use installed artifact/image/audio capabilities only when relevant, and read their associated instructions when required. Core authoring and export need no model API key or connector. Preserve the user's model, permissions and configuration.

Copy/review/send is the standard handoff for suggestion and data-request controls. Existing callbacks and DOM events are optional extension points; producing a draft does not prove another agent received it or fetched data. The `Codex*`, `codex-*` and `X-Codex-*` browser globals, local events, markers and local preview headers are retained compatibility identifiers. They do not contact Codex or require a Codex process. Do not rename them in existing designs.

The same skill can be installed in a recognized skills root or loaded directly by path. Harness discovery, permissions and UI rendering differ; compatibility does not mean every harness supplies image generation, connectors, a browser or local execution. Follow host-specific installation instructions and disclose capabilities that are absent.
