import React from "react";
export function Button({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "var(--color-accent)",
        color: "var(--color-on-accent)",
        padding: "var(--space-small) var(--space-medium)",
        border: 0,
        borderRadius: "var(--radius-control)",
        font: "inherit",
      }}
    >
      {children}
    </button>
  );
}
export function Status({ children }) {
  return (
    <span style={{ color: "var(--color-ink)", font: "14px var(--font-body)" }}>
      ● {children}
    </span>
  );
}
