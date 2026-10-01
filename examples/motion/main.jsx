import React from "react";
import { createRoot } from "react-dom/client";
import {
  CompositionStage,
  useComposition,
  Shot,
  Captions,
  Easing,
  animate,
} from "../../skills/codex-design/assets/starters/animations.jsx";

const MOTION = {
  enter: (from, to, start, end, time) =>
    animate({ from, to, start, end, ease: Easing.easeOutCubic })(time),
  draw: (from, to, start, end, time) =>
    animate({ from, to, start, end, ease: Easing.easeInOutSine })(time),
  pop: (from, to, start, end, time) =>
    animate({ from, to, start, end, ease: Easing.easeOutBack })(time),
};
function Piece() {
  const { T, CUES, authoredTotal, playing } = useComposition();
  return (
    <>
      <div
        className="title"
        style={{
          opacity: MOTION.enter(0, 1, CUES.Opening, CUES.Opening + 1, T),
        }}
      >
        An idea finds
        <br />
        its place.
      </div>
      <div className="subtitle">One clock. A continuous composition.</div>
      <div
        className="card"
        data-shared-element
        style={{
          transform: `translateX(${MOTION.enter(-480, 0, CUES.Collect - 0.4, CUES.Return + 0.4, T)}px)`,
        }}
      >
        Save what matters.
        <br />
        Return with curiosity.
      </div>
      <div
        className="circle"
        style={{
          transform: `translateY(${MOTION.draw(40, -20, CUES.Opening, authoredTotal, T)}px) scale(${MOTION.pop(0.7, 1.2, CUES.Collect, CUES.Return + 0.7, T)})`,
        }}
      />
      <Shot from={CUES.Return} to={Infinity}>
        <div className="final-note">Ready when you return.</div>
      </Shot>
      <Captions
        items={[
          {
            at: CUES.Opening + 0.2,
            until: CUES.Collect,
            text: "Begin with a little curiosity.",
          },
          {
            at: CUES.Collect,
            until: CUES.Return,
            text: "Keep the ideas that matter.",
          },
          { at: CUES.Return, text: "Make room to return." },
        ]}
        style={{
          fontSize: 22,
          color: "#202c39",
          textShadow: "none",
          bottom: 24,
        }}
      />
      <div className="label">CODEX DESIGN / CONTINUOUS COMPOSITION</div>
      <output data-authored-time style={{ display: "none" }}>
        {T.toFixed(6)}
      </output>
      <output data-composition-playing hidden>
        {String(playing)}
      </output>
    </>
  );
}
createRoot(document.querySelector("#root")).render(
  <CompositionStage
    width={1280}
    height={720}
    bg="#f6f4ee"
    autoplay={false}
    persistKey="reading-motion"
    scenes={window.CODEX_SCENES}
    playback={window.CODEX_PLAYBACK}
    source={new URLSearchParams(location.search).has("edit-source")}
  >
    <Piece />
  </CompositionStage>,
);
