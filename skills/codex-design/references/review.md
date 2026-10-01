# Feedback, experiments, variants, and tweaks

Translate feedback into an observable change: hierarchy, alignment, contrast, copy, density, navigation, or motion. Inspect the existing source and preserve working behavior. When a comparison helps, put variants in one canvas or selector rather than unrelated files.

`controls.js` provides visible local controls bound to CSS variables, with show/hide, reset, and JSON download. Changes remain in the page session until the user saves the downloaded settings or Codex applies them to source. Never imply that browser edits automatically rewrite files.

Review at intended size and a narrow viewport, with realistic text, keyboard focus, empty/error states, and reduced motion. For design-system adherence, compare actual component states and token usage; a structural checker cannot prove brand fidelity.

Experiments distinguish design exploration from measured results. State the hypothesis, variants, primary metric, assignment unit, duration assumptions, and decision rule. Do not fabricate significance or conversion improvements. Ask for analytics access only when it is needed and authorized.
