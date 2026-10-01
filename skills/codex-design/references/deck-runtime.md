# HTML deck runtime contract

The independent HTML stage preserves slide content in the DOM, plays declarative builds, scales authored geometry, exposes local navigation events, and prints the finished base layout. PowerPoint export is excluded; HTML build effects remain required.

## Files and readiness

Copy `deck.js` and its `deck-*.js` companions beside it, or bundle `deck.js` to one classic script with `scripts/build.mjs`. The showcase build does this automatically. The loader supports a classic script tag and exposes `window.CodexDeckReady`; await it before calling the component API. `deck.ready` becomes true after initialization and font readiness (capped at two seconds). Browser verification and export helpers wait for supported runtime-loader promises before capturing the page.

```html
<deck-stage width="1920" height="1080">
  <section data-label="Opening">
    <h1>A finished authored layout</h1>
    <p data-anim="fade-in">This lead-in plays on arrival.</p>
    <p data-anim="fly-in" data-anim-trigger="click" data-anim-dir="left"
       data-anim-duration="700">This waits for one advance.</p>
  </section>
</deck-stage>
<script src="deck.js"></script>
```

Direct element children are slides, except `script`, `style`, and `template`. `section` is recommended. Nonactive slides are hidden without unmounting, preserving forms and component state. Width/height default to 1920 × 1080. Authored styles are the finished layout. Headings get zero-specificity balanced wrapping; paragraphs and lists get pretty wrapping, with authored overrides taking precedence.

## Build attributes

| Attribute | Meaning and default |
| --- | --- |
| `data-anim` | One of the 44 supported effects below; unknown effects remain static |
| `data-anim-trigger` | `after` (default), `with`, or `click` |
| `data-anim-duration` | Milliseconds, clamped to 1–60000; effect default below |
| `data-anim-delay` | Milliseconds, clamped to 0–60000; default 0 |
| `data-anim-order` | Numeric order; document order breaks ties |
| `data-anim-repeat` | Integer 1–100, default 1; instantaneous effects always run once |
| `data-anim-auto-reverse` | Empty, `true`, or `1` enables a return leg on spin/grow/shrink/path only |
| `data-anim-dir` | Edge, seam/bar axis, inward/outward shape direction, or diagonal corner |
| `data-anim-rotate` | Degrees, −3600–3600; spin defaults to 360, teeter to 5 |
| `data-anim-scale` | 0.1–5; grow defaults to 1.5, shrink to 0.67, pulse to 1.05 |
| `data-anim-path` | Absolute SVG-style optional M followed by L/C segments; coordinates become offsets from the first point |

The earlier native aliases remain supported: `data-trigger`, `data-order`, `data-direction`, `data-path`, `data-repeat`, `data-rotate`, `data-scale`, and `data-auto-reverse`. The earlier `data-duration` and `data-delay` use **seconds**; canonical `data-anim-duration` and `data-anim-delay` use **milliseconds** and take precedence. Use canonical attributes in new artifacts.

| Effect | Default duration | Direction/parameters |
| --- | --- | --- |
| `appear`, `disappear` | 1 ms, fixed | Instant visibility change |
| `fade-in/out` | 500 ms | Preserve authored opacity |
| `fly-in/out` | 500 ms | left/right/top/bottom; default bottom; travel just beyond the canvas edge |
| `float-in/out` | 1000 ms | top/bottom; default bottom; drift 10% of design height with fade |
| `wipe-in/out` | 500 ms | left/right/top/bottom; default bottom |
| `split-in/out` | 500 ms | horizontal/vertical; default vertical; opposing edge bands |
| `random-bars-in/out` | 500 ms | horizontal/vertical; default horizontal; staggered stripe reveals |
| `blinds-in/out` | 500 ms | horizontal/vertical; default horizontal; growing slats |
| `checkerboard-in/out` | 500 ms | horizontal/vertical; default horizontal; offset alternating lanes |
| `dissolve-in/out` | 500 ms | Two offset growing dot lattices |
| `box-in/out`, `circle-in/out`, `diamond-in/out`, `plus-in/out` | 500 ms | in/out; entrances default in, exits out; geometry follows the selected direction |
| `strips-in/out` | 500 ms | down-right/down-left/up-right/up-left; default down-right |
| `wedge-in/out` | 500 ms | Symmetric sweep from twelve o'clock |
| `wheel-in/out` | 2000 ms | Clockwise circular sweep |
| `bounce-in/out` | 2000 ms | Design-relative damped/growing hops; segment timing and a late exit fade |
| `zoom-in/out` | 500 ms | Scale between 0.1 and 1 with fade |
| `spin`, `grow`, `shrink` | 2000 ms | Rotate or scale, retaining the final state |
| `pulse` | 500 ms | Scale peak at halfway; half-opacity across the 20–80% interval |
| `teeter` | 1000 ms | Alternating tilts with an initial hold, then settle |
| `path` | 2000 ms | L/C offsets, cubics sampled 16 times, at most 32 points |

Zero-degree spin/teeter, scale-1 grow/shrink/pulse, and unusable paths remain static and do not consume a build step. Mask effects use a registered numeric CSS property and stylesheet gradients, with a fade fallback when registration is unavailable. Box/diamond outward clip paths still work without property registration. This reproduces the reference browser's reveal geometry; it is not a claim about native PowerPoint rendering.

## Step and navigation rules

Before the first click-triggered effect, builds form an automatic lead-in. Every `click` opens another group. `with` starts at the previous element's start plus its own delay. `after` starts after the **longest scheduled end in the group**, plus its own delay. Repeats count their complete duration; automatic reversal doubles each repetition's time.

Forward arrival starts the lead-in and hides pending entrances. Exits and emphasis/path elements begin in their base state. Right/Down, Space, PageDown and touch-right play pending click groups before advancing. Left/Up, PageUp, direct number/Home/End/reset/rail/API jumps bypass the current slide's groups. Backward arrival restores every group instantly: entrances visible, exits hidden, emphasis/path at their final state. Same-slide navigation does not replay active builds. Leaving cancels only runtime-owned animation objects and removes runtime hiding/mask attributes; authored transform shorthand and unrelated animations remain intact.

Reduced motion finishes each played group instantly and retains click gating. `noscale`, `?_snthumb=` and `?deck-thumbnail=` disable the build engine and show base content. During print, runtime animations are cancelled and all unskipped slides show their authored base layout; returning restores the current slide fully built. Media-query changes and browser print events both use this contract.

## Local APIs, notes and presentation

`deck.index`, `.length`, `.designWidth`, `.designHeight`, and `.stepsRemaining` expose current state. `goTo(index)`, `next()`, and `prev()` navigate. Navigation emits a bubbling, composed `slidechange` with index, previousIndex, total, slide, previousSlide and reason. Each consumed click group emits `deckstep` with index, step and totalSteps. Local `codex-deck-go-to` and `codex-deck-presenting` events replace host transport; the latter accepts `{presenting:true|false}` independently of native fullscreen.

A `data-deck-skip` slide remains reachable by direct navigation but is skipped by previous/next and print. Its position shows a dash; remaining slides are numbered contiguously. Notes prefer per-slide `data-speaker-notes`, then an authored `aside[data-notes]`, then the corresponding string in `script#speaker-notes[type="application/json"]`. The local notes panel displays real supplied content.

`F` and Present toggle native fullscreen; fullscreen changes hide the rail and refit the slide. Presentation chrome appears on pointer movement and remains available on hover/focus. Typing, modified shortcuts and claimed keyboard events keep their normal behavior. On touch devices, stage-half taps navigate while links, controls and open-shadow interactive content retain their taps. `no-rail` suppresses the rail; narrow layouts also hide it.

## Remaining stage work

The complete deck family remains under port review. The current label rail retains existing reorder/delete/restore behavior but is not the full source thumbnail editor. Required work includes lazy styled preview clones, resizable persisted rail width, range/toggle selection, rail-specific keyboard focus, context menus, skip/move/duplicate/bulk-delete actions, confirmation and undo, stale/streaming edit guards, and actual project source persistence. Outside-presentation idle chrome, source label/validation integration, richer host-independent notes/presenter workflows, multi-stage behavior and broader print/font checks also remain pending. See the [functional inventory](porting-status.md); do not describe these missing actions as completed.

Tests now cover all 44 effect models, browser keyframes, all mask-family pixel changes, click grouping, complete repeat/reverse timing, held states, authored transforms, leaving/reconnecting, reduced-motion/fallback behavior, notes, skipped slides, real native fullscreen, capture and actual two-page PDF output. Reference visual comparisons and hardware/browser coverage still require further evidence. The effect gallery provides a local review surface for every family and representative direction/reversal variants.
