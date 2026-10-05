# Feedback, experiments, variants, and tweaks

Translate feedback into an observable change: hierarchy, alignment, contrast, copy, density, navigation, or motion. Inspect the existing source and preserve working behavior. When a comparison helps, put variants in one canvas or selector rather than unrelated files.

Use the full [typed tweaks guide](tweaks.md) for React controls, curated palettes, numeric scrubbing, panel drag/visibility and actual JSON source saving. `useTweaks` retains types and applies partial updates live; `--tweaks-file` enables versioned writes to one selected HTML document. The suggestion bar prepares a real clipboard draft for the user to paste, review and send in the agent chat. It does not simulate an automatic chat or design change. `controls.js` remains the smaller native CSS-variable surface with its existing reset/JSON-download behavior; use `TweakStore` to connect a custom native surface to typed persistence.

Review at intended size and a narrow viewport, with realistic text, keyboard focus, empty/error states, and reduced motion. For design-system adherence, compare actual component states and token usage; a structural checker cannot prove brand fidelity.

Experiments distinguish design exploration from measured results. State the hypothesis, variants, primary metric, assignment unit, duration assumptions, and decision rule. Do not fabricate significance or conversion improvements. Ask for analytics access only when it is needed and authorized.

For an annotated review, use the [data overlay runtime](data-overlay.md) in a separate review page. Confirm the design's purpose, audience and review focus from the available brief; ask concise questions only when those are missing. Copy the design or embed the supplied image with positioned anchor regions, give reviewed elements stable IDs, and keep feedback views in their own data file. Do not nest competing file-loading overlays. Add a compact review header with purpose, focus, date and a line per lens so the page reads without opening every view.

Order lenses by their effect on the stated goal. Use a primary lens with three to six specific callouts, a view of strengths worth retaining, and a grouped view for minor issues. Each card states the visible observation, its consequence and a concrete direction. Default to callout-only elements without numbers; measured contrast or actual product data can use value tags with an explicit basis. Do not invent severity metrics or infer unseen states from a static screenshot. Confirm pins match their subjects and sentence switching works at the intended size.

Review-page edits are part of the deliverable. Reactions and speculative questions can refine proposals there; changes to the user's actual design need an explicit instruction to apply them. Once changes are authorized and implemented, update the review page to reflect the resulting design.
