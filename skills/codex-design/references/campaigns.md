# Social and campaign artifacts

Match the requested medium's aspect ratio, audience, and message. Read [social assets](social-assets.md) for the restored `social-frames`, `post-card` and `instagram-story` contracts. Bundle `social.js` for the complete board/feed/story entry and actual nominal PNG/ZIP downloads. Use [social phone screens](social-phone-shells.md) for all eight distinct platform contracts. The earlier generic `social-frame` wrapper remains available; it does not replace the individual platform shells.

Use `post-card` for feed cards and real image dimensions. Keep essential copy away from crop edges and overlay regions. Create a small set of meaningful copy or visual variations with clear filenames. Do not add fake engagement, endorsements, account verification, or statistics as facts.

For brochures and fliers, read [documents](documents.md). For HTML email, read [email](email.md). Check the output at its intended dimensions and export images or PDF only when requested.

## Complete social campaign

The default is fourteen placements: ten mobile assets and four desktop feeds. A named X, LinkedIn, Facebook or Reddit platform includes its desktop placement unless the user explicitly requests mobile-only. Instagram includes square, portrait and story. Use the exact format keys below in a Formats section; `imagesOnly` is one separate boolean in Display, initially false.

| Format key | Context | Nominal PNG dimensions |
| --- | --- | --- |
| `instagramPost` | Instagram square phone | 1080×1080 |
| `instagramPortrait` | Instagram portrait phone | 1080×1350 |
| `story` | Instagram story phone | 1080×1920 |
| `xPost` | X post phone | 1200×675 |
| `facebook` | Facebook phone | 1200×630 |
| `linkedin` | LinkedIn phone | 1200×627 |
| `pinterest` | Pinterest pin phone | 1000×1500 |
| `reddit` | Reddit post phone | 1200×675 |
| `youtubeThumbnail` | YouTube thumbnail phone | 1280×720 |
| `tiktok` | TikTok viewer phone | 1080×1920 |
| `xDesktop` | Browser + X feed card | 1200×675 |
| `linkedinDesktop` | Browser + LinkedIn feed card | 1200×627 |
| `facebookDesktop` | Browser + Facebook feed card | 1200×630 |
| `redditDesktop` | Browser + Reddit feed card | 1200×675 |

When required campaign/brand information is missing, combine the subject, voice/assets/constraints and optional format choice in one native Codex question round. Do not repeat an answered interview. An unanswered optional format question keeps the complete roster. `campaignDefaults()` supplies those fourteen true flags. `campaignDefaults({platforms:["x","reddit"]})` selects both phone/desktop pairs; `{mobileOnly:true}` narrows platform selection. `{formats:["story","redditDesktop"]}` selects explicit placements. An explicit empty array selects none; it is not the representation of a skipped question. Unknown keys fail rather than silently omitting a requested platform.

## Author and control the board

Bundle `campaign-components.jsx` with a React application and the complete `social.js` runtime. `CampaignBoard` accepts an array of `{id,format,render}` units. Every id is unique and stable. Each render callback receives `{imagesOnly,format}` and returns independently authored shell/context/artwork. Bind `image-only={String(imagesOnly)}` on every semantic phone/story, `chrome-shell` and `post-card`. The callback is an authoring boundary, not a generator or provider simulation. Attributes and artwork remain under the author's control.

`CampaignControls` renders one typed toggle per distinct format, with the exact format key as its label, and one `imagesOnly` toggle. Compose it inside the existing `TweaksPanel`, with values and the setter from `useTweaks(readTweakDefaults())`. The panel lives outside the metadata canvas transform, remains usable at small zoom, and emits no frame-export chrome. Its state uses the existing browser/source tweak store.

The board conditionally mounts whole wrapper units in authored order. It retains React keys and untouched editor/overlay identities. Format removal updates visible download numbering; restoring a format recreates its DOM and hydrates its image state through the same stable image id. Do not hide the internal export frame or place conditional rendering inside a semantic shell. Every internal `image-slot` must have its own stable id; phone ids derive `<phone-id>-photo`, while desktop ids are authored explicitly.

Mobile units use the semantic shells. Desktop units compose `chrome-shell` around `post-card` with the asset as the card's child. Mark that child with `data-codex-frame-export` and a nominal label. The image-only flag strips both context layers. Use proportional offsets and container-relative type for overlay artwork where contextual and bare frame widths differ. Match the frame aspect to its nominal dimensions; keep decorative overlays pointer-transparent so image editing remains reachable.

Custom units may use another format key and their own nominal dimensions. Several units sharing a key form one toggle group. A carousel uses five to ten ordered frames with a hook, one point per frame and a closing action; give the entire sequence one `carousel` flag. Keep one visual system and separate persistent image ids for all its frames. The reference's fourteen-format roster does not automatically include a carousel when none was requested.

## Working example and delivery

[The complete campaign source](../../../examples/campaign/main.jsx) authors all fourteen placements plus an optional five-frame reading-room carousel. [Its HTML](../../../examples/campaign.html) contains editable JSON defaults and local styling. Copy these into a project, adjust the imports to copied starter files, and replace the study's original copy/art with the user's actual material. The example's accounts and counts are illustrative; it does not connect or publish to social accounts.

```sh
node skills/codex-design/scripts/build.mjs examples/campaign/main.jsx /absolute/project/campaign.bundle.js
node skills/codex-design/scripts/build.mjs skills/codex-design/assets/starters/plain-canvas.js /absolute/project/starters/plain-canvas.js
node skills/codex-design/scripts/preview.mjs /absolute/project --tweaks-file campaign.html --image-file campaign.html
node skills/codex-design/scripts/export.mjs html /absolute/project/campaign.html /absolute/project/campaign-portable.html
```

The selected document's JSON flags save to real HTML; image uploads/crops save to `image-slots.state.json` in the directory. Public/static demonstrations retain browser state. Image edits survive format removal/restoration and reload. The metadata canvas supplies pan/zoom. Native board controls download one nominal PNG or a ZIP of every visible asset in board order, using unique sanitized names. Turning on images-only affects every context, without adding shells or duration badges to asset output. A zero-format board offers no download; a single-format board retains its PNG action.

Import local raster/SVG images and fonts as modules when their references live inside JSX: `import photo from "./assets/photo.svg"`. The build helper embeds those imports as data URLs, so portable HTML retains them after runtime source and asset folders are removed. Arbitrary URL strings or dynamic JavaScript fetches still require explicit localization; they are not captured automatically.

Tests exercise the fourteen-format resolver, typed toggles, whole-unit conditional rendering, image-only across every context layer, all nominal PNG/ZIP dimensions and image/lettering pixels, five-frame grouped export, real fourteen-slot image persistence, actual JSON flag writes and portable runtime/asset removal. Full reference visual/hardware/media/provider comparisons remain required. Fractional rendering differences still prevent a general claim of byte-identical contextual/bare exports; use the existing renderer limitations when reviewing final assets.

The campaign showcase keeps its full fixed-size board as a pannable scene, while its introductory title, paragraphs and download status fit the actual viewport. PNG and ZIP downloads retain the same nominal dimensions across viewport, pan and zoom changes; responsive page copy must not resize or crop authored format artwork.
