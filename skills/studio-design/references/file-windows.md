# Live project file windows

Use `file-window.js` for an input-isolated crop of a real project HTML file, including `.dc.html` component galleries. This is separate from device/window dressing. Copy the loader and its five `file-window*.js` companion modules together, or bundle the loader with the local build helper. Serve the project over HTTP; direct `file:` URLs cannot perform the required existence probes.

```html
<script src="file-window.js"></script>
<file-window
  file="previews/reading.html"
  label="Reading room"
  width="320" height="200"
  window-width="640" document-width="960"
  window-x="100" window-y="300"
  action-label="Select this file"
></file-window>
```

## Crop and input contract

| Attribute | Default and behavior |
| --- | --- |
| `file` | Required project-relative or same-origin root-relative path. External URLs and executable schemes are rejected. Spaces and literal hashes are supported. |
| `label` | File basename with `.html` / `.dc.html` removed; labels remain literal text. |
| `width`, `height` | Physical crop size, 320 × 200 px; width 120–4000, height 48–4000. Card padding and caption sit outside the crop. |
| `window-width` | Nominal cropped document width, defaults to physical width; 24–4000. Scale is physical width divided by this value. |
| `document-width` | Nominal full document width, at least the crop width and at most 12000 px. |
| `window-x`, `window-y` | Nominal top-left crop coordinates; 0–8000. |
| `action-label` | Optional expanded-view action button; hidden when empty and disabled until the actual file is ready. |
| `lazy` | Probe availability immediately but defer mounting until within 300 px of the viewport. Removing it mounts an available file immediately. |
| `no-expand` | Hide the card's expanded-view button. |
| `expect` | Wait for a file being created instead of immediately showing unavailable. |

The thumbnail iframe uses width `document-width`, height `window-y + height / scale`, and a top-left `scale(scale) translate(-window-x, -window-y)` transform. It is inert, removed from keyboard navigation, denies camera/microphone/geolocation/fullscreen, uses no-referrer, and sits under a pointer fence. Card click or Enter/Space selects the file; embedded links, fields and buttons are display content.

The frame permits same-origin scripts for ordinary reviewed project code. These permissions preserve component rendering, measurement and update callbacks. This is **input isolation**, not a security sandbox for hostile documents. Keep imported documents within the project's existing trust boundary.

## Availability, waiting and updates

The component checks every five seconds and when the page becomes visible. HEAD validators use ETag, Last-Modified or Content-Length. A server rejecting HEAD with 405/501, or providing no validator, receives a GET fallback; without any validator the body byte count becomes the version. The included preview server provides a content-derived ETag, so equal-length rewrites are detected. Third-party servers without usable validators can only detect byte-count changes; call `reload()` for an explicit refresh.

No iframe mounts before a file exists. A normal missing file displays an unavailable card. `expect` displays twenty independently drawn pencil layouts on a seeded 100-second cycle; strokes draw, flicker and disappear with a restrained breathing motion. Reduced motion shows one static plan. Two minutes without authoring activity changes an expected missing file to unavailable. Any routed streaming update with nonempty content, including a different file, restarts that patience period. Ordinary failed polls do not restart it.

A loaded preview survives one failed probe; two consecutive misses remove its frame, close its modal, disable picking and hide expansion. A later successful probe restores it. A changed validator reloads both thumbnail and expanded view through a fresh URL nonce. Disconnect cancels timers, outstanding probes, visibility listeners and modal observers; reconnect resumes checking. Changing `file` invalidates old requests before mounting its replacement.

For a local authoring bridge, call:

```js
window.CodexFileUpdate(
  "reading", "html", content, streaming, "main", "previews/reading.html"
);
// Equivalent event transport:
window.dispatchEvent(new CustomEvent("codex:file-update", {
  detail: {
    name: "reading", kind: "html", content,
    streaming: false, viewportKey: "main", path: "previews/reading.html"
  }
}));
```

`name` is the basename without `.html` / `.dc.html`. An optional `path` disambiguates duplicate basenames. Paths resolve from the preview origin root by default; add `<meta name="codex-file-base" content="/project/">` for another project root. A matching embedded document may define its own `window.CodexFileUpdate(name, kind, content, streaming, viewportKey, path)` receiver. Both thumbnail and modal receive it without remounting. Otherwise a completed update probes the actual file; a missing file also probes on streaming pushes, throttled to at most one new probe per 500 ms. The static router preserves an existing callback and avoids duplicate delivery when reinstalled.

Polling works without an authoring bridge. These names are native local contracts; no proprietary hosted transport is installed.

## Expanded view and events

The expanded view uses a native modal above transformed body/canvas layouts. It fits the whole document at scale 0.66–2, caps the viewport at 960 px wide, and retains horizontal scrolling when the scale floor prevents fitting. Opening starts at the authored crop. A sticky viewport-sized iframe plus an outer document-height scroll region preserves real CSS viewport units while reaching the final strip of a tall document. Embedded ResizeObserver measurements track changing document height; window resize recalculates the fit.

Escape, the close button or the backdrop closes the view and restores the opener's focus. An expected file can be expanded before it exists; that view retains the placeholder and mounts only when the actual file arrives.

| Bubbling, composed event | Detail |
| --- | --- |
| `file-window:state` | `"loading"`, `"ready"` or `"unavailable"`; also readable through `.state` and `data-state`. |
| `file-window:pick` | `{ file }`, from card click or keyboard activation. |
| `file-window:action` | `{ file }`, from the optional expanded-view action. |

Handle these events in the containing page to select/open/use a project file. Automatic handoff to the Codex composer remains a required integration; emitting a local event does not claim that the composer received a file.

Theme using `--fw-ud` (waiting pencil), `--fw-surf`, `--fw-muted`, `--fw-fg`, `--fw-fg3`, `--fw-line`, `--fw-line2`, `--fw-hov`, `--fw-sel`, `--fw-skel`, `--fw-scroll` and `--fw-font`. The expanded view copies those variables from its owner.

## Output and verification

Whole-page PNG/PDF export settles available file previews, including lazy ones, waits for their fonts/images, and removes the thumbnail fade during capture. HTML inlining embeds the runtime but deliberately retains real file dependencies. Keep those HTML files and their assets beside the exported page, or prepare a separate reviewed snapshot when a completely self-contained deliverable is needed. The `files.html` laboratory includes two real project files, crop/expand/pick actions, embedded updates and a clearly labeled waiting-animation study.

Tests cover geometry/path bounds, real same-length rewrites, two-miss/reappearance behavior, missing-file patience with unrelated streaming activity, reduced motion, both native transports and duplicate-name paths, embedded receivers in both views, lazy/reconnect behavior, HEAD fallback without validators, stale request cancellation, actual polling, tall/narrow/dynamically growing modal documents, CSS viewport height, transformed-body escape, action changes, close/focus behavior, portable runtime removal and actual exported crop pixels.

additional browser engines, physical interaction checks and automatic Codex authoring/selection handoff remain required. Independently drawn waiting plans preserve the animation contract; exact source-artwork equivalence has not been verified.
