// Independent continuous-composition runtime. Bundle this module with local
// React; do not load a second animation engine on the same page.
import React from "react";
import { flushSync } from "react-dom";
import {
  clamp,
  Easing,
  interpolate,
  animate,
  parseScenes,
  parsePlayback,
  deriveScenes,
  authoredTime,
  retimeScene,
  advancePlayback,
} from "./motion-model.js";
export { clamp, Easing, interpolate, animate } from "./motion-model.js";
export {
  useWatercolorLayers,
  WatercolorSheet,
  WatercolorStroke,
  WatercolorPainting,
  WatercolorReveal,
} from "./watercolor-components.jsx";
export {
  Sprite,
  SpriteContext,
  useSprite,
  TextSprite,
  ImageSprite,
  RectSprite,
  VideoSprite,
  SceneStage,
  useScene,
} from "./scene-components.jsx";

export const TimelineContext = React.createContext(null);
export const CompositionContext = React.createContext(null);
export const useTimeline = () => React.useContext(TimelineContext);
export const useTime = () => useTimeline().time;
export function useComposition() {
  const value = React.useContext(CompositionContext);
  if (!value) throw new Error("useComposition requires a CompositionStage");
  return value;
}
const format = (time) =>
  `${Math.floor(time / 60)}:${(time % 60).toFixed(2).padStart(5, "0")}`;
function loadState(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function storeState(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage can be unavailable. */
  }
}
function download(name, value) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.download = name;
  anchor.href = url;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const css = `
.cd-motion{position:absolute;inset:0;display:flex;flex-direction:column;background:#0a0a0a;color:#f6f4ef;font:13px system-ui,sans-serif;overflow:hidden}
.cd-motion *{box-sizing:border-box}.cd-motion button,.cd-motion input,.cd-motion select{font:inherit}
.cd-motion button,.cd-motion select{background:#23252a;border:1px solid #454953;border-radius:5px;color:inherit;padding:6px 10px;cursor:pointer}
.cd-motion button:disabled{opacity:.45;cursor:default}.cd-motion input{accent-color:#71a7e8;color:inherit;background:#181a1f;border:1px solid #454953;border-radius:4px;padding:4px;width:100%}
.cd-motion button:focus-visible,.cd-motion input:focus-visible,.cd-motion select:focus-visible{outline:2px solid #71a7e8;outline-offset:2px}
.cd-viewport{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
.cd-canvas{display:block;flex-shrink:0;transform-origin:center;box-shadow:0 20px 60px #0006}
.cd-transport{display:flex;align-items:center;gap:10px;padding:8px 12px;flex-wrap:wrap;flex-shrink:0}
.cd-transport input[type=range]{flex:1;width:100px;min-width:80px;padding:0;border:0;background:transparent}.cd-time{font:12px ui-monospace,monospace;min-width:65px;font-variant-numeric:tabular-nums}
.cd-editor{border-top:1px solid #30343d;padding:12px;flex-shrink:0;max-height:42vh;overflow:auto}
.cd-editor-header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:10px}.cd-editor-header label{display:flex;gap:6px;align-items:center}.cd-editor-header input{width:60px}
.cd-segments{display:flex;height:42px;min-width:250px;border:1px solid #454953;border-radius:5px;overflow:hidden;margin:12px 0}
.cd-segment{min-width:0;display:flex;position:relative;align-items:center;background:#263a52;border-right:1px solid #71849b}
.cd-segment>button:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;background:transparent;border:0;text-align:left;height:100%}
.cd-segment .cd-edge{position:absolute;right:0;top:0;width:9px;height:100%;padding:0;border:0;border-radius:0;background:#83acd05e;cursor:ew-resize;touch-action:none}
.cd-section-fields{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;max-width:900px}.cd-section-fields label{display:flex;flex-direction:column;gap:5px}.cd-description{grid-column:1/-1}.cd-help{color:#a8b2c1;font-size:12px;margin:8px 0 0}.cd-status{color:#d8b785;display:block;margin:8px 0 0}.cd-diagnostics{padding:5px 12px;color:#e8906a;font-size:12px}
.cd-motion[data-capture] .cd-chrome{display:none}.cd-motion[data-capture] .cd-canvas{transform:none!important;box-shadow:none}.cd-motion[data-capture] .cd-viewport{align-items:flex-start;justify-content:flex-start}
@media(max-width:600px){.cd-section-fields{grid-template-columns:1fr 1fr}.cd-description{grid-column:1/-1}.cd-section-fields label:first-child{grid-column:1/-1}.cd-time{min-width:56px}.cd-transport{gap:6px;padding:6px}.cd-editor{max-height:48vh}}
`;

function CompositionClock({
  derived,
  cues,
  playback,
  children,
  unknown,
  onUnknown,
}) {
  const timeline = useTimeline();
  const value = {
    T: authoredTime(derived, timeline.time),
    CUES: cues,
    time: timeline.time,
    duration: timeline.duration,
    authoredTotal: derived.authoredTotal,
    playing: timeline.playing || timeline.extPlaying,
    scenes: derived.scenes,
    sections: derived.sections,
    playback,
  };
  React.useLayoutEffect(() => {
    onUnknown([...unknown.current].sort().join(", "));
  });
  return (
    <CompositionContext.Provider value={value}>
      {children}
    </CompositionContext.Provider>
  );
}
function TimingSync({ onScenes, onPlayback }) {
  const marker = React.useRef(null);
  React.useEffect(() => {
    const root = marker.current.closest(
      "[data-codex-exportable-video-duration]",
    );
    const scenes = (event) => {
      try {
        onScenes(parseScenes(event.detail));
      } catch {
        /* Invalid updates must not disturb a working composition. */
      }
    };
    const playback = (event) => {
      try {
        onPlayback(parsePlayback(event.detail));
      } catch {
        /* Keep the last valid setting. */
      }
    };
    root.addEventListener("codex-timeline-scenes-update", scenes);
    root.addEventListener("codex-timeline-playback-update", playback);
    return () => {
      root.removeEventListener("codex-timeline-scenes-update", scenes);
      root.removeEventListener("codex-timeline-playback-update", playback);
    };
  }, [onScenes, onPlayback]);
  return <span ref={marker} hidden />;
}
function useInlineFonts(svg) {
  React.useEffect(() => {
    const root = svg.current;
    let cancelled = false;
    const rules = [];
    const collect = (list, base) => {
      for (const rule of list) {
        if (rule.type === CSSRule.FONT_FACE_RULE)
          rules.push({ css: rule.cssText, base });
        else if (rule.cssRules) collect(rule.cssRules, base);
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        collect(sheet.cssRules, sheet.href || location.href);
      } catch {
        root.dataset.codexFontWarning =
          "A stylesheet could not be read; keep fonts local for portable SVG";
      }
    }
    (async () => {
      const inline = await Promise.all(
        rules.map(async ({ css, base }) => {
          for (const match of css.matchAll(
            /url\(\s*(["']?)([^"')]+)\1\s*\)/g,
          )) {
            const url = new URL(match[2], base);
            if (url.protocol === "data:") continue;
            if (url.origin !== location.origin) {
              root.dataset.codexFontWarning =
                "A font is remote; download it into the project for portable SVG";
              continue;
            }
            try {
              const response = await fetch(url);
              if (!response.ok) throw new Error("Font unavailable");
              const data = await response.blob();
              const encoded = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(data);
              });
              css = css.replaceAll(match[0], `url("${encoded}")`);
            } catch {
              root.dataset.codexFontWarning =
                "A local font could not be embedded";
            }
          }
          return css;
        }),
      );
      if (cancelled) return;
      const style = document.createElement("style");
      style.textContent = inline.join("\n");
      root.querySelector("foreignObject > div").prepend(style);
      root.dataset.codexFontsInlined = "true";
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}

function ExportPanel({ duration, onExport, busy }) {
  const [format, setFormat] = React.useState("mp4");
  const [fps, setFps] = React.useState(30),
    [crf, setCrf] = React.useState(18),
    [scale, setScale] = React.useState(2);
  const [start, setStart] = React.useState(0),
    [end, setEnd] = React.useState(duration);
  return (
    <form
      className="cd-editor cd-chrome"
      onSubmit={(event) => {
        event.preventDefault();
        onExport({
          format,
          fps,
          crf,
          deviceScaleFactor: scale,
          startMs: start * 1000,
          endMs: Math.min(end, duration) * 1000,
        });
      }}
    >
      <strong>Video export</strong>
      <p className="cd-help">
        Render the saved composition locally. Video is silent.
      </p>
      <div className="cd-section-fields">
        <label>
          Format
          <select
            aria-label="Video format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
            <option value="gif">GIF</option>
          </select>
        </label>
        <label>
          Frames per second
          <input
            aria-label="Video fps"
            type="number"
            min="1"
            max="60"
            required
            value={fps}
            onChange={(e) => setFps(+e.target.value)}
          />
        </label>
        <label>
          Quality (lower is better)
          <input
            aria-label="Video quality"
            type="number"
            min="0"
            max="51"
            required
            value={crf}
            onChange={(e) => setCrf(+e.target.value)}
          />
        </label>
        <label>
          Capture scale
          <input
            aria-label="Capture scale"
            type="number"
            min="1"
            max="3"
            step="0.5"
            required
            value={scale}
            onChange={(e) => setScale(+e.target.value)}
          />
        </label>
        <label>
          Start seconds
          <input
            aria-label="Export start seconds"
            type="number"
            min="0"
            max={duration}
            step="0.01"
            required
            value={start}
            onChange={(e) => setStart(+e.target.value)}
          />
        </label>
        <label>
          End seconds
          <input
            aria-label="Export end seconds"
            type="number"
            min="0.01"
            max={duration}
            step="0.01"
            required
            value={Math.min(end, duration)}
            onChange={(e) => setEnd(+e.target.value)}
          />
        </label>
      </div>
      <button disabled={busy} type="submit" style={{ marginTop: 12 }}>
        {busy ? "Rendering…" : "Render and download"}
      </button>
    </form>
  );
}

export function Shot({ from = 0, to = Infinity, children, style, ...rest }) {
  const { T } = useComposition();
  return (
    <div
      {...rest}
      style={{
        position: "absolute",
        inset: 0,
        ...style,
        visibility: T >= from && T < to ? "visible" : "hidden",
      }}
    >
      {children}
    </div>
  );
}
export function Captions({ items = [], style }) {
  const { T } = useComposition();
  const sorted = items
    .filter((item) => Number.isFinite(item.at))
    .toSorted((a, b) => a.at - b.at);
  const index = sorted.findLastIndex((item) => item.at <= T);
  const item = sorted[index];
  const end = item?.until ?? sorted[index + 1]?.at ?? Infinity;
  if (!item || T >= end) return null;
  const opacity = clamp(Math.min((T - item.at) / 0.18, (end - T) / 0.18));
  return (
    <div
      data-codex-caption
      style={{
        position: "absolute",
        left: "8%",
        right: "8%",
        bottom: "7%",
        textAlign: "center",
        pointerEvents: "none",
        font: "500 30px system-ui",
        color: "#f6f4ef",
        textShadow: "0 1px 14px #0008",
        ...style,
        opacity,
      }}
    >
      {item.text}
    </div>
  );
}

export function PlaybackBar({
  time,
  duration,
  playing,
  onPlayPause,
  onReset,
  onSeek,
  onHover,
  editor,
  onEditor,
}) {
  return (
    <div className="cd-transport cd-chrome">
      <button onClick={onPlayPause} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "Pause" : "Play"}
      </button>
      <button onClick={onReset}>Reset</button>
      <output className="cd-time">{format(time)}</output>
      <input
        type="range"
        aria-label="Timeline position"
        min="0"
        max={duration}
        step="0.01"
        value={time}
        onChange={(event) => onSeek(+event.target.value)}
        onPointerMove={(event) => {
          if (!event.buttons && !playing) {
            const r = event.currentTarget.getBoundingClientRect();
            onHover?.(clamp((event.clientX - r.left) / r.width) * duration);
          }
        }}
        onPointerLeave={() => onHover?.(null)}
      />
      <span className="cd-time">{format(duration)}</span>
      {onEditor && (
        <button aria-pressed={editor} onClick={onEditor}>
          Motion editor
        </button>
      )}
    </div>
  );
}

function TimelineEditor({
  derived,
  playback,
  onScenes,
  onPlayback,
  onSeek,
  onSave,
  status,
  source,
}) {
  const [selected, setSelected] = React.useState(0);
  const [error, setError] = React.useState("");
  const drag = React.useRef(null);
  const index = Math.min(selected, derived.scenes.length - 1);
  const scene = derived.sections[index];
  const change = (duration) => {
    try {
      onScenes(retimeScene(derived.scenes, index, duration));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div className="cd-editor cd-chrome">
      <div className="cd-editor-header">
        <strong>Sections</strong>
        <label>
          Repeat{" "}
          <select
            aria-label="Repeat mode"
            value={playback.mode}
            onChange={(event) =>
              onPlayback(
                event.target.value === "loop"
                  ? { mode: "loop" }
                  : { mode: "times", count: 1 },
              )
            }
          >
            <option value="loop">Loop</option>
            <option value="times">Fixed count</option>
          </select>
        </label>
        {playback.mode === "times" && (
          <label>
            Count{" "}
            <input
              aria-label="Repeat count"
              type="number"
              min="1"
              max="100"
              value={playback.count}
              onChange={(event) => {
                try {
                  onPlayback(
                    parsePlayback({
                      mode: "times",
                      count: +event.target.value,
                    }),
                  );
                } catch (e) {
                  setError(e.message);
                }
              }}
            />
          </label>
        )}
        <button
          onClick={() =>
            download("motion-timing.json", { scenes: derived.scenes, playback })
          }
        >
          Download timing
        </button>
        {source && <button onClick={onSave}>Save now</button>}
      </div>
      <div className="cd-segments">
        {derived.sections.map((section, i) => (
          <div
            className="cd-segment"
            key={i}
            style={{
              flex: section.dur,
              outline: index === i ? "2px solid #91c0ef" : undefined,
              outlineOffset: -2,
            }}
          >
            <button
              aria-label={`Select ${section.name}`}
              onClick={() => {
                setSelected(i);
                onSeek(section.start);
              }}
            >
              {section.name}
            </button>
            <button
              className="cd-edge"
              aria-label={`Stretch ${section.name}`}
              title="Drag to change playback length; authored motion stays complete"
              onPointerDown={(event) => {
                setSelected(i);
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                  x: event.clientX,
                  duration: section.dur,
                  index: i,
                  scenes: derived.scenes,
                  secondsPerPixel:
                    derived.duration /
                    event.currentTarget.parentElement.parentElement.clientWidth,
                };
              }}
              onPointerMove={(event) => {
                if (!drag.current) return;
                const start = drag.current;
                try {
                  onScenes(
                    retimeScene(
                      start.scenes,
                      start.index,
                      Math.max(
                        0.1,
                        Math.round(
                          (start.duration +
                            (event.clientX - start.x) * start.secondsPerPixel) *
                            100,
                        ) / 100,
                      ),
                    ),
                  );
                  setError("");
                } catch (e) {
                  setError(e.message);
                }
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
              onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                  event.preventDefault();
                  change(
                    Math.max(
                      0.1,
                      scene.dur + (event.key === "ArrowRight" ? 0.1 : -0.1),
                    ),
                  );
                }
              }}
            />
          </div>
        ))}
      </div>
      <div className="cd-section-fields">
        <label>
          Section name
          <input
            aria-label="Section name"
            value={scene.name}
            onChange={(event) => {
              try {
                const next = derived.scenes.map((item, i) =>
                  i === index ? { ...item, name: event.target.value } : item,
                );
                onScenes(parseScenes(next));
                setError("");
              } catch (e) {
                setError(e.message);
              }
            }}
          />
        </label>
        <label>
          Playback seconds
          <input
            aria-label="Playback seconds"
            type="number"
            min="0.1"
            max="300"
            step="0.1"
            value={scene.dur}
            onChange={(event) => change(+event.target.value)}
          />
        </label>
        <label>
          Speed
          <input
            aria-label="Section speed"
            type="number"
            min="0.01"
            max="100"
            step="0.1"
            value={Math.round((scene.natural / scene.dur) * 10000) / 10000}
            onChange={(event) => change(scene.natural / +event.target.value)}
          />
        </label>
        <label className="cd-description">
          What happens
          <input
            aria-label="Section description"
            value={scene.desc ?? ""}
            onChange={(event) =>
              onScenes(
                derived.scenes.map((item, i) =>
                  i === index ? { ...item, desc: event.target.value } : item,
                ),
              )
            }
          />
        </label>
      </div>
      <p className="cd-help">
        Drag a section edge or change its speed. Its complete authored motion is
        replayed over the new length. Edits are saved in this browser.
      </p>
      {(error || status) && (
        <output className="cd-status" role="status">
          {error || status}
        </output>
      )}
    </div>
  );
}

export function Stage({
  width = 1280,
  height = 720,
  duration = 10,
  fps = 60,
  capture: captureOption = false,
  background = "#f6f4ef",
  autoplay = true,
  loop = true,
  playback,
  persistKey = "codex-composition",
  children,
  derived,
  onScenes,
  onPlayback,
  source,
  onSave,
  onExport,
  exportBusy,
  status,
  diagnostics = "",
}) {
  width = Number(width);
  height = Number(height);
  autoplay = String(autoplay) !== "false";
  loop = String(loop) !== "false";
  const captureQuery = new URLSearchParams(location.search).get("capture");
  const capture =
    (captureOption != null &&
      captureOption !== false &&
      !["0", "false"].includes(String(captureOption))) ||
    (captureQuery !== null && !["0", "false"].includes(captureQuery)) ||
    document.documentElement.hasAttribute("data-capture");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const policy = parsePlayback(
    playback ?? (loop ? { mode: "loop" } : { mode: "times", count: 1 }),
  );
  const [time, setTime] = React.useState(() =>
    capture
      ? 0
      : reduced
        ? duration
        : clamp(Number(loadState(persistKey + ":time", 0)) || 0, 0, duration),
  );
  const [playing, setPlaying] = React.useState(
    !!autoplay && !capture && !reduced,
  );
  const [extPlaying, setExtPlaying] = React.useState(false);
  const [hover, setHover] = React.useState(null);
  const [editor, setEditor] = React.useState(() =>
    loadState(persistKey + ":editor", true),
  );
  const [scale, setScale] = React.useState(1);
  const [exportPanel, setExportPanel] = React.useState(false);
  const root = React.useRef(null),
    viewport = React.useRef(null),
    svg = React.useRef(null);
  const live = React.useRef(null),
    passes = React.useRef(0),
    externalTimer = React.useRef(null);
  const clearExternal = () => {
    clearTimeout(externalTimer.current);
    setExtPlaying(false);
  };
  const seek = (value, external = false) => {
    setPlaying(false);
    setHover(null);
    setTime(clamp(Number(value) || 0, 0, duration));
    clearTimeout(externalTimer.current);
    setExtPlaying(external);
    if (external)
      externalTimer.current = setTimeout(() => setExtPlaying(false), 400);
  };
  const playPause = () => {
    clearExternal();
    setHover(null);
    if (!playing) {
      passes.current = 0;
      if (time >= duration) setTime(0);
    }
    setPlaying(!playing);
  };
  live.current = {
    time,
    duration,
    playing,
    width,
    height,
    fps: Number(fps) || 60,
    capture,
    seek,
    playPause,
    clearExternal,
    policy,
  };
  useInlineFonts(svg);
  React.useEffect(() => {
    if (!capture) storeState(persistKey + ":time", time);
  }, [time, persistKey, capture]);
  React.useEffect(() => {
    storeState(persistKey + ":editor", editor);
  }, [editor, persistKey]);
  React.useEffect(() => {
    setTime((t) => clamp(t, 0, duration));
    clearExternal();
  }, [duration]);
  React.useLayoutEffect(() => {
    const measure = () =>
      setScale(
        capture
          ? 1
          : Math.min(
              viewport.current.clientWidth / width,
              viewport.current.clientHeight / height,
            ),
      );
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current);
    measure();
    return () => observer.disconnect();
  }, [width, height, capture, editor, exportPanel]);
  React.useEffect(() => {
    if (!playing) return;
    let previous, request;
    const step = (now) => {
      if (previous !== undefined) {
        const state = live.current;
        const next = advancePlayback(
          state.time,
          (now - previous) / 1000,
          state.duration,
          state.policy,
          passes.current,
        );
        passes.current = next.passes;
        // Commit each clock tick before the next tick can read it.
        flushSync(() => {
          setTime(next.time);
          if (!next.playing) setPlaying(false);
        });
        if (!next.playing) return;
      }
      previous = now;
      request = requestAnimationFrame(step);
    };
    request = requestAnimationFrame(step);
    return () => cancelAnimationFrame(request);
  }, [playing]);
  React.useLayoutEffect(() => {
    if (window.codexTimeline || window.__animStage)
      throw new Error("Only one animation engine can own the timeline");
    const bridge = {
      get duration() {
        return live.current.duration;
      },
      get width() {
        return live.current.width;
      },
      get height() {
        return live.current.height;
      },
      get fps() {
        return live.current.fps;
      },
      get captureActive() {
        return live.current.capture;
      },
      get time() {
        return live.current.time;
      },
      root: svg.current,
      seek: (t) => flushSync(() => live.current.seek(t)),
      setTime: (t) => flushSync(() => live.current.seek(t)),
      setPlaying: (value) =>
        flushSync(() => {
          live.current.clearExternal();
          if (value) {
            passes.current = 0;
            if (live.current.time >= live.current.duration) setTime(0);
          }
          setPlaying(!!value);
        }),
    };
    window.codexTimeline = bridge;
    window.__animStage = bridge;
    const onSeek = (event) =>
      flushSync(() =>
        live.current.seek(event.detail?.time, event.detail?.playing === true),
      );
    const node = svg.current;
    node.addEventListener("codex-seek-to-time", onSeek);
    const onKey = (event) => {
      if (
        event.target.closest?.("input,textarea,select,[contenteditable=true]")
      )
        return;
      const state = live.current;
      if (event.code === "Space") {
        event.preventDefault();
        state.playPause();
      } else if (
        ["ArrowLeft", "ArrowRight", "Home", "Digit0"].includes(event.code)
      ) {
        event.preventDefault();
        state.seek(
          event.code === "Home" || event.code === "Digit0"
            ? 0
            : state.time +
                (event.code === "ArrowRight" ? 1 : -1) *
                  (event.shiftKey ? 1 : 0.1),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      if (window.codexTimeline === bridge) delete window.codexTimeline;
      if (window.__animStage === bridge) delete window.__animStage;
      node.removeEventListener("codex-seek-to-time", onSeek);
      window.removeEventListener("keydown", onKey);
      clearTimeout(externalTimer.current);
    };
  }, []);
  const displayed = hover ?? time;
  return (
    <div
      ref={root}
      className="cd-motion"
      data-capture={capture ? "" : undefined}
    >
      <style>{css}</style>
      <div ref={viewport} className="cd-viewport">
        <svg
          ref={svg}
          className="cd-canvas"
          width={width}
          height={height}
          data-codex-exportable-video-duration={duration}
          data-codex-sync-seek="true"
          data-codex-timeline-scenes={
            derived ? JSON.stringify(derived.scenes) : undefined
          }
          data-codex-timeline-playback={JSON.stringify(policy)}
          style={{ transform: `scale(${scale})` }}
        >
          <foreignObject width="100%" height="100%">
            <div
              xmlns="http://www.w3.org/1999/xhtml"
              style={{
                width,
                height,
                position: "relative",
                overflow: "hidden",
                background,
              }}
            >
              <TimelineContext.Provider
                value={{
                  time: displayed,
                  duration,
                  playing,
                  extPlaying,
                  playback: policy,
                  setTime: (t) => seek(t),
                  setPlaying,
                }}
              >
                {children}
              </TimelineContext.Provider>
            </div>
          </foreignObject>
        </svg>
      </div>
      {diagnostics && (
        <div className="cd-diagnostics cd-chrome" role="status">
          Unknown scene cues: {diagnostics}
        </div>
      )}
      <PlaybackBar
        time={displayed}
        duration={duration}
        playing={playing}
        onPlayPause={playPause}
        onReset={() => seek(0)}
        onSeek={(t) => seek(t)}
        onHover={setHover}
        editor={editor}
        onEditor={derived ? () => setEditor(!editor) : undefined}
      />
      {source && (
        <div className="cd-transport cd-chrome">
          <button
            aria-expanded={exportPanel}
            onClick={() => {
              seek(time);
              setExportPanel(!exportPanel);
            }}
          >
            Export video
          </button>
          {!editor && status && <output role="status">{status}</output>}
        </div>
      )}
      {source && exportPanel && (
        <ExportPanel
          duration={duration}
          onExport={onExport}
          busy={exportBusy}
        />
      )}
      {editor && derived && (
        <TimelineEditor
          derived={derived}
          playback={policy}
          onScenes={(next) => {
            seek(time);
            onScenes(next);
          }}
          onPlayback={onPlayback}
          onSeek={(t) => seek(t)}
          source={source}
          onSave={onSave}
          status={status}
        />
      )}
    </div>
  );
}

export function CompositionStage({
  scenes,
  playback = { mode: "loop" },
  persistKey = "codex-composition",
  children,
  bg = "#0b0b0e",
  source = false,
  onTimingChange,
  ...props
}) {
  const signature = JSON.stringify([scenes, playback]);
  const initial = () => {
    const cached = source ? null : loadState(persistKey + ":timing", null);
    try {
      if (cached?.signature === signature)
        return {
          scenes: parseScenes(cached.scenes),
          playback: parsePlayback(cached.playback),
        };
    } catch {
      /* Ignore invalid saved data. */
    }
    return { scenes: parseScenes(scenes), playback: parsePlayback(playback) };
  };
  const [timing, setTiming] = React.useState(initial);
  const [diagnostics, setDiagnostics] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [exportBusy, setExportBusy] = React.useState(false);
  const binding = React.useRef(null);
  const saveQueue = React.useRef(null);
  const saving = React.useRef(false);
  const unknown = React.useRef(new Set());
  const derived = React.useMemo(() => {
    unknown.current.clear();
    return deriveScenes(timing.scenes);
  }, [timing.scenes]);
  const cues = React.useMemo(
    () =>
      new Proxy(derived.cues, {
        get(target, key) {
          if (typeof key !== "string" || Object.hasOwn(target, key))
            return target[key];
          if (
            key.startsWith("$$") ||
            key.startsWith("@@") ||
            [
              "then",
              "toJSON",
              "toString",
              "valueOf",
              "constructor",
              "hasOwnProperty",
              "isPrototypeOf",
              "propertyIsEnumerable",
              "toLocaleString",
            ].includes(key)
          )
            return undefined;
          unknown.current.add(key);
          return NaN;
        },
      }),
    [derived],
  );
  React.useEffect(() => {
    storeState(persistKey + ":timing", { ...timing, signature });
    onTimingChange?.(timing);
  }, [timing, signature]);
  React.useEffect(() => {
    if (!source) return;
    let alive = true;
    fetch(typeof source === "string" ? source : "/__codex_motion", {
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Source editing is unavailable on this preview");
        return response.json();
      })
      .then((value) => {
        if (alive) {
          const next = {
            scenes: parseScenes(value.scenes),
            playback: parsePlayback(value.playback),
          };
          binding.current = { ...value, last: JSON.stringify(next) };
          setTiming(next);
          setStatus(
            "Source connected. Timing edits save automatically to this document.",
          );
        }
      })
      .catch((error) => {
        if (alive) setStatus(error.message);
      });
    return () => {
      alive = false;
    };
  }, [source]);
  const save = async (next = timing) => {
    if (!binding.current) {
      setStatus("Start preview.mjs with --motion-file for source editing");
      return;
    }
    saveQueue.current = next;
    if (saving.current) return;
    saving.current = true;
    try {
      while (saveQueue.current) {
        const pending = saveQueue.current;
        saveQueue.current = null;
        if (JSON.stringify(pending) === binding.current.last) continue;
        const response = await fetch(
          typeof source === "string" ? source : "/__codex_motion",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Codex-Motion-Token": binding.current.token,
            },
            body: JSON.stringify({
              ...pending,
              version: binding.current.version,
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        binding.current = {
          ...binding.current,
          version: result.version,
          last: JSON.stringify(pending),
        };
        setStatus("Timing saved to source. Reloading preserves this edit.");
      }
    } catch (error) {
      binding.current = null;
      saveQueue.current = null;
      setStatus(error.message);
    } finally {
      saving.current = false;
    }
  };
  React.useEffect(() => {
    if (
      !source ||
      !binding.current ||
      JSON.stringify(timing) === binding.current.last
    )
      return;
    const timer = setTimeout(() => save(timing), 250);
    return () => clearTimeout(timer);
  }, [timing, source]);
  const exportVideo = async (options) => {
    if (!binding.current) {
      setStatus("Start preview.mjs with --motion-file for local video export");
      return;
    }
    setExportBusy(true);
    setStatus("Rendering video locally…");
    try {
      await save(timing);
      while (saving.current)
        await new Promise((resolve) => setTimeout(resolve, 25));
      if (!binding.current)
        throw new Error("Resolve the source edit before exporting");
      const response = await fetch(
        (typeof source === "string" ? source : "/__codex_motion") + "/export",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Codex-Motion-Token": binding.current.token,
          },
          body: JSON.stringify(options),
        },
      );
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob()),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `animation.${options.format}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const warning = response.headers.get("X-Codex-Export-Warnings");
      setStatus(
        warning
          ? `Video downloaded. ${warning}`
          : "Video rendered and downloaded.",
      );
    } catch (error) {
      setStatus(error.message);
    } finally {
      setExportBusy(false);
    }
  };
  return (
    <Stage
      {...props}
      persistKey={persistKey}
      background={bg}
      duration={derived.duration}
      playback={timing.playback}
      derived={derived}
      diagnostics={diagnostics}
      source={source}
      status={status}
      onSave={() => save()}
      onExport={exportVideo}
      exportBusy={exportBusy}
      onScenes={(value) =>
        setTiming((old) => ({ ...old, scenes: parseScenes(value) }))
      }
      onPlayback={(value) =>
        setTiming((old) => ({ ...old, playback: parsePlayback(value) }))
      }
    >
      <CompositionClock
        derived={derived}
        cues={cues}
        playback={timing.playback}
        unknown={unknown}
        onUnknown={setDiagnostics}
      >
        {children}
      </CompositionClock>
      <TimingSync
        onScenes={(value) => setTiming((old) => ({ ...old, scenes: value }))}
        onPlayback={(value) =>
          setTiming((old) => ({ ...old, playback: value }))
        }
      />
    </Stage>
  );
}
