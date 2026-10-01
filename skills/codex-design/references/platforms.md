# Device, browser and desktop composition

The reference exposes separate React composition libraries and fixed HTML presentation shells. `frames.js` retains the earlier `device-frame`, `browser-frame` and `desktop-frame` interfaces, and loads the independent HTML shells. Use the platform libraries when an individual platform contract matters. The live file preview is a separate required component; a static desktop frame does not replace it.

## React authoring

Import the named primitives from `platform-components.jsx`, or use the dedicated `ios-frame.jsx`, `android-frame.jsx`, `browser-window.jsx` and `macos-window.jsx` entries. Bundle the entry with the local build helper before loading it in a plain page. The shared React build also exposes the same named functions on `window` for existing authored compositions. No proprietary starter probe or host message is installed.

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { IOSDevice, IOSList, IOSListRow } from "./platform-components.jsx";

createRoot(document.getElementById("app")).render(
  <IOSDevice title="Settings" keyboard>
    <IOSList header="Account">
      <IOSListRow title="Profile" detail="Private" icon="#007aff" />
      <IOSListRow title="About" isLast chevron={false} />
    </IOSList>
  </IOSDevice>
);
```

| Primitive | Inputs and defaults | Behavior |
| --- | --- | --- |
| `IOSDevice` | `width=402`, `height=874`, `dark=false`, optional `title`, `keyboard=false`, children | Fixed screen, 48 px outline, 126×37 island, overlaid status/home indicator, optional large-title navigation, contained scroll and visual keyboard. Omitting title omits the entire navigation. |
| `IOSStatusBar` | `dark=false`, `time="9:41"` | Separate time/network/battery surface. Dark changes the glyph color. |
| `IOSNavBar` | `title="Title"`, `dark=false`, `trailingIcon=true` | Glass back pill, optional trailing pill, 34 px large title and top status clearance. |
| `IOSGlassPill` | `dark=false`, `style={}`, children | 44 px baseline, 12 px blur, tint and inset shine; authored style overrides its outer geometry. |
| `IOSList` | optional `header`, `dark=false`, children | Uppercase group heading and inset 26 px rounded card. |
| `IOSListRow` | `title`, optional `detail` and icon color, `chevron=true`, `isLast=false`, `dark=false` | 52 px minimum row, optional 30 px icon, secondary detail, chevron and inset separator; the last row suppresses the separator. |
| `IOSKeyboard` | `dark=false` | Suggestions, QWERTY rows, special keys, blue return, translucent glass and bottom spacer. |
| `AndroidDevice` | `width=412`, `height=892`, `dark=false`, optional `title`, `large=false`, `keyboard=false`, children | Border-box device with 8 px bezel, 18 px corners, 40 px status, optional app bar, contained scroll, keyboard and 24 px gesture region. |
| `AndroidStatusBar` | `dark=false` | 9:30 time, central 24 px camera and network/battery indicators. |
| `AndroidAppBar` | `title="Title"`, `large=false` | Small inline title or separate larger title beneath its icon row. |
| `AndroidListItem` | `headline`, optional `supporting` and `leading` | Material list layout with optional 40 px avatar and secondary text. |
| `AndroidNavBar` | `dark=false` | 108×4 gesture pill in a 24 px region. |
| `AndroidKeyboard` | no props | Four visual QWERTY rows, punctuation, space and Material special-key colors. |
| `ChromeWindow` | `width=900`, `height=600`, `tabs=[{title:"New Tab"}]`, `activeIndex=0`, `url="example.com"`, children | Dark browser composition; separate 44 px tabs and 40 px toolbar, active tab scoops, white contained page region. |
| `ChromeTabBar` | same `tabs` and `activeIndex` defaults | Authors an arbitrary list of tabs and the active index. |
| `ChromeTab` | `title="New Tab"`, `active=false` | Active fill, typography and two corner scoops; inactive tabs omit the scoops. |
| `ChromeToolbar` | `url="example.com"` | URL text and decorative toolbar affordances. |
| `ChromeTrafficLights` | no props | 12 px browser window dots. |
| `MacWindow` | `width=900`, `height=600`, `title="Folder"`, optional `sidebar`, children | 26 px rounded desktop window, floating sidebar, toolbar and contained workspace. Pass sidebar items/headers as its sidebar content. |
| `MacSidebar` | children | 220 px content width plus padding, frosted panel and traffic lights. |
| `MacSidebarItem` | `label`, `selected=false` | Selection fill and blue selected glyph. |
| `MacSidebarHeader` | `title` | Group heading for sidebar content. |
| `MacToolbar` | `title="Folder"` | Title, glass action and visual search affordance. |
| `MacGlass` | `radius=296`, `dark=false`, `style={}`, children | 40 px blur, tint, outline and shine, with authored outer style. |
| `MacTrafficLights` | `style={}` | 14 px desktop dots with outer style overrides. |

These are visual authoring primitives. The reference does not wire decorative back/search/tab/sidebar controls into application state; author actual interactive controls and flows in the content. Visual keyboards do not enter text. Real inputs, child listeners and React state remain live as platform props change. Android's dark prop changes the device backdrop, status and gesture indicators; its separate app bar/list/keyboard retain their authored Material colors, matching the reference's limited dark contract. Width/height props support authored portrait and landscape boxes; these are fixed compositions, not automatic device rotation emulation.

## Fixed HTML shells

```html
<ios-shell width="428" screen-height="874" dark>
  <div data-codex-frame-export data-codex-frame-label="Story"
       style="height:600px;background:#376455">Authored story</div>
</ios-shell>
<chrome-shell width="780" tab="Reading room" url="reading.example"
              fav="#497662" image-only="false">
  <article data-codex-frame-export>Authored page</article>
</chrome-shell>
<script src="frames.js"></script>
```

Copy `platform-shells.js` and `canvas-export.js` alongside the loader, or bundle it. The separate classic `ios-shell.js` and `chrome-shell.js` entry files load the same editable implementation. `window.CodexFramesReady` resolves after the native definitions load. The demo helper bundles all of these dependencies automatically.

An iOS shell is a physical 428×900 box by default: 13 px bezel around a 402×874 screen. `width` and `screen-height` are its sizing inputs. Minimum/maximum sizes and flex behavior prevent a narrow flex row or stretching grid from changing that physical box. The original content nodes stay as direct light-DOM children and render through a native slot, preserving React ownership, input values and listeners. Native screen/content parts are available through `::part(screen)` and `::part(content)`. Island, status and home overlays are absolute, independent of content layout, and marked with `data-codex-chrome` for local snapshot exports. `dark` changes the status and home colors.

A Chrome shell has one light tab, favicon, traffic lights, navigation and URL bar. Its `tab`, `url`, `fav` and `width` attributes update in place. Width defaults to 780 px and remains pinned; height hugs its content plus chrome, with no flex stretch. It differs deliberately from the React dark multi-tab browser. Display strings remain inert text and URL text does not navigate.

Both shells accept `image-only` with **presence or the literal string `true`**. The string `false` keeps the full shell. iOS removes its bezel and overlays, switches to the exact inner width and hugs in-flow content. Absolutely positioned content with no flow height falls back to the configured screen height. A direct parent with image-only can strip a phone marked `data-composed-phone`, releasing its device clamps for semantic asset composition. Chrome removes its bars, corners and shadow while retaining the exact authored content width. Changing modes, dimensions or parent state preserves content identity. Reconnect and independently updated clones retain one owned shell.

## Actual local asset export

```js
await document.querySelector("ios-shell").exportAsset("png");
await document.querySelector("chrome-shell").exportAsset("html");
```

`exportAsset(kind, target?)` captures the first descendant marked `data-codex-frame-export`, or the first authored child if no marker is present. An explicit target must belong to that shell. The PNG contains the selected region at its nominal layout pixels, without the surrounding device/browser dressing. HTML is a script-free snapshot with current input values, computed styles and embedded local assets. The label uses `data-codex-frame-label`, then the shell's `label`, then `Asset`. Image slots settle their current framing and loads; their editor and credit surfaces are omitted from snapshots without hiding the visible source. Local font embedding and asset-origin rules use the same verified capture engine as canvas artboards, which retain their existing 3× output.

This is an actual local download, not a proprietary frame-export message. Selecting many social frames, ZIP download and automatic social-board export routing remain required integrations for the social family. Whole-page PNG/PDF export can retain presentation context; select/export the actual asset region when the dressing should be omitted. Standalone HTML requires a bundled loader and embeds its local dependencies. The `platforms.html` laboratory demonstrates each family, live prop changes, image-only and actual asset downloads.

## Verification and outstanding work

Tests exercise every named export, distinct default dimensions, status and camera/island geometry, list separators, large/omitted titles, keyboard visibility, live contained scroll, actual child actions, retained inputs under prop changes, authored landscape dimensions, tab selection and URL changes, desktop sidebar/glass, fixed shells in narrow/stretching layouts, inert display strings, all image-only states, flow-height growth, absolute-content fallback, composed-parent updates, React reconciliation, reconnect/clone ownership, standalone dependency removal, actual PNG pixels and portable HTML downloads. Root image-slot capture is verified separately, including settled pixels and unchanged source credit.

Full reference visual comparison, actual Apple/Roboto font availability, more browser engines, physical-device checks and full social-board integration remain required. `file-window` is not ported by these static/composition primitives. Its inspected contract includes cropped input-isolated live files, existence/rewrite probes, waiting sketch animation, page-wide streaming patience, reload/update routing, missing/reappearing states and a measured scrollable modal with pick/action events. Those functions remain required work under their own inventory row.
