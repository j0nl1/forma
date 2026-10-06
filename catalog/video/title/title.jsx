import React from "react";
import "./styles.css";
export function Title({
  text = "A clear idea",
  subtitle = "Give the audience a reason to listen",
  time = 1,
  enterSeconds = 0.6,
  color = "#202925",
  accent = "#397758",
}) {
  const progress = Math.min(
    1,
    Math.max(0, time / Math.max(0.001, enterSeconds)),
  );
  const eased = 1 - (1 - progress) ** 3;
  return (
    <section
      className="forma-title"
      style={{
        color,
        opacity: eased,
        transform: `translateY(${(1 - eased) * 24}px)`,
      }}
    >
      <span className="forma-title-accent" style={{ background: accent }} />
      <h1>{text}</h1>
      {subtitle && <p>{subtitle}</p>}
    </section>
  );
}
