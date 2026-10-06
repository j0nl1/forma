import {
  parseEffect,
  buildSteps,
  maskVariant,
  effectFrames,
  effectOptions,
} from "./deck-effects.js";
import { installMaskRules } from "./deck-masks.js";
const markHidden = (element, hidden) => {
  element.toggleAttribute("data-deck-anim-hidden", hidden);
  element.toggleAttribute("data-build-hidden", hidden);
};
export class DeckBuilds {
  constructor(deck) {
    this.deck = deck;
    this.masks = installMaskRules();
    this.state = null;
  }
  get enabled() {
    return (
      !this.deck.hasAttribute("noscale") &&
      !new URLSearchParams(location.search).has("_snthumb") &&
      !new URLSearchParams(location.search).has("deck-thumbnail") &&
      !this.deck.printing
    );
  }
  get remaining() {
    return this.state ? this.state.steps.length - 1 - this.state.played : 0;
  }
  inspect(slide) {
    return [...slide.querySelectorAll("[data-anim]")].flatMap(
      (element, documentIndex) => {
        const entry = parseEffect(element);
        if (!entry) return [];
        const canvas = this.deck.shadowRoot
            .querySelector(".art")
            .getBoundingClientRect(),
          rect = element.getBoundingClientRect();
        const scale = canvas.width / this.deck.width || 1;
        entry.geometry = {
          width: this.deck.width,
          height: this.deck.height,
          fly: (direction) => {
            const distance = {
              left: [-Math.max(0, rect.right - canvas.left), 0],
              right: [Math.max(0, canvas.right - rect.left), 0],
              top: [0, -Math.max(0, rect.bottom - canvas.top)],
              bottom: [0, Math.max(0, canvas.bottom - rect.top)],
            }[direction];
            return distance.map((n) => n / scale);
          },
        };
        const opacity = Number.parseFloat(getComputedStyle(element).opacity);
        return [
          {
            ...entry,
            element,
            documentIndex,
            opacity: Number.isFinite(opacity) ? opacity : 1,
          },
        ];
      },
    );
  }
  arrive(slide, complete = false) {
    if (!this.enabled) {
      this.clear();
      return;
    }
    if (this.state?.slide === slide && !complete) return;
    this.clear();
    const entries = this.inspect(slide);
    if (!entries.length) return;
    const steps = buildSteps(entries);
    const state = {
      slide,
      entries,
      steps,
      played: complete ? steps.length - 1 : 0,
      animations: [],
    };
    this.state = state;
    for (const entry of entries)
      if (entry.kind === "entrance") markHidden(entry.element, true);
    if (complete) for (const step of steps) this.play(step, true);
    else this.play(steps[0]);
  }
  play(step, instant = false) {
    const state = this.state;
    instant ||= matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const { entry, start } of step.items) {
      if (entry.kind === "entrance") markHidden(entry.element, false);
      const variant = this.masks && maskVariant(entry);
      if (variant) entry.element.setAttribute("data-deck-anim-mask", variant);
      const frames = effectFrames(entry, entry.geometry, this.masks),
        options = effectOptions(entry, start, instant);
      const animation = entry.element.animate(frames, options);
      state.animations.push({ entry, animation, start });
      if (instant) animation.finish();
      if (entry.kind === "exit") {
        if (instant) markHidden(entry.element, true);
        animation.finished.then(
          () => {
            if (this.state === state) markHidden(entry.element, true);
          },
          () => {},
        );
      }
    }
  }
  next() {
    if (!this.enabled || !this.remaining) return false;
    const state = this.state;
    state.played++;
    this.play(state.steps[state.played]);
    this.deck.dispatchEvent(
      new CustomEvent("deckstep", {
        bubbles: true,
        composed: true,
        detail: {
          index: this.deck.index,
          step: state.played,
          totalSteps: state.steps.length - 1,
        },
      }),
    );
    return true;
  }
  clear() {
    const state = this.state;
    this.state = null;
    if (!state) return;
    for (const { animation } of state.animations) animation.cancel();
    for (const entry of state.entries) {
      markHidden(entry.element, false);
      entry.element.removeAttribute("data-deck-anim-mask");
    }
  }
}
