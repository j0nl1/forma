# Functional port status

The required outcome is an independently implemented Codex port with the reference's user-visible functions preserved. PowerPoint is the only agreed exclusion. The initial implementation simplified more than that; the port is active and must not be described as complete.

The packaged [functional inventory](../skills/codex-design/references/porting-status.md) records source components, available replacements, unresolved functions, and acceptance criteria. A category name, example screenshot, or passing test of the replacement does not establish parity.

Work starts with the continuous animation engine and export transport, then its watercolor and older animation APIs. Canvas, deck effects, platform shells, charts/data overlays, systems/imports, and remaining workflow integrations must also pass their own behavioral and visual checks. A function unavailable in the current environment must be documented as pending or dependent on a real configured integration, not removed from scope.
