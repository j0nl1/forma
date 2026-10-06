// Independently implemented sprite and scene contracts share the same clock,
// transport and source editor as continuous compositions.
import React from "react";
import {
  CompositionStage,
  CompositionContext,
  TimelineContext,
  useComposition,
  useTimeline,
  useTime,
} from "./animations.jsx";
import {
  clamp,
  Easing,
  parseScenes,
  parsePlayback,
} from "../../../../core/src/timeline/motion-model.js";

export const SpriteContext = React.createContext({
  localTime: 0,
  progress: 0,
  duration: 0,
});
const SceneContext = React.createContext(null);
export const useSprite = () => React.useContext(SpriteContext);
export const useScene = () => React.useContext(SceneContext);

export function Sprite({
  start = 0,
  end = Infinity,
  keepMounted = false,
  children,
}) {
  const time = useTime(),
    duration = end - start;
  const visible = time >= start && time <= end;
  const localTime = Math.max(0, time - start);
  const value = {
    localTime,
    duration,
    progress:
      duration > 0 && Number.isFinite(duration)
        ? clamp(localTime / duration)
        : 0,
    visible,
  };
  return visible || keepMounted ? (
    <SpriteContext.Provider value={value}>
      {typeof children === "function" ? children(value) : children}
    </SpriteContext.Provider>
  ) : null;
}

function phase(localTime, duration, entryDur, exitDur) {
  if (localTime < entryDur) return { entry: clamp(localTime / entryDur) };
  const exitStart = Math.max(0, duration - exitDur);
  if (localTime > exitStart)
    return { exit: clamp((localTime - exitStart) / exitDur) };
  return {
    hold:
      exitStart > entryDur
        ? (localTime - entryDur) / (exitStart - entryDur)
        : 0,
  };
}
const positioned = (x, y, style) => ({
  position: "absolute",
  left: x,
  top: y,
  ...style,
});
export function TextSprite({
  text,
  x = 0,
  y = 0,
  size = 48,
  color = "#111",
  font = "Inter, system-ui, sans-serif",
  weight = 600,
  entryDur = 0.45,
  exitDur = 0.35,
  entryEase = Easing.easeOutBack,
  exitEase = Easing.easeInCubic,
  align = "left",
  letterSpacing = "-0.01em",
}) {
  const { localTime, duration } = useSprite();
  const p = phase(localTime, duration, entryDur, exitDur);
  const entry = p.entry === undefined ? null : entryEase(p.entry);
  const exit = p.exit === undefined ? null : exitEase(p.exit);
  const opacity = entry ?? (exit === null ? 1 : 1 - exit);
  const offset =
    entry === null ? (exit === null ? 0 : -exit * 8) : (1 - entry) * 16;
  return (
    <div
      data-codex-text-sprite
      style={positioned(x, y, {
        opacity,
        transform: `translate(${align === "center" ? "-50%" : align === "right" ? "-100%" : "0"}, ${offset}px)`,
        color,
        fontFamily: font,
        fontWeight: weight,
        fontSize: size,
        letterSpacing,
        whiteSpace: "pre",
        lineHeight: 1.1,
        willChange: "transform, opacity",
      })}
    >
      {text}
    </div>
  );
}
export function ImageSprite({
  src,
  x = 0,
  y = 0,
  width = 400,
  height = 300,
  entryDur = 0.6,
  exitDur = 0.4,
  kenBurns = false,
  kenBurnsScale = 1.08,
  radius = 12,
  fit = "cover",
  placeholder = null,
}) {
  const { localTime, duration } = useSprite();
  const p = phase(localTime, duration, entryDur, exitDur);
  const entry = p.entry === undefined ? null : Easing.easeOutCubic(p.entry);
  const exit = p.exit === undefined ? null : Easing.easeInCubic(p.exit);
  const opacity = entry ?? (exit === null ? 1 : 1 - exit);
  const scale =
    entry !== null
      ? 0.96 + 0.04 * entry
      : exit !== null
        ? (kenBurns ? kenBurnsScale : 1) + 0.02 * exit
        : kenBurns
          ? 1 + (kenBurnsScale - 1) * p.hold
          : 1;
  return (
    <div
      data-codex-image-sprite
      style={positioned(x, y, {
        width,
        height,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "center",
        borderRadius: radius,
        overflow: "hidden",
        willChange: "transform, opacity",
      })}
    >
      {placeholder ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            placeItems: "center",
            background:
              "repeating-linear-gradient(135deg, #e9e6df 0 10px, #dcd8cf 10px 20px)",
            color: "#6b6458",
            font: "13px ui-monospace, monospace",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {placeholder.label || "image"}
        </div>
      ) : (
        <img
          src={src}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: fit,
            display: "block",
          }}
        />
      )}
    </div>
  );
}
export function RectSprite({
  x = 0,
  y = 0,
  width = 100,
  height = 100,
  color = "#111",
  radius = 8,
  entryDur = 0.4,
  exitDur = 0.3,
  render,
}) {
  const context = useSprite();
  const p = phase(context.localTime, context.duration, entryDur, exitDur);
  const entry = p.entry === undefined ? null : Easing.easeOutBack(p.entry);
  const exit = p.exit === undefined ? null : Easing.easeInQuad(p.exit);
  return (
    <div
      data-codex-rect-sprite
      style={positioned(x, y, {
        width,
        height,
        background: color,
        borderRadius: radius,
        opacity: entry !== null ? p.entry : exit === null ? 1 : 1 - exit,
        transform: `scale(${entry !== null ? 0.4 + 0.6 * entry : exit === null ? 1 : 1 - 0.15 * exit})`,
        transformOrigin: "center",
        willChange: "transform, opacity",
        ...render?.(context),
      })}
    />
  );
}

export function VideoSprite({
  src,
  start = 0,
  end,
  speed = 1,
  style,
  ...rest
}) {
  start = Number(start) || 0;
  speed = Number(speed) || 1;
  end = end == null ? undefined : Number(end) || undefined;
  const time = useTime(),
    span = Math.max(0.001, (end ?? start + 1) - start);
  const target = start + ((time * speed) % span);
  const node = React.useRef(null),
    desired = React.useRef(target);
  desired.current = target;
  React.useLayoutEffect(() => {
    const video = node.current;
    const sync = () => {
      video.pause();
      if (
        video.readyState >= 2 &&
        Math.abs(video.currentTime - desired.current) > 0.001
      )
        video.currentTime = desired.current;
    };
    const events = ["loadeddata", "canplay"];
    events.forEach((event) => video.addEventListener(event, sync));
    sync();
    return () =>
      events.forEach((event) => video.removeEventListener(event, sync));
  }, [src, target]);
  return (
    <video
      ref={node}
      src={src}
      muted
      playsInline
      preload="auto"
      data-codex-video-target={target}
      data-codex-exportable-video-play-start={start}
      data-codex-exportable-video-play-end={end ?? start + span}
      data-codex-exportable-video-play-speed={speed}
      style={{ display: "block", objectFit: "cover", ...style }}
      {...rest}
    />
  );
}

function sceneAt(composition) {
  const { sections, scenes, time, duration } = composition;
  let index = sections.findIndex((s) => time < s.start + s.dur);
  if (index < 0) index = sections.length - 1;
  const section = sections[index];
  const progress = clamp((time - section.start) / section.dur);
  return {
    scene: scenes[index],
    localTime: progress * section.natural,
    progress,
    dur: section.natural,
    index,
    count: sections.length,
    total: duration,
  };
}
function SceneSwitch({ map, transition }) {
  const composition = useComposition(),
    timeline = useTimeline();
  const scene = sceneAt(composition);
  const committed = React.useRef(null);
  const [, nudge] = React.useReducer((n) => n + 1, 0);
  const playing = timeline.playing || timeline.extPlaying;
  const now = performance.now(),
    previous = committed.current;
  const Component = Object.hasOwn(map ?? {}, scene.scene.name)
    ? map[scene.scene.name]
    : null;
  const inner = (
    <TimelineContext.Provider value={timeline}>
      <CompositionContext.Provider value={composition}>
        <SceneContext.Provider value={scene}>
          {Component ? (
            <Component {...scene} />
          ) : (
            <div
              role="status"
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                color: "#c96442",
                font: "16px system-ui",
              }}
            >
              No component is mapped to scene “{scene.scene.name}”.
            </div>
          )}
        </SceneContext.Provider>
      </CompositionContext.Provider>
    </TimelineContext.Provider>
  );
  let overlap = previous?.overlap ?? null;
  const sameTiming = previous?.scenes === composition.scenes;
  if (transition !== "overlap" || !playing || !sameTiming) overlap = null;
  else if (previous.index !== scene.index) {
    const elapsed = timeline.time - previous.time;
    const forward =
      scene.index === previous.index + 1 && elapsed > 0 && elapsed <= 0.5;
    const policy = composition.playback;
    const wrapping = policy.mode === "loop" || policy.count > 1;
    const wrapElapsed = timeline.time + composition.duration - previous.time;
    const seam =
      wrapping &&
      previous.index === scene.count - 1 &&
      scene.index === 0 &&
      timeline.time > 0 &&
      timeline.time <= 0.5 &&
      wrapElapsed > 0 &&
      wrapElapsed <= 0.5;
    overlap =
      forward || seam
        ? {
            index: previous.index,
            to: scene.index,
            inner: previous.inner,
            started: now,
            ticks: 0,
          }
        : null;
  } else if (overlap && timeline.time !== previous.time)
    overlap = { ...overlap, ticks: overlap.ticks + 1 };
  if (
    overlap &&
    (overlap.to !== scene.index ||
      overlap.ticks >= 2 ||
      now - overlap.started >= 500)
  )
    overlap = null;
  React.useLayoutEffect(() => {
    committed.current = {
      index: scene.index,
      time: timeline.time,
      inner,
      scenes: composition.scenes,
      overlap,
    };
  });
  const expiry = overlap?.started;
  React.useEffect(() => {
    if (expiry === undefined) return;
    const timer = setTimeout(
      nudge,
      Math.max(0, expiry + 517 - performance.now()),
    );
    return () => clearTimeout(timer);
  }, [expiry]);
  const layer = (index, content, frozen, zIndex) => (
    <div
      key={index}
      data-codex-scene-layer={index}
      data-codex-scene-frozen={frozen ? "true" : "false"}
      style={{
        position: "absolute",
        inset: 0,
        zIndex,
        pointerEvents: frozen ? "none" : undefined,
      }}
    >
      {content}
    </div>
  );
  return (
    <>
      {overlap && layer(overlap.index, overlap.inner, true, 0)}
      {layer(scene.index, inner, false, overlap ? 1 : undefined)}
    </>
  );
}

export function SceneStage({
  scenes,
  children,
  transition = "cut",
  loop = true,
  playback,
  ...props
}) {
  let effective;
  try {
    parseScenes(scenes);
  } catch (error) {
    return (
      <div role="status">
        SceneStage needs a valid scene list: {error.message}
      </div>
    );
  }
  try {
    effective = parsePlayback(playback);
  } catch {
    effective = { mode: String(loop) === "false" ? "times" : "loop", count: 1 };
  }
  // An absent playback setting follows the older loop prop.
  if (playback == null)
    effective =
      String(loop) === "false" ? { mode: "times", count: 1 } : { mode: "loop" };
  return (
    <CompositionStage
      {...props}
      scenes={scenes}
      playback={effective}
      loop={loop}
    >
      <SceneSwitch map={children} transition={transition} />
    </CompositionStage>
  );
}
