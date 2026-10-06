import React from "react";
import { createRoot } from "react-dom/client";
import { DesignCanvas, DCSection, DCArtboard } from "./canvas-components.jsx";
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
        <DesignCanvas {...values}>
          <DCSection title="Explore an idea">
            <DCArtboard label="First composition" width={640} height={360}>
              <div style={{ padding: 40 }}>
                <h1>Turn ideas into media</h1>
                <p>An editable board with one clear idea.</p>
              </div>
            </DCArtboard>
          </DCSection>
        </DesignCanvas>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")).render(<Preview />);
