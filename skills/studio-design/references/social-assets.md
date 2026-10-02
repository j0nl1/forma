# Social assets, feed cards and stories

These independently written components restore the separate board, feed-card and story-viewer contracts. They are composition tools: author the asset itself as HTML/CSS, images and overlays; keep surrounding account/device context separate. Reaction rows are illustrative display content, not connected social-network controls.

Use `post-card.js` with its runtime and `social-model.js` / `social-dom.js` companions for a feed alone. Use `instagram-story.js` with its runtime, the local platform shell and image modules for a story. Both are classic loaders with editable module companions. The complete `social.js` entry also installs `social-frames` and preserves the earlier generic `social-frame` wrapper. **Bundle `social.js` or `social-frames.js`** to include the pinned local `fflate` ZIP writer and shared capture helper; no CDN or proprietary parent-window transport is required.

```sh
node skills/studio-design/scripts/build.mjs \
  skills/studio-design/assets/starters/social.js /absolute/project/social.bundle.js
```

## Feed card

```html
<post-card
  platform="facebook" name="Reading room" sub="Concept study"
  text="Leave room for the thought."
  link-domain="readingroom.example" link-title="Field notes"
>
  <div data-codex-frame-export
       data-codex-frame-label="Link artwork · 1200×630"
       style="width:100%;aspect-ratio:1200/630;background:#269d80">
    <!-- Authored artwork and overlays. -->
  </div>
</post-card>
```

| Attribute | Contract |
| --- | --- |
| `platform` | `x` (default), `linkedin`, `facebook`, `reddit`. Unknown values use the X default. |
| `name` | Display name, default `Your brand`. The legacy `author` remains a fallback alias. |
| `sub` | Optional author detail. Defaults: `@yourbrand · 2h`, `Company · 2h`, `2h · 🌐`, or `r/design · Posted by u/yourbrand · 5h`. |
| `text` | Optional literal post copy above the media. Empty copy adds no space. |
| `avatar` | Optional avatar image; otherwise a neutral disc. |
| `link-domain`, `link-title` | Optional Facebook link footer; absent on other platforms. |
| `image-only` | Presence or the literal string `true` hides author/copy/reactions/link/votes and removes padding, media border and corners. `false` retains context. |

X, LinkedIn and Facebook keep the author/avatar row. Reddit has its own vote column and a community/detail line above the larger title. Each platform has its inspected reaction vocabulary. Authored children remain light-DOM nodes assigned into the media slot. Attribute changes, image-only toggles, reconnect and React conditional rendering preserve their identities, input values and event listeners. Live copy/platform changes keep the authored content and state.

## Instagram-style story

```html
<instagram-story
  id="launch-story" username="readingroom" time="3h"
  image-src="assets/story-photo.jpg"
  image-credit="Photo by the credited creator"
  image-credit-href="https://example.com/creator"
>
  <h2 style="position:absolute;left:30px;bottom:90px;color:white;z-index:10">
    A quiet idea.
  </h2>
</instagram-story>
```

The story composes a dark `ios-shell` and an `image-slot`. Default phone size is 428 × 900 px, with a 402 × 874 screen. Its 9:16 canvas is centered on black, preserving the whole story instead of stretching or cropping to fill the phone. Three progress segments, avatar/username/time and neutral more/close icons overlay the canvas. The visual reply bar sits below it in the letterbox. These are viewer dressing, without an account connection or invented send action.

`username` defaults to `yourbrand`, `time` to `2h`, and `avatar-src` accepts an optional avatar. `image-src`, `image-credit` and `image-credit-href` forward to the internal image slot. Its id is `<story-id>-photo`; give each persisted story a unique stable id. Missing ids receive distinct instance defaults. Stock-credit requirements and image editing use the existing image runtime.

`width` changes the physical phone width. Screen width is outer width minus 26 px; screen height uses 402:874 proportions. `image-only="true"` or presence removes all phone/viewer dressing and hugs only the 9:16 asset at screen width. `false` keeps the full device. All attributes update without replacing author overlays or the image slot. Caption/headline/sticker children remain authored light-DOM content assigned inside the canvas; size their text for the rendered screen, not the nominal 1080 px export width. Keep decorative scrims pointer-transparent so image editing remains reachable.

Use the source-connected image service for actual project persistence:

```sh
node skills/studio-design/scripts/preview.mjs /absolute/project --image-file campaign.html
```

Uploaded bytes and reframing state save in the directory's `image-slots.state.json`, including slots inside story shadow roots. `editable="session"` explicitly enables browser-only editing for a static demonstration. Session hydration supports slots created after store initialization, while pending local edits retain priority. The routine session notice is explained outside the artwork; actual save/storage errors and draft-recovery controls stay visible. Static pages without that attribute or a source service remain read-only.

## Board and nominal export

```html
<social-frames label="Reading room campaign">
  <div>
    <post-card platform="x" name="Reading room">
      <div data-codex-frame-export
           data-codex-frame-label="Feed artwork · 1200×675"
           style="width:360px;aspect-ratio:16/9;background:#269d80"></div>
    </post-card>
  </div>
  <div><instagram-story id="launch-story" image-src="assets/story.jpg"></instagram-story></div>
</social-frames>
```

Each unit normally contains one export frame. A story provides its own `Instagram story · 1080×1920` frame. Labels and buttons are owned shadow chrome above the units; the board never reparents authored children or inserts controls into React-managed units. Frames inside component shadow roots and slots are discovered in rendered order. Standard template contents remain inert. Custom-element units also work because label controls do not enter their child trees.

The board wraps units with 72 px row / 60 px column gaps and 48 px padding. A narrow viewport uses 24 px padding. Fixed-size devices stay physical; place the board in a scrollable or canvas viewport for smaller screens. Label positions follow uniform parent scaling and resize. Visible frames require a rectangle of at least 2 × 2 px and exclude display-none, visibility-hidden and fixed-position frames. Conditional insertion/removal and visibility changes rescan the board. Nested boards own their own frames; one board does not export another board's assets.

The native markers are `data-codex-frame-export` and `data-codex-frame-label`. Data-only legacy `data-om-frame-export` / `data-om-frame-label` markers remain readable. This preserves useful authored metadata without installing the old host protocol. Dimensions come from a trailing `W×H` / `WxH` in the label, or optional native `data-codex-frame-width` / `data-codex-frame-height`; otherwise the frame's layout size is used. Dimensions must be positive integers. Match the authored aspect ratio to those nominal dimensions.

Every visible unit gets a PNG button, including a single-format board. With two or more visible frames, Download all produces a **real ZIP containing every owned visible frame**, in board order. Exports settle image loads/reframing and fonts, snapshot current content and form values, flatten slots/shadow roots, embed assets and fonts, and retain authored before/after CSS artwork. Device/viewer/editor dressing marked `data-codex-chrome` or its data-only legacy equivalent is omitted. Root corners and shadows are removed. Output width and height are exactly the nominal label dimensions, regardless of parent pan/zoom or rendered thumbnail size.

ZIP names are sanitized and duplicate names receive numeric suffixes. Progress disables concurrent export controls; failures leave a visible message and allow retry. Local/same-origin and data/blob assets work offline after localization. `allow-external-assets` on the board explicitly enables embedding external assets, subject to the browser's CORS rules. No server credentials are supplied or simulated.

```js
await document.querySelector("social-frames").exportFrame(0); // Visible index.
await document.querySelector("social-frames").exportFrame(frameElement);
await document.querySelector("social-frames").exportAll();
```

An explicit frame must belong to that board and be visible. Completed exports emit bubbling/composed `social-frames:export` with `{ name, frames: [{ label, width, height, name }] }`. Errors emit `social-frames:error` with `{ message }`. `frames()` exposes the current visible candidates. These replace hosted export requests with actual browser downloads, usable without embedding the page in another app.

## Complete campaigns

Use the [campaign guide](campaigns.md#complete-social-campaign) for the full fourteen-placement roster, platform selection rules, typed Formats/Display controls, conditional units, grouped carousel and actual project/portable delivery. `CampaignBoard` composes authored units over this board runtime; the individual components remain independently usable.

## Verification and remaining work

Tests cover all four feed defaults and anatomies, literal input, Facebook-only links, Reddit votes, image-only false/presence/true, live attributes, retained inputs/actions, physical story/letterbox geometry, attribution forwarding, late-slot browser storage and actual source-sidecar uploads/reloads, board visibility/conditional rescans, scaled labels, reconnect/clones, scoped ownership, correct per-frame selection, duplicate ZIP names, real decoded nominal PNG bytes, dressing removal, authored pseudo-element artwork, failure/retry, standalone runtime removal and React reconciliation.

Verify other browser engines, hardware image-editing gestures and external/font/media combinations in the intended environment. Fractional frame boundaries can produce an antialiased outermost PNG pixel in the current snapshot renderer; inspect those edges in the requested output. Animated media and general iframe content are not yet verified in board snapshots. All eight separate [platform phone screens](social-phone-shells.md) now have full attribute/aspect/persistence implementations and behavioral/output tests. Use the distinct phone shells when platform anatomy matters; `social-frame` is a generic wrapper.
