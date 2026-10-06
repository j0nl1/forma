// Independent continuous-composition runtime. Bundle this module with local
// React; do not load a second animation engine on the same page.
import React from "react";
import { flushSync } from "react-dom";
import { ExportPanel, useVideoExport } from "./motion-export.jsx";
import { createFrameController } from "./motion-frame.js";
import { embedMotionFonts } from "./motion-fonts.js";
import { fontOrigins as normalizeFontOrigins } from "../shared/font-css.js";
import captionFont from "../shared/fonts/inter-medium.woff2";
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
  captionFrame,
} from "../../../../core/src/timeline/motion-model.js";
export {
  clamp,
  Easing,
  interpolate,
  animate,
} from "../../../../core/src/timeline/motion-model.js";
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

export {
  CompositionProvider,
  useClip,
  ClipInspector,
} from "./composition-components.jsx";
export {
  compileComposition,
  parseClipDocument,
  clipFrame,
  playbackTime,
} from "../../../../core/src/timeline/composition-model.js";
export {
  createAudioPreview,
  compileAudioSchedule,
} from "../../../../core/src/timeline/audio-plan.js";
export const FrameContext = React.createContext(null);
export function useFrameRenderer(render, { id } = {}) {
  const controller = React.useContext(FrameContext);
  const timeline = useTimeline();
  const fallbackId = React.useId();
  const latest = React.useRef(render);
  latest.current = render;
  React.useLayoutEffect(() => {
    if (!controller) throw new Error("useFrameRenderer requires a Stage");
    return controller.register(id ?? fallbackId, (context) =>
      latest.current(context),
    );
  }, [controller, id, fallbackId]);
  React.useLayoutEffect(() => {
    controller?.revise();
  });
  React.useLayoutEffect(() => {
    if (timeline.capture) return;
    const abort = new AbortController();
    Promise.resolve(
      latest.current({
        time: timeline.time,
        signal: abort.signal,
        commit: (draw) => {
          if (!abort.signal.aborted) return draw();
        },
      }),
    ).catch((error) => {
      if (!abort.signal.aborted) console.error(error);
    });
    return () => abort.abort();
  });
}
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
.cd-transport input[type=range]{flex:1;width:100px;min-width:80px;padding:0;border:0;background:transparent;touch-action:none}.cd-time{font:12px ui-monospace,monospace;min-width:65px;font-variant-numeric:tabular-nums}
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
function useInlineFonts(svg, origins) {
  const key = JSON.stringify(normalizeFontOrigins(origins));
  React.useEffect(() => {
    const root = svg.current;
    const controller = new AbortController();
    let cleanup;
    delete root.dataset.codexFontsInlined;
    delete root.dataset.codexFontWarning;
    const pending = embedMotionFonts(root, {
      origins: JSON.parse(key),
      signal: controller.signal,
    })
      .then((remove) => {
        cleanup = remove;
        if (controller.signal.aborted) remove();
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          root.dataset.codexFontWarning = error.message;
          root.dataset.codexFontsInlined = "true";
        }
      });
    root.codexFontsReady = pending;
    return () => {
      controller.abort();
      cleanup?.();
      if (root.codexFontsReady === pending) delete root.codexFontsReady;
    };
  }, [key]);
}

export function Shot({ from, to, children, style, ...rest }) {
  const { T } = useComposition();
  const start = +from;
  const visible = Number.isFinite(start) && T >= start && T < +(to ?? Infinity);
  return (
    <div
      {...rest}
      style={{
        position: "absolute",
        inset: 0,
        ...style,
        visibility: visible ? "visible" : "hidden",
      }}
    >
      {children}
    </div>
  );
}
export function Captions({ items = [], style }) {
  const { T } = useComposition();
  const frame = captionFrame(items, T);
  if (!frame) return null;
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
        font: "500 30px Inter, system-ui, sans-serif",
        color: "#f6f4ef",
        textShadow: "0 1px 14px rgb(0 0 0 / 45%)",
        opacity: frame.opacity,
        ...style,
      }}
    >
      {frame.item.text}
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
  const pointer = React.useRef(null);
  const position = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return bounds.width > 0
      ? clamp((event.clientX - bounds.left) / bounds.width) * duration
      : 0;
  };
  const finish = (event) => {
    if (
      pointer.current !== null &&
      event &&
      pointer.current !== event.pointerId
    )
      return;
    pointer.current = null;
    onHover?.(null);
  };
  return (
    <div className="cd-transport cd-chrome">
      <button
        style={{ minWidth: 64 }}
        onClick={onPlayPause}
        aria-label={playing ? "Pause" : "Play"}
      >
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
        onChange={(event) => {
          if (pointer.current !== null) return;
          onHover?.(null);
          onSeek(+event.target.value);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || pointer.current !== null) return;
          // Keep one proportional seek contract for mouse, pen and touch.
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current = event.pointerId;
          onHover?.(null);
          onSeek(position(event));
        }}
        onPointerMove={(event) => {
          if (pointer.current === event.pointerId) onSeek(position(event));
          else if (
            pointer.current === null &&
            !event.buttons &&
            event.pointerType !== "touch"
          )
            onHover?.(position(event));
        }}
        onPointerLeave={() => onHover?.(null)}
        onPointerUp={(event) => {
          if (pointer.current !== event.pointerId) return;
          onSeek(position(event));
          finish();
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onBlur={() => onHover?.(null)}
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
  const finishDrag = (event) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };
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
                if (event.button !== 0 || drag.current) return;
                setSelected(i);
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                  pointerId: event.pointerId,
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
                if (drag.current?.pointerId !== event.pointerId) return;
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
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onLostPointerCapture={finishDrag}
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
  fontOrigins = [],
  children,
  derived,
  onScenes,
  onPlayback,
  source,
  onSave,
  onExport,
  exportBusy,
  exportProgress,
  onCancelExport,
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
  const [captionFace] = React.useState(() =>
    [...document.fonts].some(
      (face) =>
        face.family.replace(/^["']|["']$/g, "").toLowerCase() === "inter",
    )
      ? ""
      : `@font-face{font-family:Inter;font-weight:500;font-style:normal;font-display:swap;src:url("${captionFont}") format("woff2")}`,
  );
  const [exportPanel, setExportPanel] = React.useState(false);
  const root = React.useRef(null),
    viewport = React.useRef(null),
    svg = React.useRef(null);
  const live = React.useRef(null),
    passes = React.useRef(0),
    externalTimer = React.useRef(null);
  const clearExternal = () => {
    clearTimeout(externalTimer.current);
    externalTimer.current = null;
    setExtPlaying(false);
  };
  const seek = (value, external = false) => {
    frameController.invalidate();
    setPlaying(false);
    setHover(null);
    setTime(clamp(Number(value) || 0, 0, duration));
    clearTimeout(externalTimer.current);
    setExtPlaying(external);
    if (external)
      externalTimer.current = setTimeout(() => setExtPlaying(false), 400);
  };
  const changePlaying = (value) => {
    clearExternal();
    setHover(null);
    const next = typeof value === "function" ? value(playing) : !!value;
    if (next && !playing && time >= duration) setTime(0);
    setPlaying(next);
  };
  const playPause = () => changePlaying(!playing);
  live.current = {
    time,
    frameTime: hover ?? time,
    duration,
    playing,
    width,
    height,
    fps: Number(fps) || 60,
    capture,
    seek,
    playPause,
    changePlaying,
    clearExternal,
    policy,
  };
  const [frameController] = React.useState(() =>
    createFrameController({
      seek: (t) => flushSync(() => live.current.seek(t)),
      root: () => svg.current,
      getTime: () => live.current.frameTime,
    }),
  );
  React.useLayoutEffect(() => {
    frameController.revise();
  }, [
    duration,
    width,
    height,
    JSON.stringify(derived?.scenes),
    JSON.stringify(policy),
    hover,
  ]);
  useInlineFonts(svg, fontOrigins);
  React.useEffect(() => {
    if (!capture) storeState(persistKey + ":time", time);
  }, [time, persistKey, capture]);
  React.useEffect(() => {
    storeState(persistKey + ":editor", editor);
  }, [editor, persistKey]);
  React.useEffect(() => {
    frameController.invalidate();
    setTime((t) => clamp(t, 0, duration));
    clearExternal();
  }, [duration]);
  React.useLayoutEffect(() => {
    const measure = () => {
      const available = viewport.current.getBoundingClientRect();
      setScale(
        capture
          ? 1
          : Math.min(available.width / width, available.height / height),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current);
    measure();
    return () => observer.disconnect();
  }, [width, height, capture, editor, exportPanel]);
  React.useEffect(() => {
    if (!playing) return;
    passes.current = 0;
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
        frameController.invalidate();
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
  }, [playing, duration, policy.mode, policy.count]);
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
      seek: (t) => {
        frameController.invalidate();
        flushSync(() => live.current.seek(t));
      },
      setTime: (t) => {
        frameController.invalidate();
        flushSync(() => live.current.seek(t));
      },
      beginFrame: (t) => frameController.begin(t),
      completeFrame: (token, options) =>
        frameController.complete(token, options),
      verifyFrame: (token) => frameController.verify(token),
      setPlaying: (value) => flushSync(() => live.current.changePlaying(value)),
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
      frameController.invalidate("Motion stage detached");
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
      <style>{captionFace + css}</style>
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
                  capture,
                  duration,
                  playing,
                  extPlaying,
                  playback: policy,
                  setTime: (t) => seek(t),
                  setPlaying: changePlaying,
                }}
              >
                <FrameContext.Provider value={frameController}>
                  {children}
                </FrameContext.Provider>
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
          progress={exportProgress}
          onCancel={onCancelExport}
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
    const root = window.codexTimeline?.root;
    const saved = (event) => {
      const value = event.detail;
      if (
        binding.current &&
        JSON.stringify({ scenes: value.scenes, playback: value.playback }) ===
          binding.current.last
      )
        binding.current.version = value.version;
    };
    root?.addEventListener("studio-composition-source-saved", saved);
    return () =>
      root?.removeEventListener("studio-composition-source-saved", saved);
  }, [source]);
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
        window.codexTimeline?.root.dispatchEvent(
          new CustomEvent("studio-motion-source-saved", {
            detail: { version: result.version, ...pending },
          }),
        );
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
  const {
    busy: exportBusy,
    progress: exportProgress,
    cancel: onCancelExport,
    exportVideo,
  } = useVideoExport({ source, binding, save, saving, timing, setStatus });
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
      exportProgress={exportProgress}
      onCancelExport={onCancelExport}
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
