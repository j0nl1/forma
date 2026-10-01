# Data analysis, visualization, diagrams, and geography

Read the actual dataset and define units, population, time window, missing-value treatment, and transformations. Keep an untouched input copy outside source control when appropriate. Use Python or existing project tools for analysis; never infer numerical facts from a decorative chart.

Choose a chart by the question: bars for category comparison, lines for time, scatter for relationships. Start quantitative bars at zero. Do not use pie charts for many categories. `chart.js` renders accessible SVG bar and line charts with labels and a data table. Use SVG or Mermaid for diagrams and connections when appropriate.

Use `sources.js` for provenance and clearly mark synthetic data. An experiment needs a hypothesis, primary metric, assignment unit, test duration assumptions, and a decision rule. A visual variant picker is not evidence that an experiment has run.

Maps need real coordinates and projection choice. Use local GeoJSON with SVG for offline work; use a configured mapping library only when tiles and licensing are understood. Include scale, legend, geographic caveats, and attribution. Do not invent boundaries or interpret raw latitude/longitude as screen pixels.
