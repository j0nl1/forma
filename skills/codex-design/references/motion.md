# Animation, video, sound, and watercolor

Use `assets/starters/animations.jsx` for animation projects. It independently restores the continuous-composition model of the reference's v3 engine. Bundle it with local React using `scripts/build.mjs`; do not load a second timeline engine. `timeline.js` remains available for existing simple DOM compositions, but it is not the full animation authoring surface.

## Continuous composition

Import `CompositionStage`, `useComposition`, `Shot`, `Captions`, `Easing`, `interpolate`, and `animate`. Render one persistent element tree inside `CompositionStage`. `useComposition()` supplies `{T, CUES, time, duration, authoredTotal, playing}`. All visible choreography must derive from authored time `T` and `CUES.SectionName`. Elements crossing a boundary remain mounted. `Shot` changes visibility without unmounting its children. `Captions` displays at most one caption, with `at`, optional `until`, and `text`.

`Shot from={start} to={end}` is visible from the inclusive authored start to the exclusive end. Numeric strings are accepted. A missing or non-finite start, or an empty interval, stays hidden. An omitted or null end means an open interval. Hidden images and videos remain mounted and keep their decoded readiness; visibility does not suspend the underlying shared clock or change a `VideoSprite` source interval. Retiming a section moves the playback boundary while retaining its authored gate.

Caption entries are sorted by their numeric `at` value without mutating the input. Null entries and non-finite starts are ignored; numeric strings are accepted. Only a finite numeric `until` supplies an explicit end; otherwise the next caption start is inferred, with an open end for the last entry. The latest entry at or before `T` wins, including the last of equal starts. If it has already expired, the gap stays empty rather than reviving an earlier overlapping caption. Captions fade in and out over 180 ms of authored time, so stretching a section stretches the fade in playback time. The defaults are centered 30 px, weight 500, `Inter, system-ui, sans-serif`, 8% side insets, 7% bottom inset and a 45% black shadow. The engine packages [Inter Medium 4.1](../assets/starters/fonts/README.md) for that default and retains an authored Inter face when one is already declared. Every property in `style`, including `opacity`, overrides the corresponding default; an explicit opacity deliberately replaces the automatic fade envelope.

Declare scene and playback JSON strings in a dedicated plain inline script in the main HTML document:

```html
<script>
  window.CODEX_SCENES = "[{\"name\":\"Opening\",\"dur\":3,\"desc\":\"The title settles into place.\"},{\"name\":\"Build\",\"dur\":5,\"desc\":\"The diagram assembles around the title.\"}]";
  window.CODEX_PLAYBACK = "{\"mode\":\"loop\"}";
</script>
```

Pass these values to `CompositionStage` as `scenes` and `playback`. Use `{mode: "times", count: N}` for finite repetition. Give each scene a short, accurate description. The optional `nat` anchor is stamped on its first timing edit; it retains the authored length while `dur` changes. Cue names bind to the first occurrence when names repeat. Unknown cues produce a preview diagnostic.

The editor supports section selection, dragging a right edge to stretch playback, numeric duration and speed, descriptions, repeat count, timing download, and a persistent visibility toggle. Changing speed or duration replays the same authored slice over the new interval. It does not cut choreography. Timing, editor visibility, and playhead persist in browser storage; changing the authored input invalidates old timing state. Use a distinct `persistKey` for each composition.

Space toggles playback; arrows seek by 0.1 seconds, Shift+arrow by one second, and Home/0 resets. Hovering over the scrubber previews a frame without moving the stored playhead, including during internal or external playback. The own clock continues advancing underneath a hover preview. Leaving the track, losing focus, cancelling a gesture, seeking or changing playback clears the preview. Mouse, pen and touch scrubs share proportional positioning and capture the active pointer, so dragging beyond the track clamps to the start/end. A cancelled scrub or section stretch keeps its last committed position and releases the gesture. The fitted stage preserves fractional viewport dimensions to avoid clipping in short windows.

Each transition from paused to playing starts a fresh repeat budget; starting partway through a composition counts that remaining partial pass as the first pass. A duration or repeat-policy change restarts that budget while preserving the current clamped playhead. Repeating `codexTimeline.setPlaying(true)` during playback does not restart it. The final finite pass holds the last frame; pressing Play there restarts from zero. `useTimeline().setPlaying` supports a boolean or updater function and uses the same transport as the preview and export bridge. If browser storage is unavailable, timing, playhead and editor changes remain usable in memory; reloading restores the authored defaults.

Reduced motion starts on the completed frame without autoplay. `?capture` or the stage's `capture` prop hides all editor chrome and restores the authored dimensions. `?capture=0` and `?capture=false` keep the ordinary preview.

## Sprite and scene authoring

The older authoring surfaces share the same stage and transport. Import `Stage`, `Sprite`, `useSprite`, `TextSprite`, `ImageSprite`, `RectSprite`, `VideoSprite`, `SceneStage` and `useScene` from `animations.jsx`. Copy `scene-components.jsx` alongside the engine and its other imported starters. The scene example uses this surface; continuous compositions still use `CompositionStage`.

`Stage` supplies global `useTime()` and `useTimeline()`, dimensions, duration, background, fps metadata, capture and playback. `Sprite start={seconds} end={seconds}` mounts its children over an inclusive global interval. Children may be a render function receiving `{localTime, progress, duration, visible}` or use `useSprite()`. `keepMounted` retains the subtree outside its interval without automatically hiding it. Infinite or zero durations yield progress 0. `TextSprite` fades/slides, `ImageSprite` fades/scales with optional Ken Burns drift or a labeled placeholder, and `RectSprite` accepts per-frame style overrides through `render(context)`.

`SceneStage` accepts the same scene/playback literals and an object mapping names to component functions:

```jsx
function Opening() {
  const { localTime, progress, dur, index, count, total, scene } = useScene();
  return <div style={{ opacity: Math.min(1, localTime / 0.5) }}>{scene.name}</div>;
}
function Build() { return <div>The diagram assembles.</div>; }
function Close() { return <div>A final invitation.</div>; }
<SceneStage scenes={window.CODEX_SCENES} playback={window.CODEX_PLAYBACK}>
  {{ Opening, Build, Close }}
</SceneStage>
```

The active component receives the same values as props. `localTime` and `dur` use the section's authored `nat`; progress is 0..1, while `total` is playback duration. Editing duration preserves the complete authored scene. Extra scene metadata is preserved. A cut mounts only the active scene index; moving to another index creates a fresh component instance even when both names map to the same function. The final timestamp belongs to the last scene at progress 1. Missing components and invalid initial lists display a diagnostic. `useScene()` is null outside a scene.

`Sprite` and `VideoSprite` continue to use the global playback clock inside scenes. Use `useScene().localTime` for authored scene choreography. When a sprite must follow editable scene timing, derive its global start/end and entrance/exit durations from `useComposition().sections`, as the scene example does.

Default transitions are cuts. Set `transition="overlap"` only for opaque scenes. At a naturally played adjacent boundary or loop seam, the outgoing subtree retains its exact last committed frame beneath the incoming scene for the boundary and one successor tick, with a 500 ms lifetime bound. Its timeline, scene and composition contexts are frozen, and its DOM identity is retained. Paused seeks, resets, large jumps, timing changes and a finished finite run clear the overlap. External streams must explicitly mark `playing: true` to count as playback.

`VideoSprite src={localClip} start={sourceSeconds} end={sourceSeconds} speed={1}` pauses native playback and seeks its video to `start + ((globalTime * speed) % span)`. Its start/end describe the source clip range. Keep media local and provide a real file; the preview server supports byte ranges. Export waits for the requested video frame to decode and fails clearly on an unavailable frame. Its markers also include the source audio in MP4/WebM; see [audio export](exports.md#audio).

## Local source editing and video export

Start `scripts/preview.mjs <project-folder> --motion-file animation.html`. Only that explicit HTML document can be edited. Set `source={true}` on the composition to connect it to the local preview service. In the demo, open `animation.html?edit-source` after enabling the server option. Timing and repetition edits then save automatically into the declarative HTML literals. A content version check refuses to overwrite intervening source changes; reload to reconcile. The source service requires its same-origin token and is absent from ordinary static previews and the public showcase.

The connected editor includes **Export video**, with MP4/WebM/GIF, frame rate, quality, capture scale, a start/end interval and **Include marked media audio**. It saves current timing before rendering and downloads the actual locally encoded file. Chromium, FFmpeg and FFprobe must be installed. CLI export is also available through [exports](exports.md). Both routes use the same deterministic bridge.

The exporter allows up to eight seconds for the configured bridge to expose `seek()` or `setTime()`, then reads its final duration and dimensions. This supports asynchronously initialized authored pages. A missing bridge fails with a named setup error before encoding and leaves no output file. This readiness check is separate from nested-media frame decoding.

`window.codexTimeline` exposes synchronous `seek(seconds)`, `setTime(seconds)`, `setPlaying(boolean)`, live `duration`, dimensions, time, fps, captureActive, and the single export root. `window.__animStage` is an alias to the same owner for older export bridges. `codex-seek-to-time` on that root supports `{time, playing}`. Marked external playback pauses the internal clock and expires after 400 ms without a successor. Validated `codex-timeline-scenes-update` and `codex-timeline-playback-update` events update timing; malformed updates are ignored. These are local equivalents of the original transport, without its proprietary parent-window messages.

The stage uses SVG/foreignObject and embeds font-face rules for portable serialization. Keep fonts in the project or configure their provider origins as described below; unresolved fonts produce export warnings. The existing module bundler and standalone HTML exporter make React compositions portable without a CDN.

## Portable fonts

The stage parses readable document font rules and recursively follows stylesheet imports against each sheet's URL. It retains media/support/layer conditions and complete font descriptors, decodes CSS URL escapes, and shares repeated embedding requests. Data fonts stay embedded; local blob fonts are converted before serialization. Font CSS is treated as data. An owned style inside the SVG's `foreignObject` contains the resulting data URLs. `codexTimeline.root.codexFontsReady` resolves after embedding and the active font load; `data-codex-fonts-inlined` marks completion, with `data-codex-font-warning` for incomplete sources. Wait for readiness before serializing the SVG. Local-font tests compare the original render, a serialized SVG after source deletion, and that SVG decoded as an image.

Same-origin fonts are the default. To embed a configured provider's fonts or read its otherwise opaque CORS stylesheet, pass `fontOrigins={['https://fonts.example', 'https://assets.example']}` to `Stage` or `CompositionStage`. Ordinary browser embedding requires the provider's CORS support. Configured remote responses may redirect to other configured origins; local exports validate every font redirect and rebase stylesheet references against the final URL. Put the same origin array in the export helper's `--config` JSON. For the connected editor, start `preview.mjs` with `--font-origins https://fonts.example,https://assets.example`; browser export requests cannot enlarge that server configuration. These options do not grant external scripts or writes. See [exports](exports.md). Keep fonts local for a standalone HTML package: remote document assets still require localization before HTML inlining.

The font tests cover local TTF, the packaged WOFF2, CSS imports/conditions, opaque CORS sheets, real source redirects, blob/data fonts, glyph geometry, actual SVG-image decoding, authored Inter precedence, cleanup and local editor MP4. An additional configured run uses the Inter author's public stylesheet and emits actual MP4 with no font warnings. Other font formats, complex CSS/viewport interactions, programmatic faces without a stylesheet declaration and broader browser comparisons remain unverified; this does not establish whole-animation parity.

## Verification and remaining port work

Check deterministic seek, continuous motion at every boundary +/-0.15 seconds, complete playback, finite repetition, a slower and faster section, DOM identity across cuts, editor persistence, and real encoded output. A new implementation test is not proof of whole-project parity. Follow [porting status](porting-status.md) before claiming equivalence.

The complete paint kit and React integration are available in the [watercolor recipe](watercolor.md), with layered strokes, deterministic frames, baking and live replay. Copy both watercolor files, `scene-components.jsx`, `motion-fonts.js`, `font-css.js`, and the `fonts/` directory alongside `animations.jsx` and `motion-model.js`: the animation module re-exports those components and embeds its default font during the local JSX build. Sprite/scene behavior, overlapping frozen trees, retiming, real nested-video frames and mixed audio have browser/output tests. Broader visual/audio comparisons and larger performance cases remain required. Do not call the animation module fully equivalent yet.

For interactive preview sound, use Web Audio after a user gesture, with mute and gain controls. For export, use the marked-media contract in [exports](exports.md#audio) with real local audio assets and documented provenance. Web Audio synthesis and arbitrary live playback are not automatically recorded by the deterministic exporter. The silent local route remains available through `audio: "none"`.
