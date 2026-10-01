# Animation, video, sound, and watercolor

Use `assets/starters/animations.jsx` for animation projects. It independently restores the continuous-composition model of the reference's v3 engine. Bundle it with local React using `scripts/build.mjs`; do not load a second timeline engine. `timeline.js` remains available for existing simple DOM compositions, but it is not the full animation authoring surface.

## Continuous composition

Import `CompositionStage`, `useComposition`, `Shot`, `Captions`, `Easing`, `interpolate`, and `animate`. Render one persistent element tree inside `CompositionStage`. `useComposition()` supplies `{T, CUES, time, duration, authoredTotal, playing}`. All visible choreography must derive from authored time `T` and `CUES.SectionName`. Elements crossing a boundary remain mounted. `Shot` changes visibility without unmounting its children. `Captions` displays at most one caption, with `at`, optional `until`, and `text`.

Declare scene and playback JSON strings in a dedicated plain inline script in the main HTML document:

```html
<script>
  window.CODEX_SCENES = "[{\"name\":\"Opening\",\"dur\":3,\"desc\":\"The title settles into place.\"},{\"name\":\"Build\",\"dur\":5,\"desc\":\"The diagram assembles around the title.\"}]";
  window.CODEX_PLAYBACK = "{\"mode\":\"loop\"}";
</script>
```

Pass these values to `CompositionStage` as `scenes` and `playback`. Use `{mode: "times", count: N}` for finite repetition. Give each scene a short, accurate description. The optional `nat` anchor is stamped on its first timing edit; it retains the authored length while `dur` changes. Cue names bind to the first occurrence when names repeat. Unknown cues produce a preview diagnostic.

The editor supports section selection, dragging a right edge to stretch playback, numeric duration and speed, descriptions, repeat count, timing download, and a persistent visibility toggle. Changing speed or duration replays the same authored slice over the new interval. It does not cut choreography. Timing, editor visibility, and playhead persist in browser storage; changing the authored input invalidates old timing state. Use a distinct `persistKey` for each composition.

Space toggles playback; arrows seek by 0.1 seconds, Shift+arrow by one second, and Home/0 resets. Hovering over the scrubber previews a frame without moving the stored playhead. Reduced motion starts on the completed frame without autoplay. `?capture` hides all editor chrome and restores the authored dimensions.

## Local source editing and video export

Start `scripts/preview.mjs <project-folder> --motion-file animation.html`. Only that explicit HTML document can be edited. Set `source={true}` on the composition to connect it to the local preview service. In the demo, open `animation.html?edit-source` after enabling the server option. Timing and repetition edits then save automatically into the declarative HTML literals. A content version check refuses to overwrite intervening source changes; reload to reconcile. The source service requires its same-origin token and is absent from ordinary static previews and the public showcase.

The connected editor includes **Export video**, with MP4/WebM/GIF, frame rate, quality, capture scale, and a start/end interval. It saves current timing before rendering and downloads the actual locally encoded file. Chromium and FFmpeg must be installed. CLI export is also available through [exports](exports.md). Both routes use the same deterministic bridge.

`window.codexTimeline` exposes synchronous `seek(seconds)`, `setTime(seconds)`, `setPlaying(boolean)`, live `duration`, dimensions, time, and the single export root. `codex-seek-to-time` on that root supports `{time, playing}`. Marked external playback pauses the internal clock and expires after 400 ms without a successor. Validated `codex-timeline-scenes-update` and `codex-timeline-playback-update` events update timing; malformed updates are ignored. These are local equivalents of the original transport, without its proprietary parent-window messages.

The stage uses SVG/foreignObject and embeds accessible local font-face rules for portable serialization. Keep fonts in the project; remote or inaccessible fonts produce export warnings. The existing module bundler and standalone HTML exporter make React compositions portable without a CDN.

## Verification and remaining port work

Check deterministic seek, continuous motion at every boundary +/-0.15 seconds, complete playback, finite repetition, a slower and faster section, DOM identity across cuts, editor persistence, and real encoded output. A new implementation test is not proof of whole-project parity. Follow [porting status](porting-status.md) before claiming equivalence.

The watercolor integration components, complete paint kit, older sprite/scene APIs, and hosted audio-mixing behavior still require independent ports. Do not silently replace them with the smaller `watercolor.js` starter or call the animation module fully equivalent yet.

For sound, use Web Audio after a user gesture, with mute and gain controls. Local video export is silent, matching the reference's local FFmpeg route; the separate hosted audio-mixing contract remains pending. Explicit audio mixing can be performed after export with source attribution and timing documented.
