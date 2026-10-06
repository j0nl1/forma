# Native video pattern catalog

These are implementation recipes, not bundled components or installed effects. Choose patterns for their explanatory jobs, then author with [motion](motion.md) and [composition](composition.md). [Video direction](video-direction.md) specifies the shot; [video review](video-review.md) checks it. Combine a few related patterns, not the entire catalog.

## Runtime choices

| Surface | Fit | Tradeoff |
| --- | --- | --- |
| DOM/SVG | Type, code, diagrams, UI screenshots, stable object identity | CSS perspective tilts planes; it supplies no physical lighting or volumetric occlusion |
| Owned Canvas 2D | Many marks, masks, seeded particles | Explicit text layout; pixels lack editable DOM semantics |
| Owned Three.js/WebGL | Camera travel, geometry, materials, instancing, occlusion | Requires an authored seek-driven renderer and actual export verification |

The local [3D stage](three-dimensional.md) is an interactive object viewer; its live turntable is not a deterministic film camera. Build a motion-owned renderer for time-driven 3D. Register asynchronous work through `useFrameRenderer`, honor cancellation and paint through `commit`.

Derive continuous choreography from `useComposition().T` and `CUES`. A frame-renderer callback exposes playback `time`; map it through the native plan before applying authored cues after retiming. Precompute seeded geometry and render directly from time, without accumulated simulation or a second clock. Keep fonts/assets local and await readiness. Clip `track` groups inventory, not paint stacking.

## Focus a code line or interface region

**Job:** locate a meaningful change while retaining context.

Inputs: actual snippet/screenshot, named target, label, reading interval. Establish the surface, then pan/scale one world wrapper with counter-translation to frame the target. Highlight behind it and lower competing contrast. Slow or stop for reading; keep captions outside code. Type short meaningful chunks early enough to finish.

Use HTML/SVG and authored-time transforms. Check delivery-size readability and direct seeks; label pseudocode and never invent terminal output. Centered zoom without a target often hides the explanation.

## Before/after with a shared frame

**Job:** demonstrate a verified difference under matching conditions.

Inputs: two real states, same input and supported claim. Match layout, camera and scale; retain shared items with stable keys and move only what changes. Removed lines can collapse while added lines reveal; a refactor can move common tokens to new positions. Crossfade incompatible shapes explicitly.

Repeat the same behavior and hold the new outcome. Use a shared scale for measured comparisons; an animation's speed is not benchmark evidence. Check either state through direct seeking. Pair failure/success colors with text or shape meaning.

## Persistent object handoff

**Job:** connect shots through one recognizable object.

Inputs: identity, outgoing/incoming poses and retained meaning. Keep the object under one `CompositionStage`; introduce the next context before removing the previous one. Match position, travel direction and, where appropriate, velocity at the seam. Settle when the next idea needs reading.

Use stable React keys, authored cues and `Shot` for surroundings. Avoid active-index `SceneStage` if a remount breaks continuity. Inspect boundary frames, backward seeks and required DOM identity. Crossfading unrelated cards is not a handoff.

## Causal dataflow and state change

**Job:** show behavior rather than merely naming components.

Inputs: entities, legal paths, branch conditions, state changes and worked example. Reveal necessary relations, then move one identifiable packet by distance along its path. Change destination state on arrival; retain return paths when observations cause another cycle. Extra packets should explain concurrency or another actual behavior.

Use SVG paths or Canvas, with events derived from authored time/native clips. Check ordering and branch logic against the real mechanism. A policy gate describes the selected system, not a universal approval requirement.

## Layered spatial reveal

**Job:** expose hierarchy or nested structure through separation.

Inputs: foreground/subject/background roles, spacing, camera path and final arrangement. Differentiate depth through contrast, size, occlusion and restrained softness. Use consistent parallax; reveal a relationship through camera movement. Keep active objects crisp and labels readable, optionally in a stable 2D overlay.

Use DOM/SVG for planes or owned Three.js for volumes and real occlusion. Specify camera position, target and field of view instead of inheriting a turntable. Inspect the whole path, near/far clipping, overlaps and encoded labels. More blur cannot repair unclear hierarchy.

## Material and light hierarchy

**Job:** distinguish roles and guide attention coherently.

Inputs: semantic roles, material family, palette, light direction and shadows. For example, opaque task markers, translucent context planes and one emissive active route establish different meanings. Keep lighting direction consistent; highlights describe shape, shadows describe separation, bloom accents one focal point.

Use restrained CSS/SVG shadows for planes, explicit Three.js materials/lights for geometry. Transmission, sorting and postprocessing require authored setup and may cost capture time. Inspect silhouette, banding and highlights in the encoded output. CSS blur approximates softness, not physical depth of field.

## Kinetic typography with a read interval

**Job:** make a phrase land without losing comprehension.

Inputs: exact words, semantic emphasis, line breaks and actual audio cues if present. Reveal clauses when introduced, with one clear hierarchy. Choose masked reveal, discrete replacement or one scale accent to fit the tone. Resolve and hold the complete phrase; preserve punctuation and glyph coverage.

Use HTML/SVG or `Captions` for the caption role. Narrated captions follow actual phrase timing, not assumed speaking speed. Check wrapping, crop, reading time and collisions. Do not scramble essential instructional copy.

## Scatter → ordered resolution

**Job:** show unstructured pieces becoming a meaningful object, or deliver one visual climax.

Inputs: seeded starting poses, fixed targets, correspondence, density and resolved read interval. Interpolate directly with bounded stagger and deliberate settling. Generate shape/glyph targets once; use instancing for many 3D pieces. Image textures need real local assets.

Use Canvas for flat pieces or owned WebGL for tumbling depth. Inspect mid-shot direct seeks, repeatability, silhouette and export cost before building the full film. Label decorative metaphors; particles do not prove how a model computes.

## Reusable pattern packet

```text
Pattern: packet handoff through context layers
Inputs: packet label, local palette/font, three context labels
Meaning: the same task acquires context before reaching the model
Window: 4–9 authored seconds, derived from native section cues
Action: enter → pass behind nearest plane → reveal attached layers
Camera: oblique establish → lateral follow → frontal resolved read
Seam: retain packet identity and travel direction into the next shot
Runtime: seek-driven 3D canvas, stable labels, native frame completion
Checks: direct seeks, seam frames, crop, occlusion, repeated export
```

This prose packet is not an executable schema. A future component must expose reviewed inputs, assets and export checks while retaining the shared clock.
