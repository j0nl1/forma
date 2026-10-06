import React from "react";
import { createRoot } from "react-dom/client";
import { CampaignBoard } from "./campaign-components.jsx";
import manifest from "./manifest.json";
const properties = manifest.parameters.properties;
function Preview() {
  const [values, setValues] = React.useState(
    Object.fromEntries(
      Object.entries(properties).map(([key, schema]) => [key, schema.default]),
    ),
  );
  return (
    <>
      <form
        className="preview-controls"
        onSubmit={(event) => event.preventDefault()}
      >
        {Object.entries(properties).map(([key, schema]) => (
          <label key={key}>
            {key}
            <input
              type={
                schema.type === "boolean"
                  ? "checkbox"
                  : schema.type === "number"
                    ? "number"
                    : "text"
              }
              step="any"
              checked={schema.type === "boolean" ? values[key] : undefined}
              value={
                schema.type === "boolean" ? undefined : (values[key] ?? "")
              }
              onChange={(event) =>
                setValues((previous) => ({
                  ...previous,
                  [key]:
                    schema.type === "boolean"
                      ? event.target.checked
                      : schema.type === "number"
                        ? Number(event.target.value)
                        : event.target.value,
                }))
              }
            />
          </label>
        ))}
      </form>
      <main className="preview-stage">
        <CampaignBoard
          units={[
            {
              id: "opening",
              format: "instagramPost",
              render: () => (
                <div
                  style={{
                    width: 400,
                    height: 400,
                    padding: 48,
                    background: "#397758",
                    color: "white",
                  }}
                >
                  <h1>One clear idea</h1>
                  <p>A complete campaign placement.</p>
                </div>
              ),
            },
          ]}
        />
      </main>
    </>
  );
}
createRoot(document.getElementById("root")).render(<Preview />);
