# Data analysis, visualization, diagrams, and geography

Read the actual dataset and define units, population, time window, missing-value treatment, and transformations. Keep an untouched input copy outside source control when appropriate. Use Python or existing project tools for analysis; never infer numerical facts from a decorative chart.

Choose a chart by the question: bars for category comparison, lines for time, scatter for relationships. Start quantitative bars at zero. Do not use pie charts for many categories. `chart.js` renders accessible SVG bar and line charts with labels and a data table. For general interactive charts, use the full locally bundled D3 API with `chart-stage.js`; read the [chart contract](charts.md) for redraws, container sizing, zoom/pinch, tooltips, transitions, states and SVG/2× PNG exports. Keep the simpler bar/line API for existing artifacts. Use SVG or Mermaid for diagrams and connections when appropriate.

Use `sources.js` for provenance and clearly mark synthetic data. An experiment needs a hypothesis, primary metric, assignment unit, test duration assumptions, and a decision rule. A visual variant picker is not evidence that an experiment has run.

Follow the [geography guide](geography.md) for locally bundled real Natural Earth topology, full D3/TopoJSON APIs, world and regional SVG views, actual SVG/2× PNG downloads, and opt-in Leaflet street maps with visible provider attribution. Choose the projection and dataset resolution deliberately; keep measurements, caveats and provenance explicit.

Use the [data overlay contract](data-overlay.md) to paint already-computed metrics or qualitative annotations onto live product elements. Record the denominator, reproducible query, as-of date and metric definition; do not substitute arbitrary severity scores for measurements. Build a telemetry map beside the views file with stable IDs, event/property mappings, known instrumentation gaps and refresh instructions. Keep overlays switchable, verify the off state and confirm every painted number against the underlying dataset.
