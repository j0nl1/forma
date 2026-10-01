/* const painting=new CodexWatercolor(canvas,42); painting.wash({...});
   painting.line({points:[[x,y],...],color:'#345',width:3}); painting.render(0..1).
   Stroke geometry is seeded once; seeking never changes the painting. */
(() => {
  class Watercolor {
    constructor(canvas, seed = 1) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.seed = seed >>> 0;
      this.strokes = [];
      this.paper = "#fbf6ea";
    }
    random() {
      this.seed = (1664525 * this.seed + 1013904223) >>> 0;
      return this.seed / 4294967296;
    }
    wash({ x, y, rx, ry, color = "#709c85", opacity = 0.18 }) {
      const layers = [];
      for (let i = 0; i < 8; i++)
        layers.push({
          x: x + (this.random() - 0.5) * rx * 0.16,
          y: y + (this.random() - 0.5) * ry * 0.16,
          rx: rx * (0.88 + this.random() * 0.22),
          ry: ry * (0.88 + this.random() * 0.22),
        });
      this.strokes.push({ kind: "wash", layers, color, opacity });
      return this;
    }
    line({ points, color = "#304638", width = 2 }) {
      this.strokes.push({
        kind: "line",
        points: points.map(([x, y]) => [
          x + (this.random() - 0.5) * 0.7,
          y + (this.random() - 0.5) * 0.7,
        ]),
        color,
        width,
      });
      return this;
    }
    splatter({ x, y, radius = 30, count = 20, color = "#688c77" }) {
      const dots = [];
      for (let i = 0; i < count; i++) {
        const a = this.random() * Math.PI * 2,
          r = this.random() * radius;
        dots.push({
          x: x + Math.cos(a) * r,
          y: y + Math.sin(a) * r,
          r: 1 + this.random() * 3,
        });
      }
      this.strokes.push({ kind: "splatter", dots, color });
      return this;
    }
    render(progress = 1) {
      const c = this.ctx;
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      c.fillStyle = this.paper;
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
      const time = Math.max(0, Math.min(1, progress)) * this.strokes.length;
      this.strokes.forEach((s, i) => {
        const p = Math.min(1, Math.max(0, time - i));
        if (p === 0) return;
        c.save();
        c.globalCompositeOperation = "multiply";
        c.fillStyle = s.color;
        c.strokeStyle = s.color;
        if (s.kind === "wash") {
          c.globalAlpha = s.opacity * p;
          for (const layer of s.layers) {
            c.beginPath();
            c.ellipse(layer.x, layer.y, layer.rx, layer.ry, 0, 0, Math.PI * 2);
            c.fill();
          }
        } else if (s.kind === "line") {
          c.lineWidth = s.width;
          c.lineCap = "round";
          c.lineJoin = "round";
          c.beginPath();
          const count = Math.max(1, Math.ceil(s.points.length * p));
          s.points
            .slice(0, count)
            .forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y)));
          c.stroke();
        } else
          for (const d of s.dots.slice(0, Math.ceil(s.dots.length * p))) {
            c.globalAlpha = 0.4;
            c.beginPath();
            c.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            c.fill();
          }
        c.restore();
      });
    }
  }
  window.CodexWatercolor = Watercolor;
})();
