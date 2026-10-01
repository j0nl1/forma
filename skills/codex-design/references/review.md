# Feedback, experiments, variants, and tweaks

Translate feedback into an observable change: hierarchy, alignment, contrast, copy, density, navigation, or motion. Inspect the existing source and preserve working behavior. When a comparison helps, put variants in one canvas or selector rather than unrelated files.

Use the full [typed tweaks guide](tweaks.md) for React controls, curated palettes, numeric scrubbing, panel drag/visibility and actual JSON source saving. `useTweaks` retains types and applies partial updates live; `--tweaks-file` enables versioned writes to one selected HTML document. The suggestion bar prepares a real clipboard draft for the user to paste, review and send in Codex. It does not simulate an automatic chat or design change. `controls.js` remains the smaller native CSS-variable surface with its existing reset/JSON-download behavior; use `TweakStore` to connect a custom native surface to typed persistence.

Review at intended size and a narrow viewport, with realistic text, keyboard focus, empty/error states, and reduced motion. For design-system adherence, compare actual component states and token usage; a structural checker cannot prove brand fidelity.

Experiments distinguish design exploration from measured results. State the hypothesis, variants, primary metric, assignment unit, duration assumptions, and decision rule. Do not fabricate significance or conversion improvements. Ask for analytics access only when it is needed and authorized.
