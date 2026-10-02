# Geography and interactive maps

Use ordinary HTML with local classic-script bundles for maps. A map intended for a document, slide, animation or static export should use real vector geometry and a chosen projection. Street exploration uses an actual interactive mapping library and an explicitly enabled tile provider. Do not invent geographic outlines or use latitude/longitude directly as screen coordinates.

## Local vector geography

`assets/starters/geography-libraries.js` bundles the complete D3 7.9.0 and topojson-client 3.1.0 APIs with world-atlas 2.0.2's Natural Earth 1:110m country topology. It exposes `window.CodexMaps = {d3, topojson, world}`; `window.d3` remains available. Retain `chart-libraries.js`, its package notices and the geography entry when copying source, or produce one local bundle with the installed build helper:

```sh
CODEX_DESIGN_SKILL="$HOME/.agents/skills/codex-design"
node "$CODEX_DESIGN_SKILL/scripts/build.mjs" "$CODEX_DESIGN_SKILL/assets/starters/geography-libraries.js" /absolute/path/to/design/geography.bundle.js
```

Load `geography.bundle.js` before your authored map script. No CDN, remote boundary request, model API key or tile download is needed. The installed dependency lockfile includes the geography data and libraries.

Convert the topology with `topojson.feature(world, world.objects.countries)`. Choose a [D3 geographic projection](https://d3js.org/d3-geo) and use `d3.geoPath(projection)` to draw the actual features into SVG. `geoNaturalEarth1().fitExtent(...)` with a `Sphere` fits a world view. `geoMercator().fitExtent(...)` fits a region; rotate its central meridian before fitting when its longitude bounds cross the dateline. GeoJSON coordinates use **longitude, latitude**. Respect the input winding convention; do not reverse imported rings blindly. The dataset includes features without ISO numeric IDs: keep a local name-based identity instead of making up country codes.

The working `examples/maps.html` and `maps.js` demonstrate all 177 dataset features, named regional selection, direct country clicks, reset, accessible selector/status, responsive SVG and actual SVG/2× PNG downloads. Standalone HTML export embeds the topology, libraries, CSS and authored scripts. Retain dependency notices in that output. Initialization after DOM readiness supports both external deferred scripts and inline portable scripts.

The download contains the vector view with its background, title, projection and dataset credit. Keep fills, strokes and text styling in SVG attributes for independently decoded SVG/PNG. The example uses a fixed 720×420 viewBox; PNG is 1440×840. Adapt geometry and content to the intended board. Country outlines are categorical geometry, not measured business data. A choropleth additionally needs real joined values, units, missing-value treatment, legend, period and source citations. A quantitative distance scale must be derived from the actual projection/location.

[world-atlas](https://github.com/topojson/world-atlas) distributes coarse Natural Earth geometry; keep its provenance and licensing. This scale is unsuitable for street detail, recent administrative changes or legal boundary determinations. Use a reviewed higher-resolution/local dataset for those tasks. Broader projection, visual and dataset comparisons remain pending.

## Interactive street maps

`assets/starters/street-libraries.js` exposes the complete Leaflet 1.9.4 API as `window.CodexLeaflet`. Its CSS import produces **two build outputs**; link both. Default marker, retina marker and shadow PNGs are embedded in the JavaScript bundle, so authored `L.marker(...)` works without a separate images folder:

```sh
node "$CODEX_DESIGN_SKILL/scripts/build.mjs" "$CODEX_DESIGN_SKILL/assets/starters/street-libraries.js" /absolute/path/to/design/street.bundle.js
```

```html
<link rel="stylesheet" href="street.bundle.css">
<script src="street.bundle.js" defer></script>
<script src="maps-street.js" defer></script>
```

Copy/adapt the repository's `maps-street.js` and HTML street section for an opt-in example, or author your own ordinary HTML using the [Leaflet API](https://leafletjs.com/reference.html). The example expects `street-map`, `enable-tiles` and `street-status` IDs and a real container height. Its button creates a map centered on Lisbon, adds tiles and a metric/imperial scale, and enables pan/zoom/keyboard controls. Leaflet coordinates use **latitude, longitude**. `window.CodexStreetMap` is the actual map instance, available for authoring and integrations. Retry replaces the tile layer while retaining the map, controls and position.

No tile request occurs until the button is activated. By default it uses `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with visible OpenStreetMap attribution. Configure `data-tile-url` and `data-tile-attribution` on the map container for another provider; review that provider's terms and attribution. The current example status distinguishes OpenStreetMap, a local test fixture and a configured provider, including loading failures. A local test tile is synthetic test data and proves interaction/error handling only.

Use the public OSM tile service for normal interactive viewing under its [current tile policy](https://operations.osmfoundation.org/policies/tiles/). Keep visible attribution, browser caching and an HTTP Referer. Do not prefetch, bulk-download, build offline tile archives or automate pan/zoom against it. Use self-hosted tiles or an appropriate provider when those capabilities are required. The example's vector download never captures street tiles. Verify the actual chosen provider and target browser when delivering a street map; local fixture tests do not establish provider availability.

## Scope and verification

The reference's world/region vector and Leaflet street workflows are restored independently with locally pinned libraries. Tests use real country geometry and actual PNG/SVG output, then remove source files and exercise portable HTML. Street tests use a contained synthetic tile fixture for real Leaflet navigation, attribution, opt-in loading and failure/retry behavior, and decode actual default marker/retina/shadow images at 1× and 2× display density. Full reference visual comparison, further projections/data resolutions, external provider delivery and embedding in every deck/document/animation layout remain open in the [functional inventory](porting-status.md).
