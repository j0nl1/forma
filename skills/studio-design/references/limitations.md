# Known limitations

## Harness capabilities

- Native discovery paths and invocation syntax depend on the harness. The instruction format, installer destinations and local helpers are validated independently; authenticated end-to-end sessions in every third-party harness are not verified. Load the skill by absolute path when native discovery is unavailable.
- Full execution requires local filesystem/process access, Node.js and the documented dependencies. A text-only or restricted environment cannot run unavailable tools. Codex UI metadata and native preview/input tools are optional; standard fallbacks are described in the [harness workflow](harness.md).
- Image generation, browser control and external connectors depend on the actual session. Existing local browser globals/events with Codex names remain compatibility identifiers and impose no Codex runtime requirement.

## Motion and audio

- Nested-video capture waits for decoding, requests paused-video surface resubmission after visibility paint, and cancels callback registrations without waiting for a new callback. Regression checks inspect actual encoded first-visible and held/quantized frames. Inspect scene boundaries when delivering new media combinations; browser/application coverage remains environment-specific.
- MP4/WebM exports mix marked local media. Arbitrary live Web Audio and unmarked playback are not recorded; GIF has no audio.
- Sound-effect generation requires an explicitly configured provider. Local fixture checks verify protocol handling, not live provider quality. Narration uses an available text-to-speech engine or supplied recording; there is no bundled speech engine.
- Source-to-audio offers podcast, explanation, video narration, tutorial and summary authoring presets using the user's chosen language and voice-production capability, including an available MCP or supplied recordings. The offline helper validates source hashes and reference links, estimates script timing, decodes clips and assembles audio; it does not extract documents, verify semantic truth or synthesize voices. Optional speech leveling verifies measured loudness and true peaks in the encoded output; it cannot reconstruct already distorted speech or infer individual levels in unaligned grouped dialogue. Requested duration remains a target until measured and corrected. Voice naturalness, supported languages and continuity depend on the selected tool; no provider-wide quality or timing guarantee is implied. Presets do not add an extractor, provider queue, cache manager or scene scheduler to the helper. Video narration requires real placement/integration through a supported composition or timeline tool. Matching ASR text does not certify audible pronunciation.
- Keep assets local for portable output. Font embedding supports configured read-only provider origins, but standalone HTML still requires localized document assets.

## Editing and handoff

- Canvas, deck, timing, text, image and typed-tweak project saves require their documented preview-server options. Static/public previews retain browser or session state and do not write project files.
- Deck source writes support literal HTML slides. Renderer-generated slide source and expanded presenter workflows are not supported by that service.
- Review and suggestion controls produce clipboard drafts. Automatic insertion into a harness composer requires a configured integration; clipboard and selectable-text handoff work without it.
- Transfers to Figma, Canva or Google Slides require an available, authorized connector and verification of its actual result. A local handoff package does not perform a transfer.

## Imports and output

- Editable PowerPoint exports retain native text/shapes over eligible isolated CSS paint layers. Composed uniform positive 2D scaling/translation/rotation and safely inset rounded foreground retain editable objects. Explicit static TTF/OTF snapshots can embed used font families and variants; unembedded text and applications that ignore embedded fonts still require those fonts locally. LibreOffice needs version 25.8 or newer with EOT support to import PPTX embedded fonts. Screenshot mode preserves finished artwork as one image per slide.
- PowerPoint scalar builds support authored pivots and base transforms. Eligible nested spin/grow/shrink/teeter/path builds use bounded sampled composition with explicit repeat resets. Disjoint group opacity and eligible leaf wipes retain native artwork; overlapping nested fade/wipe composition can use bounded transparent picture builds while surrounding objects remain editable. These captures approximate motion at 20 fps and are limited to 120 images per component and 32 MiB of PNG bytes per slide. Other nested mask/visibility families, unsafe paint interleaving, unsupported geometry, live surfaces and clipped/off-slide motion can still require static fallback. Inspect warnings and the native/raster/static animation counts. Native wipe directions follow Microsoft mapping, but the tested Impress 25.8 player reveals the opposite edge from the HTML effect.
- PowerPoint local media can use bounded source-range/rate/gain copies. Eligible visible videos retain a conditional cover until a click starts playback, verified with concurrent builds and print in Impress 24.2 and 25.8. Native looping still plays once in both versions, including native ODP controls. Other manual-media variants retain direct trigger compatibility warnings and remain unverified; Microsoft PowerPoint playback remains unverified. Inseparable CSS can require static artwork, and CSS clipping/object fitting and codecs can differ in the native player. See the [PowerPoint guide](powerpoint.md).
- Figma import reports unsupported and approximate paints, masks, typography, variable wiring and instance properties. Inspect its warnings and compare a real design export when exact fidelity matters.
- Design-system checks are advisory source analysis, not complete type checking or brand certification. External/ambient types, package export maps and unsupported legacy formats can require manual conversion.
- HTML email requires testing in the actual target clients. Browser preview does not establish Outlook, Gmail or Apple Mail compatibility.
- Leaflet street maps require a configured tile provider and attribution. Tests use local synthetic tiles; verify live delivery with the actual provider.
- Browser checks primarily use Chromium. Physical gestures, Safari printing, complex fonts/color profiles and additional material/media combinations need checks on the intended environment.

Preserve functioning controls and saved state when refining a deliverable. Report limitations that materially affect the user's requested output.
