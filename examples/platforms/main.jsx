import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  IOSDevice,
  IOSList,
  IOSListRow,
  AndroidDevice,
  AndroidListItem,
  ChromeWindow,
  MacWindow,
  MacSidebarHeader,
  MacSidebarItem,
} from "../../catalog/interfaces/platforms/platform-components.jsx";
function Laboratory() {
  const [dark, setDark] = useState(false),
    [keyboard, setKeyboard] = useState(false),
    [large, setLarge] = useState(true),
    [tab, setTab] = useState(0),
    [selected, setSelected] = useState("Library");
  return (
    <>
      <div className="controls">
        <label>
          <input
            type="checkbox"
            checked={dark}
            onChange={(e) => setDark(e.target.checked)}
          />{" "}
          Dark device backdrop
        </label>
        <label>
          <input
            type="checkbox"
            checked={keyboard}
            onChange={(e) => setKeyboard(e.target.checked)}
          />{" "}
          Show visual keyboards
        </label>
        <label>
          <input
            type="checkbox"
            checked={large}
            onChange={(e) => setLarge(e.target.checked)}
          />{" "}
          Large Android title
        </label>
      </div>
      <div className="phones">
        <section>
          <h2>iOS composition</h2>
          <div className="pane">
            <IOSDevice title="Reading room" dark={dark} keyboard={keyboard}>
              <div
                style={{ padding: "16px 0", color: dark ? "white" : "#263c34" }}
              >
                <IOSList header="Your library" dark={dark}>
                  <IOSListRow
                    title="Saved essays"
                    detail="12"
                    icon="#497662"
                    dark={dark}
                  />
                  <IOSListRow
                    title="Collections"
                    detail="4"
                    icon="#d7a64e"
                    dark={dark}
                  />
                  <IOSListRow
                    title="Reading settings"
                    chevron={false}
                    isLast
                    dark={dark}
                  />
                </IOSList>
                <div style={{ padding: 24 }}>
                  <label>
                    Find an essay
                    <input
                      placeholder="Search your library"
                      aria-label="iOS library search"
                      style={{
                        display: "block",
                        marginTop: 10,
                        padding: 12,
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    />
                  </label>
                  <p>Your input remains live when the shell changes.</p>
                </div>
              </div>
            </IOSDevice>
          </div>
        </section>
        <section>
          <h2>Android composition</h2>
          <div className="pane">
            <AndroidDevice
              title="Reading room"
              large={large}
              dark={dark}
              keyboard={keyboard}
            >
              <div style={{ background: "#f4fbf8" }}>
                <AndroidListItem
                  headline="The quiet work"
                  supporting="An essay about attention"
                  leading="Q"
                />
                <AndroidListItem
                  headline="Small observations"
                  supporting="Notes from the week"
                  leading="S"
                />
              </div>
              <div style={{ padding: 24, color: dark ? "white" : "#263c34" }}>
                <label>
                  Write a note
                  <textarea
                    aria-label="Android note"
                    style={{
                      display: "block",
                      marginTop: 10,
                      padding: 12,
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                </label>
              </div>
            </AndroidDevice>
          </div>
        </section>
      </div>
      <section>
        <h2>Chrome composition</h2>
        <div className="controls">
          <button onClick={() => setTab(0)}>Show library tab</button>
          <button onClick={() => setTab(1)}>Show notes tab</button>
        </div>
        <div className="pane">
          <ChromeWindow
            width={980}
            height={410}
            tabs={[{ title: "Library" }, { title: "Notes" }]}
            activeIndex={tab}
            url={`reading.example/${tab === 0 ? "library" : "notes"}`}
          >
            <article className="page">
              <p className="eyebrow">A CLEARER VIEW</p>
              <h3>
                {tab === 0
                  ? "Keep what stays with you."
                  : "Leave a useful note."}
              </h3>
              <p>
                The active tab and URL are authored props. Browser chrome is
                presentation.
              </p>
              <input
                aria-label="Browser page input"
                placeholder="An ordinary live input"
              />
            </article>
          </ChromeWindow>
        </div>
      </section>
      <section>
        <h2>macOS composition</h2>
        <div className="controls">
          {["Library", "Notes"].map((label) => (
            <button key={label} onClick={() => setSelected(label)}>
              Select {label}
            </button>
          ))}
        </div>
        <div className="pane">
          <MacWindow
            width={980}
            height={410}
            title={selected}
            sidebar={
              <>
                <MacSidebarHeader title="Reading room" />
                <MacSidebarItem
                  label="Library"
                  selected={selected === "Library"}
                />
                <MacSidebarItem label="Notes" selected={selected === "Notes"} />
                <MacSidebarHeader title="Collections" />
                <MacSidebarItem label="Design" />
                <MacSidebarItem label="Writing" />
              </>
            }
          >
            <article className="page">
              <p className="eyebrow">YOUR WORKSPACE</p>
              <h3>{selected}</h3>
              <p>
                Compose the sidebar, toolbar, glass surfaces and content
                independently.
              </p>
              <input
                aria-label="Desktop page input"
                placeholder="An ordinary live input"
              />
            </article>
          </MacWindow>
        </div>
      </section>
    </>
  );
}
createRoot(document.getElementById("react-platforms")).render(<Laboratory />);
