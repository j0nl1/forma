# Native clip composition

Composition data supplements the existing native scene and playback bindings. Scene `dur` and `nat` remain the only section timing authority. The model derives its authored and playback clocks from those sections, preserving duplicate scene names and the existing captions, Shot and Sprite behavior.

Author one explicit inert JSON script in the selected HTML document:

```html
<script id="studio-motion-clips" type="application/json">
  {
    "schemaVersion": 1,
    "clips": [
      {
        "id": "title",
        "kind": "caption",
        "timeBasis": "authored",
        "start": 0,
        "duration": 1,
        "track": 0,
        "text": "Opening title"
      },
      {
        "id": "card",
        "kind": "visual",
        "timeBasis": "authored",
        "start": { "after": "title", "offset": 0.25 },
        "duration": 1,
        "track": 1,
        "params": { "color": "blue" }
      }
    ]
  }
</script>
```

The document contains only `schemaVersion` and `clips`. It accepts at most 500 clips and 1 MiB of finite JSON data, with nesting limited to 40 levels. Clip IDs start with an ASCII letter and contain up to 128 letters, digits, underscores, periods, colons or hyphens. IDs are unique; a track is an integer from 0 to 255 and carries display grouping only. Track numbers do not set visual stacking or audio routing. Clip duration is finite and positive. A start is finite nonnegative seconds or `{after,offset}`, where `after` names another clip's end and `offset` is finite seconds, including negative overlap offsets. References resolve within the same time basis. Cross-basis references, cycles, missing IDs and ranges outside the selected timeline fail with named `CompositionError` codes.

`timeBasis: "authored"` follows native choreography as sections are retimed. `timeBasis: "playback"` stays on the visible playback clock. Authored clips crossing sections compile into separate windows, preserving each section's time mapping. Clip visibility uses a half-open interval: the start is included and the end is excluded. The composition's terminal playback frame contains no visible clips.

`kind` is `visual`, `caption`, `audio` or `video`. Captions require plain `text`. All clips may carry JSON `params`. Media clips require `media.src`, an explicitly relative local path or audio/video data or blob source. Remote and absolute paths are rejected; final asset containment and decoding are handled by the export tools. Only media clips carry `media`, and only caption clips carry `text`.

Media fields are optional except `src`: `sourceStart` defaults to zero; `sourceDuration` is a positive source span; `playbackRate` defaults to one and must be positive and at most 16; `gain` is from zero to 16; `loop` and `audio` are booleans. Loops require an explicit `sourceDuration`. Source time advances from `sourceStart` using the clip's selected local clock times `playbackRate`. Loops wrap within the source span; finite nonlooping spans hold at `sourceStart + sourceDuration`. `fadeIn` and `fadeOut` are nonnegative seconds no longer than the clip duration. `volumeEnvelope` contains at most 500 `{time,value}` points with strictly increasing clip-local times within its duration and gains from zero to 16. `bus` optionally names a stable audio bus identifier; bus definitions belong to the audio planner.

The editable pure module is `packages/core/src/timeline/composition-model.js`. `parseClipDocument(raw)` returns a validated immutable document without evaluating source. `compileComposition({scenes,clips})` returns native scene timing with resolved immutable clips. Each clip includes numeric `start` and `end`, `playbackStart`/`playbackEnd`, `authoredStart`/`authoredEnd` and `windows`. A window contains `sectionIndex`, those four time boundaries, `localStart`/`localEnd` in the clip's selected basis and `rate`, the clip-local seconds per playback second. Playback windows have rate one. `playbackTime(plan,authoredSeconds)` is the clamped inverse of native `authoredTime`. `clipFrame(plan,id,playbackSeconds)` returns visibility, local time, progress, selected basis and optional media `sourceTime`. `moveClip(document,id,start)` validates a semantic move; compile the returned document to validate its complete schedule.

## Exact source editing

`scripts/forma.mjs composition inspect <HTML>` emits the actual normalized document, native scenes/playback, resolved plan, content version and diagnostics. It reads dedicated native `CODEX_SCENES`/`CODEX_PLAYBACK` or supported legacy `OM_*` JSON string bindings as data. It does not execute page scripts, derive source from rendered DOM, insert a block or migrate legacy files.

Move an existing clip using the exact content version returned by inspection:

```sh
node scripts/forma.mjs composition move /absolute/path/motion.html \
  --clip title --start 2 \
  --base-version <SHA-256-from-inspection> --operation-id move-title-1
```

`--start` accepts a JSON number or a quoted JSON reference object. The source API exports `readCompositionSource(file)` and `saveCompositionSource(file,{baseVersion,clipId,start,operationId})`. Saves serialize through the shared per-file transaction queue, compare the whole source hash and atomically replace only the owned JSON script body. They preserve all other source bytes, including scene/playback literals. Output escapes `<` inside JSON to prevent embedded script endings. Duplicate IDs, duplicate script attributes, external scripts, non-JSON scripts, template blocks and incomplete script tags fail before mutation. Paths must name an explicit regular `.html` file without symlinks.

The source API also accepts `{action:"undo"|"redo",baseVersion,operationId}`, without clip fields. Undo and redo retain up to 50 exact JSON slices per file in the current process; they require the matching full content version and do not overwrite external edits. Repeating an identical operation ID returns its existing result only while its resulting source version remains current. Reusing an operation ID for another edit fails. The CLI supports undo and redo in its current process; separate invocations do not share in-memory history. Connected preview services may use the same long-lived API for actual session history.

## React authoring and the connected inspector

Bundle `packages/runtime/src/browser/motion/composition-components.jsx` with the existing native animation runtime. `CompositionProvider({scenes,clips,source,children})` accepts an explicit clip array or document and otherwise reads the inert HTML clip script. With no clip script or supplied clips, it adds no inspector or source endpoint request. Inside `CompositionStage`, its scene timing comes from `CompositionContext`, so native scene retimes update the same compiled plan. Inside a plain `Stage`, supply `scenes` explicitly. `useClip(id)` returns the exact playback frame with `clip` and `plan` for typed content and parameters.

The provider publishes its compiled plan as both `window.codexTimeline.compositionPlan` and `audioPlan` after the native Stage bridge mounts. It scopes those properties to its Stage root and clears them on detach. An invalid schedule publishes `compositionError`, displays a named diagnostic and suspends its clip children rather than rendering a stale schedule. There is no second writable timeline or mutable global clip document.

The inspector lists stable clip IDs, kinds, tracks, time bases, resolved starts and durations. Select an existing clip and enter a numeric start, then explicitly save. A numeric save replaces a relative reference for that clip; it does not change any other authored clip fields. Source errors retain the draft. Reloading clip source refreshes the content version while retaining pending input. Undo and redo operate on exact source slices within the preview session. Inspector chrome is outside the captured artwork and is omitted in capture mode.

Start `preview.mjs` with `--motion-file` selecting the HTML document. If that document already contains a valid clip block, the service enables `GET`/`POST /__codex_composition`. It uses the native motion token in `X-Codex-Motion-Token`, matching preview origins and the same selected-file transaction queue. POST accepts the source API operations above and cannot choose another file. No clip block is added to a legacy document. Successful clip writes emit `studio-composition-source-saved` on the native Stage root with `version`, `scenes` and `playback`; native timing saves emit `studio-motion-source-saved`. Matching timing bindings update their content version, and clip bindings reload their source data. Concurrent edits that lose the shared version race still fail with a retained draft.

## Connected video progress and cancellation

The existing binary `POST /__codex_motion/export` remains the rendering entry point. During rendering, `GET /__codex_motion/export/status` returns `{job}` with the latest compact job or `null`. A job contains `id`, `status`, `phase`, completed `frame`, total `frames`, `elapsedMs` and `format`; it exposes no output path. Status access requires the preview motion token and rejects a foreign Origin.

`POST /__codex_motion/export/cancel` requires matching origin, motion token, JSON content type and exactly `{jobId}` for the currently rendering job. It aborts that export's browser and frame capture. A cancelled binary request returns JSON with HTTP 409 and `code: "EXPORT_CANCELLED"`; it does not publish a video download. Cancelling another or already finished job fails. Disconnecting the owned binary request also aborts its running export. Completed, cancelled and failed job summaries remain available until the next export starts; temporary render files are removed by the service.
