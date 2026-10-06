# Interactive D3 chart stage

`chart-stage.js` provides a light-DOM shell for arbitrary D3 charts. It owns sizing, zoom/pan/pinch, tooltip placement, empty/error states, data transitions and SVG/PNG downloads. Your draw function owns the chart, data, axes, labels and units. The smaller `data-chart` element in `chart.js` remains available for existing bar/line artifacts; it does not replace this general API.

## Install and build

Install the skill's pinned dependencies with `npm ci --ignore-scripts` in the installed skill directory. D3 7.9.0 and D3 Sankey 0.12.3 are declared in both lockfiles. Build the editable library entry locally:

```sh
node /path/to/forma/scripts/forma.mjs build \
  /path/to/forma/packages/runtime/src/browser/chart-libraries.js \
  /path/to/output/chart-libraries.bundle.js
cp /path/to/forma/packages/runtime/src/browser/chart-stage.js /path/to/output/
```

Load both local scripts, in order, before authoring the chart. No CDN or remote service is required. The library bundle exposes the full D3 API and Sankey helpers as `window.d3`. You may supply another reviewed local D3 build through that same global. An absent library rejects readiness and displays an actionable error.

```html
<script src="chart-libraries.bundle.js"></script>
<script src="chart-stage.js"></script>
<style>
  chart-stage:not(:defined) { visibility: hidden; }
  chart-stage { height: 360px; --chart-ink: #253c31; }
</style>
<chart-stage name="weekly-articles" zoom="x"></chart-stage>
<script>
  const stage = document.querySelector('chart-stage');
  const rows = [{ id: 'a', value: 12 }, { id: 'b', value: 19 }];
  stage.ready.then(({ d3 }) => {
    stage.draw(({ width, height, view, layer, t, tips, esc }) => {
      if (!rows.length) return stage.showEmpty('No rows in this period');
      const x = view.x(d3.scaleBand(rows.map(d => d.id), [40, width - 20]).padding(.3));
      const y = view.y(d3.scaleLinear([0, d3.max(rows, d => d.value)], [height - 30, 30]).nice());
      const marks = layer('marks').selectAll('rect').data(rows, d => d.id).join('rect');
      t(marks).attr('x', d => x(d.id)).attr('y', d => y(d.value))
        .attr('width', x.bandwidth()).attr('height', d => y(0) - y(d.value));
      tips(marks, d => ({ html: `<b>${esc(d.id)}</b>: ${esc(d.value)} articles` }));
      layer('x-axis').attr('transform', `translate(0,${height - 30})`).call(d3.axisBottom(x));
      layer('y-axis').attr('transform', 'translate(40,0)').call(d3.axisLeft(y));
    });
  });
</script>
```

## Public contract

| Input/action | Behavior |
| --- | --- |
| `stage.ready` | Promise of `{ d3 }`; waits for document readiness. Missing libraries produce a visible error and rejection. |
| `stage.draw(fn)` | Registers the synchronous whole-chart draw callback. First paint uses reason `mount`; replacing a previously drawn callback uses `refresh`. |
| `stage.refresh()` | Schedules a new draw after data/filter changes. Multiple requests in one frame coalesce. Mount/refresh take priority over gesture/resize requests. |
| `stage.showEmpty(message)` | Hides prior SVG and tooltips, shows an explicit message, and prevents export. Return early from draw. The next successful draw restores the chart. |
| `name` | Download basename, default `chart`; unsupported filename characters become hyphens. |
| `zoom` | `xy` by default; `x`, `y` and `none` restrict scale adjustment. Wheel, drag, double-click and native touch pinch use D3 zoom. `none` removes the gesture and reset control. |
| `max-zoom` | Maximum factor, default 32; finite values greater than 1 are accepted. Minimum factor is 1. |
| Ordinary CSS sizing | Default 100% width × 420px height. Draw receives the stage's own client dimensions; a ResizeObserver redraws on container changes. Zero-size stages wait for positive dimensions. |
| Reset view | Appears after zoom/pan and restores identity over 250ms, or immediately with reduced motion. Each stage has independent view state. |
| SVG/PNG buttons | Download current visible geometry with computed SVG paint/text styles and an opaque chart background. PNG has twice the stage's pixel width and height. Empty/unrendered/error stages do not export. |

The draw context is `{ d3, svg, width, height, reason, view, layer, t, tips, esc }`:

- `svg` is the D3 selection of the root SVG, with current width, height and viewBox. Derive ranges from these container dimensions on every draw.
- `view.transform` is the current D3 ZoomTransform. `view.x(scale)` and `view.y(scale)` rescale continuous domains or map the ranges of band/point scales. Disabled axes retain their original scales. Supply unzoomed scales every time; derive axes and marks from the returned scales.
- `layer(name)` retains one SVG group per key and returns its D3 selection. First-use order establishes paint order. If the author removes a group, the next request recreates it. Key every data join; bare appends on repeated draws duplicate marks.
- `t(selection)` returns a named `chart-stage` transition with 250ms duration on refresh. Mount, resize and zoom interrupt that named transition and apply immediately. Reduced motion also applies refreshes immediately. Route every changing geometry attribute through this helper.
- `tips(selection, formatter)` binds namespaced pointer enter/move/leave/cancel listeners. The formatter receives `(datum, event)` with `this` bound to the mark. Strings render as plain text; null/false hides. `{ html }` permits inert formatting and relative-origin images. It strips active/custom elements, event attributes, inline styles, links, identifiers and external/scheme URLs. Style classes through page CSS. Tooltips flip at container edges and disappear when the chart redraws or starts a gesture. A stationary touch tap retains its tooltip after release so it can be read; the next pointer press dismisses it. Drag and pinch do not latch a tooltip.
- `esc(value)` escapes `&`, `<`, `>`, `"` and `'`. Escape every dataset value interpolated into tooltip HTML, even with the sanitizer.

Draw errors hide stale marks, display a readable status, and log the actual exception. Re-registering a valid callback or refreshing corrected data recovers. Disconnect/reconnect preserves SVG node and layer identity and reattaches sizing and gestures. There is no source-editing endpoint for chart data: update the authored data through the agent or a file editor, then refresh; view state remains local to the mounted stage.

## Authoring and verification

Use actual datasets, units, dates and source provenance. Missing values are gaps or explicit unavailable states, never invented zeros. Choose chart type by the question; all D3 modules remain available, including scales, joins, brushes, axes, layouts and Sankey. Disable stage zoom when implementing a brush that owns the same pointer surface. Add a table or textual equivalent for accessible inspection; the stage does not invent one from arbitrary draw code. Format exact tooltip values and avoid truncating source names without an inspection path.

Theme `--chart-font`, `--chart-ink`, `--chart-muted`, `--chart-surface` and `--chart-grid`. Chart marks/axes remain in ordinary light DOM for author styles. Localize fonts and images before portable export; remote assets are not automatically fetched or embedded. The SVG export captures current computed styles and zoom, rather than reconstructing an unzoomed chart.

`examples/charts.html` demonstrates keyed temporal marks, refresh transitions, empty/recovery behavior, an inspectable table, a general Sankey layout and independent stage policies. Browser tests cover node identity, container resize/reconnect, scale modes, D3 brush compatibility, actual wheel/drag/two-finger touch input, tooltip formatting/sanitization, download filenames, SVG styling, decoded PNG dimensions/background/mark pixels, and missing-library/draw errors. Inspect the authored chart at its intended size and verify physical-device interaction when needed.
