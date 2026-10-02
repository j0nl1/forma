# Typed design tweaks

Use `tweaks-components.jsx` for the full React panel, or `TweakStore` from `tweaks-store.js` for a custom native control surface. Bundle JSX locally with `scripts/build.mjs`; copy its companion modules when building outside the checkout. No React CDN, runtime Babel, host messages or telemetry are required. The older `controls.js` remains a small native CSS-variable surface with its existing reset/download behavior.

## Defaults and live state

Keep one JSON block in the root HTML document:

```html
<script id="codex-tweak-defaults" type="application/json">
{"fontSize":32,"density":"regular","dark":false,"palette":["#254f49","#f6f3e9","#e3a576"]}
</script>
<div id="root"></div>
<script src="app.bundle.js"></script>
```

```jsx
import {
  useTweaks, readTweakDefaults, TweaksPanel, TweakSuggestionBar,
  TweakSlider, TweakRadio, TweakColor, TweakToggle
} from "./tweaks-components.jsx";

function App() {
  const [t, setTweak] = useTweaks(readTweakDefaults());
  return <>
    <main style={{fontSize:t.fontSize, color:t.palette[0]}}>Your design</main>
    <TweaksPanel store={setTweak.store}>
      <TweakSuggestionBar suggestions={[
        "Add a quiet-hours dial", "Add a reading rhythm slider", "Add a print-like mode"
      ]} />
      <TweakSlider label="Font size" value={t.fontSize} min={12} max={48}
        unit="px" onChange={value => setTweak("fontSize", value)} />
      <TweakRadio label="Density" value={t.density}
        options={["compact","regular","comfy"]}
        onChange={value => setTweak("density", value)} />
      <TweakColor label="Palette" value={t.palette}
        options={[["#254f49","#f6f3e9","#e3a576"],["#3d426b","#f0eff8","#b7addd"]]}
        onChange={value => setTweak("palette", value)} />
      <TweakToggle label="Dark mode" value={t.dark}
        onChange={value => setTweak("dark", value)} />
    </TweaksPanel>
  </>;
}
```

`setTweak(key,value)` and `setTweak({key:value,...})` apply live changes without remounting the design. `false`, zero and arrays retain their types. Values are finite JSON data with size/depth limits; updates do not coerce their values, and intentional type changes or new JSON-valued keys are accepted by the partial-update API. Nested values are data rather than executable expressions. Defaults are initialization values, not a controlled hook prop.

`useTweaks(defaults,{id,storage,source})` defaults to ID `default`, browser persistence and source connection when available. Hooks sharing an ID share one store; use separate IDs for independent tweak sets. The first source-enabled store connects to the selected document's one defaults block. Subsequent stores remain browser/session stores. `setTweak.store` exposes `.values`, `.defaults`, `.status`, `.ready`, `.set()`, `.subscribe()`, `.flush()`, `.reset()` and `.download()`. Reset returns to the defaults loaded for the current page; saved source values become the defaults on reload. Browser overrides are scoped by path, ID and the authored-defaults signature. Changing defaults invalidates old browser overrides. Storage failures leave working session controls and a visible status.

Each live edit emits same-window `tweakchange` with the partial edits. Custom native controls can subscribe to the store and apply values to CSS variables, content or layout without adopting React.

## Controls and panel

| Export | Contract |
| --- | --- |
| `TweakSection({label,children})` | Group heading and arbitrary child controls |
| `TweakRow({label,value,children,inline})` | Labeled row, optional displayed value and inline layout |
| `TweakSlider` | Number-valued range; default min 0, max 100, step 1; unit is display-only |
| `TweakToggle` | Boolean switch with checked state and keyboard activation |
| `TweakRadio` | Typed primitive or `{value,label}` options; two short labels up to 16 characters or three up to 10 use segments; other sets use a dropdown and resolve its strings back to the original option type |
| `TweakSelect` | Native dropdown; emits a string, matching the direct reference API |
| `TweakText` | String-valued text field with optional placeholder |
| `TweakNumber` | Number field clamped to optional min/max; horizontal label drag snaps by step, including decimal steps; Left/Right on the label also scrubs |
| `TweakColor` | Curated string colors or arrays; palette cards show the first color with up to four supporting colors; selected equality ignores hex case; no options uses the native color picker |
| `TweakButton` | Primary/secondary button with an authored action |

Provide three or four deliberate palette choices rather than an unrestricted picker for normal design decisions. The controls allow arbitrary additional authored UI inside the panel.

The panel opens from its local Tweaks launcher or `codex-tweaks-open` and closes via its close button or `codex-tweaks-close`. Events may include `{id}` to target one panel. Listeners are installed before `codex-tweaks-available` is emitted; dismissal emits `codex-tweaks-dismissed`. `showLauncher={false}` lets an application's own toolbar control visibility. Drag the header with mouse or touch; arrow keys on the focused header move it by 10 px, or 1 px with Shift. Its position remains within a 16 px viewport inset after dragging, resizing and reopening. Tall content scrolls within the panel. Close returns focus to the launcher. Print and `?capture` omit the panel chrome.

The segmented selection marker slides for keyboard/click changes and tracks drag without a lagging transition. Switch and swatch motion remains available; reduced motion disables decorative transitions.

## Actual source saving

```sh
node skills/studio-design/scripts/preview.mjs /path/to/design --tweaks-file prototype.html
```

This explicitly enables writes to the selected HTML file. The server injects connection metadata only into that document. It accepts exactly one `script#codex-tweak-defaults[type="application/json"]`, or one legacy `/*EDITMODE-BEGIN*/.../*EDITMODE-END*/` JSON block in an inline literal variable declaration. Pass the legacy `TWEAK_DEFAULTS` value to `useTweaks`/`readTweakDefaults` as the fallback when using that format. Inventory and saving parse JSON and HTML; they do not evaluate the surrounding JavaScript. Defaults in an external bundle need a root-document JSON binding rather than arbitrary source rewriting.

Edits merge into the JSON block and preserve surrounding HTML/scripts. Strings containing `<` are escaped so they cannot terminate a script element. Rapid input changes are batched after 150 ms, and `.flush()` waits for connection and outstanding saves. Leaving the page flushes pending edits with a keepalive request. The same-origin token, exact content version, serialized writes and repeated path checks reject foreign, concurrent, stale and redirected requests. A conflict reports an unsaved draft and refuses further source writes until reload; it does not silently pretend browser persistence is a successful project save. Live draft values remain available for inspection/download.

## Suggestion handoff

Place `TweakSuggestionBar` first in the panel with three short, expressive suggestions about the design content. A type/pause/erase cycle plays once per distinct suggestion set in the session; changing the suggestions starts a new cycle. Default pacing uses a 400 ms lead-in, 35–55 ms character intervals, a 1800 ms hold, 22 ms erasure and a 28 ms placeholder reveal. Scheduling and slicing share UTF-16 string offsets, so emoji-bearing suggestions reach their complete final text during the hold and erase without stale trailing text. Reduced motion displays the static prompt. Clicking freezes the complete current suggestion as ghost text; Tab accepts it, Escape clears it, and Enter prepares a draft. Editing the text produces a free-text draft. Ideas prepares a request to replace the three suggestions.

The default handoff copies the actual draft to the clipboard and displays it for review. Paste into Codex, review and send. If clipboard access fails, the text remains selectable in the panel. This replacement does not automatically insert into Codex's composer or send a chat message. A host application may provide `onRequest({text,kind})` to deliver a draft to its own review composer; this replaces clipboard delivery. `codex-tweak-request` exposes the same local request with kind `suggestion`, `freetext` or `ideas`. No model call or completed design change is simulated.

## Verification and remaining work

Tests exercise typed edits, palette shape, range/select/toggle controls, number and segmented pointer scrubbing, live component preservation, drag/clamping, keyboard/focus, print, JSON downloads, browser persistence, legacy/JSON source writes, script-ending escapes, stale/foreign/concurrent rejection, storage recovery and actual clipboard draft delivery. The showcase is `tweaks.html`.

Automatic native Codex-composer insertion is not available. Clipboard handoff requires the user's paste/review/send step. Verify additional browsers/touch devices and multiple independently mounted panels when those layouts are needed.
