# Capabilities and migration

This implementation is being corrected toward a full functional Codex port. Its first version covered workflow categories but simplified several components. The table describes available resources, not completed parity. [Porting status](porting-status.md) records the remaining required work. It uses a new API and schema; source compatibility and identical rendering remain unverified.

| Reference workflow | New resources | Behavior |
| --- | --- | --- |
| Hi-fi, frontend direction, prototype, website | `interface.md`, `prototype.md` | Native HTML and real flows; React bundled when useful |
| Mobile and device/browser/desktop shells | `mobile.md`, `frames.js` | Editable context, responsive content, simplified chrome |
| Wireframes, options stack, canvas | `wireframe.md`, `canvas.js` | Pan, zoom, rename, focus, reorder, remove, restore |
| Decks and speaker notes | `slides.md`, `deck.js` | HTML, scaling, keyboard, thumbnails, reorder/delete, builds, fullscreen, print |
| Documents, resume, flier, trifold | `documents.md`, `document.js` | Paper layout and fold-order guidance |
| Email | `email.md`, `email.html` | Tables and inline CSS; client compatibility requires actual client testing |
| Social media and platform shells | `campaigns.md`, `social.js` | All named platform contexts through one generic API |
| Data science, charts, diagrams, maps | `data.md`, `chart.js`, `sources.js` | Source-driven analysis, local SVG charts and tables; supplied/configured geography |
| Research and sourced overlays | `research.md`, `sources.js` | Live sources through Codex, local citations |
| Animation and video | `motion.md`, `animations.jsx` | Continuous React composition, authored cues, persistent shots, captions, local editor, source timing write-back, deterministic seek and video export; watercolor/older APIs remain pending |
| Sound | `motion.md` | Web Audio guidance and explicit post-export audio mixing |
| Watercolor | `watercolor.js` | Seeded washes, lines, splatter and stroke reveal |
| 3D | `three-stage.js` | Orbit, framing, lighting, GLB loading, GLB/OBJ download |
| Create/use/import systems | `design-system.mjs` | Check, compile, review, hashed local binding; new explicit schema |
| Design Components and preview | `design-systems.md` | Local `.dc.html` galleries without hosted protocols |
| Offline Figma | `figma.mjs` | Raw/ZIP, deflate/Zstd, inventory, mount, selected HTML and system extraction |
| GitHub and HTML imports | `imports.md` | Read-only source analysis and explicit conversion |
| Standalone, PDF, PNG | `export.mjs` | Structured local inlining, Chromium print/capture |
| MP4/WebM/GIF | `export.mjs` | Deterministic silent video through FFmpeg |
| Figma, Canva, implementation handoff | `exports.md` | Real authorized connector, or clearly identified local handoff |
| Images, PDF input, model interactions | `assets-ai.md` | Actual Codex tools, source provenance, configured backend or labeled simulation |
| Feedback, experiments, tweaks protocols | `review.md`, `controls.js` | Local CSS controls, variants, reset, download; no host injection |
| Surprise / something cool | `SKILL.md` | Opt-in concept exploration |

## Exclusions and fidelity

PowerPoint editable/screenshot export, native PowerPoint animation XML, and PptxGenJS are excluded. HTML decks remain in scope. Multi-harness references, provider-specific APIs/handoffs, and hosted protocols need Codex-native equivalents that preserve their user-visible behavior; they are not grounds for dropping functionality. Older animation APIs and Google Slides workflows remain in the port review rather than being silently excluded.

Figma rendering supports saved geometry, common solid/image fills, text, transforms, and vector path blobs. Effects, masks, instance overrides, constraints, variable modes, and some fonts need manual reconciliation. Raw mount preserves those properties. System extraction creates HTML examples rather than inferred React prop models.

The deck implements common entrance and path builds, with expanded browser equivalents for the reference vocabulary. Timing follows local click/with/after sequencing; it does not export native PowerPoint semantics. Watercolor and social/device shells are smaller implementations. For an exact artifact recreation, reconcile these differences against supplied visual references.

Connectors are conditional on the current Codex environment. The package does not invent services, bundle credentials, or claim transfers that did not happen. Video output is silent, with optional explicit later mixing.

## Migrate an existing project

1. Preserve the original and inspect its source, assets, `_d_meta.json`, bound systems, and dependencies.
2. Retain useful working HTML; installation alone does not require a rewrite.
3. Author native `system.json`, declare CSS and named component exports, provide props, compile, review, and import.
4. Map animation scenes to one deterministic timeline and verify boundaries.
5. Replace injected host controls with local controls. Apply downloaded changes to source deliberately.
6. Record outputs in `design.json`, verify actual flows, and state remaining differences.

No automatic translator overwrites old projects or claims legacy schema compatibility.
