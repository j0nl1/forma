# Data and feedback overlays

`<data-overlay>` paints authored views on live product UI. It has no built-in metric types and never estimates an unanswered slice. It is also the annotation runtime for a separate design-review page. `sources.js` remains the citation component; it does not implement these overlays.

## Install and load

Copy `data-overlay.js` and its `data-overlay-*.js` companions beside your HTML. The classic loader exposes `window.CodexOverlayReady`; wait for it before calling the imperative API. For a single runtime file, use the local build helper:

```sh
node /path/to/forma/scripts/forma.mjs build \
  /path/to/forma/packages/runtime/src/browser/data/data-overlay.js \
  /path/to/output/data-overlay.js
```

```html
<script src="data-overlay.js"></script>
<data-overlay src="./overlay-data.json" controls="on">
  <button data-metric-id="create">Create project</button>
  <button data-metric-id="share">Share project</button>
</data-overlay>
```

JSON is the data-only file format. The reviewed legacy `.js` form is supported: its script assigns `window.__overlays = { views: [...] }`. A file-loading script overlay uses that shared mailbox, so use one per page; additional overlays can use `setViews`. Loading a JavaScript data file executes authored page code, just like another page script. Inventory and static export read files without evaluating them. There are no injected parent-host request protocols or model calls.

Native standalone export embeds JSON/JS source resources as typed data URLs and embeds a bundled runtime. The resulting artifact works without the original data and runtime files. Bundle the loader first; an unbundled dynamic import still needs its companion files.

## Public API and state

| Surface | Contract |
| --- | --- |
| `src` | File URL. JSON is fetched without cache; reviewed JS loads as a script. Changing it or dispatching `overlay:reload` reloads. Stale/aborted JSON responses cannot replace newer data. |
| `id-attr` | Tracked descendant attribute, default `data-metric-id`. Invalid selector-like names fall back to that default. |
| `controls` | `on` renders sentence menus, metadata and stage chrome; otherwise headless. Finding and legend still travel with an active view. |
| `views` | Loaded array, getter. Source data is not silently recalculated. |
| `setViews(arrayOrObject)` | Imperative authoring; accepts an array or `{ views, suggest }`, preserves pending combinations until answered, and returns the element. Works before mount and across remounts. |
| `view` | Property getter/setter for active view ID. Defaults to the first authored view; changing it cancels waiting and pending cuts. |
| `measure()` | Schedules container-relative geometry measurement and returns the element. |
| `window.DataOverlay` | Registered class; exposes `layoutCallouts` and `geom` helpers for authoring/tests. |
| `overlay:reload` | DOM event on the element, or same-origin window/parent `postMessage` with `{ type: 'overlay:reload' }`. This reload channel does not execute a supplied prompt. |
| `data-overlay:fetch` | Local bubbling/composed CustomEvent carrying a validated request draft: `src`, `mode`, `view`, `want`, `text` and `fallbackPrompt`. No wildcard parent message is sent. |
| `onRequest(request)` | Optional reviewed-page callback to deliver a draft to a configured review surface. Return a Promise if needed. Sending a model/chat request remains a separate explicit user action. |

With no `src` and no imperative data, the wrapper is a passthrough: no padding, sentence, finding, legend or paint. Removing a file source turns off its cached view and restores inline opacity. A source-driven artifact should expose an on-by-default checkbox/tweak that maps `src`. Imperative artifacts turn off with `setViews([])`; use `controls="off"` for a completely headless empty wrapper. Loading failure with no data displays an explicit status instead of fabricated values; existing cached views remain available after a failed reload.

Geometry tracks mutation, stage/subject resize, scroll, a short late-mount retry chain, startup layout and running light-DOM animations. Washes/rings use each subject's computed border-radius and accumulated planar transform, including independent `rotate`/`scale`/`translate` and transformed ancestors inside the overlay. Pins follow the actual transformed top-left. Perspective, z-mixing and unsupported CSS zoom fall back to the measured axis-aligned box. Transform scaling above the overlay host is not verified; inspect alignment in that layout.

Subjects below a sibling modal/popover inside the overlay are not painted. Duplicate IDs prefer the first visible anchor over an occluded one. Use unique stable IDs for normal authoring. Hovering a subject isolates its callout and leader, choosing the smallest matching anchor; leaving restores the other cards. Pure paint layers do not intercept product interactions; annotation cards remain readable/selectable.

## View data

```json
{
  "suggest": { "window": ["last 7 days", "weekends only"] },
  "views": [
    {
      "id": "reach-28d",
      "label": "Creation reach",
      "asOf": "2026-10-01",
      "basis": "all active workspace users in the same 28-day window",
      "sentence": { "metric": "reach", "cohort": "all users", "window": "last 28 days" },
      "source": "Replace with the actual reproducible query and its source.",
      "refreshable": true,
      "finding": "Replace with a takeaway derived after computing the real values.",
      "meta": { "range": "Sep 4 - Oct 1", "n": 100, "unit": "active users", "about": "creation reach among active users" },
      "spectrum": { "colors": ["#F6F4EF", "#376E53"], "domain": [0, 1], "fmt": "pct" },
      "dim": 0.25,
      "deltaBasis": "prior 28 days",
      "legend": true,
      "elements": [
        { "id": "create", "value": 0.37, "delta": 0.04, "callout": { "head": "Composer", "body": "Replace with the actual measured observation." } },
        { "id": "share", "value": null },
        { "id": "help" }
      ]
    }
  ]
}
```

The numbers above illustrate the schema only. Do not paint them onto a real product as actual telemetry. If no analytics source is available, tag the screen and document the query/measurement gaps; leave the views empty until real values exist. `examples/overlay.html` explicitly uses the separate synthetic aggregate fixture in `overlay-observations.json`.

- A present numerical `value` paints a wash and formatted tag. `value: null` paints a hatched missing measurement with a dash, visibly distinct from zero. An entry with neither value nor callout paints a spotlight ring. Callout-only entries paint the numbered pin and annotation without inventing a score.
- `delta` appears only with a declared `deltaBasis`, which remains in the legend. The tag shows direction and formatted magnitude; a zero change is `=`.
- `spectrum.colors` accepts `#rgb`, `#rrggbb`, `rgb()` and `rgba()`. Unsupported ramp stops fall back to paper/green; unsupported element `color` falls back to the ramp. `hue` is paper-to-hue shorthand. Three colors form a diverging ramp; a valid internal `baseline` fixes the midpoint and takes precedence over `good: 'low'` and quantile spacing. Two colors interpolate RGB. `good: 'low'` reverses ordinary value mapping. `scale: 'quantile'` ranks distinct values so ties share a color. `steps` quantizes the result. Flat ranges use the midpoint, not an invented minimum. `domain` otherwise derives from the view's finite values.
- `fmt: 'pct'` is the default; `fmt: 'n'` formats compact counts. Reviewed imperative/JS data may supply a formatting function. Formatter output is plain text, including in legends.
- `callout` accepts `pin`, `head`, `body`, `place` (`above`/`below`), `dx` and `dy`. Automatic pins follow elements-array order and skip explicitly reserved pin labels. Occlusion does not renumber later cards. Text renders inertly. Layout places authored fixed cards first, then sweeps below/above/right/left, avoids other cards and subjects, minimizes covered subject area when no clear spot exists, and clamps to the stage. Identical input and viewport yield identical placement. Tags use collision lanes.
- Unlisted tracked elements fade to `dim`, default 0.25; `dim: 1` leaves them alone. Subject ancestors do not fade, nested non-subjects inherit one fade, already-hidden elements stay hidden, and nested overlays own their own opacity writes. Original inline value and priority restore on view change, untracking, off and disconnect. If your page animates inline opacity on tracked elements, use `dim: 1` to avoid conflicting ownership.

## Provenance and sentence controls

Every valued view requires a plain-language denominator in `basis`; omitting it produces a visible `basis not stated` warning even when metadata is present. `asOf` supplies a valid date. `source` is the reproducible query recipe, not a vague table name. Compute `finding` after the values, then show it above the painted design.

`meta.range`, `n`/`unit` and `about` validate independently. An invalid provided unit drops that count; only an absent unit defaults to rows. Range and about must be short nonempty plain phrases. With controls on, a rendered range replaces the legend's date and a rendered about replaces its basis text. A count alone replaces neither; the missing-denominator warning is never hidden. Headless views retain provenance in the legend.

Sentence menus show the distinct authored metric/cohort/window phrases. Keyboard Enter/Space/ArrowDown opens, arrows navigate into the text field, Enter picks/submits, Escape restores token focus and outside click closes. The metric segment selects the closest authored view when an exact triple is absent, matching cohort/window where possible and resolving ties by file order. Cohort and window require exact matches: an unanswered cut marks the existing paint stale and displays the request action. The control never re-slices existing values.

Free text normalizes keyboard curly quotes/dashes and whitespace, validates a short plain phrase, and switches immediately for an existing case-insensitive option. A new phrase prepares a request for that exact triple. IME composition does not submit. Placeholder suggestions skip existing options, rotate with a brief fade, freeze while typing, and clean up when the menu closes/disconnects.

## Requests, reload and remaining integration

The default request action copies an actual draft and shows a selectable textarea fallback. Refresh drafts ask the agent to re-run the active view's recorded source, preserve population/window and other views, recompute provenance, derive finding, then reload. Missing-view drafts request real values for the selected triple and preserve existing views. IDs and phrases are validated before entering the structured request. The user pastes, reviews and sends the draft in the agent chat; the runtime does not report a query as running merely because text was copied.

While awaiting an update, the stage shimmers and offers cancellation. A matching newly loaded/imperatively provided view is adopted. A successful refresh clears waiting. After 90 seconds without an answer, paint is visibly stale; cancellation returns to the current authored state. Removal tears down timers/listeners and restores opacity. Native composer insertion is not available. Clipboard delivery requires the user to paste, review and send the draft, as with typed tweak requests.

Browser verification covers spectra, affine geometry, deterministic placement, nil/zero/spotlight states, opacity restoration and nested ownership, transformed/reflowed/animated anchors, scroll, modal occlusion, view switching and keyboard menus, provenance, JSON/JS source reloads and stale responses, actual copied drafts and unavailable-clipboard fallback, 90-second timeout/adoption, and portable exports without original files. Full reference visual comparison and physical-device checks remain pending.
