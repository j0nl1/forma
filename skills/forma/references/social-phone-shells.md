# Social phone screens

These independently authored components preserve the inspected X post-detail, Instagram photo-feed, TikTok short-video viewer, Facebook feed, LinkedIn feed, Pinterest pin, Reddit post and YouTube thumbnail contracts. They compose the existing local `ios-shell` and `image-slot`; their platform anatomy is distinct from the generic `social-frame` and `post-card` wrappers.

Every platform and aspect uses one fixed phone height: 428 × 900 px by default, a 402 × 874 screen, and a compressed metadata area for larger feed photos.

## Load and author

Bundle `social.js` for all currently implemented social components and actual PNG/ZIP board downloads. For an individual phone, copy its classic `<platform>-shell.js` loader and editable companions, or bundle that entry:

```sh
node packages/cli/src/commands/build.mjs \
  packages/runtime/src/browser/x-shell.js /absolute/project/x.bundle.js
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

The loaders expose `CodexXReady`, `CodexInstagramReady`, `CodexTikTokReady`, `CodexFacebookReady`, `CodexLinkedInReady`, `CodexPinterestReady`, `CodexRedditReady` and `CodexYouTubeReady` promises. The combined `CodexSocialReady` awaits them. No proprietary host callback or external icon package is used.

All authored children stay in light DOM and are assigned inside the asset through a native slot. Overlays, input values and event listeners survive live attributes, aspect changes, image-only toggles and reconnect. React can add/remove complete phone units without generated markup entering its managed child tree. Units may be direct board children or plain wrappers; the board discovers each phone's own shadow-root frame. Ordinary template contents remain inert.

## Shared inputs and image persistence

| Input | Behavior |
| --- | --- |
| `id` | Give each persisted phone a unique stable id. Its image slot is `<phone-id>-photo`. Missing ids receive distinct instance defaults. |
| `image-src` | Prefilled still image, using the full local image editor's cover/rect/zero-radius contract. |
| `image-credit`, `image-credit-href` | Forwarded attribution. The existing image runtime retains its stock-credit requirements. |
| `avatar-src` | Optional avatar URL, applied through the CSS property API. Removing it restores the neutral gradient disc; Instagram also updates its profile-tab avatar. LinkedIn retains its neutral search-profile disc. Pinterest also accepts the optional avatar URL. Reddit retains its orange community disc. |
| `width` | Outer physical width, default 428 px. Screen width is outer minus 26 px; screen height is `round(inner × 874 / 402)`. Every aspect retains that phone size. |
| `image-only` | Presence or literal `true` removes the bezel and viewer dressing. Literal `false` retains the complete platform context. |
| `editable="session"` | Explicit browser-only image editing for a static demonstration. Routine session labeling can live outside the artwork; real errors and recovery controls remain visible. |

Attribute updates are live and preserve authored state without rebuilding the content. Copy and counts are literal text. Avatar URLs are never interpolated into HTML.

For actual project-file persistence, serve the selected HTML with the existing source service:

```sh
node packages/cli/src/commands/preview.mjs /absolute/project --image-file campaign.html
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

The screen includes a back/Post bar, 40 px avatar and author details, Follow control, optional copy, rounded bordered media, time/views, reaction row and four-icon bottom navigation. The Follow button and other platform controls retain their illustrative behavior; they do not create a social account or send requests.

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

The TikTok shell provides an editable still-image area with author overlays, rather than a video playback controller. Authored media may be included as children, but complete animated-media snapshot verification remains required.

## Facebook feed

| Attribute | Default / behavior |
| --- | --- |
| `name`, `time` | `Your brand`, `2h`; time appears beside the public globe. |
| `text` | Optional literal copy above the image; hidden when empty. |
| `likes`, `comments`, `shares` | `1.2K`, `84 comments`, `23 shares`. |
| `aspect` | Wide by default: `Facebook post · 1200×630`; `square`: `Facebook post · 1080×1080`. Unknown values use wide. |

The Feed bar has search/message circles. The gray background separates the white post with its 40 px avatar, author/time, full-width image, overlapping like/heart reaction discs, counts and horizontal Like/Comment/Share row. Five navigation symbols remain below. The default contextual asset is 402 × 211.046875 px. Image-only removes the card spacing and all viewer dressing, retaining the export frame and image editor.

## LinkedIn feed

| Attribute | Default / behavior |
| --- | --- |
| `name`, `time` | `Your brand`, `2h` with the public globe. |
| `headline` | Optional author subtitle, empty by default. |
| `text` | Optional literal post copy; hidden when empty. |
| `reactions`, `comments`, `reposts` | `847`, `63 comments`, `12 reposts`. |
| `aspect` | Wide by default: `LinkedIn post · 1200×627`; `square`: `LinkedIn post · 1080×1080`. Unknown values use wide. |

The search bar uses a separate neutral profile disc. The post has a 44 px avatar, author/headline/time, blue Follow control, optional copy, full-width media and blue reaction/count row. Like/Comment/Repost/Send use vertical icon/label groups. Five navigation symbols complete the screen. The 627 px nominal height is intentional: the default contextual image is 402 × 210.046875 px. Image-only retains the same image width.

## Pinterest pin

| Attribute | Default / behavior |
| --- | --- |
| `title` | Optional pin title; its entire metadata area is hidden when empty. |
| `username`, `followers` | `yourbrand`, `12k followers`. |
| `site` | `Visit site`, illustrative button text. |

The fixed 2:3 asset exports as `Pinterest pin · 1000×1500`. A back/more bar leads to a rounded pin with 12 px horizontal margins and 24 px corner radius. The default contextual frame is 378 × 567 px. Save overlays the upper right; Visit site overlays the lower left; share/more circles overlay the lower right. These controls sit outside the export frame and never enter PNG output. Optional title/username/followers/Follow and five navigation items remain below. Image-only removes margins, radius and every control, producing a bare 402 × 603 px image. Pinterest has no square variant.

## Reddit post

| Attribute | Default / behavior |
| --- | --- |
| `community` | `r/yourcommunity`, repeated in the top bar and author row. |
| `username`, `time` | `u/yourbrand`, `5h`, joined below the community. |
| `title` | Optional literal post title; hidden when empty. |
| `upvotes`, `comments` | `1.2k`, `84`. |
| `aspect` | Wide by default: `Reddit post · 1200×675`; `square`: `Reddit post · 1080×1080`. Unknown values use wide. |

The post retains its orange community disc and Join control, title above the full-width media, combined up/count/down vote chip, comment chip and share symbol. Five navigation symbols include the notification badge. The default frame is 402 × 226.125 px. Image-only retains the frame width while removing all post and navigation context.

## YouTube thumbnail

| Attribute | Default / behavior |
| --- | --- |
| `title`, `channel` | `Your video title`, `Your brand`. |
| `views`, `time` | `12K views`, `2 days ago`. |
| `duration` | `3:12`, shown in the thumbnail's lower-right viewer badge. |

Home/cast/notification/search, All/Music/Live/Gaming filters, full-width thumbnail, avatar/title/channel/views/time/more metadata and five navigation items retain their separate hierarchy. The fixed 16:9 asset is 402 × 226.125 px and exports as `YouTube thumbnail · 1280×720`; no square variant exists. The duration badge is viewer dressing inside the frame: both export capture and image-only remove it. This is the editable thumbnail contract, without a playback controller.

Platform controls use illustrative behavior. Save, Visit site, Follow and Join do not connect an account, navigate to an inferred URL or publish content. Actual image editing and local asset downloads are functional. See `social-feeds.html` for the five additional screens and `social-shells.html` for X, Instagram and TikTok.

## Exports and verification limits

Each phone provides one native frame to [social assets](social-assets.md). Per-format downloads and ZIP archives use the same real capture pipeline, attribution handling and safe filename rules. Both standalone loaders and portable HTML remain usable after runtime source removal. Board discovery covers direct phone units as well as wrapper units, and React conditional boards retain input identity and handlers.

Tests verify every listed default and live input, optional content, literal copy, all aspect labels, fixed phone and letterbox geometry, image-only presence/true/false, widths, avatar removal, forwarded credits, reconnect/clones, actual separate source-sidecar uploads/reloads, real decoded PNG/ZIP bytes, viewer removal, independent classic loaders, portable runtime removal and React ownership.

Inspect pixel edges when exact raster output matters. The current browser snapshot renderer can antialias the outermost pixel at fractional boundaries: the tested X wide toggle changes its final PNG row while the interior still-image pixels match. This difference is explicitly bounded in tests, not counted as exact export equality. Other browser engines, hardware image gestures and additional fonts/media require checks on the intended environment. All eight phone shells have behavioral and output tests.
