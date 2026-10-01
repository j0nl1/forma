# Animation, video, sound, and watercolor

Use `timeline.js` for a deterministic single-clock composition. Define scenes before choreography. Call `stage.configure({scenes, render, width, height})`; each scene has a unique id, title, authored duration, optional playback duration, and speed. `render(t, cues)` updates a persistent artwork tree at authored time. The starter handles playback, scrubbing, timing edits, reduced motion, and a deterministic export bridge.

Key motion to authored scene cues, not wall-clock time. Keep elements crossing boundaries mounted. `interpolate` clamps ranges and supports easing. Allow time-stretch without cutting choreography. Show useful play/pause and reset controls, and give timing edits a downloadable JSON representation so they can be applied to source. Browser edits do not silently modify disk.

Verify the beginning, ending, and every scene boundary at +/-0.15 seconds, plus full playback. Use refs or element bounds for cursor movement. Avoid flashing and unreadable text. Keep the final frame complete and the loop seam intentional.

For sound, use Web Audio after a user gesture, with mute and gain controls. Do not autoplay audio. The local video exporter produces silent video; audio can be explicitly mixed with FFmpeg after export, with source attribution and timing documented.

`watercolor.js` supplies seeded canvas washes, lines, and splatter that reveal by stroke. Choose it only for a painterly brief. Build the still composition first, then drive reveal with the same timeline clock. For generated raster images, use the available image generation skill instead.

Export MP4, WebM, or GIF through [exports](exports.md). Do not claim a rendered video exists when only an HTML animation was delivered.
