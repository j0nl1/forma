import React from "react";
export function Button({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "var(--color-accent)",
        color: "var(--color-on-accent)",
        padding: "12px 22px",
        border: 0,
        borderRadius: "var(--trail-radius)",
        font: "600 15px system-ui",
      }}
    >
      {children}
    </button>
  );
}
