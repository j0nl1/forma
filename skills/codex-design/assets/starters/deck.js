/* <deck-stage width="1920" height="1080"><section>...</section>...</deck-stage>.
   Optional <aside data-notes>, data-anim, data-trigger, data-delay, data-duration,
   and data-path attributes. The reference's data-anim-* aliases are also accepted. Browser edits are session-only. */
(() => {
  class Deck extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.index = 0;
      this.step = 0;
      this.removed = [];
      this.generation = 0;
      this.slides = [...this.children].filter((n) => n.tagName === "SECTION");
      this.width = Number(this.getAttribute("width")) || 1920;
      this.height = Number(this.getAttribute("height")) || 1080;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML =
        '<style>:host{display:block;height:100vh;background:#161c25;color:white;font:14px system-ui}.layout{display:flex;height:calc(100% - 58px)}.rail{width:180px;flex-shrink:0;overflow:auto;padding:10px;box-sizing:border-box}.rail button{display:block;width:100%;text-align:left;margin:6px 0}.viewport{flex:1;min-width:0;display:grid;place-items:center;overflow:hidden}.art{position:relative;transform-origin:center}slot{display:block}::slotted(section){box-sizing:border-box;width:100%;height:100%;overflow:hidden;position:absolute;inset:0}::slotted([data-slide-hidden]){display:none}.toolbar{height:58px;display:flex;align-items:center;gap:9px;padding:0 16px;box-sizing:border-box;flex-wrap:wrap}button{font:inherit;border:1px solid #687482;border-radius:6px;background:#252e3a;color:white;padding:7px 10px;cursor:pointer}button[aria-current="true"]{border-color:#8bacff;background:#344766}.notes{position:absolute;right:16px;bottom:70px;max-width:420px;max-height:30vh;overflow:auto;background:#fff;color:#1c2836;padding:18px;border-radius:8px;white-space:pre-wrap}[hidden]{display:none!important}@media(max-width:700px){.rail{display:none}}@media print{:host{display:block;height:auto;background:white}.layout{display:block;height:auto}.rail,.toolbar,.notes{display:none!important}.viewport{display:block;overflow:visible}.art{transform:none!important;width:auto!important;height:auto!important}::slotted(section){display:block!important;position:relative!important;break-after:page;width:var(--deck-w)!important;height:var(--deck-h)!important}}</style><div class="layout"><nav class="rail" aria-label="Slides"></nav><div class="viewport"><div class="art"><slot></slot></div></div></div><div class="toolbar"><button data-prev aria-label="Previous slide">←</button><output></output><button data-next aria-label="Next slide or build">→</button><button data-full>Present</button><button data-notes>Notes</button><button data-remove>Remove slide</button><button data-restore>Restore slides</button><button data-print>Print / PDF</button></div><aside class="notes" hidden></aside>';
      const art = root.querySelector(".art");
      art.style.width = this.width + "px";
      art.style.height = this.height + "px";
      this.style.setProperty("--deck-w", this.width + "px");
      this.style.setProperty("--deck-h", this.height + "px");
      const style = document.createElement("style");
      style.textContent = `deck-stage>section [data-notes]{display:none}deck-stage>section [data-build-hidden]{visibility:hidden}@media print{@page{size:${this.width}px ${this.height}px;margin:0}html,body{margin:0}deck-stage>section [data-build-hidden]{visibility:visible!important}deck-stage>section [data-anim]{offset-path:none!important}}`;
      this.append(style);
      const resize = () => {
        const view = root.querySelector(".viewport");
        art.style.transform = `scale(${Math.min(view.clientWidth / this.width, view.clientHeight / this.height)})`;
      };
      this.observer = new ResizeObserver(resize);
      this.observer.observe(root.querySelector(".viewport"));
      root.querySelector("[data-prev]").onclick = () =>
        this.show(this.index - 1, true);
      root.querySelector("[data-next]").onclick = () => this.next();
      root.querySelector("[data-full]").onclick = async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await this.requestFullscreen();
      };
      root.querySelector("[data-print]").onclick = () => window.print();
      root.querySelector("[data-notes]").onclick = () => {
        const notes = root.querySelector(".notes");
        notes.hidden = !notes.hidden;
        this.updateNotes();
      };
      root.querySelector("[data-remove]").onclick = () => {
        if (this.slides.length <= 1) return;
        const slide = this.slides.splice(this.index, 1)[0];
        slide.remove();
        this.removed.push(slide);
        this.show(Math.min(this.index, this.slides.length - 1));
      };
      root.querySelector("[data-restore]").onclick = () => {
        for (const slide of this.removed) {
          this.append(slide);
          this.slides.push(slide);
        }
        this.removed = [];
        this.show(this.index);
      };
      this.keyHandler = (e) => {
        if (
          e.defaultPrevented ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          e
            .composedPath()
            .some((n) =>
              n.matches?.(
                'input,textarea,select,button,[contenteditable="true"]',
              ),
            )
        )
          return;
        if (["ArrowRight", " ", "PageDown"].includes(e.key)) {
          e.preventDefault();
          this.next();
        }
        if (["ArrowLeft", "PageUp"].includes(e.key)) {
          e.preventDefault();
          this.show(this.index - 1, true);
        }
        if (e.key === "Home") this.show(0);
        if (e.key === "End") this.show(this.slides.length - 1, true);
      };
      window.addEventListener("keydown", this.keyHandler);
      this.hashHandler = () => {
        const n = Number(location.hash.slice(1)) - 1;
        if (
          Number.isInteger(n) &&
          n >= 0 &&
          n < this.slides.length &&
          n !== this.index
        )
          this.show(n);
      };
      window.addEventListener("hashchange", this.hashHandler);
      const start = Number(location.hash.slice(1)) - 1;
      this.show(Number.isInteger(start) && start >= 0 ? start : 0);
    }
    disconnectedCallback() {
      this.observer?.disconnect();
      window.removeEventListener("keydown", this.keyHandler);
      window.removeEventListener("hashchange", this.hashHandler);
      this.generation++;
    }
    updateNotes() {
      this.shadowRoot.querySelector(".notes").textContent =
        this.slides[this.index]?.querySelector("[data-notes]")?.textContent ||
        "No speaker notes for this slide.";
    }
    show(index, complete = false) {
      if (!this.slides.length) return;
      this.generation++;
      this.index = Math.max(0, Math.min(this.slides.length - 1, index));
      this.slides.forEach((s, i) => {
        s.toggleAttribute("data-slide-hidden", i !== this.index);
        s.querySelectorAll("[data-anim]").forEach((e) => {
          e.getAnimations().forEach((a) => a.cancel());
          e.removeAttribute("data-build-hidden");
        });
      });
      this.builds = [
        ...this.slides[this.index].querySelectorAll("[data-anim]"),
      ].sort(
        (a, b) =>
          Number(a.dataset.animOrder || a.dataset.order || 0) -
          Number(b.dataset.animOrder || b.dataset.order || 0),
      );
      this.lastStart = performance.now();
      this.lastFinish = this.lastStart;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.step = complete || reduced ? this.builds.length : 0;
      if (this.step === 0) {
        this.builds.forEach((e) => e.setAttribute("data-build-hidden", ""));
        this.auto();
      }
      this.shadowRoot.querySelector("output").textContent =
        `${this.index + 1} / ${this.slides.length}`;
      history.replaceState(null, "", "#" + (this.index + 1));
      this.updateNotes();
      this.rail();
    }
    trigger(element) {
      return element.dataset.animTrigger || element.dataset.trigger || "after";
    }
    animate(element, start = performance.now()) {
      element.removeAttribute("data-build-hidden");
      const kind = element.dataset.anim;
      const name = kind.replace(/-(in|out)$/, "");
      const exit = kind.endsWith("-out") || kind === "disappear";
      const duration =
        Math.max(
          0,
          Number(
            element.dataset.animDuration || element.dataset.duration || 0.5,
          ),
        ) * 1000;
      const delay =
        Math.max(
          0,
          Number(element.dataset.animDelay || element.dataset.delay || 0),
        ) *
          1000 +
        Math.max(0, start - performance.now());
      const iterations = Math.min(
        100,
        Math.max(
          1,
          Number(element.dataset.animRepeat || element.dataset.repeat || 1),
        ),
      );
      const options = {
        duration,
        delay,
        iterations,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "backwards",
        direction:
          element.dataset.animAutoReverse === "true" ||
          element.dataset.autoReverse === "true"
            ? "alternate"
            : "normal",
      };
      this.lastStart = performance.now() + delay;
      this.lastFinish = this.lastStart + duration * iterations;
      const base = getComputedStyle(element).transform;
      const transform = (value) => (base === "none" ? "" : base + " ") + value;
      const direction =
        element.dataset.animDir || element.dataset.direction || "right";
      const shift =
        {
          left: "translateX(-70px)",
          right: "translateX(70px)",
          up: "translateY(-70px)",
          down: "translateY(70px)",
        }[direction] || "translateY(40px)";
      const hidden = { opacity: 0 },
        shown = { opacity: 1 };
      let frames = [hidden, shown];
      if (["fly", "float"].includes(name))
        frames = [
          {
            opacity: 0,
            transform: transform(name === "float" ? "translateY(32px)" : shift),
          },
          { opacity: 1, transform: base },
        ];
      if (name === "zoom")
        frames = [
          { opacity: 0, transform: transform("scale(.75)") },
          { opacity: 1, transform: base },
        ];
      if (name === "bounce")
        frames = [
          { opacity: 0, transform: transform("translateY(70px)") },
          { opacity: 1, transform: transform("translateY(-14px)") },
          { opacity: 1, transform: base },
        ];
      const clips = {
        wipe: {
          left: "inset(0 100% 0 0)",
          right: "inset(0 0 0 100%)",
          up: "inset(0 0 100% 0)",
          down: "inset(100% 0 0 0)",
        }[direction],
        split: "inset(0 50% 0 50%)",
        box: "inset(50%)",
        circle: "circle(0% at 50% 50%)",
        diamond: "polygon(50% 50%,50% 50%,50% 50%,50% 50%)",
        plus: "inset(50%)",
        wheel: "circle(0% at 50% 50%)",
        wedge: "polygon(50% 50%,50% 50%,50% 50%)",
        strips: "inset(100% 0 0 100%)",
        blinds: "inset(0 100% 0 0)",
        "random-bars": "inset(100% 0 0 0)",
        checkerboard: "inset(50%)",
        dissolve: "inset(0)",
      };
      if (clips[name])
        frames = [
          { opacity: 0, clipPath: clips[name] },
          {
            opacity: 1,
            clipPath:
              name === "circle" || name === "wheel"
                ? "circle(75% at 50% 50%)"
                : "inset(0)",
          },
        ];
      const emphasis = {
        spin: [{ transform: base }, { transform: transform("rotate(360deg)") }],
        grow: [{ transform: base }, { transform: transform("scale(1.2)") }],
        shrink: [{ transform: base }, { transform: transform("scale(.8)") }],
        pulse: [
          { transform: base },
          { transform: transform("scale(1.08)") },
          { transform: base },
        ],
        teeter: [
          { transform: base },
          { transform: transform("rotate(-4deg)") },
          { transform: transform("rotate(4deg)") },
          { transform: base },
        ],
      };
      if (emphasis[name]) frames = emphasis[name];
      if (exit) frames = frames.slice().reverse();
      if (kind === "appear" || kind === "disappear") options.duration = 0;
      const motionPath = element.dataset.animPath || element.dataset.path;
      if (kind === "path" && motionPath) {
        element.style.offsetPath = `path("${motionPath.replace(/"/g, "")}")`;
        frames = [{ offsetDistance: "0%" }, { offsetDistance: "100%" }];
        options.fill = "forwards";
      }
      const animation = element.animate(frames, options);
      const generation = this.generation;
      if (exit)
        animation.finished
          .then(() => {
            if (this.generation === generation)
              element.setAttribute("data-build-hidden", "");
          })
          .catch(() => {});
    }
    auto() {
      while (
        this.step < this.builds.length &&
        this.trigger(this.builds[this.step]) !== "click"
      ) {
        const element = this.builds[this.step++];
        this.animate(
          element,
          this.trigger(element) === "with" ? this.lastStart : this.lastFinish,
        );
      }
    }
    next() {
      if (this.step < this.builds.length) {
        this.animate(this.builds[this.step++]);
        this.auto();
      } else this.show(this.index + 1);
    }
    rail() {
      const rail = this.shadowRoot.querySelector(".rail");
      rail.replaceChildren();
      this.slides.forEach((slide, i) => {
        const b = document.createElement("button");
        b.textContent = `${i + 1}. ${slide.querySelector("h1,h2")?.textContent || "Slide"}`;
        b.setAttribute("aria-current", String(i === this.index));
        b.onclick = () => this.show(i);
        b.draggable = true;
        b.ondragstart = (e) => e.dataTransfer.setData("text/plain", String(i));
        b.ondragover = (e) => e.preventDefault();
        b.ondrop = (e) => {
          e.preventDefault();
          const from = Number(e.dataTransfer.getData("text/plain"));
          if (!Number.isInteger(from) || from < 0 || from >= this.slides.length)
            return;
          const moved = this.slides.splice(from, 1)[0];
          this.slides.splice(i, 0, moved);
          for (const s of this.slides) this.append(s);
          this.show(i, true);
        };
        rail.append(b);
      });
    }
  }
  if (!customElements.get("deck-stage"))
    customElements.define("deck-stage", Deck);
})();
