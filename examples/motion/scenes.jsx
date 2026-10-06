import React from "react";
import { createRoot } from "react-dom/client";
import {
  SceneStage,
  useScene,
  useComposition,
  Sprite,
  TextSprite,
  ImageSprite,
  RectSprite,
  Easing,
} from "../../packages/runtime/src/browser/animations.jsx";

const chapters = [
  {
    title: "Notice the\nlittle things.",
    note: "An idea starts with attention.",
    background: "#f3eee3",
    ink: "#24322d",
    accent: "#bb7552",
  },
  {
    title: "Give them\na place to stay.",
    note: "Keep a thought. Make room for another.",
    background: "#214c44",
    ink: "#f3eee3",
    accent: "#dbb87b",
  },
  {
    title: "Return with\nfresh eyes.",
    note: "A small collection becomes a habit.",
    background: "#e3b787",
    ink: "#24322d",
    accent: "#214c44",
  },
];
function Chapter() {
  const { index, localTime } = useScene();
  const { sections } = useComposition();
  const section = sections[index],
    ratio = section.dur / section.natural;
  const chapter = chapters[index];
  const exit = index === chapters.length - 1 ? 0 : 0.4 * ratio;
  const art = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="430" viewBox="0 0 460 430"><rect width="460" height="430" fill="${chapter.accent}"/><circle cx="270" cy="160" r="120" fill="${chapter.background}"/><path d="M80 315 Q165 195 270 305 T455 275" stroke="${chapter.ink}" stroke-width="2" fill="none"/><text x="34" y="390" font-family="serif" font-size="22" fill="${chapter.ink}">A thought, kept.</text></svg>`;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: chapter.background,
        color: chapter.ink,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 54,
          font: "13px ui-monospace,monospace",
          letterSpacing: ".12em",
        }}
      >
        0{index + 1} / A SCENE AT A TIME
      </div>
      <Sprite start={section.start} end={section.start + section.dur}>
        <TextSprite
          text={chapter.title}
          x={80}
          y={165}
          size={86}
          font="Georgia,serif"
          weight={400}
          color={chapter.ink}
          entryDur={0.6 * ratio}
          exitDur={exit}
          entryEase={Easing.easeOutCubic}
        />
        <ImageSprite
          src={"data:image/svg+xml," + encodeURIComponent(art)}
          x={730}
          y={145}
          width={460}
          height={430}
          entryDur={0.7 * ratio}
          exitDur={exit}
          radius={8}
          kenBurns
        />
        <RectSprite
          x={80}
          y={495}
          width={62}
          height={3}
          color={chapter.accent}
          radius={0}
          entryDur={0.4 * ratio}
          exitDur={exit}
          render={() => ({ width: 62 + Math.min(1, localTime / 1.2) * 48 })}
        />
        <TextSprite
          text={chapter.note}
          x={80}
          y={528}
          size={22}
          weight={400}
          color={chapter.ink}
          entryDur={0.7 * ratio}
          exitDur={exit}
        />
      </Sprite>
    </div>
  );
}
const query = new URLSearchParams(location.search);
createRoot(document.getElementById("root")).render(
  <SceneStage
    width={1280}
    height={720}
    scenes={window.CODEX_SCENES}
    playback={window.CODEX_PLAYBACK}
    autoplay={false}
    persistKey="reading-scenes"
    transition={query.get("transition") ?? "cut"}
    source={query.has("edit-source")}
  >
    {{ Notice: Chapter, Collect: Chapter, Return: Chapter }}
  </SceneStage>,
);
