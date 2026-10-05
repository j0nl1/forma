# Video narration preset

Use this preset to create speech that supports a video or motion composition. Follow the [shared source-to-audio workflow](source-to-audio.md), then the [motion recipe](motion.md) and [audio export contract](exports.md#audio) when integrating actual media. Default to one narrator unless the brief calls for dialogue or other roles.

## Editorial direction

Read the storyboard or existing scenes as well as the evidence. For each narrated scene, identify what the image already communicates and what speech needs to add: context, causality, a comparison, qualification or a transition. Avoid unnecessarily describing every visible element or reading every on-screen label.

Write connected narration that follows the visual argument. Retain the necessary context between scenes so separately generated blocks still sound like one explanation. Keep source references, scene identifiers and production cues separate from spoken text.

## Time and handoff

Keep a companion scene plan with actual composition/scene IDs, scene start and end times when fixed, ordered speech segment IDs, intended pauses and whether visual timing can change. Scene metadata is not part of the current episode-helper schema. Use one canonical script for narration; do not independently rewrite it in the video file or transcript.

Generate coherent speech blocks, measure their decoded durations, and compute scene fit mechanically. For flexible compositions, adapt scene lengths and dependent cues to the measured narration. For fixed scenes, revise only text that does not fit while preserving essential meaning. Do not cut syllables, force undocumented tempo changes or invent word timings to hide a mismatch. Keep per-scene clips and measured placement data for reuse after visual edits.

The existing `source-to-audio.mjs` helper can measure/assemble a sequential narration or a scene's blocks. It cannot place clips at absolute scene times. Use an available deterministic timeline assembler for a composition-length narration track, with genuine visual pauses, or an actual supported placement mechanism. Do not describe sequential concatenation as synchronization.

The current motion exporter uses source-range markers with global-time loop phase; mounting a clip at a scene boundary does not reset its audio to zero. Follow the export contract rather than inventing offset markers. A prepared narration track aligned from composition time zero can use its real full source interval; stop its contribution at the intended end to avoid looping. CSS hiding alone does not silence a marked track. Balance speech/music and inspect the final mix.

## Review and delivery

Check the relationship between speech and picture at scene boundaries and in the final encoded MP4/WebM. Confirm no word is clipped, repeated or masked by other audio, and that moving a scene preserves the intended placement. Measure final output and inspect any sub-range export phase. GIF cannot carry narration.

Deliver the narration clips or prepared track, canonical script, scene plan and measured timing. Claim synchronization only after actually integrating and checking it. Without an available composition/export tool, deliver a scene-linked audio handoff and identify the missing integration step.
