# Mobile design

Use `frames.js` with `<device-frame platform="ios">` or `platform="android">` when a device presentation helps. The content remains ordinary responsive HTML. Do not implement a fake status bar as part of the product UI.

Choose platform-appropriate navigation and interaction: bottom tabs for peer destinations, a clear back path, safe-area spacing, touch targets, and useful keyboard/form behavior. Do not rely on hover. Sheets and dialogs must fit the viewport and retain dismissal controls.

A frame's visual keyboard is a demonstration surface, not an operating-system keyboard. Use real HTML inputs for editing. Verify portrait, landscape or narrow width as relevant, scroll containment, and focus visibility. For a native implementation handoff, describe state and interaction contracts explicitly.
