# HTML presentations

Create editable HTML slides using `deck.js`: each slide is a direct child `<section>` of `<deck-stage width="1920" height="1080">`. Use one story and one focal point per slide. Keep authored artwork fixed-size; the stage scales it and keeps navigation outside the artwork.

The stage supports keyboard navigation, thumbnails, slide order, deletion, restoration, hash navigation, fullscreen, print, and optional speaker notes. Add `<aside data-notes>` only when notes are requested. Keep source order meaningful and titles readable. A removed slide remains restorable in the local presentation session; persistent edits belong in the source.

Build animations use `data-anim="fade-in|fly-in|zoom-in|appear|path"` and browser equivalents of wipe, float, split, bounce, wheel, blinds, dissolve, shape reveals, spin, grow, shrink, pulse, and teeter. Complex reveal effects are approximations. Use `data-trigger="click|with|after"`. Use `data-delay`, `data-duration`, and `data-path` (SVG path data). The `data-anim-*` timing, direction, order, repeat, and auto-reverse aliases are accepted. With/after builds follow the previous build timing. Base styles show the final layout. Reduced motion and print show completed content. For more involved motion, use the timeline recipe.

Arrow keys and Space advance builds before changing slide. Text inputs keep their normal keyboard behavior. Verify first, middle, and final slides and print all slides. PDF is supported through [exports](exports.md). PowerPoint and Google Slides conversion are excluded.
