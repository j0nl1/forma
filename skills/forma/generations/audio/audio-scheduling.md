# Scheduled composition audio

Native `audio` clips and `video` clips with `media.audio !== false` contribute sound to MP4 and WebM exports. The compiled composition plan supplies their complete timing; sound does not depend on a visual element being mounted, visible, or visited on the video frame grid. GIF has no audio, and `audio: "none"` disables declared and marked media together.

Use local relative sources, audio/video data URLs, or browser blob URLs. Export resolves relative sources against the selected page, snapshots them through the existing local boundary, and decodes the snapshots with FFmpeg. A declared source range that exceeds the decoded asset fails the export. Omit `sourceDuration` to use the remaining decoded source duration; looping requires an explicit positive source span.

```json
{
  "id": "music",
  "kind": "audio",
  "timeBasis": "authored",
  "start": 0,
  "duration": 8,
  "track": 0,
  "media": {
    "src": "audio/music.wav",
    "sourceStart": 1,
    "sourceDuration": 4,
    "playbackRate": 1,
    "loop": true,
    "gain": 0.5,
    "fadeIn": 0.4,
    "fadeOut": 0.6,
    "volumeEnvelope": [
      { "time": 0, "value": 1 },
      { "time": 4, "value": 0.6 },
      { "time": 8, "value": 1 }
    ],
    "bus": "music"
  }
}
```

Source position starts at `sourceStart` and advances from the clip's local time multiplied by `playbackRate`. Looping repeats the selected source span from that clip-local phase. Nonlooping sound becomes silent when the span ends. Authored clips follow each scene's piecewise authored-to-playback mapping; playback clips use playback seconds. Each retimed window decodes through chained FFmpeg `atempo` filters to preserve pitch. Subrange exports preserve the full composition's phase and gain rather than restarting the source.

Gain is the product of `gain`, the bus gain, the linear envelope, and linear fade-in/fade-out factors. Envelope points use local seconds in the clip's selected time basis and hold their first/last values outside the specified points. Fades also use that local time. Clip gain, envelope values, playback rate, and configured bus gains accept values up to 16. Declared bus names are grouping metadata with unity gain until the caller supplies explicit `busConfig: { buses: [{ id: "music", gain: 0.5 }] }`; an unknown bus then fails validation. There are no implicit bus effects, ducking, normalization, or automatic limiter.

## Runtime interfaces

- `compileAudioSchedule(plan, { start, duration, sampleRate = 48000, busConfig })` in `packages/runtime/src/browser/audio-plan.js` is a pure transformation of the compiled composition plan. It returns clips with half-open sample intervals and piecewise windows. Start/end boundaries round up to the first sample whose time falls inside the interval.
- `audioGainAt(clip, localTime)` evaluates compiled gain, fades, and envelopes. `addScheduledWindow(schedule, clip, window, decodedPCM, mixedPCM, sourceDuration, channels = 2)` adds to a caller-owned float accumulator.
- `createAudioExport({ format, audio, declaredPlan, busConfig })` in `packages/media/src/lib/audio.mjs` retains `record`, `mix`, and `dispose`, and adds `snapshot(page)`. Call `snapshot` while blob URLs remain valid, before frame capture can unmount or revoke their source. `mix` can snapshot missing sources, but cannot restore a revoked URL.
- A compiled clip window has `playbackStart`, `playbackEnd`, `authoredStart`, `authoredEnd`, `localStart`, `localEnd`, and `rate`. `rate` is local clip seconds per playback second. The window's effective audio tempo is `media.playbackRate * rate`.

Declared and legacy marked media add to the same stereo 48 kHz float accumulator. One final sample clamp and AAC/Opus mux follow the complete mix; the video stream is copied. Existing legacy media keep frame-grid gating, hidden marked-node inventory, global loop phase, source ranges, and pitch-preserving playback. Declarative rendered media must not also carry the legacy audio marker, or the same source will be mixed twice.

FFmpeg tempo processing can introduce waveform changes and audible seams around rate changes or source-loop boundaries; this is pitch preservation rather than waveform-preserving time stretching. Sample-accurate clip placement does not remove AAC/Opus codec delay or browser preview differences. Arbitrary live Web Audio and unrelated unmarked playback are not recorded. Audio source snapshots and decoded stems stay in temporary directories and are removed after export.
