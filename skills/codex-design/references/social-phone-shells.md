# Social phone screens

These independently authored components preserve the inspected X post-detail, Instagram photo-feed and TikTok short-video viewer contracts. They compose the existing local `ios-shell` and `image-slot`; their platform anatomy is distinct from the generic `social-frame` and `post-card` wrappers.

The reference implementation's executable behavior uses one fixed phone height for every platform and aspect. Some of its usage comments say that Instagram portrait raises the phone height; the implementation does not. This port follows the implemented physical-device contract: 428 × 900 px by default, a 402 × 874 screen, and a compressed metadata area for larger feed photos.

## Load and author

Bundle `social.js` for all currently implemented social components and actual PNG/ZIP board downloads. For an individual phone, copy the classic `x-shell.js`, `instagram-shell.js` or `tiktok-shell.js` loader and its editable companions, or bundle that entry:

```sh
node skills/codex-design/scripts/build.mjs \
  skills/codex-design/assets/starters/x-shell.js /absolute/project/x.bundle.js
```

```html
<social-frames label="Campaign">
  <x-shell id="campaign-x" name="Studio" handle="@studio"
           text="An original thought." image-src="assets/photo.jpg">
    <h2 style="position:absolute;left:30px;top:50px;color:white;pointer-events:none">
      Leave room.
    </h2>
  </x-shell>
  <instagram-shell id="campaign-instagram" username="studio"
                   aspect="portrait" caption="A quiet page."
                   image-src="assets/photo.jpg"></instagram-shell>
  <tiktok-shell id="campaign-short" username="@studio"
                caption="Look a little longer."
                image-src="assets/photo.jpg"></tiktok-shell>
</social-frames>
<script src="social.bundle.js"></script>
```

The loaders expose `CodexXReady`, `CodexInstagramReady` and `CodexTikTokReady` promises. The combined `CodexSocialReady` awaits them. No proprietary host callback or external icon package is used.

All authored children stay in light DOM and are assigned inside the asset through a native slot. Overlays, input values and event listeners survive live attributes, aspect changes, image-only toggles and reconnect. React can add/remove complete phone units without generated markup entering its managed child tree. Units may be direct board children or plain wrappers; the board discovers each phone's own shadow-root frame. Ordinary template contents remain inert.

## Shared inputs and image persistence

| Input | Behavior |
| --- | --- |
| `id` | Give each persisted phone a unique stable id. Its image slot is `<phone-id>-photo`. Missing ids receive distinct instance defaults. |
| `image-src` | Prefilled still image, using the full local image editor's cover/rect/zero-radius contract. |
| `image-credit`, `image-credit-href` | Forwarded attribution. The existing image runtime retains its stock-credit requirements. |
| `avatar-src` | Optional avatar URL, applied through the CSS property API. Removing it restores the neutral gradient disc; Instagram also updates its profile-tab avatar. |
| `width` | Outer physical width, default 428 px. Screen width is outer minus 26 px; screen height is `round(inner × 874 / 402)`. Every aspect retains that phone size. |
| `image-only` | Presence or literal `true` removes the bezel and viewer dressing. Literal `false` retains the complete platform context. |
| `editable="session"` | Explicit browser-only image editing for a static demonstration. Routine session labeling can live outside the artwork; real errors and recovery controls remain visible. |

Attribute updates are live in the port; the inspected reference reads most attributes only once. This preserves its inputs while avoiding a rebuild that would discard authored state. Copy and counts are literal text. Avatar URLs are never interpolated into HTML.

For actual project-file persistence, serve the selected HTML with the existing source service:

```sh
node skills/codex-design/scripts/preview.mjs /absolute/project --image-file campaign.html
```

Uploads and crop/zoom edits share the directory's `image-slots.state.json`, with separate records for each stable phone id. Reload restores the uploaded bytes. Static pages without explicit session editing remain read-only. See [images](images.md) for conflict recovery, gestures and portable state. Source-sidecar editing does not require setting `editable="session"`.

## X post detail

| Attribute | Default / behavior |
| --- | --- |
| `name`, `handle` | `Your brand`, `@yourbrand`. |
| `text` | Literal copy above the image; hidden when empty. |
| `time`, `views` | `9:41 AM · Today`, `12.4K`, followed by the Views label. |
| `replies`, `reposts`, `likes` | `88`, `340`, `1.2K`. Bookmark/share symbols complete the five-action row. |
| `aspect` | `wide` by default: `X post · 1200×675`; `square`: `X post · 1080×1080`. Unknown values use wide. |

The screen includes a back/Post bar, 40 px avatar and author details, Follow control, optional copy, rounded bordered media, time/views, reaction row and four-icon bottom navigation. The Follow button and other platform controls retain their illustrative reference behavior; they do not create a social account or send requests.

The default contextual asset is 368 px wide, inside the screen's 16 px margins and media border. Image-only removes those margins and border, so the rendered asset becomes 402 px wide. At another phone width the same relationship applies. The export marker, image slot, stored image and nominal label are retained across that toggle. Match responsive artwork to its rendered size; absolute-pixel overlays naturally occupy a different fraction of the wider bare frame, as in the inspected layout.

## Instagram photo feed

| Attribute | Default / behavior |
| --- | --- |
| `username` | `yourbrand`, also prepended in bold to the caption. |
| `location` | Optional author subtitle; hidden when empty. |
| `caption` | Literal caption with leading whitespace removed. |
| `likes` | `1,024 likes`. |
| `comments` | Optional line such as `View all 92 comments`; hidden when empty. |
| `time` | `2 hours ago`, shown in small uppercase text. |
| `aspect` | `square` by default: `Instagram post · 1080×1080`; `portrait`: `Instagram portrait · 1080×1350`. Unknown values use square. |

The neutral Home bar, create/heart/send icons, gradient avatar ring, author/location/menu row, edge-to-edge photo, reaction/save row, likes/caption/comments/time and five-part navigation retain their distinct layout. The square photo is 402 × 402 px; portrait is 402 × 502.5 px. Both use the same 874 px screen height. Metadata is compressible and clips excessive content; the photo retains its export aspect. Image-only removes all contextual content while retaining the photo width.

## TikTok short-video viewer

| Attribute | Default / behavior |
| --- | --- |
| `username` | `yourbrand`; one leading authored `@` is removed before one is added for display. |
| `caption` | Optional two-line literal caption; hidden when empty. |
| `sound` | `Original sound · <username>` unless explicitly supplied. This is viewer copy, not an audio player. |
| `likes`, `comments`, `saves`, `shares` | `24.5K`, `482`, `1,208`, `3,407`. |

The complete 9:16 canvas is centered on the fixed black screen. Following/For You tabs, avatar/follow marker, four-count action rail, record disc and username/caption/sound appear inside the canvas as export-hidden viewer dressing. Home/Friends/create/Inbox/Profile navigation sits below the canvas in the bottom letterbox. The default asset is approximately 402 × 714.656 px and exports as `TikTok · 1080×1920`. Image-only hugs that canvas; no letterbox or navigation enters the asset download.

The reference provides an editable still-image area with author overlays, rather than a video playback controller. Authored media may be included as children, but complete animated-media snapshot verification remains required.

## Exports and verification limits

Each phone provides one native frame to [social assets](social-assets.md). Per-format downloads and ZIP archives use the same real capture pipeline, attribution handling and safe filename rules. Both standalone loaders and portable HTML remain usable after runtime source removal. Board discovery covers direct phone units as well as wrapper units, and React conditional boards retain input identity and handlers.

Tests verify every listed default and live input, optional content, literal copy, all aspect labels, fixed phone and letterbox geometry, image-only presence/true/false, widths, avatar removal, forwarded credits, reconnect/clones, actual separate source-sidecar uploads/reloads, real decoded PNG/ZIP bytes, viewer removal, independent classic loaders, portable runtime removal and React ownership.

Exact rendering parity remains unproven. The current browser snapshot renderer can antialias the outermost pixel at fractional boundaries: the tested X wide toggle changes its final PNG row while the interior still-image pixels match. This difference is explicitly bounded in tests, not counted as exact export equality. Full source visual comparisons, other browser engines, hardware image gestures, additional fonts/media and full campaign workflows remain required. Facebook, LinkedIn, Pinterest, Reddit and YouTube shells are still required separate ports.
