# Directing video scenes

Use this guide for video creation, sophisticated finish or motion references; retain existing direction for small corrections. It adds creative decisions, not a fixed house style. Read [motion](motion.md) for runtime contracts, [native clips](composition.md) for scheduling and [video review](video-review.md) for verification.

## Turn intent into visible behavior

State the audience, one message, supporting evidence, duration, dimensions, copy language, audio intent and delivery constraints. Reuse actual design-system colors, fonts and prohibitions. “Premium, cinematic, about agents” leaves composition and motion unresolved.

Replace adjectives with decisions: an editorial explanation might use generous type and one persistent diagram; a technical film might follow an object through solid geometry. Match the subject and audience without adding unrequested claims or content.

Connect explanatory copy to the visible action: who acts, what changes and why it matters. A label such as “Context” may identify a diagram node, but cannot replace explaining which information travels with the task. When appropriate, follow one concrete example through the film. Remove captions that merely repeat a headline or name an abstract concept without a visible relationship.

For multiple shots or workers, keep current decisions in a compact production note beside the intended deliverable. Skip separate planning artifacts for trivial edits.

## Extract a reference's visual grammar

Watch the complete reference at the intended viewing size when playback is available. Otherwise inspect a timed frame sequence, including boundaries, and report which motion relationships remain uncertain; a sparse contact sheet does not establish camera paths or easing. Inspect the opening, reveals and ending. Separate observations from guesses; visible depth does not establish a particular renderer.

| Inspect | Record something actionable |
| --- | --- |
| Story and rhythm | What each shot establishes; where attention peaks; when the viewer has time to read |
| Camera | Framing, viewpoint, path, target and change in speed; which foreground objects it passes |
| Objects | Entry order, paths, contact, overlap, persistence and exit conditions |
| Depth and finish | Occlusion, near/far scale, shadows, material response, light direction and focus |
| Typography | Exact copy, hierarchy, line breaks, placement, safe areas and readable dwell |
| Handoff | Which object, direction, color or shape connects consecutive shots |

Capture timestamped evidence with permitted tools; sample colors and proportions when fidelity matters. Reuse useful relationships for original content. Do not infer an unknown source prompt or promise identical optics from screenshots.

## Write a shot that can be built

Specify each shot's visible change and purpose before effects. Plan rhythm across the film, with useful variation in entrances, durations and reading holds.

Use this compact template; omit fields that do not affect the shot:

```text
Shot / interval:
Viewer learns / evidence shown:
Exact on-screen copy / reading interval:
Key composition: focal object, scale, placement, negative space
Camera: start, target, path, end, projection or fixed viewpoint
Objects: stable IDs, action windows, paths, easing character, resting state
Depth / materials / light: required visual relationships and named values
Entry / handoff: what survives, changes or deliberately cuts
Sound: local cue and synchronization, or silent
Proof: frame or short sequence that demonstrates the hardest requirement
```

Use explicit seconds or cue-relative offsets. Distinguish camera and object motion; identify transform destinations and morph source/target geometry. Settled objects can stay still. Secondary motion should communicate weight or ongoing work without competing with reading.

Design object-level handoffs: a result becomes the next input, or a boundary becomes a divider. Match position, direction and speed for continuity; deliberately cut when changing subject. A dissolve cannot repair unexplained spatial changes.

For connected diagrams, recurring traveling objects or 3D choreography, read [scene integrity](video-scene-integrity.md) before building the proof. Derive related motion and geometry from shared anchors rather than independently guessed coordinates. Inspect the actual handoff, not only each shot's midpoint.

## Make the finish serve the scene

- **Composition:** test hierarchy, text and thin details at delivery size after encoding. Shorten copy before shrinking it. Sparse or centered compositions are valid when intentional.
- **Depth:** use occlusion, relative motion, scale, focus or lighting. Global zoom alone does not establish camera travel. Preserve spatial relationships.
- **Materials:** choose matte, translucent, emissive or reflective surfaces for a reason; define light and contrast before bloom or grain. Inspect washed highlights, unreadable glass and banding.
- **Attention:** use easing that conveys weight; overlap related actions and provide reading holds. Vary energy. Justify particles and motion blur through meaning and capture cost.
- **Type:** preserve contrast, clear space and safe areas. Inspect intermediate letter states. Decorative metadata must not introduce invented facts.

## Choose the runtime for the requirement

| Requirement | Native route and boundary |
| --- | --- |
| Type, diagrams, interface evidence, masks, planar cards | Persistent React artwork in `CompositionStage`, using DOM/SVG and authored time. CSS perspective can stage planes; it does not provide volumetric geometry or physical lighting. |
| Many drawn marks, raster treatment or procedural fields | Owned Canvas inside the same Stage; register async work with `useFrameRenderer`. Its callback receives playback time: deliberately map native section retiming to authored choreography. |
| Solid geometry, camera travel or material lighting | Local Three.js integrated with native frame completion. The [3D viewer](three-dimensional.md) supplies object viewing/model export, not a seekable film camera. Author and verify that integration before claiming exportability. |
| Photography, illustration or footage conveys the evidence better | Use inspected local assets and the [asset workflow](../../references/assets-ai.md); preserve provenance and the native media readiness contract. |

Use one timeline owner: continuous choreography follows `T` and `CUES`; clips follow their selected time basis. Retain persistent resources, seed randomness and derive state from time rather than accumulated playback. No hosted catalog, second timeline or wall-clock substitute. Follow [motion](motion.md#native-clips-and-asynchronous-frames) for async completion and cancellation.

## Prove the difficult shot early

For an ambitious film, inspect representative stills with real copy, fonts and colors, then encode its hardest short action. Scale this effort to the task: a title sting may need one still. Stills test composition; short playback tests motion and capture.

The proof must demonstrate the requested finish and an entry/action/handoff at delivery size. A working 3D camera or successful export is insufficient. Resolve observed continuity, occlusion and hierarchy defects before extending that treatment to the full film. This is an authoring check, not a request for user approval. After a palette or lighting revision, repeat the affected visual proof: unchanged geometry does not imply unchanged readability.

Example seven-second proof for an agent explanation:

```text
Message: the harness controls a tool request and feeds its result back to the model.
0.0–1.5: one amber request crosses a stack of context planes; camera follows it.
1.5–3.0: the request reaches a visible permission boundary and waits; camera settles.
3.0–4.5: the boundary opens for this request; the object moves toward one tool.
4.5–6.0: a result returns along a distinct path into the persistent context stack.
6.0–7.0: hold the resolved loop with the copy “A tool result becomes new context.”
Proof: request visibly waits at the boundary; the return path is spatially legible;
the final copy is readable; a backward seek restores the same state.
```

This metaphor is not a universal harness policy or an existing 3D preset. Choose a planar diagram when clearer. Continue within authorized scope without imposing approval gates; [review](video-review.md) before expanding the full film.
