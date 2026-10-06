import React from "react";
import {
  appleFont,
  Glass,
  Chevron,
  StatusIcons,
  KeyboardRows,
} from "../platform-materials/platform-primitives.jsx";
export function IOSStatusBar({ dark = false, time = "9:41" }) {
  return (
    <div
      data-part="ios-status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 154,
        width: "100%",
        boxSizing: "border-box",
        padding: "21px 24px 19px",
        position: "relative",
        zIndex: 20,
        color: dark ? "white" : "black",
        font: `590 17px/22px ${appleFont}`,
      }}
    >
      <span style={{ flex: 1, textAlign: "center", paddingTop: 1.5 }}>
        {time}
      </span>
      <span
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          paddingTop: 1,
          paddingRight: 1,
        }}
      >
        <StatusIcons />
      </span>
    </div>
  );
}
export function IOSGlassPill({ children, dark = false, style = {} }) {
  return (
    <Glass
      dark={dark}
      style={{
        height: 44,
        minWidth: 44,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", padding: "0 4px" }}>
        {children}
      </div>
    </Glass>
  );
}
export function IOSNavBar({
  title = "Title",
  dark = false,
  trailingIcon = true,
}) {
  const icon = {
    width: 36,
    height: 36,
    display: "grid",
    placeItems: "center",
    color: dark ? "#ffffff99" : "#404040",
  };
  return (
    <div
      data-part="ios-navigation"
      style={{
        paddingTop: 62,
        paddingBottom: 10,
        display: "grid",
        gap: 10,
        position: "relative",
        zIndex: 5,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "0 16px",
        }}
      >
        <IOSGlassPill dark={dark}>
          <div style={icon}>
            <Chevron size={20} back />
          </div>
        </IOSGlassPill>
        {trailingIcon && (
          <IOSGlassPill dark={dark}>
            <div style={{ ...icon, fontSize: 26, lineHeight: 1 }}>•••</div>
          </IOSGlassPill>
        )}
      </div>
      <div
        style={{
          font: `700 34px/41px ${appleFont}`,
          padding: "0 16px",
          letterSpacing: 0.4,
          color: dark ? "white" : "black",
        }}
      >
        {title}
      </div>
    </div>
  );
}
export function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false,
}) {
  return (
    <div
      data-part="ios-row"
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: 52,
        padding: "0 16px",
        position: "relative",
        font: `17px ${appleFont}`,
        letterSpacing: -0.43,
        color: dark ? "white" : "black",
      }}
    >
      {icon && (
        <div
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: 7,
            background: icon,
            marginRight: 12,
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1 }}>{title}</div>
      {detail && (
        <span
          style={{ color: dark ? "#ebebf599" : "#3c3c4399", marginRight: 6 }}
        >
          {detail}
        </span>
      )}
      {chevron && <Chevron size={14} muted />}
      {!isLast && (
        <div
          data-part="separator"
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            left: icon ? 58 : 16,
            height: 0.5,
            background: dark ? "#545458a6" : "#3c3c431f",
          }}
        />
      )}
    </div>
  );
}
export function IOSList({ header, children, dark = false }) {
  return (
    <div>
      {header && (
        <div
          style={{
            font: `13px ${appleFont}`,
            textTransform: "uppercase",
            padding: "8px 36px 6px",
            letterSpacing: -0.08,
            color: dark ? "#ebebf599" : "#3c3c4399",
          }}
        >
          {header}
        </div>
      )}
      <div
        data-part="ios-list"
        style={{
          background: dark ? "#1c1c1e" : "white",
          borderRadius: 26,
          margin: "0 16px",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
export function IOSKeyboard({ dark = false }) {
  return (
    <Glass
      radius={27}
      dark={dark}
      tint={dark ? "#78788024" : "#ffffff40"}
      style={{
        padding: "11px 0 2px",
        overflow: "hidden",
        position: "relative",
        zIndex: 15,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 20,
          padding: "8px 22px 13px",
          font: `17px/22px ${appleFont}`,
          color: dark ? "#ffffff99" : "#333",
        }}
      >
        {['"The"', "the", "to"].map((word, i) => (
          <span
            key={word}
            style={{
              flex: 1,
              textAlign: "center",
              borderLeft: i ? "1px solid #cccccc4d" : undefined,
            }}
          >
            {word}
          </span>
        ))}
      </div>
      <KeyboardRows dark={dark} />
      <div style={{ height: 56 }} />
    </Glass>
  );
}
export function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false,
}) {
  return (
    <div
      data-codex-starter="ios-frame"
      style={{
        width,
        height,
        borderRadius: 48,
        overflow: "hidden",
        position: "relative",
        background: dark ? "black" : "#f2f2f7",
        boxShadow: "0 40px 80px #0000002e,0 0 0 1px #0000001f",
        fontFamily: appleFont,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div
        data-part="island"
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 11,
          left: "50%",
          transform: "translateX(-50%)",
          width: 126,
          height: 37,
          borderRadius: 24,
          background: "black",
          zIndex: 50,
        }}
      />
      <div style={{ position: "absolute", inset: "0 0 auto", zIndex: 10 }}>
        <IOSStatusBar dark={dark} />
      </div>
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        {title !== undefined && <IOSNavBar title={title} dark={dark} />}
        <div
          data-part="device-content"
          style={{ flex: 1, minHeight: 0, overflow: "auto" }}
        >
          {children}
        </div>
        {keyboard && <IOSKeyboard dark={dark} />}
      </div>
      <div
        aria-hidden="true"
        data-part="home-indicator"
        style={{
          position: "absolute",
          inset: "auto 0 0",
          height: 34,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          paddingBottom: 8,
          pointerEvents: "none",
          zIndex: 60,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: 139,
            height: 5,
            borderRadius: 100,
            background: dark ? "#ffffffb3" : "#00000040",
          }}
        />
      </div>
    </div>
  );
}
if (typeof window !== "undefined")
  Object.assign(window, {
    IOSDevice,
    IOSStatusBar,
    IOSNavBar,
    IOSGlassPill,
    IOSList,
    IOSListRow,
    IOSKeyboard,
  });
