(() => {
  if (customElements.get("chart-stage")) return;
  const NS = "http://www.w3.org/2000/svg";
  const transitionName = "chart-stage";
  const exportStyles = [
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-dasharray",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "letter-spacing",
    "text-anchor",
    "dominant-baseline",
    "paint-order",
    "shape-rendering",
    "visibility",
    "display",
    "mix-blend-mode",
  ];
  const css = document.createElement("style");
  css.textContent = `
    :where(chart-stage){display:block;position:relative;width:100%;height:420px;background:var(--chart-surface,#fff);font-family:var(--chart-font,system-ui,sans-serif)}
    chart-stage>svg{display:block;overflow:hidden;max-width:100%}
    chart-stage .cs-tip{position:absolute;pointer-events:none;z-index:4;max-width:min(260px,calc(100% - 26px));padding:6px 9px;border-radius:6px;font-size:12px;line-height:1.45;overflow:hidden;overflow-wrap:anywhere;background:var(--chart-ink,#1a1a18);color:var(--chart-surface,#fff);opacity:0;transition:opacity 120ms}
    chart-stage .cs-tools{position:absolute;top:8px;right:8px;z-index:3;display:flex;gap:6px;opacity:0;transition:opacity 150ms}
    chart-stage:hover .cs-tools,chart-stage:focus-within .cs-tools{opacity:1}
    chart-stage .cs-tools button{font:inherit;font-size:11px;padding:3px 9px;border-radius:999px;cursor:pointer;color:var(--chart-ink,#1a1a18);background:var(--chart-surface,#fff);border:1px solid var(--chart-grid,#d9d9d4)}
    chart-stage .cs-tools button:hover{border-color:var(--chart-ink,#1a1a18)}
    chart-stage .cs-note{position:absolute;inset:0;z-index:2;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;font-size:13px;color:var(--chart-muted,#6e6e68)}
    chart-stage .cs-note.cs-on{display:flex}
    chart-stage .cs-note[data-error]{color:#b3261e}
    @media (hover:none){chart-stage .cs-tools{opacity:1}}
    @media (prefers-reduced-motion:reduce){chart-stage .cs-tip,chart-stage .cs-tools{transition:none}}
  `;
  document.head.append(css);

  const escapeText = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const unsafeURL = (value) => {
    const clean = value.replace(/[\x00-\x20]/g, "");
    return /^[a-z][a-z\d+.-]*:/i.test(clean) || /^[\\/]{2}/.test(clean);
  };
  function tooltipFragment(markup) {
    const template = document.createElement("template");
    template.innerHTML = markup;
    const forbidden = new Set(
      "script iframe object embed link meta style form base template svg animate set animatetransform animatemotion".split(
        " ",
      ),
    );
    const urlAttrs = new Set(
      "src formaction action poster ping cite data background".split(" "),
    );
    for (const element of template.content.querySelectorAll("*")) {
      if (forbidden.has(element.localName) || element.localName.includes("-")) {
        Element.prototype.remove.call(element);
        continue;
      }
      for (const attr of [...element.attributes]) {
        const name = attr.name.toLowerCase();
        if (
          name.startsWith("on") ||
          [
            "style",
            "pointer-events",
            "tabindex",
            "name",
            "id",
            "href",
            "xlink:href",
            "is",
          ].includes(name) ||
          (urlAttrs.has(name) && unsafeURL(attr.value)) ||
          (name === "srcset" &&
            attr.value
              .split(",")
              .some((part) => unsafeURL(part.trim().split(/\s+/)[0])))
        ) {
          element.removeAttribute(attr.name);
        }
      }
    }
    return template.content;
  }
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  class ChartStage extends HTMLElement {
    static observedAttributes = ["zoom", "max-zoom"];
    constructor() {
      super();
      this.layers = new Map();
      this.reason = "mount";
      this.frame = 0;
      this.hasDrawn = false;
    }
    get ready() {
      if (!this.readiness) {
        this.readiness = new Promise((resolve, reject) => {
          const probe = () => {
            if (window.d3?.select && window.d3?.zoom)
              resolve({ d3: window.d3 });
            else {
              const message =
                "Chart libraries are missing. Load the local chart-libraries bundle before chart-stage.js.";
              this.problem = message;
              this.note(message, true);
              reject(new Error(message));
            }
          };
          if (document.readyState === "loading")
            document.addEventListener("DOMContentLoaded", probe, {
              once: true,
            });
          else probe();
        });
        this.readiness.catch(() => {});
      }
      return this.readiness;
    }
    connectedCallback() {
      if (!this.svgElement) {
        this.svgElement = document.createElementNS(NS, "svg");
        this.tip = document.createElement("div");
        this.tip.className = "cs-tip";
        this.tip.setAttribute("role", "tooltip");
        this.noteElement = document.createElement("div");
        this.noteElement.className = "cs-note";
        this.noteElement.setAttribute("role", "status");
        this.tools = document.createElement("div");
        this.tools.className = "cs-tools";
        this.append(this.svgElement, this.tip, this.noteElement, this.tools);
        this.resetButton = this.button("Reset view", () => this.reset());
        this.resetButton.hidden = true;
        this.button("↓ PNG", () => this.download("png"));
        this.button("↓ SVG", () => this.download("svg"));
        this.observer = new ResizeObserver(() => this.schedule("resize"));
      }
      this.dismissTip ??= () => this.hideTip();
      document.addEventListener("pointerdown", this.dismissTip, true);
      this.observer.observe(this);
      if (this.problem) this.note(this.problem, true);
      this.ready.then(
        ({ d3 }) => {
          this.d3 = d3;
          this.transform ??= d3.zoomIdentity;
          if (!this.isConnected) return;
          this.configureZoom();
          this.schedule(this.hasDrawn ? "resize" : "mount");
        },
        () => {},
      );
    }
    disconnectedCallback() {
      document.removeEventListener("pointerdown", this.dismissTip, true);
      this.tipPress = null;
      this.observer?.disconnect();
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.d3?.select(this.svgElement).interrupt().on(".zoom", null);
      this.hideTip();
    }
    attributeChangedCallback() {
      if (!this.d3 || !this.isConnected) return;
      this.configureZoom();
      this.schedule("zoom");
    }
    mode() {
      const mode = (this.getAttribute("zoom") || "xy").toLowerCase();
      return ["x", "y", "none"].includes(mode) ? mode : "xy";
    }
    configureZoom() {
      const { d3 } = this;
      const svg = d3.select(this.svgElement);
      svg.on(".zoom", null);
      if (this.mode() === "none") {
        this.transform = d3.zoomIdentity;
        this.svgElement.__zoom = this.transform;
        this.resetButton.hidden = true;
        this.svgElement.style.touchAction = "";
        return;
      }
      const maximum = Number(this.getAttribute("max-zoom"));
      this.zoomBehavior = d3
        .zoom()
        .scaleExtent([
          1,
          Number.isFinite(maximum) && maximum > 1 ? maximum : 32,
        ])
        .on("start", () => this.hideTip())
        .on("zoom", (event) => {
          this.transform = event.transform;
          this.resetButton.hidden =
            event.transform.k === 1 &&
            (this.mode() === "y" || event.transform.x === 0) &&
            (this.mode() === "x" || event.transform.y === 0);
          this.schedule("zoom");
        });
      this.svgElement.style.touchAction = "none";
      svg.call(this.zoomBehavior);
    }
    button(label, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", action);
      this.tools.append(button);
      return button;
    }
    draw(callback) {
      if (typeof callback !== "function")
        throw new TypeError("Chart draw requires a function");
      this.drawFunction = callback;
      this.schedule(this.hasDrawn ? "refresh" : "mount");
    }
    refresh() {
      this.schedule("refresh");
    }
    schedule(reason) {
      if (!this.frame || !["mount", "refresh"].includes(this.reason))
        this.reason = reason;
      if (this.frame || !this.isConnected) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        const next = this.reason;
        this.reason = "idle";
        this.render(next);
      });
    }
    showEmpty(message = "Nothing to show yet") {
      this.note(message);
    }
    note(message, error = false) {
      if (!this.noteElement) return;
      this.noteElement.textContent = message;
      this.noteElement.classList.add("cs-on");
      this.noteElement.toggleAttribute("data-error", error);
      this.svgElement.style.visibility = "hidden";
      this.hideTip();
    }
    hideTip() {
      if (this.tip) this.tip.style.opacity = "0";
    }
    scale(scale, axis) {
      const transform = this.transform;
      const mode = this.mode();
      if (
        mode === "none" ||
        mode === (axis === "x" ? "y" : "x") ||
        (transform.k === 1 && transform.x === 0 && transform.y === 0)
      )
        return scale;
      if (typeof scale.invert === "function")
        return axis === "x"
          ? transform.rescaleX(scale)
          : transform.rescaleY(scale);
      return scale
        .copy()
        .range(
          scale
            .range()
            .map((value) =>
              axis === "x" ? transform.applyX(value) : transform.applyY(value),
            ),
        );
    }
    layer(name) {
      let node = this.layers.get(name);
      if (!node || node.ownerSVGElement !== this.svgElement) {
        node = document.createElementNS(NS, "g");
        node.setAttribute("data-layer", String(name));
        this.svgElement.append(node);
        this.layers.set(name, node);
      }
      return this.d3.select(node);
    }
    render(reason) {
      const width = this.clientWidth,
        height = this.clientHeight;
      if (!this.d3 || !this.drawFunction || width <= 0 || height <= 0) return;
      const svg = this.d3
        .select(this.svgElement)
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`);
      this.zoomBehavior
        ?.extent([
          [0, 0],
          [width, height],
        ])
        .translateExtent([
          [0, 0],
          [width, height],
        ]);
      this.svgElement.style.visibility = "";
      this.noteElement.classList.remove("cs-on");
      this.hideTip();
      try {
        this.drawFunction({
          d3: this.d3,
          svg,
          width,
          height,
          reason,
          view: {
            transform: this.transform,
            x: (scale) => this.scale(scale, "x"),
            y: (scale) => this.scale(scale, "y"),
          },
          layer: (name) => this.layer(name),
          t: (selection) =>
            reason === "refresh" &&
            !matchMedia("(prefers-reduced-motion: reduce)").matches
              ? selection.transition(transitionName).duration(250)
              : selection.interrupt(transitionName),
          tips: (selection, formatter) => this.bindTips(selection, formatter),
          esc: escapeText,
        });
        this.hasDrawn = true;
      } catch (error) {
        this.note(
          "This chart hit an error while rendering — details in the console.",
          true,
        );
        console.error("Chart rendering failed:", error);
      }
    }
    bindTips(selection, formatter) {
      const stage = this;
      function show(event, datum) {
        const content = formatter.call(this, datum, event);
        if (content == null || content === false) return stage.hideTip();
        stage.tip.replaceChildren();
        if (typeof content === "object" && "html" in content)
          stage.tip.append(tooltipFragment(String(content.html)));
        else stage.tip.textContent = String(content);
        const box = stage.getBoundingClientRect();
        const x = event.clientX - box.left,
          y = event.clientY - box.top;
        const { offsetWidth: w, offsetHeight: h } = stage.tip;
        stage.tip.style.left = `${Math.max(4, Math.min(box.width - w - 4, x + 12 + w > box.width - 4 ? x - w - 12 : x + 12))}px`;
        stage.tip.style.top = `${Math.max(4, Math.min(box.height - h - 4, y + 12 + h > box.height - 4 ? y - h - 12 : y + 12))}px`;
        stage.tip.style.opacity = "1";
      }
      selection
        .on("pointerenter.cstip pointermove.cstip", show)
        .on("pointerdown.cstip", function (event) {
          if (event.pointerType !== "touch") return;
          stage.tipPress = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            transform: stage.transform,
            mark: this,
          };
        })
        .on("pointerup.cstip", function (event, datum) {
          const press = stage.tipPress;
          stage.tipPress = null;
          if (
            event.pointerType !== "touch" ||
            !press ||
            press.id !== event.pointerId ||
            press.mark !== this
          )
            return;
          const transform = stage.transform;
          if (
            Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 8 &&
            transform.k === press.transform.k &&
            transform.x === press.transform.x &&
            transform.y === press.transform.y
          )
            show.call(this, event, datum);
        })
        .on("pointerleave.cstip", (event) => {
          if (event.pointerType !== "touch") this.hideTip();
        })
        .on("pointercancel.cstip", () => {
          this.tipPress = null;
          this.hideTip();
        });
    }
    reset() {
      if (!this.zoomBehavior || this.mode() === "none") return;
      const svg = this.d3.select(this.svgElement);
      const target = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? svg
        : svg.transition().duration(250);
      target.call(this.zoomBehavior.transform, this.d3.zoomIdentity);
    }
    serializedSVG() {
      const clone = this.svgElement.cloneNode(true);
      const originals = [
        this.svgElement,
        ...this.svgElement.querySelectorAll("*"),
      ];
      const copies = [clone, ...clone.querySelectorAll("*")];
      originals.forEach((original, i) => {
        const style = getComputedStyle(original);
        for (const property of exportStyles)
          copies[i].style.setProperty(
            property,
            style.getPropertyValue(property),
          );
      });
      clone.setAttribute("xmlns", NS);
      const background = document.createElementNS(NS, "rect");
      background.setAttribute("width", "100%");
      background.setAttribute("height", "100%");
      background.setAttribute(
        "fill",
        getComputedStyle(this).getPropertyValue("--chart-surface").trim() ||
          "#fff",
      );
      clone.prepend(background);
      return new XMLSerializer().serializeToString(clone);
    }
    async download(format) {
      if (!this.hasDrawn || this.noteElement.classList.contains("cs-on"))
        return;
      const name = (this.getAttribute("name") || "chart").replace(
        /[^\w.-]+/g,
        "-",
      );
      try {
        const svg = new Blob([this.serializedSVG()], { type: "image/svg+xml" });
        if (format === "svg") return saveBlob(svg, `${name}.svg`);
        const url = URL.createObjectURL(svg);
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = this.clientWidth * 2;
          canvas.height = this.clientHeight * 2;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const png = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/png"),
          );
          if (!png) throw new Error("PNG encoding failed");
          saveBlob(png, `${name}.png`);
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.error("Chart export failed:", error);
      }
    }
  }
  customElements.define("chart-stage", ChartStage);
})();
