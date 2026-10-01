import React from "react";
import { appleFont, Glass, Lights } from "./platform-primitives.jsx";
export function MacGlass({ children, radius = 296, dark = false, style = {} }) {
  return (
    <Glass
      dark={dark}
      radius={radius}
      blur={40}
      tint={dark ? "#ffffff14" : "#ffffff59"}
      style={style}
    >
      {children}
    </Glass>
  );
}
export function MacTrafficLights({ style = {} }) {
  return (
    <Lights
      size={14}
      gap={9}
      colors={["#ff736a", "#febc2e", "#19c332"]}
      style={{ padding: 1, ...style }}
    />
  );
}
export function MacToolbar({ title = "Folder" }) {
  return (
    <div
      data-part="mac-toolbar"
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: 8,
        flexShrink: 0,
        fontFamily: appleFont,
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#000000d9",
          whiteSpace: "nowrap",
          paddingLeft: 8,
        }}
      >
        {title}
      </div>
      <div style={{ flex: 1 }} />
      <MacGlass>
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 36,
            display: "grid",
            placeItems: "center",
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#4c4c4c",
              opacity: 0.4,
            }}
          />
        </div>
      </MacGlass>
      <MacGlass>
        <div
          style={{
            width: 140,
            height: 36,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 12px",
            color: "#727272",
          }}
        >
          <svg
            aria-hidden="true"
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="5.5" cy="5.5" r="4" />
            <path d="m8.5 8.5 3 3" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Search</span>
        </div>
      </MacGlass>
    </div>
  );
}
export function MacSidebarItem({ label, selected = false }) {
  return (
    <div
      data-part="mac-sidebar-item"
      data-selected={String(selected)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 24,
        padding: "4px 10px 4px 6px",
        margin: "0 10px",
        borderRadius: 8,
        position: "relative",
        font: `500 11px ${appleFont}`,
      }}
    >
      {selected && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 8,
            background: "#0000001c",
            mixBlendMode: "multiply",
          }}
        />
      )}
      <div
        aria-hidden="true"
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: selected ? "#007aff" : "#00000066",
          opacity: selected ? 1 : 0.5,
          flexShrink: 0,
          position: "relative",
        }}
      />
      <span style={{ color: "#000000d9", position: "relative" }}>{label}</span>
    </div>
  );
}
export function MacSidebarHeader({ title }) {
  return (
    <div
      style={{
        padding: "14px 18px 5px",
        font: `700 11px ${appleFont}`,
        color: "#00000080",
      }}
    >
      {title}
    </div>
  );
}
export function MacSidebar({ children }) {
  return (
    <div
      data-part="mac-sidebar"
      style={{
        width: 220,
        height: "100%",
        padding: 8,
        flexShrink: 0,
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 8,
          borderRadius: 18,
          background: "rgba(210,225,245,.45)",
          backdropFilter: "blur(50px) saturate(200%)",
          WebkitBackdropFilter: "blur(50px) saturate(200%)",
          border: ".5px solid #ffffff80",
          boxShadow: "0 8px 40px #0000001a,inset 0 1px 0 #ffffff59",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "10px 0",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div
          style={{
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 10px",
            marginBottom: 4,
          }}
        >
          <MacTrafficLights />
        </div>
        {children}
      </div>
    </div>
  );
}
export function MacWindow({
  width = 900,
  height = 600,
  title = "Folder",
  sidebar,
  children,
}) {
  return (
    <div
      data-codex-starter="macos-window"
      style={{
        width,
        height,
        borderRadius: 26,
        overflow: "hidden",
        background: "white",
        boxShadow: "0 0 0 1px #0000003b,0 16px 48px #00000059",
        display: "flex",
        position: "relative",
        fontFamily: appleFont,
      }}
    >
      <MacSidebar>{sidebar}</MacSidebar>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <MacToolbar title={title} />
        <div
          data-part="window-content"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            padding: "4px 8px",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
if (typeof window !== "undefined")
  Object.assign(window, {
    MacWindow,
    MacSidebar,
    MacSidebarItem,
    MacSidebarHeader,
    MacToolbar,
    MacGlass,
    MacTrafficLights,
  });
