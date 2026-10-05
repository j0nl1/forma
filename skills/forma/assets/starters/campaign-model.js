// Mobile and desktop placements remain separate assets in the default roster.
export const campaignFormats = Object.freeze(
  [
    { key: "instagramPost", platform: "instagram", width: 1080, height: 1080 },
    {
      key: "instagramPortrait",
      platform: "instagram",
      width: 1080,
      height: 1350,
    },
    { key: "story", platform: "instagram", width: 1080, height: 1920 },
    { key: "xPost", platform: "x", width: 1200, height: 675 },
    { key: "facebook", platform: "facebook", width: 1200, height: 630 },
    { key: "linkedin", platform: "linkedin", width: 1200, height: 627 },
    { key: "pinterest", platform: "pinterest", width: 1000, height: 1500 },
    { key: "reddit", platform: "reddit", width: 1200, height: 675 },
    { key: "youtubeThumbnail", platform: "youtube", width: 1280, height: 720 },
    { key: "tiktok", platform: "tiktok", width: 1080, height: 1920 },
    { key: "xDesktop", platform: "x", desktop: true, width: 1200, height: 675 },
    {
      key: "linkedinDesktop",
      platform: "linkedin",
      desktop: true,
      width: 1200,
      height: 627,
    },
    {
      key: "facebookDesktop",
      platform: "facebook",
      desktop: true,
      width: 1200,
      height: 630,
    },
    {
      key: "redditDesktop",
      platform: "reddit",
      desktop: true,
      width: 1200,
      height: 675,
    },
  ].map(Object.freeze),
);
export function campaignDefaults({
  platforms,
  formats,
  mobileOnly = false,
} = {}) {
  if (platforms !== undefined && formats !== undefined)
    throw new Error("Choose platforms or explicit formats.");
  const allowed =
    platforms !== undefined
      ? [...new Set(campaignFormats.map((format) => format.platform))]
      : campaignFormats.map((format) => format.key);
  const selected = platforms !== undefined ? platforms : formats;
  if (
    selected !== undefined &&
    (!Array.isArray(selected) ||
      selected.some((value) => !allowed.includes(value)))
  )
    throw new Error("Choose recognized campaign platforms or formats.");
  if (typeof mobileOnly !== "boolean")
    throw new Error("mobileOnly must be a boolean.");
  return Object.fromEntries([
    ...campaignFormats.map((format) => [
      format.key,
      (!selected ||
        selected.includes(
          platforms !== undefined ? format.platform : format.key,
        )) &&
        !(mobileOnly && format.desktop),
    ]),
    ["imagesOnly", false],
  ]);
}
export function validateCampaignUnits(units) {
  if (!Array.isArray(units))
    throw new Error("Author an array of campaign units.");
  const ids = new Set();
  for (const unit of units) {
    if (
      !unit ||
      typeof unit.id !== "string" ||
      !unit.id.trim() ||
      ids.has(unit.id)
    )
      throw new Error("Give every campaign unit a unique stable id.");
    if (
      typeof unit.format !== "string" ||
      !unit.format.trim() ||
      unit.format === "imagesOnly"
    )
      throw new Error("Give each unit a separate format toggle key.");
    if (typeof unit.render !== "function")
      throw new Error("Author a render function for each campaign unit.");
    ids.add(unit.id);
  }
  return units;
}
