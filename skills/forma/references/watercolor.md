# Watercolor painting and animation

Use `watercolor-kit.js` for standalone canvas paintings and `watercolor-components.jsx` with the continuous animation engine. Both are editable source. The small `watercolor.js` starter remains for existing artifacts; it is not the complete painting API. The bird demonstration in `examples/watercolor.html` compares independent stroke layers with a flattened frame and downloads a real PNG.

## Paint contract

Load the classic script locally and call `window.CodexWatercolorKit.paper(pixelWidth, pixelHeight, options)`. `window.WatercolorKit` is also available when another kit has not already claimed it. Direct paper dimensions are raster pixels; `scale` multiplies logical painting coordinates. For a 360 × 480 painting at scale 2, create a 720 × 960 paper. The higher-level frame/layer/React APIs accept logical dimensions and apply scale themselves. `seed` fixes the paper and random sequence. Supply a stable painting function, and derive randomness from `paper.rng()` or explicit operation seeds rather than `Math.random()`.

```js
function painting(p) {
  p.wash(["blob", 180, 200, 100], "aqua", { load: 0.55, blooms: [[145, 180, 15]] });
  p.glaze(["ellipse", 180, 200, 45, 65], "quin_rose", { load: 0.3 });
  p.reserve(["ellipse", 155, 175, 12, 8], { feather: 1 });
  p.ink([[120, 285], [240, 285]], { color: "ink", width: 2 });
  p.caption("A quiet afternoon", { x: 180, y: 340, size: 15 });
}
const sheet = CodexWatercolorKit.paper(720, 960, { seed: 7, scale: 2 });
painting(sheet);
document.querySelector("#art").append(sheet.render());
sheet.seek(0.5); // Replay the weighted operation timeline from pristine paper.
```

All operations are chainable and recorded in `paper.ops`:

| Operation | Inputs and behavior |
| --- | --- |
| `wash(shape, pigment, options)` | Soft/deckled boundaries, pigment load, edge pooling, granulation, mottle, blooms and seed |
| `gradedWash(shape, stops, options)` | Stops `[position, pigment]`, axis, gamma and density profile `[position, value]`; also accepts `(shape, firstPigment, secondPigment, options)` with front/soft/noisy transition |
| `glaze(shape, pigment, options)` | Thin soft-edged wash; multiplies underlying pigment |
| `reserve(shape, options)` | Restores pristine seeded paper, including feathered boundaries; does not substitute a flat white fill |
| `ink(points, options)` | One path or an array of paths, width/color/load/wobble/lost/taper; partial progress reveals path length |
| `hatch(shape, options)` | Clipped ink hatching with angle, spacing, width, wobble and gaps |
| `splatter(x, y, radius, pigment, options)` | Seeded droplets with `n`, size range, load and paint texture options |
| `dryStroke(points, pigment, options)` | Paper-tooth-sensitive broken stroke with width, load and toothBias |
| `caption(text, options)` | Typography with position, color, size, font, italic, letter spacing and load |

Shapes: `["ellipse", cx, cy, rx, ry, rotationDegrees?]`, `["rect", x, y, width, height]`, `["poly", points]`, `["path", contextCallback]`, `["union", shapes]`, and `["blob", cx, cy, rx, ry, options?]`. Blob options include seed, wobble and `rot` in degrees. Pigments accept named colors, hex colors or three normalized RGB transmittance values. Overlaid paint uses multiplicative transmission. Unknown pigments or malformed shapes fail explicitly.

`resetSheet()` restores the paper; `renderUpTo(operationIndex, partialProgress)` paints completed predecessors and a partial operation. `timeline()` returns weighted boundaries. `seek(progress)` recreates the same image when moving backward or forward. `layer(index, progress)` returns a cropped transparent canvas and normalized box; multiply paint layers in order, using normal blending for reserves.

## Frames and layers

`CodexWatercolorKit.frame(painting, {width, height, seed, scale, at, type, quality})` synchronously returns an image data URL. `bake(painting, {steps, ...options}, onFrame)` asynchronously returns `steps + 1` frames including both endpoints. Its callback receives `(index, steps, image)`. JPEG is the default baked format; use PNG for lossless comparisons or transparency. Cache keys include painting function identity and configuration; changing a closure requires a new function identity.

`layers(painting, options)` returns `{width, height, count, paper, kind(index), box(index), span(index), src(index, progress), warm()}`. Boxes are normalized to logical paper size. Spans are normalized weighted operation intervals. `src(index, 0)` is null; partial sources are quantized and bounded in memory. `quality: 1` requests PNG layers for lossless composition. `warm()` prepares completed layers in the background; it is optional for correctness.

## React and live replay

Import `WatercolorPainting`, `WatercolorReveal`, `WatercolorSheet`, `WatercolorStroke` and `useWatercolorLayers` from `animations.jsx`. Inside `CompositionStage`, `WatercolorPainting` uses authored `T`, `from` and `to`, with a full layer per completed stroke and one partial stroke. `WatercolorReveal` uses synchronous flattened frames; optional pre-baked `frames` avoid generation during playback. Both accept a painting function, dimensions, scale, seed, quality, style and alt text. Stretching the playback section preserves the entire authored paint sequence.

For individual choreography, call `useWatercolorLayers(painting, options)`, place `WatercolorSheet layers={layers}` in the composition, and add `WatercolorStroke index={i} at={progress}`. A stroke can inherit its layers from the sheet. Calculate every stroke's progress from the composition clock; do not start independent timers.

For standalone live painting, create `<watercolor-kit width="360" height="480" duration="6" controls autoplay="false"></watercolor-kit>` and set its `.painting` property to the function. `.play(fromProgress)`, `.pause()`, `.seek(progress)` and `.progress` support replay and scrubbing. Completion emits `watercolor-done`; the optional **Paint again** button appears on completion. Reduced motion starts at the completed frame. Removing the element stops its clock.

Tests cover determinism, pigment multiplication, paper restoration, all operations/shapes, baking, layer reconstruction, replay, retiming and actual image download. Paper and brush texture are generated locally. Inspect their appearance and performance at the intended output size.
