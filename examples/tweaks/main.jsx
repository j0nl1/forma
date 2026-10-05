import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  useTweaks,
  readTweakDefaults,
  TweaksPanel,
  TweakSuggestionBar,
  TweakSection,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton,
} from "../../skills/forma/assets/starters/tweaks-components.jsx";
const palettes = [
  ["#254f49", "#f6f3e9", "#e3a576"],
  ["#3d426b", "#f0eff8", "#b7addd"],
  ["#73372f", "#fbefdc", "#f2c376"],
];
function Book({ title, symbol, accent }) {
  const [saved, setSaved] = useState(false);
  return (
    <article className="book">
      <div className="cover" style={{ background: accent }}>
        {symbol}
      </div>
      <p className="eyebrow">A reading study · 8 minutes</p>
      <h2>{title}</h2>
      <p>Make space to notice, collect, and return with a fresh perspective.</p>
      <button aria-pressed={saved} onClick={() => setSaved(!saved)}>
        {saved ? "Collected" : "Collect article"}
      </button>
    </article>
  );
}
function App() {
  const [t, setTweak] = useTweaks(readTweakDefaults()),
    store = setTweak.store;
  return (
    <>
      <main
        style={{
          background: t.dark ? t.palette[0] : t.palette[1],
          color: t.dark ? t.palette[1] : t.palette[0],
        }}
      >
        <header>
          <b>HARBOR / READING ROOM</b>
          <a href="index.html">Back to the collection ↗</a>
        </header>
        <section className="intro">
          <p className="eyebrow">A quieter place for your ideas</p>
          <h1
            style={{
              fontSize: t.fontSize,
              fontWeight: 400 + Math.round(t.weight * 200),
            }}
          >
            {t.title}
          </h1>
          <p>
            Explore the same reading room through typography, spacing, density
            and color. Your collection stays intact as the design changes.
          </p>
        </section>
        <section
          className="library"
          style={{
            gap: t.spacing,
            gridTemplateColumns: `repeat(${t.columns},minmax(0,1fr))`,
            maxWidth: t.density === "compact" ? 900 : "none",
          }}
        >
          <Book
            title="Attention is a design material"
            symbol="Aa"
            accent={t.palette[2]}
          />
          <Book
            title="A place for unfinished thoughts"
            symbol="↗"
            accent={t.palette[2]}
          />
        </section>
      </main>
      <TweaksPanel store={store}>
        <TweakSuggestionBar
          suggestions={[
            "Add a quiet-hours dial",
            "Add a print-like mode",
            "Add a reading rhythm slider",
          ]}
        />
        <TweakSection label="Typography">
          <TweakSlider
            label="Title size"
            value={t.fontSize}
            min={28}
            max={70}
            unit="px"
            onChange={(value) => setTweak("fontSize", value)}
          />
          <TweakText
            label="Headline"
            value={t.title}
            onChange={(value) => setTweak("title", value)}
          />
          <TweakNumber
            label="Weight"
            value={t.weight}
            min={0}
            max={1}
            step={0.05}
            onChange={(value) => setTweak("weight", value)}
          />
        </TweakSection>
        <TweakSection label="Layout">
          <TweakRadio
            label="Density"
            value={t.density}
            options={["compact", "comfortable"]}
            onChange={(value) => setTweak("density", value)}
          />
          <TweakRadio
            label="Columns"
            value={t.columns}
            options={[1, 2, 3]}
            onChange={(value) => setTweak("columns", value)}
          />
          <TweakSlider
            label="Spacing"
            value={t.spacing}
            min={8}
            max={48}
            unit="px"
            onChange={(value) => setTweak("spacing", value)}
          />
        </TweakSection>
        <TweakSection label="Theme">
          <TweakColor
            label="Palette"
            value={t.palette}
            options={palettes}
            onChange={(value) => setTweak("palette", value)}
          />
          <TweakToggle
            label="Dark mode"
            value={t.dark}
            onChange={(value) => setTweak("dark", value)}
          />
        </TweakSection>
        <TweakButton
          label="Reset controls"
          secondary
          onClick={() => store.reset()}
        />
        <TweakButton
          label="Download settings"
          secondary
          onClick={() => store.download()}
        />
      </TweaksPanel>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
