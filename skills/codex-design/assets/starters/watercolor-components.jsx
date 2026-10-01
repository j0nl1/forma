// Painting components remain pure at every authored timestamp. Bitmap sources
// are generated synchronously for a seek; background warming is only a cache.
import React from "react";
import "./watercolor-kit.js";
import { useComposition } from "./animations.jsx";
import { clamp, Easing } from "./motion-model.js";

const SheetContext = React.createContext(null);
const kit = () => window.CodexWatercolorKit;
function options(props = {}, reveal = false) {
  const width = Number(props.width ?? 900),
    height = Number(props.height ?? 1200);
  return {
    width,
    height,
    scale: Math.min(
      Number(props.scale ?? (reveal ? Math.min(2, devicePixelRatio || 1) : 1)),
      Math.sqrt(11000000 / (width * height)),
    ),
    seed: props.seed === undefined ? undefined : Number(props.seed),
    quality: props.quality === undefined ? undefined : Number(props.quality),
  };
}
function Fallback({ children, style }) {
  return (
    <div
      role="status"
      style={{
        width: "100%",
        aspectRatio: "3 / 4",
        background: "#f4f1e8",
        color: "#8a8270",
        font: "12px system-ui",
        display: "grid",
        placeItems: "center",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
export function useWatercolorLayers(painting, props = {}) {
  const o = options(props),
    key = JSON.stringify(o);
  return React.useMemo(() => {
    try {
      return typeof painting === "function" ? kit().layers(painting, o) : null;
    } catch {
      return null;
    }
  }, [painting, key]);
}
export function WatercolorSheet({ layers, style, alt = "", children }) {
  if (!layers)
    return (
      <Fallback style={style}>
        A valid watercolor painting is required.
      </Fallback>
    );
  return (
    <SheetContext.Provider value={layers}>
      <div
        data-codex-watercolor-sheet
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: `${layers.width} / ${layers.height}`,
          isolation: "isolate",
          overflow: "hidden",
          ...style,
        }}
      >
        <img
          src={layers.paper}
          alt={alt}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
          }}
        />
        {children}
      </div>
    </SheetContext.Provider>
  );
}
export function WatercolorStroke({ layers, index, at = 1, style }) {
  const inherited = React.useContext(SheetContext),
    value = layers ?? inherited;
  if (!value || index < 0 || index >= value.count || !(at > 0)) return null;
  try {
    const box = value.box(index),
      source = box && value.src(index, clamp(Number(at)));
    if (!source) return null;
    return (
      <img
        src={source}
        alt=""
        data-codex-watercolor-stroke={index}
        data-codex-stroke-kind={value.kind(index)}
        style={{
          position: "absolute",
          display: "block",
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.w * 100}%`,
          height: `${box.h * 100}%`,
          mixBlendMode: value.kind(index) === "reserve" ? "normal" : "multiply",
          pointerEvents: "none",
          ...style,
        }}
      />
    );
  } catch {
    return null;
  }
}
export function WatercolorPainting(props) {
  const { T } = useComposition(),
    from = Number(props.from ?? 0),
    to = Number(props.to ?? from + 6);
  const progress = Easing.easeInOutQuad(
    clamp((T - from) / Math.max(0.001, to - from)),
  );
  const layers = useWatercolorLayers(props.painting, props);
  React.useEffect(() => {
    layers?.warm().catch(() => {});
  }, [layers]);
  const strokes = [];
  if (layers)
    for (let i = 0; i < layers.count; i++) {
      const span = layers.span(i),
        at = clamp(
          (progress - span.from) / Math.max(0.000001, span.to - span.from),
        );
      if (!at) break;
      strokes.push(
        <WatercolorStroke key={i} layers={layers} index={i} at={at} />,
      );
    }
  return (
    <WatercolorSheet layers={layers} style={props.style} alt={props.alt}>
      {strokes}
    </WatercolorSheet>
  );
}
export function WatercolorReveal(props) {
  const { T } = useComposition(),
    from = Number(props.from ?? 0),
    to = Number(props.to ?? from + 6);
  const progress = Easing.easeInOutQuad(
    clamp((T - from) / Math.max(0.001, to - from)),
  );
  const frames =
    Array.isArray(props.frames) && props.frames.length ? props.frames : null;
  const steps = frames
    ? frames.length - 1
    : Math.max(1, Math.round(Number(props.steps ?? 36)));
  const index = Math.min(steps, Math.round(progress * steps));
  const o = {
    ...options(props, true),
    steps,
    type: props.format ?? "image/jpeg",
    quality: props.quality ?? 0.88,
  };
  const key = JSON.stringify(o),
    cache = React.useMemo(() => new Map(), [props.painting, key]);
  React.useEffect(() => {
    if (frames || typeof props.painting !== "function") return;
    let live = true;
    kit()
      .bake(props.painting, o, (i, _steps, image) => {
        if (live) cache.set(i, image);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [props.painting, key, frames]);
  let source = frames?.[index];
  if (!source) {
    if (typeof props.painting !== "function")
      return (
        <Fallback style={props.style}>
          A painting function or baked frames are required.
        </Fallback>
      );
    try {
      if (!cache.has(index))
        cache.set(
          index,
          kit().frame(props.painting, { ...o, at: steps ? index / steps : 1 }),
        );
      source = cache.get(index);
    } catch (error) {
      return (
        <Fallback style={props.style}>
          Painting could not render: {error.message}
        </Fallback>
      );
    }
  }
  return (
    <img
      src={source}
      alt={props.alt ?? ""}
      data-codex-watercolor-reveal
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain",
        ...props.style,
      }}
    />
  );
}
