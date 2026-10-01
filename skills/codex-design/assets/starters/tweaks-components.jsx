import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { TweakStore, readTweakDefaults } from "./tweaks-store.js";
import { segmentedOptions, tweakOptions, scrubNumber } from "./tweaks-model.js";
import { tweakStyles, bindTweakPanel } from "./tweaks-panel.js";
export { readTweakDefaults };
export { TweakSuggestionBar, useTwkTypewriter } from "./tweaks-suggestions.jsx";
const storesKey = Symbol.for("codex-design.tweak-stores");
const panelsKey = Symbol.for("codex-design.tweak-panels");
export function useTweaks(defaults, options = {}) {
  const ref = useRef();
  if (!ref.current) {
    const stores = (window[storesKey] ??= new Map()),
      id = options.id ?? "default";
    let store = stores.get(id);
    if (!store) {
      store = new TweakStore(defaults, options);
      stores.set(id, store);
      store.set.store = store;
    }
    ref.current = store;
    if (id === "default") window.codexTweaks = store;
  }
  const store = ref.current;
  return [
    useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot),
    store.set,
  ];
}
function Status({ store }) {
  const status = useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    () => store?.status ?? "",
    () => "",
  );
  return status ? (
    <div className="status" role="status" aria-label="Tweak save status">
      {status}
    </div>
  ) : null;
}
export function TweaksPanel({
  title = "Tweaks",
  children,
  store,
  id = "default",
  showLauncher = true,
}) {
  const [open, setOpen] = useState(false),
    [shadow, setShadow] = useState(null);
  const panelRef = useRef(),
    handleRef = useRef(),
    launcherRef = useRef(),
    offset = useRef({ right: 16, bottom: 16 });
  useLayoutEffect(() => {
    const host = document.createElement("div");
    host.dataset.codexTweaksChrome = "";
    host.className = "export-hidden";
    if (new URLSearchParams(location.search).has("capture")) host.hidden = true;
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);
    setShadow(root);
    return () => host.remove();
  }, []);
  useEffect(() => {
    const panels = (window[panelsKey] ??= new Set());
    const identity = {};
    panels.add(identity);
    const activate = (event) => {
      if (!event.detail?.id || event.detail.id === id) setOpen(true);
    };
    const deactivate = (event) => {
      if (!event.detail?.id || event.detail.id === id) setOpen(false);
    };
    window.addEventListener("codex-tweaks-open", activate);
    window.addEventListener("codex-tweaks-close", deactivate);
    document.documentElement.dataset.codexTweaks = "available";
    window.dispatchEvent(
      new CustomEvent("codex-tweaks-available", { detail: { id } }),
    );
    return () => {
      window.removeEventListener("codex-tweaks-open", activate);
      window.removeEventListener("codex-tweaks-close", deactivate);
      panels.delete(identity);
      if (!panels.size) delete document.documentElement.dataset.codexTweaks;
    };
  }, [id]);
  useLayoutEffect(() => {
    if (open && panelRef.current)
      return bindTweakPanel(
        panelRef.current,
        handleRef.current,
        offset.current,
      );
  }, [open, shadow]);
  const dismiss = () => {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("codex-tweaks-dismissed", { detail: { id } }),
    );
    requestAnimationFrame(() => launcherRef.current?.focus());
  };
  if (!shadow) return null;
  return createPortal(
    <>
      <style>{tweakStyles}</style>
      {showLauncher && !open && (
        <button
          ref={launcherRef}
          className="launcher"
          aria-expanded="false"
          onClick={() => setOpen(true)}
        >
          {title}
        </button>
      )}
      {open && (
        <aside
          ref={panelRef}
          className="panel"
          role="dialog"
          aria-label={title}
        >
          <header
            ref={handleRef}
            className="heading"
            tabIndex={0}
            aria-label="Move tweaks panel"
          >
            <b>{title}</b>
            <button aria-label="Close tweaks" onClick={dismiss}>
              ×
            </button>
          </header>
          <div className="body">
            {children}
            <Status store={store ?? window.codexTweaks} />
          </div>
        </aside>
      )}
    </>,
    shadow,
  );
}
export function TweakSection({ label, children }) {
  return (
    <>
      <div className="section">{label}</div>
      {children}
    </>
  );
}
export function TweakRow({ label, value, children, inline = false }) {
  return (
    <div className={`row${inline ? " row-inline" : ""}`}>
      <div className="label">
        <span>{label}</span>
        {value != null && <output className="value">{value}</output>}
      </div>
      {children}
    </div>
  );
}
export function TweakSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  onChange,
}) {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </TweakRow>
  );
}
export function TweakToggle({ label, value, onChange }) {
  return (
    <TweakRow label={label} inline>
      <button
        className="toggle"
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={!!value}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </TweakRow>
  );
}
export function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select
        className="field"
        aria-label={label}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {tweakOptions(options).map((option, index) => (
          <option key={index} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </TweakRow>
  );
}
export function TweakRadio({ label, value, options, onChange }) {
  const track = useRef(),
    current = useRef(value),
    drag = useRef(null);
  current.current = value;
  const normalized = tweakOptions(options),
    emit = (next) => {
      if (next !== current.current) {
        current.current = next;
        onChange(next);
      }
    };
  const resolve = (text) => {
    const option = normalized.find((option) => String(option.value) === text);
    return option ? option.value : text;
  };
  const pick = (x) => {
    const bounds = track.current.getBoundingClientRect();
    emit(
      normalized[
        Math.max(
          0,
          Math.min(
            normalized.length - 1,
            Math.floor(
              ((x - bounds.left - 2) * normalized.length) / (bounds.width - 4),
            ),
          ),
        )
      ].value,
    );
  };
  if (!segmentedOptions(options))
    return (
      <TweakSelect
        label={label}
        value={value}
        options={options}
        onChange={(text) => onChange(resolve(text))}
      />
    );
  return (
    <TweakRow label={label}>
      <div
        ref={track}
        className="segments"
        role="radiogroup"
        aria-label={label}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.dataset.dragging = "";
          drag.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          pick(event.clientX);
        }}
        onPointerMove={(event) => {
          if (drag.current === event.pointerId) pick(event.clientX);
        }}
        onPointerUp={(event) => {
          delete event.currentTarget.dataset.dragging;
          drag.current = null;
        }}
        onPointerCancel={(event) => {
          delete event.currentTarget.dataset.dragging;
          drag.current = null;
        }}
        onLostPointerCapture={(event) => {
          delete event.currentTarget.dataset.dragging;
          drag.current = null;
        }}
      >
        <i
          className="segment-thumb"
          aria-hidden="true"
          style={{
            left: `calc(2px + ${Math.max(
              0,
              normalized.findIndex((option) => option.value === value),
            )} * (100% - 4px) / ${normalized.length})`,
            width: `calc((100% - 4px) / ${normalized.length})`,
          }}
        />
        {normalized.map((option, index) => (
          <button
            key={index}
            type="button"
            role="radio"
            aria-label={String(option.label)}
            aria-checked={option.value === value}
            tabIndex={option.value === value ? 0 : -1}
            onClick={() => emit(option.value)}
            onKeyDown={(event) => {
              const keys = [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
              ];
              if (!keys.includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? normalized.length - 1
                    : (index +
                        (["ArrowRight", "ArrowDown"].includes(event.key)
                          ? 1
                          : -1) +
                        normalized.length) %
                      normalized.length;
              emit(normalized[next].value);
              track.current.querySelectorAll("button")[next].focus();
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}
export function TweakText({ label, value, placeholder, onChange }) {
  return (
    <TweakRow label={label}>
      <input
        className="field"
        type="text"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </TweakRow>
  );
}
export function TweakNumber({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}) {
  const drag = useRef(),
    clamp = (number) =>
      Math.min(max ?? Infinity, Math.max(min ?? -Infinity, number));
  return (
    <div className="number">
      <label
        tabIndex={0}
        aria-label={`Scrub ${label}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, value };
        }}
        onPointerMove={(event) => {
          if (drag.current)
            onChange(
              scrubNumber(
                drag.current.value,
                event.clientX - drag.current.x,
                step,
                min,
                max,
              ),
            );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
          event.preventDefault();
          onChange(
            scrubNumber(
              value,
              event.key === "ArrowRight" ? 1 : -1,
              step,
              min,
              max,
            ),
          );
        }}
      >
        {label}
      </label>
      <input
        aria-label={label}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
      {unit && <span className="value">{unit}</span>}
    </div>
  );
}
function light(hex) {
  let text = String(hex).replace(/^#/, "");
  if (text.length === 3) text = [...text].map((char) => char + char).join("");
  if (!/^[\da-f]{6}$/i.test(text)) return true;
  const rgb = [0, 2, 4].map((index) =>
    parseInt(text.slice(index, index + 2), 16),
  );
  return rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114 > 148000;
}
export function TweakColor({ label, value, options, onChange }) {
  if (!options?.length)
    return (
      <TweakRow label={label} inline>
        <input
          className="swatch"
          aria-label={label}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </TweakRow>
    );
  const key = (option) => String(JSON.stringify(option)).toLowerCase();
  return (
    <TweakRow label={label}>
      <div className="chips" role="radiogroup" aria-label={label}>
        {options.map((option, index) => {
          const colors = Array.isArray(option) ? option : [option],
            selected = key(option) === key(value);
          return (
            <button
              key={index}
              className="chip"
              type="button"
              role="radio"
              aria-label={colors.join(", ")}
              title={colors.join(" · ")}
              aria-checked={selected}
              style={{ background: colors[0] }}
              onClick={() => onChange(option)}
            >
              {colors.length > 1 && (
                <span>
                  {colors.slice(1, 5).map((color, i) => (
                    <i key={i} style={{ background: color }} />
                  ))}
                </span>
              )}
              {selected && (
                <b style={{ color: light(colors[0]) ? "#172434" : "#fff" }}>
                  ✓
                </b>
              )}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}
export function TweakButton({ label, onClick, secondary = false }) {
  return (
    <button
      className={`action${secondary ? " secondary" : ""}`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
Object.assign(window, {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRow,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakSelect,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton,
});
