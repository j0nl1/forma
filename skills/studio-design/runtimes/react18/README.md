# React 18 authoring runtime

This workspace pins the official React and React DOM 18.3.1 packages for design-system cards and component sources that use the reference's React 18 browser contracts. It preserves legacy rendering, hydration, class lookup, unmount and callback behavior through React's actual implementation. No upstream design-tool bundle is used.

The compiler selects this runtime for recognized React 18 CDN declarations or source components using browser React globals. Native systems retain the separately pinned React 19 runtime. Each compiled system embeds its selected React/DOM pair. Systems compiled with the same exact version share one browser runtime, including hooks and JSX helpers, so their components can compose in one root. Different React versions require their matching renderer. Recompile older bundles before combining them.

Install from the repository root or the installed skill root with `npm ci --ignore-scripts`; this nested workspace is included in both lockfiles. The browser requires no CDN request.
