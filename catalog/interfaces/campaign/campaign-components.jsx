import React from "react";
import { validateCampaignUnits } from "../../../packages/runtime/src/browser/interfaces/campaign-model.js";
import {
  TweakSection,
  TweakToggle,
} from "../../../packages/runtime/src/browser/controls/tweaks-components.jsx";
export {
  campaignFormats,
  campaignDefaults,
} from "../../../packages/runtime/src/browser/interfaces/campaign-model.js";
// Callbacks author their own platform context and artwork; no image generation is simulated.
export function CampaignBoard({
  units,
  values = {},
  label = "Campaign",
  ...props
}) {
  validateCampaignUnits(units);
  return (
    <social-frames label={label} {...props}>
      {units
        .filter((unit) => values[unit.format] !== false)
        .map((unit) => (
          <div
            key={unit.id}
            data-campaign-unit={unit.id}
            data-campaign-format={unit.format}
          >
            {unit.render({
              imagesOnly: values.imagesOnly === true,
              format: unit.format,
            })}
          </div>
        ))}
    </social-frames>
  );
}
export function CampaignControls({ units, values, onChange }) {
  validateCampaignUnits(units);
  const formats = [...new Set(units.map((unit) => unit.format))];
  return (
    <>
      <TweakSection label="Formats">
        {formats.map((format) => (
          <TweakToggle
            key={format}
            label={format}
            value={values[format] !== false}
            onChange={(value) => onChange(format, value)}
          />
        ))}
      </TweakSection>
      <TweakSection label="Display">
        <TweakToggle
          label="imagesOnly"
          value={values.imagesOnly === true}
          onChange={(value) => onChange("imagesOnly", value)}
        />
      </TweakSection>
    </>
  );
}
