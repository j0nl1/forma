# Known limitations

## Motion and audio

- Nested-video capture waits for decoding, requests paused-video surface resubmission after visibility paint, and cancels callback registrations without waiting for a new callback. Regression checks inspect actual encoded first-visible and held/quantized frames. Inspect scene boundaries when delivering new media combinations; browser/application coverage remains environment-specific.
- MP4/WebM exports mix marked local media. Arbitrary live Web Audio and unmarked playback are not recorded; GIF has no audio.
- Sound-effect generation requires an explicitly configured provider. Local fixture checks verify protocol handling, not live provider quality. Narration uses an available text-to-speech engine or supplied recording; there is no bundled speech engine.
- Keep assets local for portable output. Font embedding supports configured read-only provider origins, but standalone HTML still requires localized document assets.

## Editing and handoff

- Canvas, deck, timing, text, image and typed-tweak project saves require their documented preview-server options. Static/public previews retain browser or session state and do not write project files.
- Deck source writes support literal HTML slides. Renderer-generated slide source and expanded presenter workflows are not supported by that service.
- Review and suggestion controls produce clipboard drafts. Automatic insertion into the Codex composer is not available.
- Transfers to Figma, Canva or Google Slides require an available, authorized connector and verification of its actual result. A local handoff package does not perform a transfer.

## Imports and output

- Editable PowerPoint exports retain native text/shapes over eligible isolated CSS paint layers, translate supported builds into native timing, and embed local video/audio. Composed uniform positive 2D scaling/translation/rotation and safely inset rounded foreground retain editable objects. Scalar builds support authored pivots and base transforms; eligible nested spin/grow/shrink/teeter/path builds use bounded sampled composition. Inseparable CSS, nested masks/group opacity, repeated composed builds and clipped motion can still require static fallback; inspect explicit warnings. Explicit static TTF/OTF snapshots can embed used font families and variants; unembedded text and applications that ignore embedded fonts still require those fonts locally. LibreOffice needs version 25.8 or newer with EOT support to import PPTX embedded fonts. Native effect rendering and media codecs can vary. Source trims, speed and volume/mute use bounded local playback copies when needed. Native loop and activation are encoded, but the tested LibreOffice 25.8 player plays once and starts on slide entry; Microsoft PowerPoint playback remains unverified. CSS clipping/object fitting can still differ in the native player. Screenshot mode preserves finished artwork as one image per slide. See the [PowerPoint guide](powerpoint.md).
- Figma import reports unsupported and approximate paints, masks, typography, variable wiring and instance properties. Inspect its warnings and compare a real design export when exact fidelity matters.
- Design-system checks are advisory source analysis, not complete type checking or brand certification. External/ambient types, package export maps and unsupported legacy formats can require manual conversion.
- HTML email requires testing in the actual target clients. Browser preview does not establish Outlook, Gmail or Apple Mail compatibility.
- Leaflet street maps require a configured tile provider and attribution. Tests use local synthetic tiles; verify live delivery with the actual provider.
- Browser checks primarily use Chromium. Physical gestures, Safari printing, complex fonts/color profiles and additional material/media combinations need checks on the intended environment.

Preserve functioning controls and saved state when refining a deliverable. Report limitations that materially affect the user's requested output.
