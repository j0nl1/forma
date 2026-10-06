# Image slots and framing

The image editor supports a container-sized `<image-slot>`, directory-shared image state, drag/drop and browse, replace requests, cover/contain framing, pan/zoom/corner resizing, attribution, replacement masks and duplicate-slide state copying. The local runtime implements those contracts independently through editable modules and an opt-in local sidecar service. No proprietary host bridge is installed.

## Authoring

```html
<div style="width:800px;height:450px">
  <image-slot id="hero" src="landscape.png" alt="A landscape"
    shape="rounded" radius="20" fit="cover"
    credit="Original studio photograph"></image-slot>
</div>
<script src="image-slot.js"></script>
```

Copy every `image-*.js` companion or bundle the loader with the local build helper. The demo helper produces a bundled image runtime. A bare slot fills the available width at a 3:2 aspect ratio; an explicitly sized parent or inline width/height determines its exact box. `shape` accepts `rect`, `rounded` (default, radius 12 px), `circle` and `pill`. A non-square circle is an ellipse. An authored CSS `mask` overrides the preset outline. Placeholder text inherits the surrounding color.

Give every slot a distinct `id` across pages in the same directory. The directory owns one `image-slots.state.json`; entries use `{u, s, x, y, alt?}`, with an optional image data URL, scale and pan offsets in frame percentages. A bare data-URL entry and the legacy `.image-slots.state.json` filename remain readable. The first configured write upgrades legacy state into the native filename while preserving other entries. A framing-only entry retains the author's `src`. Clearing the entry restores the authored source and initial framing.

## Local editing and persistence

```sh
node packages/cli/src/commands/preview.mjs /path/to/artifact --image-file artwork.html
```

The selected page gets image-service metadata in its HTTP response. Image edits save to the actual shared directory sidecar. `--deck-file` and `--canvas-file` also connect image state for their selected page, so duplicating a slide can retain its image and crop. The HTML itself is not changed by image edits. The service has a fixed sidecar target, exact origin/token checks, content versions and shared serialized writes. Larger groups of edits are split into bounded requests while newer revisions remain queued. Conflicts retain the current draft; saving pauses and **Download image state** produces the actual current JSON. A recovered browser draft is offered separately as **Download retained draft**, without automatically replacing newer disk state. Storage failure does not block using or downloading the current page state.

Drag/drop or browse accepts PNG, JPEG, WebP and AVIF. Valid images are decoded, scaled without upsampling to at most twice the slot's layout width and a 1200 px longest side, then encoded as WebP at quality 0.85. Decode/encode failure retains the previous image and crop. A newer valid upload, reset or author `src` edit invalidates an older in-flight encode. Rejecting an unsupported file leaves an existing valid upload and replacement mask active; its eventual image is still saved. Replacement masking stays active through both encoding and decoding, including same-task credit edits and unrelated state notifications. First fills do not show a replacement mask. Reduced motion keeps the loading indicator static.

Hover or keyboard focus reveals **Replace**, **Edit** and **Reset image**. Replace dispatches the cancelable, bubbling/composed `image-slot:pick` event with `{id}`; an available configured picker can handle it. The default opens the real local file chooser. `openFilePicker()` exposes that action. This is not a stock-search or generation simulation. Configured stock/provider workflows remain separate required integrations.

Double-click or **Edit** enters reframe mode. Drag moves the image, wheel zooms toward the pointer and all four corner handles resize with a fixed aspect ratio and opposite-corner anchor. Scale is limited to 1–5 relative to the chosen cover/contain baseline. Pan is limited to overflow; letterboxed contain images remain centered on an axis until they overflow it. The full-image ghost and controls use the top layer, escaping clipping and scaled ancestors. A body portal supplies the fallback when popovers are unavailable. Arrow keys pan; Shift increases the step; plus/minus adjust zoom. Escape, clicking outside, Edit-as-toggle and leaving the page commit the current view. Disconnect tears down the gesture without committing an interrupted crop. `image-slot:reframe` reports `{active,id}`.

An anonymous slot can be filled for the current page but cannot persist to the shared file. The earlier `storage-key` interface remains available, with its browser-local image, alt text and crop controls. Its existing storage keys and duplicate-copy hook remain readable. Animated GIFs are retained as original bytes in that compatibility mode; the canonical raster importer rejects GIF rather than flattening its animation.

## Attribution and exported output

Credit text belongs to the authored `src` and is hidden while a user image overrides it. An Unsplash-host source without nonblank credit displays an attribution tile instead of the photo. Canonical `Photo by NAME on Unsplash` credit splits into photographer and platform links; only HTTP(S) links are clickable. Existing referral parameters are retained and absent parameters use `studio_design` / `referral`. Credit and placeholder strings stay inert text. This preserves the reference gate; it does not establish rights for a supplied image.

Static pages are read-only by default and load the shared state. `editable="session"` explicitly enables a browser-only demonstration. `examples/images.html` uses an original vector illustration and session editing. Keep a public tunnel on that ordinary preview; use the local service for actual project writes.

Standalone HTML embeds the shared image state before the bundled runtime and continues to work after the sidecar and original image files are removed. PDF/PNG/video preparation settles image state and loads, hides image controls, credits, ghost layers and statuses through native capture metadata, and commits an active crop. Browser print also hides image chrome. Keep screen attribution visible and avoid covering its bottom-left area with authored overlays. Localize remote assets before portable export; the inliner does not download remote dependencies.

## Verification and remaining work

Tests cover both state generations, exact shape/fit/container behavior, real decoded uploads, native sidecar writes/reload/reset, scaled/clipped pointer gestures, actual corner resizing, hydration races and inherited disk pixels, stale encode cancellation, failure recovery, inert/split credits, stale/foreign/path guards, downloadable drafts, legacy state conversion, reconnect identity, standalone output and actual native deck duplication. Invalid sibling records are ignored for display and preserved by unrelated partial writes. hardware touch/IME/browser paths, further large media/color-profile combinations, and real configured stock/generation picker workflows remain required work.
