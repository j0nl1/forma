import React from "react";
import { createRoot } from "react-dom/client";
import {
  CompositionStage,
  WatercolorPainting,
  WatercolorReveal,
  useComposition,
} from "../../skills/codex-design/assets/starters/animations.jsx";
import { paintBird } from "./painting.js";

function Piece() {
  const { CUES } = useComposition();
  const shared = {
    painting: paintBird,
    from: CUES.Paint,
    to: CUES.Hold,
    width: 360,
    height: 480,
    scale: 1,
    quality: 1,
    alt: "A watercolor bird resting on a branch",
  };
  return (
    <div style={{ color: "#272f36", fontFamily: "system-ui" }}>
      <h1
        style={{
          position: "absolute",
          top: 25,
          left: 65,
          font: "42px Georgia,serif",
          margin: 0,
        }}
      >
        A moment, painted slowly.
      </h1>
      <div
        style={{
          position: "absolute",
          left: 115,
          top: 135,
          width: 360,
          height: 480,
        }}
      >
        <WatercolorPainting {...shared} />
        <p>Layered brushstrokes</p>
      </div>
      <div
        style={{
          position: "absolute",
          left: 700,
          top: 135,
          width: 360,
          height: 480,
        }}
      >
        <WatercolorReveal {...shared} steps={48} format="image/png" />
        <p>Complete painting</p>
      </div>
    </div>
  );
}
document.querySelector("#save-painting").onclick = () => {
  const anchor = document.createElement("a");
  anchor.download = "watercolor-bird.png";
  anchor.href = window.CodexWatercolorKit.frame(paintBird, {
    width: 360,
    height: 480,
    scale: 2,
    seed: 7,
  });
  anchor.click();
};
createRoot(document.querySelector("#root")).render(
  <CompositionStage
    width={1280}
    height={720}
    bg="#f4f1e8"
    scenes={window.CODEX_SCENES}
    playback={window.CODEX_PLAYBACK}
    autoplay={false}
    persistKey="watercolor-bird"
  >
    <Piece />
  </CompositionStage>,
);
