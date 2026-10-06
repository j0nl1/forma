import React from "react";
import {
  CompositionStage,
  useTime,
} from "../../../packages/runtime/src/browser/motion/animations.jsx";
import { Title } from "../title/title.jsx";
import { LowerThird } from "../lower-third/lower-third.jsx";
function Content({ title, subtitle, presenter, accent, duration }) {
  const time = useTime();
  return (
    <>
      <Title text={title} subtitle={subtitle} accent={accent} time={time} />
      <LowerThird
        name={presenter}
        detail="An introduction"
        accent={accent}
        time={time}
        startSeconds={1}
        endSeconds={duration}
      />
    </>
  );
}
export function NativeComposition({
  title = "Turn ideas into media",
  subtitle = "Build a complete thought, then give it motion",
  presenter = "Alex Morgan",
  accent = "#397758",
  duration = 8,
  width = 960,
  height = 540,
  autoplay = false,
}) {
  return (
    <CompositionStage
      width={width}
      height={height}
      bg="#f5f5ef"
      autoplay={autoplay}
      scenes={[{ name: "Introduction", dur: duration }]}
      playback={{ mode: "times", count: 1 }}
    >
      <Content {...{ title, subtitle, presenter, accent, duration }} />
    </CompositionStage>
  );
}
