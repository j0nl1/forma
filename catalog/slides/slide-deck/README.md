# slide-deck

An editable deck with builds, notes and local controls.

The manifest describes the entry, editable parameters, requirements and source dependencies. Use `forma catalog show slide-deck` to inspect this resource and `forma catalog add slide-deck /absolute/project` to copy it with its manifest and dependencies.

Bundle the copied JavaScript or JSX entry before using it as a standalone browser script. When the resource has CSS imports, load the emitted stylesheet beside the generated bundle. The preview is an editable usage example. Shared clocks, controls and processing remain in the packages.
