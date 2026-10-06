import React from "react";
import "./styles.css";
export function LowerThird({
  name = "Alex Morgan",
  detail = "Researcher",
  time = 1,
  startSeconds = 0,
  endSeconds = 8,
  fadeSeconds = 0.4,
  accent = "#397758",
}) {
  const fade = Math.max(0.001, fadeSeconds);
  const opacity = Math.min(
    1,
    Math.max(0, (time - startSeconds) / fade),
    Math.max(0, (endSeconds - time) / fade),
  );
  return (
    <aside
      className="forma-lower-third"
      style={{
        opacity,
        borderColor: accent,
        transform: `translateX(${(1 - opacity) * -20}px)`,
      }}
    >
      <strong>{name}</strong>
      <span>{detail}</span>
    </aside>
  );
}
