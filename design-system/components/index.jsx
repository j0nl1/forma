import React from "react";
export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background:
          variant === "quiet" ? "var(--color-paper)" : "var(--color-accent)",
        color:
          variant === "quiet" ? "var(--color-ink)" : "var(--color-on-accent)",
        padding: "var(--space-small) var(--space-medium)",
        border: 0,
        borderRadius: "var(--radius-control)",
        font: "inherit",
        opacity: disabled ? 0.45 : 1,
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
