# Interactive prototypes

Choose the user flow and make its entry, primary action, completion, and recovery paths work. Keep state in one place. Render list/detail selection, validation, filters, tabs, forms, dialogs, and feedback from that state rather than mutating unrelated DOM independently.

Use deterministic local sample data. Label mocked network or AI operations as simulations. Persistence may use localStorage, with a reset control and graceful fallback when storage is unavailable. Do not request real credentials or imply that a local demo sends messages or charges money.

Provide loading, empty, success, and error states where they change the flow. Dialogs need a labeled heading, escape-to-close, focus management, and focus restoration. Native `<dialog>` is usually sufficient. Form errors should identify the field and correction. Make icon-only controls accessible.

Use `controls.js` for a local tweaks panel; its toggle works without any host. Verify by clicking and typing through the main flow, then repeat with the keyboard and on a narrow viewport.
