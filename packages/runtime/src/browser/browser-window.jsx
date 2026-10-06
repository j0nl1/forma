import React from "react";
import { Lights } from "./platform-primitives.jsx";
export function ChromeTrafficLights() {
  return <Lights style={{ padding: "0 14px" }} />;
}
export function ChromeTab({ title = "New Tab", active = false }) {
  const scoop = (right) => (
    <svg
      key={String(right)}
      aria-hidden="true"
      width="8"
      height="10"
      viewBox="0 0 8 10"
      style={{
        position: "absolute",
        bottom: 0,
        [right ? "right" : "left"]: -8,
        transform: right ? "scaleX(-1)" : undefined,
      }}
    >
      <path d="M0 10 Q7 8 8 0 V10 Z" fill="#35363a" />
    </svg>
  );
  return (
    <div
      data-part="chrome-tab"
      data-active={String(active)}
      style={{
        position: "relative",
        height: 34,
        alignSelf: "flex-end",
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: active ? "#35363a" : "transparent",
        borderRadius: "8px 8px 0 0",
        minWidth: 120,
        maxWidth: 220,
        font: "12px system-ui",
        color: active ? "#e8eaed" : "#9aa0a6",
      }}
    >
      {active && [scoop(false), scoop(true)]}
      <div
        aria-hidden="true"
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#5f6368",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </span>
    </div>
  );
}
export function ChromeTabBar({
  tabs = [{ title: "New Tab" }],
  activeIndex = 0,
}) {
  return (
    <div
      data-part="chrome-tabs"
      style={{
        display: "flex",
        alignItems: "center",
        height: 44,
        background: "#202124",
        paddingRight: 8,
        flexShrink: 0,
      }}
    >
      <ChromeTrafficLights />
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          height: "100%",
          paddingLeft: 4,
          flex: 1,
          minWidth: 0,
        }}
      >
        {tabs.map((tab, index) => (
          <ChromeTab
            key={index}
            title={tab.title}
            active={index === activeIndex}
          />
        ))}
      </div>
    </div>
  );
}
export function ChromeToolbar({ url = "example.com" }) {
  const placeholder = (
    <div
      aria-hidden="true"
      style={{ width: 28, height: 28, display: "grid", placeItems: "center" }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#9aa0a6",
          opacity: 0.4,
        }}
      />
    </div>
  );
  return (
    <div
      data-part="chrome-toolbar"
      style={{
        height: 40,
        background: "#35363a",
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 8px",
        flexShrink: 0,
      }}
    >
      {placeholder}
      <div
        style={{
          flex: 1,
          height: 30,
          borderRadius: 15,
          background: "#282a2d",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 14px",
          margin: "0 6px",
          minWidth: 0,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#9aa0a6",
            opacity: 0.4,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            flex: 1,
            color: "#e8eaed",
            font: "13px system-ui",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {url}
        </span>
      </div>
      {placeholder}
    </div>
  );
}
export function ChromeWindow({
  tabs = [{ title: "New Tab" }],
  activeIndex = 0,
  url = "example.com",
  width = 900,
  height = 600,
  children,
}) {
  return (
    <div
      data-codex-starter="browser-window"
      style={{
        width,
        height,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 24px 80px #00000059,0 0 0 1px #0000001a",
        display: "flex",
        flexDirection: "column",
        background: "#35363a",
      }}
    >
      <ChromeTabBar tabs={tabs} activeIndex={activeIndex} />
      <ChromeToolbar url={url} />
      <div
        data-part="window-content"
        style={{ flex: 1, minHeight: 0, background: "white", overflow: "auto" }}
      >
        {children}
      </div>
    </div>
  );
}
if (typeof window !== "undefined")
  Object.assign(window, {
    ChromeWindow,
    ChromeTabBar,
    ChromeToolbar,
    ChromeTab,
    ChromeTrafficLights,
  });
