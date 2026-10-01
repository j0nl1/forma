/* <data-chart type="bar|line" label="...">; set .data=[{label:'A',value:10},...].
   Units come from the unit attribute. Includes an accessible data table. */
(() => {
  const NS = "http://www.w3.org/2000/svg";
  class Chart extends HTMLElement {
    connectedCallback() {
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      this.render();
    }
    set data(value) {
      this._data = value;
      this.render();
    }
    get data() {
      return this._data || [];
    }
    render() {
      if (!this.shadowRoot) return;
      const data = this.data;
      if (
        !data.every(
          (d) => typeof d.label === "string" && Number.isFinite(d.value),
        )
      )
        throw new Error("Chart data needs string labels and finite values");
      const root = this.shadowRoot;
      root.innerHTML =
        "<style>:host{display:block;color:#243043;font:14px system-ui}svg{width:100%;height:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd}summary{cursor:pointer;margin:10px 0}</style>";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 640 340");
      svg.setAttribute("role", "img");
      svg.setAttribute(
        "aria-label",
        this.getAttribute("label") || "Data chart",
      );
      const el = (tag, attributes, text) => {
        const node = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attributes))
          node.setAttribute(k, v);
        if (text != null) node.textContent = text;
        svg.append(node);
        return node;
      };
      const min = Math.min(0, ...data.map((d) => d.value)),
        max = Math.max(1, ...data.map((d) => d.value));
      const y = (v) => 285 - ((v - min) / (max - min)) * 245;
      const width = 540 / Math.max(1, data.length);
      const zero = y(0);
      el("line", { x1: 60, y1: zero, x2: 620, y2: zero, stroke: "#8993a3" });
      el(
        "text",
        { x: 10, y: 40, fill: "currentColor" },
        max + (this.getAttribute("unit") || ""),
      );
      el("text", { x: 10, y: 285, fill: "currentColor" }, min);
      const points = [];
      data.forEach((d, i) => {
        const x = 65 + i * width;
        points.push(`${x + width * 0.4},${y(d.value)}`);
        if (this.getAttribute("type") !== "line")
          el("rect", {
            x,
            y: Math.min(zero, y(d.value)),
            width: width * 0.75,
            height: Math.abs(zero - y(d.value)),
            rx: 3,
            fill: "var(--chart-accent,#275dad)",
          });
        el(
          "text",
          { x, y: 315, fill: "currentColor", "font-size": 12 },
          d.label,
        );
      });
      if (this.getAttribute("type") === "line")
        el("polyline", {
          points: points.join(" "),
          fill: "none",
          stroke: "var(--chart-accent,#275dad)",
          "stroke-width": 3,
        });
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "View data table";
      details.append(summary);
      const table = document.createElement("table");
      table.innerHTML =
        "<thead><tr><th>Category</th><th>Value</th></tr></thead>";
      const body = document.createElement("tbody");
      for (const d of data) {
        const tr = document.createElement("tr");
        for (const value of [d.label, d.value]) {
          const td = document.createElement("td");
          td.textContent = value;
          tr.append(td);
        }
        body.append(tr);
      }
      table.append(body);
      details.append(table);
      root.append(svg, details);
    }
  }
  if (!customElements.get("data-chart"))
    customElements.define("data-chart", Chart);
})();
