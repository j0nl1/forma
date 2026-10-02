export const tweakStyles = `
:host{font:13px/1.4 system-ui;color:#192737;position:fixed;z-index:10000;right:0;bottom:0}*{box-sizing:border-box}button,input,select,textarea{font:inherit}button{cursor:pointer;color:inherit}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #496cd5;outline-offset:2px}.launcher{position:fixed;right:16px;bottom:16px;background:#fff;border:1px solid #bdc8d4;border-radius:8px;padding:8px 14px;box-shadow:0 4px 18px #14223118}.panel{position:fixed;width:min(300px,calc(100vw - 32px));max-height:calc(100dvh - 32px);display:flex;flex-direction:column;background:#f9fafb;color:#192737;border:1px solid #bdc8d4;border-radius:12px;box-shadow:0 12px 40px #14223130;overflow:hidden}.heading{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:#fff;border-bottom:1px solid #dce2e9;cursor:grab;touch-action:none;user-select:none}.heading button{border:0;background:none;font-size:18px;padding:0 4px}.body{padding:14px;overflow:auto;overscroll-behavior:contain;min-height:0}.section{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#677586;font-weight:650;margin:16px 0 10px}.row{margin:12px 0}.row-inline{display:flex;align-items:center;justify-content:space-between;gap:12px}.label{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:7px;font-size:12px}.row-inline .label{margin:0}.value{font-variant-numeric:tabular-nums;color:#677586;font-size:11px}input[type=range]{width:100%;accent-color:#496cd5;cursor:ew-resize}.field{display:block;width:100%;border:1px solid #c7d1dc;background:#fff;border-radius:6px;padding:7px 9px;color:inherit;min-width:0}.toggle{width:34px;height:20px;border:0;border-radius:20px;background:#aab5c2;padding:3px;position:relative;flex:none;transition:background .15s}.toggle[aria-checked=true]{background:#496cd5}.toggle i{display:block;width:14px;height:14px;background:#fff;border-radius:50%;transform:translateX(0);transition:transform .15s}.toggle[aria-checked=true] i{transform:translateX(14px)}.segments{display:flex;background:#e5eaf0;border-radius:7px;padding:2px;position:relative;touch-action:none;user-select:none}.segments button{flex:1;min-width:0;border:0;background:none;border-radius:5px;padding:7px 5px;font-size:11px;position:relative;white-space:nowrap}.segment-thumb{position:absolute;top:2px;bottom:2px;border-radius:5px;background:#fff;box-shadow:0 1px 4px #14223125;transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}.segments[data-dragging] .segment-thumb{transition:none}.number{display:flex;align-items:center;gap:8px;margin:10px 0}.number label{flex:1;cursor:ew-resize;touch-action:none;user-select:none;font-size:12px}.number input{width:76px;border:1px solid #c7d1dc;border-radius:5px;background:#fff;padding:5px 7px}.chips{display:flex;gap:8px}.chip{flex:1;height:38px;min-width:0;position:relative;border:2px solid transparent;border-radius:7px;overflow:hidden;display:flex;padding:0}.chip{transition:transform .12s,box-shadow .12s}.chip:hover{transform:translateY(-1px)}.chip[aria-checked=true]{outline:2px solid #496cd5;outline-offset:2px}.chip>span{display:flex;flex-direction:column;width:32%;margin-left:auto}.chip i{flex:1;width:100%}.chip b{position:absolute;left:9px;top:7px;text-shadow:0 1px 2px #0004}.swatch{width:36px;height:28px;border:0;background:none;padding:0}.action{width:100%;margin:5px 0;padding:8px 12px;border:1px solid #283d57;border-radius:6px;background:#283d57;color:#fff}.action.secondary{background:#fff;color:#283d57;border-color:#c7d1dc}.status{font-size:11px;color:#677586;margin-top:10px}.suggestion{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:7px;background:#e9edf2;border:1px solid #d8e0e8}.suggestion-field{position:relative;flex:1;min-width:0}.suggestion input{display:block;width:100%;background:none;border:0;padding:2px 0;font-size:11px;min-width:0;color:inherit}.ghost{position:absolute;inset:0;display:flex;align-items:center;overflow:hidden;white-space:nowrap;color:#778497;pointer-events:none;font-size:11px}.caret{height:12px;border-left:1px solid currentColor;margin-left:2px;animation:codex-tweak-blink 1s step-end infinite}.suggestion button{font-size:10px;border:0;border-radius:4px;padding:4px 6px;background:#283d57;color:#fff;white-space:nowrap}.draft textarea{width:100%;min-height:64px;margin-top:8px}.draft small{display:block;font-size:10px;color:#677586;margin-top:5px}slot::slotted(label){display:block;margin-bottom:12px}[hidden]{display:none!important}@keyframes codex-tweak-blink{50%{opacity:0}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}@media print{:host{display:none!important}}`;
export function bindTweakPanel(
  panel,
  handle,
  position = { right: 16, bottom: 16 },
) {
  const controller = new AbortController(),
    options = { signal: controller.signal };
  const clamp = () => {
    position.right = Math.max(
      16,
      Math.min(
        Math.max(16, innerWidth - panel.offsetWidth - 16),
        position.right,
      ),
    );
    position.bottom = Math.max(
      16,
      Math.min(
        Math.max(16, innerHeight - panel.offsetHeight - 16),
        position.bottom,
      ),
    );
    panel.style.right = `${position.right}px`;
    panel.style.bottom = `${position.bottom}px`;
  };
  let drag;
  handle.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || event.target.closest("button,input")) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      drag = {
        x: event.clientX,
        y: event.clientY,
        right: position.right,
        bottom: position.bottom,
      };
    },
    options,
  );
  handle.addEventListener(
    "pointermove",
    (event) => {
      if (!drag) return;
      position.right = drag.right - event.clientX + drag.x;
      position.bottom = drag.bottom - event.clientY + drag.y;
      clamp();
    },
    options,
  );
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    handle.addEventListener(
      name,
      () => {
        drag = null;
      },
      options,
    );
  handle.addEventListener(
    "keydown",
    (event) => {
      if (
        event.target !== handle ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 1 : 10;
      position.right +=
        event.key === "ArrowLeft"
          ? step
          : event.key === "ArrowRight"
            ? -step
            : 0;
      position.bottom +=
        event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;
      clamp();
    },
    options,
  );
  const observer = new ResizeObserver(clamp);
  observer.observe(panel);
  window.addEventListener("resize", clamp, options);
  clamp();
  return () => {
    controller.abort();
    observer.disconnect();
  };
}
