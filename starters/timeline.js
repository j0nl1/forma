/* <motion-stage><div data-art>...</div></motion-stage>; then:
   stage.configure({scenes:[{id:'intro',title:'Opening',duration:3}],width:1280,
   height:720,render:(authoredTime,cues)=>{...}}). Only one composition per page.
   window.codexTimeline exposes deterministic seek(), duration, width, height. */
(() => {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const easing = {
    linear: (x) => x,
    smooth: (x) => x * x * (3 - 2 * x),
    out: (x) => 1 - (1 - x) ** 3,
    inOut: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  };
  window.CodexMotion = {
    easing,
    interpolate: (t, start, end, from, to, curve = "smooth") => {
      const p = clamp((t - start) / (end - start || 1), 0, 1);
      return from + (to - from) * (easing[curve] || easing.smooth)(p);
    },
  };
  class Motion extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.time = 0;
      this.playing = false;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML =
        '<style>:host{display:block;background:#17202d;color:white;height:90vh;min-height:360px;font:14px system-ui}.viewport{height:calc(100% - 114px);display:grid;place-items:center;overflow:hidden}.art{transform-origin:center;position:relative}.toolbar{height:54px;display:flex;align-items:center;gap:12px;padding:0 16px}input[type="range"]{flex:1;min-width:80px}button,input{font:inherit}button{background:#2b3747;border:1px solid #78899b;color:white;padding:7px 12px;border-radius:6px;cursor:pointer}.scenes{display:flex;gap:14px;overflow:auto;padding:6px 16px;height:48px}label{display:flex;gap:7px;align-items:center;white-space:nowrap}input[type="number"]{width:64px}.art slot{display:block}:host-context([data-capture]){height:100vh;min-height:0}:host-context([data-capture]) .viewport{height:100%}:host-context([data-capture]) .toolbar,:host-context([data-capture]) .scenes{display:none}</style><div class="viewport"><div class="art"><slot></slot></div></div><div class="toolbar"><button data-play>Play</button><input aria-label="Timeline position" type="range" min="0" step="0.01" value="0"><output>0.00 s</output><button data-reset>Reset</button><button data-save>Save timing</button></div><div class="scenes"></div>';
      root.querySelector("[data-play]").onclick = () =>
        this.playing ? this.pause() : this.play();
      root.querySelector("[data-reset]").onclick = () => {
        this.pause();
        this.seek(0);
      };
      root.querySelector("input[type=range]").oninput = (e) => {
        this.pause();
        this.seek(Number(e.target.value));
      };
      root.querySelector("[data-save]").onclick = () => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(this.scenes, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "scene-timing.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(root.querySelector(".viewport"));
    }
    disconnectedCallback() {
      this.pause();
      this.observer?.disconnect();
      if (window.codexTimeline?.stage === this) delete window.codexTimeline;
    }
    configure({ scenes, width = 1280, height = 720, render }) {
      if (
        typeof render !== "function" ||
        !Array.isArray(scenes) ||
        !scenes.length
      )
        throw new Error("A render function and scenes are required");
      if (window.codexTimeline && window.codexTimeline.stage !== this)
        throw new Error("Only one timeline per page is supported");
      const ids = new Set();
      for (const s of scenes) {
        if (
          !s.id ||
          ids.has(s.id) ||
          !Number.isFinite(s.duration) ||
          s.duration <= 0
        )
          throw new Error("Scenes need unique ids and positive duration");
        ids.add(s.id);
      }
      this.scenes = scenes.map((s) => ({ ...s, speed: s.speed || 1 }));
      this.width = width;
      this.height = height;
      this.render = render;
      this.recompute();
      const art = this.shadowRoot.querySelector(".art");
      art.style.width = width + "px";
      art.style.height = height + "px";
      const artwork = this.querySelector("[data-art]");
      if (artwork) {
        artwork.style.width = width + "px";
        artwork.style.height = height + "px";
      }
      const self = this;
      window.codexTimeline = {
        stage: this,
        get duration() {
          return self.duration;
        },
        get width() {
          return self.width;
        },
        get height() {
          return self.height;
        },
        seek(t) {
          self.pause();
          self.seek(t);
        },
      };
      this.editor();
      this.resize();
      this.seek(
        matchMedia("(prefers-reduced-motion: reduce)").matches
          ? this.duration
          : 0,
      );
    }
    recompute() {
      this.cues = {};
      this.mapping = [];
      let authored = 0,
        playback = 0;
      for (const s of this.scenes) {
        const length = s.playback ?? s.duration / s.speed;
        if (!Number.isFinite(length) || length <= 0)
          throw new Error("Invalid scene timing");
        this.cues[s.id] = authored;
        this.mapping.push({ authored, playback, length, duration: s.duration });
        authored += s.duration;
        playback += length;
      }
      if (playback > 300) throw new Error("Composition exceeds 300 seconds");
      this.duration = playback;
      this.shadowRoot.querySelector("input[type=range]").max = playback;
    }
    resize() {
      if (!this.width) return;
      const view = this.shadowRoot.querySelector(".viewport");
      this.shadowRoot.querySelector(".art").style.transform =
        `scale(${Math.min(view.clientWidth / this.width, view.clientHeight / this.height)})`;
    }
    seek(t) {
      if (!this.render) return;
      this.time = clamp(Number(t) || 0, 0, this.duration);
      const m =
        this.mapping.find((s) => this.time < s.playback + s.length) ||
        this.mapping.at(-1);
      const authored =
        m.authored +
        clamp((this.time - m.playback) / m.length, 0, 1) * m.duration;
      this.render(authored, this.cues);
      this.shadowRoot.querySelector("input[type=range]").value = this.time;
      this.shadowRoot.querySelector("output").textContent =
        this.time.toFixed(2) + " s";
      this.setAttribute("data-screen-label", `Time ${this.time.toFixed(2)} s`);
      this.dispatchEvent(
        new CustomEvent("timeline-seek", {
          detail: { time: this.time, authored, cues: this.cues },
        }),
      );
    }
    play() {
      if (!this.render) return;
      if (this.time >= this.duration) this.seek(0);
      this.playing = true;
      this.shadowRoot.querySelector("[data-play]").textContent = "Pause";
      let last = performance.now();
      const frame = (now) => {
        if (!this.playing) return;
        this.seek(this.time + (now - last) / 1000);
        last = now;
        if (this.time >= this.duration) this.pause();
        else this.frame = requestAnimationFrame(frame);
      };
      this.frame = requestAnimationFrame(frame);
    }
    pause() {
      this.playing = false;
      cancelAnimationFrame(this.frame);
      this.shadowRoot
        ?.querySelector("[data-play]")
        ?.replaceChildren(document.createTextNode("Play"));
    }
    editor() {
      const panel = this.shadowRoot.querySelector(".scenes");
      panel.replaceChildren();
      for (const s of this.scenes) {
        const label = document.createElement("label");
        label.append(document.createTextNode((s.title || s.id) + " seconds"));
        const input = document.createElement("input");
        input.type = "number";
        input.min = ".1";
        input.max = "300";
        input.step = ".1";
        input.value = s.playback ?? s.duration / s.speed;
        input.onchange = () => {
          const before = s.playback;
          this.pause();
          s.playback = Number(input.value);
          try {
            this.recompute();
            this.seek(Math.min(this.time, this.duration));
          } catch (e) {
            s.playback = before;
            this.recompute();
            input.value = s.playback ?? s.duration / s.speed;
            input.setCustomValidity(e.message);
            input.reportValidity();
          }
        };
        input.oninput = () => input.setCustomValidity("");
        label.append(input);
        panel.append(label);
      }
    }
  }
  if (!customElements.get("motion-stage"))
    customElements.define("motion-stage", Motion);
})();
