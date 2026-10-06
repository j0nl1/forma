# Reviewing a video

Use [video direction](video-direction.md) to establish the intended result and [motion](motion.md) for runtime verification. Review the rendered piece against that intent. Passing a browser check proves neither narrative clarity nor visual finish; attractive stills prove neither choreography nor a correct export.

## Pick evidence that answers the open question

Use proportionate checks rather than rerendering the whole film after every change:

| Open question | Useful evidence |
| --- | --- |
| Is the layout or visual direction convincing? | Representative stills with actual copy, fonts and assets at the intended viewing size |
| Does the signature action work? | A short encoded sequence containing entry, reveal, hold and handoff |
| Do adjacent shots connect? | Frames before/at/after the boundary and a played interval spanning it |
| Does the film explain the message? | Complete uninterrupted playback, with the intended audio or silence |
| Does export preserve the result? | The actual encoded file, readiness diagnostics and representative frame comparisons |

Keep research captures and temporary comparison outputs outside the project repository unless the user requests otherwise. A storyboard requested as the deliverable can remain a storyboard; a request for a finished video requires inspecting the finished output.

## Review meaning before embellishment

Watch once without scrubbing. State what the viewer is likely to understand, where attention becomes divided, and where the piece feels rushed or padded. Then inspect the specific moments that explain those observations.

- **Message and evidence:** does each shot establish something relevant? Are simulated behavior, proposed changes and real evidence distinguishable? Can the ending be understood without the production note?
- **Composition and type:** is the intended focal object clear? Is essential copy readable for its full reading interval at the expected player size? Do line breaks, edge crops and contrasting layers survive encoding?
- **Staging and finish:** do camera, lighting and materials produce the requested visual relationships? Check occlusion, shadows, reflections, blur and highlights in motion. Prefer identifiable defects to a vague request for “more premium.”
- **Choreography and rhythm:** can the viewer follow the action? Check overlap, contact, holds, acceleration and the return to a resolved state. Both constant motion and excessive dead time can weaken the explanation.
- **Continuity:** does a recurring object retain identity, position and purpose through the handoff? Inspect native scene boundaries around ±0.15 seconds, plus the full transition when it extends farther.
- **Sound, when requested:** does narration land with the event it describes? Is copy duplicated unnecessarily? Check intelligibility, fades, clipping and the ending using the actual muxed file and [scheduled audio](../audio/audio-scheduling.md).

These dimensions are diagnostic questions, not a universal numeric quality score. A restrained diagram and a cinematic product reveal need different criteria. Name the requested treatment and evidence before comparing their finish.

## Reject concrete scene defects

For connected paths or 3D choreography, use [scene integrity](video-scene-integrity.md). Separate intentional overlap, abstraction or a deliberate cut from accidental defects. Do not accept a finished film while an observed defect breaks the message:

| Defect | Evidence to repeat after revision |
| --- | --- |
| A claimed continuous path has a gap, or a traveling object leaves it unexpectedly | Endpoint/trajectory checks using the scene's own data, plus playback through the join |
| An outline, label or accessory drifts away from its moving owner | Seek several rotations, both forward and backward; inspect silhouettes |
| Surfaces intersect unintentionally, glass obscures the focal action, or labels collide | Inspect the full camera interval and intermediate states at delivery size |
| A recurring object disappears and a result appears without an intelligible handoff | Play the complete transformation and adjacent shot; identify what persists |
| Materials merge after a brand-color or lighting change | Recheck focal silhouette, background separation and essential copy in the encoded proof |
| Explanatory captions name concepts without establishing what happens or why | Watch the sequence without production notes; connect each caption to a visible action or remove it |

Technical checks establish readiness, timing and reproducibility. Visual checks establish meaning, separation and the requested treatment. Record which checks passed and revise failed relationships; do not replace visual acceptance with frame counts, a successful encode or the presence of 3D effects.

## Revise one cause at a time

List a few concrete observations in priority order. For each, record the affected time, likely cause, smallest useful change and proof to repeat. Fix meaning, hierarchy and timing before adding surface effects. Preserve working copy, geometry, sound alignment and downstream timings unless they cause the defect.

```text
Observation: 3.2–4.0 s, the request crosses the boundary before permission is shown.
Cause: object travel begins before the boundary reveal ends.
Change: hold the request until the reveal completes; retain the return path and copy.
Proof: play 2.5–4.5 s and inspect the first frame after release.

Observation: the final label disappears against the illuminated background.
Change: increase foreground contrast and move the label into the established clear area.
Proof: inspect the encoded frame at the actual delivery size.
```

Use absolute values when adjusting a reference-sensitive property: a destination, font size, exposure or blur radius is more reproducible than “twice as much.” Change one meaningful axis when diagnosing a defect, then inspect the dependent relationships. Keep the production note current with the successful values so another worker does not restore an earlier decision.

A style frame is a working constraint, not an approval ritual. Preserve an explicitly accepted layout during animation work unless new evidence or user direction warrants changing it. Continue with reasonable reversible revisions inside the authorized task; ask only when a missing choice materially changes the requested result.

## Separate visual comparison from performance comparison

When comparing authoring workflows, hold the brief, source evidence, assets, model, available tools and iteration budget constant. Let each workflow create its own composition, and inspect full playback using the same stated criteria. Record deviations from those controls. Rendering the same authored scene through two tools tests rendering behavior, not their ability to create a better scene.

When comparing capture backends, freeze one composition, frame rate, dimensions, quality settings and audio plan. Check decoded frames, timing and dimensions as appropriate; report lossy capture formats separately from lossless ones. Matching encoder settings alone does not establish identical captured inputs.

Measure preparation, asset work, authoring, visual revisions and export separately when the question is end-to-end productivity. Distinguish cold setup from a warm run and record failed attempts. Native export phase diagnostics help locate capture cost; final encoder drain time is not total encoder work when encoding overlaps capture. Do not reconstruct unmeasured creative time from output file timestamps or report unknown values as zero.

## Finish with complete playback

After targeted checks pass, play the entire final encoded film. Inspect the opening, every seam, the last readable frame, audio tail and any finite repetition. Verify deterministic forward and backward seeks through important actions, with local fonts, images, nested video and async renderers ready under the native frame contract. Use the relevant [export](../../references/exports.md) and [limitation](../../references/limitations.md) guidance instead of assuming preview and export are equivalent.

Report what was actually inspected and any unresolved limitation. A runtime check, a proof shot, a visual improvement and a measured speed improvement are distinct conclusions; state only the conclusions supported by the evidence.
