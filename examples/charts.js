const reading = document.querySelector("#reading");
const flow = document.querySelector("#flow");
const sample = [12, 19, 16, 28, 22, 31, 26, 35].map((value, i) => ({
  id: i,
  date: new Date(Date.UTC(2026, 8, 7 + i * 7)),
  value,
}));
let rows = sample,
  revision = 0;
function table() {
  document.querySelector("#rows").replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      for (const value of [row.date.toISOString().slice(0, 10), row.value]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      }
      return tr;
    }),
  );
}
reading.ready.then(({ d3 }) => {
  const date = d3.utcFormat("%b %d");
  reading.draw(({ width, height, view, layer, t, tips, esc }) => {
    if (!rows.length)
      return reading.showEmpty("No reading records in this period");
    const x = view.x(
      d3.scaleUtc(
        d3.extent(rows, (r) => r.date),
        [48, width - 22],
      ),
    );
    const y = view.y(
      d3
        .scaleLinear([0, d3.max(rows, (r) => r.value)], [height - 38, 36])
        .nice(),
    );
    layer("grid")
      .attr("class", "grid")
      .attr("transform", "translate(48,0)")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickSize(-(width - 70))
          .tickFormat(""),
      );
    t(
      layer("line")
        .selectAll("path")
        .data([rows])
        .join("path")
        .attr("class", "series"),
    ).attr(
      "d",
      d3
        .line()
        .x((r) => x(r.date))
        .y((r) => y(r.value)),
    );
    const points = layer("marks")
      .selectAll("circle")
      .data(rows, (r) => r.id)
      .join("circle")
      .attr("class", "point")
      .attr("r", 5);
    t(points)
      .attr("cx", (r) => x(r.date))
      .attr("cy", (r) => y(r.value));
    tips(points, (r) => ({
      html: `<b>${esc(r.date.toISOString().slice(0, 10))}</b><br>${esc(r.value)} articles completed`,
    }));
    layer("x-axis")
      .attr("transform", `translate(0,${height - 38})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(Math.max(2, Math.floor(width / 110)))
          .tickFormat(date),
      );
    layer("y-axis")
      .attr("transform", "translate(48,0)")
      .call(d3.axisLeft(y).ticks(5));
    layer("unit")
      .selectAll("text")
      .data(["Articles"])
      .join("text")
      .attr("x", 48)
      .attr("y", 18)
      .attr("font-size", 12)
      .text((d) => d);
  });
});
flow.ready.then(({ d3 }) => {
  flow.draw(({ width, height, layer, tips, esc }) => {
    const graph = d3
      .sankey()
      .nodeWidth(14)
      .nodePadding(28)
      .extent([
        [18, 42],
        [width - 18, height - 18],
      ])({
      nodes: ["Focused", "Casual", "Design", "Science"].map((name) => ({
        name,
      })),
      links: [
        { source: 0, target: 2, value: 40 },
        { source: 0, target: 3, value: 30 },
        { source: 1, target: 2, value: 20 },
        { source: 1, target: 3, value: 10 },
      ],
    });
    const links = layer("flows")
      .selectAll("path")
      .data(graph.links, (l) => `${l.source.name}-${l.target.name}`)
      .join("path")
      .attr("class", "sankey-link")
      .attr("d", d3.sankeyLinkHorizontal())
      .attr("stroke-width", (l) => l.width);
    tips(
      links,
      (l) => `${l.source.name} → ${l.target.name}: ${l.value} minutes`,
    );
    const nodes = layer("nodes")
      .selectAll("rect")
      .data(graph.nodes, (n) => n.name)
      .join("rect")
      .attr("class", "sankey-node")
      .attr("x", (n) => n.x0)
      .attr("y", (n) => n.y0)
      .attr("width", (n) => n.x1 - n.x0)
      .attr("height", (n) => n.y1 - n.y0);
    tips(nodes, (n) => ({
      html: `<b>${esc(n.name)}</b><br>${esc(n.value)} minutes`,
    }));
    layer("labels")
      .selectAll("text")
      .data(graph.nodes, (n) => n.name)
      .join("text")
      .attr("class", "sankey-label")
      .attr("x", (n) => (n.x0 < width / 2 ? n.x1 + 8 : n.x0 - 8))
      .attr("y", (n) => (n.y0 + n.y1) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", (n) => (n.x0 < width / 2 ? "start" : "end"))
      .text((n) => n.name);
  });
});
document.querySelector("#update").addEventListener("click", () => {
  revision++;
  rows = sample.map((r, i) => ({
    ...r,
    value: r.value + (revision % 2 ? ((i % 3) + 1) * 3 : 0),
  }));
  table();
  reading.refresh();
});
document.querySelector("#empty").addEventListener("click", () => {
  rows = rows.length ? [] : sample;
  table();
  reading.refresh();
});
table();
