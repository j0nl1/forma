import React from "react";
import {
  materialFont,
  StatusIcons,
  KeyboardRows,
} from "./platform-primitives.jsx";
const surface = "#f4fbf8",
  ink = "#171d1b";
export function AndroidStatusBar({ dark = false }) {
  return (
    <div
      data-part="android-status"
      style={{
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        position: "relative",
        flexShrink: 0,
        color: dark ? "white" : ink,
        font: `14px/20px ${materialFont}`,
        letterSpacing: 0.25,
      }}
    >
      <span>9:30</span>
      <div
        data-part="camera"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "50%",
          top: 8,
          transform: "translateX(-50%)",
          width: 24,
          height: 24,
          borderRadius: 100,
          background: "#2e2e2e",
        }}
      />
      <StatusIcons android />
    </div>
  );
}
export function AndroidAppBar({ title = "Title", large = false }) {
  const dot = (
    <div
      aria-hidden="true"
      style={{
        width: 48,
        height: 48,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#49454f",
          opacity: 0.3,
        }}
      />
    </div>
  );
  return (
    <div
      data-part="android-appbar"
      style={{
        background: surface,
        padding: "4px 4px 0",
        fontFamily: materialFont,
        flexShrink: 0,
        color: ink,
      }}
    >
      <div
        style={{ height: 56, display: "flex", alignItems: "center", gap: 4 }}
      >
        {dot}
        <div style={{ flex: 1, fontSize: 22 }}>{!large && title}</div>
        {dot}
      </div>
      {large && (
        <div style={{ padding: "16px 16px 20px", fontSize: 28 }}>{title}</div>
      )}
    </div>
  );
}
export function AndroidListItem({ headline, supporting, leading }) {
  return (
    <div
      data-part="android-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 16px",
        minHeight: 56,
        boxSizing: "border-box",
        fontFamily: materialFont,
      }}
    >
      {leading && (
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "#006a60",
            color: "white",
            display: "grid",
            placeItems: "center",
            fontSize: 18,
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {leading}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, color: ink, lineHeight: "24px" }}>
          {headline}
        </div>
        {supporting && (
          <div style={{ fontSize: 14, color: "#49454f", lineHeight: "20px" }}>
            {supporting}
          </div>
        )}
      </div>
    </div>
  );
}
export function AndroidNavBar({ dark = false }) {
  return (
    <div
      data-part="android-gesture"
      aria-hidden="true"
      style={{
        height: 24,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 108,
          height: 4,
          borderRadius: 2,
          opacity: 0.4,
          background: dark ? "white" : ink,
        }}
      />
    </div>
  );
}
export function AndroidKeyboard() {
  return (
    <div style={{ background: "#ecf2ef", paddingTop: 44, flexShrink: 0 }}>
      <KeyboardRows android />
    </div>
  );
}
export function AndroidDevice({
  children,
  width = 412,
  height = 892,
  dark = false,
  title,
  large = false,
  keyboard = false,
}) {
  return (
    <div
      data-codex-starter="android-frame"
      style={{
        width,
        height,
        borderRadius: 18,
        overflow: "hidden",
        background: dark ? "#1d1b20" : surface,
        border: "8px solid rgba(116,119,117,.5)",
        boxShadow: "0 30px 80px #00000040",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <AndroidStatusBar dark={dark} />
      {title !== undefined && <AndroidAppBar title={title} large={large} />}
      <div
        data-part="device-content"
        style={{ flex: 1, minHeight: 0, overflow: "auto" }}
      >
        {children}
      </div>
      {keyboard && <AndroidKeyboard />}
      <AndroidNavBar dark={dark} />
    </div>
  );
}
if (typeof window !== "undefined")
  Object.assign(window, {
    AndroidDevice,
    AndroidStatusBar,
    AndroidAppBar,
    AndroidListItem,
    AndroidNavBar,
    AndroidKeyboard,
  });
