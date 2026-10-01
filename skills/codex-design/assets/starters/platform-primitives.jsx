import React from "react";
export const appleFont =
  '-apple-system, BlinkMacSystemFont, "SF Pro", system-ui, sans-serif';
export const materialFont = "Roboto, system-ui, sans-serif";
export function Glass({
  children,
  dark = false,
  radius = 9999,
  blur = 12,
  tint,
  style = {},
}) {
  return (
    <div style={{ position: "relative", borderRadius: radius, ...style }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          background:
            tint || (dark ? "rgba(120,120,128,.28)" : "rgba(255,255,255,.5)"),
          backdropFilter: `blur(${blur}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${blur}px) saturate(180%)`,
          border: `0.5px solid ${dark ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.6)"}`,
          boxShadow: dark
            ? "inset 1px 1px 1px #ffffff26,0 8px 40px #0003"
            : "inset 1px 1px 1px #ffffffb3,0 8px 40px #00000014",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
export function Chevron({ size = 16, back = false, muted = false }) {
  return (
    <svg
      aria-hidden="true"
      width={size * 0.6}
      height={size}
      viewBox="0 0 12 20"
      style={{
        opacity: muted ? 0.3 : 1,
        transform: back ? "rotate(180deg)" : undefined,
      }}
    >
      <polyline
        points="2,2 10,10 2,18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function StatusIcons({ android = false }) {
  return (
    <span
      aria-label="Network and battery"
      style={{ display: "flex", alignItems: "center", gap: android ? 0 : 7 }}
    >
      <svg
        aria-hidden="true"
        width={android ? 16 : 19}
        height={android ? 16 : 12}
        viewBox={android ? "0 0 16 16" : "0 0 19 12"}
      >
        {android ? (
          <path d="M1 5 Q8 -2 15 5 L8 12 Z" fill="currentColor" />
        ) : (
          [0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={i * 4.8}
              y={7.5 - i * 2.5}
              width="3.2"
              height={4.5 + i * 2.5}
              rx=".7"
              fill="currentColor"
            />
          ))
        )}
      </svg>
      <svg
        aria-hidden="true"
        width={android ? 16 : 17}
        height={android ? 16 : 12}
        viewBox={android ? "0 0 16 16" : "0 0 17 12"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        {android ? (
          <polygon points="1,14 15,1 15,14" fill="currentColor" stroke="none" />
        ) : (
          <>
            <path d="M1 4.5 Q8.5 -2 16 4.5 M4 7.5 Q8.5 3 13 7.5" />
            <circle
              cx="8.5"
              cy="10.5"
              r="1.5"
              fill="currentColor"
              stroke="none"
            />
          </>
        )}
      </svg>
      <svg
        aria-hidden="true"
        width={android ? 13 : 27}
        height={android ? 16 : 13}
        viewBox={android ? "0 0 16 16" : "0 0 27 13"}
      >
        {android ? (
          <>
            <rect
              x="3.75"
              y="2"
              width="8.5"
              height="13"
              rx="1.5"
              fill="currentColor"
            />
            <rect
              x="5.5"
              y=".9"
              width="5"
              height="2"
              rx=".5"
              fill="currentColor"
            />
          </>
        ) : (
          <>
            <rect
              x=".5"
              y=".5"
              width="23"
              height="12"
              rx="3.5"
              fill="none"
              stroke="currentColor"
              opacity=".35"
            />
            <rect
              x="2"
              y="2"
              width="20"
              height="9"
              rx="2"
              fill="currentColor"
            />
            <rect
              x="25"
              y="4.5"
              width="1.5"
              height="4"
              rx=".7"
              fill="currentColor"
              opacity=".5"
            />
          </>
        )}
      </svg>
    </span>
  );
}
export function Lights({
  size = 12,
  gap = 8,
  colors = ["#ff5f57", "#febc2e", "#28c840"],
  style = {},
}) {
  return (
    <div
      aria-label="Window controls"
      style={{ display: "flex", alignItems: "center", gap, ...style }}
    >
      {colors.map((color) => (
        <span
          key={color}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}
export function KeyboardRows({ android = false, dark = false }) {
  const keyStyle = {
    height: android ? 46 : 42,
    borderRadius: android ? 6 : 8.5,
    display: "grid",
    placeItems: "center",
    minWidth: 0,
    flex: 1,
    background: android ? "#f4fbf8" : dark ? "#ffffff38" : "#ffffffd9",
    color: android ? "#00201c" : dark ? "#ffffffb3" : "#595959",
    font: `${android ? 21 : 25}px ${android ? materialFont : appleFont}`,
    boxShadow: android ? undefined : "0 1px 0 #00000013",
  };
  const key = (label, extra = {}, identity = label) => (
    <div key={identity} style={{ ...keyStyle, ...extra }}>
      {label}
    </div>
  );
  const gap = android ? 6 : 6.5;
  return (
    <div
      aria-label="Visual QWERTY keyboard"
      style={{
        display: "grid",
        gap: android ? 12 : 13,
        padding: android ? "0 8px 8px" : "0 6.5px",
      }}
    >
      <div style={{ display: "flex", gap }}>
        {[..."qwertyuiop"].map((l) => key(l))}
      </div>
      <div style={{ display: "flex", gap, padding: "0 20px" }}>
        {[..."asdfghjkl"].map((l) => key(l))}
      </div>
      <div style={{ display: "flex", gap: android ? 6 : 14.25 }}>
        {key(
          android ? "" : <KeyboardIcon type="shift" />,
          {
            flex: android ? 1 : "0 0 45px",
            background: android ? "#dae5e1" : keyStyle.background,
          },
          "shift",
        )}
        <div
          style={{
            display: "flex",
            gap,
            flex: android ? 7 : 1,
            minWidth: android ? 274 : 0,
          }}
        >
          {[..."zxcvbnm"].map((l) => key(l))}
        </div>
        {key(
          android ? " " : <KeyboardIcon type="delete" />,
          {
            flex: android ? 1 : "0 0 45px",
            background: android ? "#dae5e1" : keyStyle.background,
          },
          "delete",
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {key(android ? "?123" : "ABC", {
          flex: android ? 1 : "0 0 92.25px",
          minWidth: android ? 58 : undefined,
          fontSize: android ? 14 : 18,
          borderRadius: android ? 100 : 8.5,
          background: android ? "#cde8e1" : keyStyle.background,
        })}
        {android && key(",", { background: "#dae5e1" })}
        {key("Space", {
          flex: android ? 3 : 1,
          minWidth: android ? 154 : undefined,
          color: "transparent",
        })}
        {android && key(".", { background: "#dae5e1" })}
        {key(
          android ? "  " : <KeyboardIcon type="return" />,
          {
            flex: android ? 1 : "0 0 92.25px",
            minWidth: android ? 58 : undefined,
            background: android ? "#83d5c6" : "#0088ff",
            color: "white",
            borderRadius: android ? 100 : 8.5,
          },
          "return",
        )}
      </div>
    </div>
  );
}

function KeyboardIcon({ type }) {
  return (
    <svg
      aria-hidden="true"
      width={type === "delete" ? 23 : 20}
      height={type === "return" ? 14 : 18}
      viewBox="0 0 24 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {type === "shift" ? (
        <polygon
          points="12,1 2,10 7,10 7,19 17,19 17,10 22,10"
          fill="currentColor"
          stroke="none"
        />
      ) : type === "delete" ? (
        <>
          <polygon points="8,2 22,2 22,18 8,18 1,10" />
          <path d="m11 6 7 8 m0 -8 -7 8" />
        </>
      ) : (
        <path d="M22 2 V11 H3 M8 6 L3 11 L8 16" />
      )}
    </svg>
  );
}
