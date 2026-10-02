import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DesignCanvas,
  DCSection,
  DCArtboard,
  DCPostIt,
} from "../../skills/studio-design/assets/starters/canvas-components.jsx";
function Reading({ dense = false }) {
  const [saved, setSaved] = useState(false);
  return (
    <article className={`direction ${dense ? "dense" : ""}`}>
      <p className="eyebrow">HARBOR / READING ROOM</p>
      <h2>
        {dense ? (
          <>
            Everything,
            <br />
            within reach.
          </>
        ) : (
          <>
            Keep what
            <br />
            stays with you.
          </>
        )}
      </h2>
      <p>
        {dense
          ? "Your articles, references and next ideas in one useful collection."
          : "One clear collection with space for the next idea."}
      </p>
      <div className="reading-item">
        <span>Aa</span>
        <div>
          <small>DESIGN · 8 MIN</small>
          <h3>Attention is a design material</h3>
        </div>
      </div>
      <button onClick={() => setSaved(!saved)}>
        {saved ? "Saved to your collection ✓" : "Save this article →"}
      </button>
      <small className="hint">
        This control works inside the canvas and focus view.
      </small>
    </article>
  );
}
function App() {
  return (
    <DesignCanvas
      id="reading-directions"
      style={{ width: "100%", height: "calc(100vh - 58px)" }}
    >
      <DCSection
        id="collection"
        title="Collection directions"
        subtitle="Two ways to make room for a reader's ideas."
      >
        <DCArtboard id="calm" label="Editorial calm" width={360} height={470}>
          <Reading />
        </DCArtboard>
        <DCArtboard id="dense" label="Focused utility" width={360} height={470}>
          <Reading dense />
        </DCArtboard>
        <DCPostIt top={-6} left={800} width={185} rotate={3}>
          Same reading task. Compare the hierarchy and density before choosing a
          direction.
        </DCPostIt>
      </DCSection>
      <DCSection
        id="capture"
        title="Capture the next idea"
        subtitle="A shorter route from a link to a saved reference."
      >
        <DCArtboard
          id="quick-save"
          label="Quick capture"
          width={360}
          height={380}
          style={{ background: "#f6f1e5" }}
        >
          <article className="direction capture">
            <p className="eyebrow">HARBOR / QUICK CAPTURE</p>
            <h2>
              A place for
              <br />
              the next idea.
            </h2>
            <p>Keep a useful reference close.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                event.currentTarget.querySelector("button").textContent =
                  "Reference saved ✓";
              }}
            >
              <label>
                Reference title
                <input required placeholder="What stays with you?" />
              </label>
              <button>Save reference →</button>
            </form>
          </article>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}
createRoot(document.getElementById("root")).render(<App />);
