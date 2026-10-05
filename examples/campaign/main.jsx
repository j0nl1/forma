import React, { useEffect } from "react";
import portrait from "../social/portrait.svg";
import { createRoot } from "react-dom/client";
import {
  CampaignBoard,
  CampaignControls,
  campaignFormats,
  campaignDefaults,
} from "../../skills/forma/assets/starters/campaign-components.jsx";
import {
  useTweaks,
  readTweakDefaults,
  TweaksPanel,
} from "../../skills/forma/assets/starters/tweaks-components.jsx";
import "../../skills/forma/assets/starters/social.js";
const copy = {
  instagramPost: "A good page leaves room.",
  instagramPortrait: "Stay with the next useful idea.",
  story: "Read a little. See a little more.",
  xPost: "An idea deserves a little space.",
  facebook: "Make a quiet corner for the next chapter.",
  linkedin: "Attention is a design material. Give it room.",
  pinterest: "A reading corner worth keeping",
  reddit: "What helps you make space for a thought?",
  youtubeThumbnail: "Make a little room for the thought",
  tiktok: "One quiet page can change the day.",
};
const headlines = {
  instagramPost: "A little room.",
  instagramPortrait: "Stay with\nthe page.",
  story: "Read a little.\nSee a little\nmore.",
  xPost: "Leave room.",
  facebook: "Make space.",
  linkedin: "Stay curious.",
  pinterest: "Keep a little\nroom.",
  reddit: "Leave room.",
  youtubeThumbnail: "Look again.",
  tiktok: "Read a little.\nSee a little\nmore.",
};
export function Artwork({ headline, index }) {
  return (
    <div className="campaign-art">
      <small>READING ROOM / {String(index + 1).padStart(2, "0")}</small>
      <h2>{headline}</h2>
    </div>
  );
}
export function campaignUnits() {
  const mobile = campaignFormats
    .filter((format) => !format.desktop)
    .map((format, index) => ({
      id: "reading-" + format.key,
      format: format.key,
      render: ({ imagesOnly }) => {
        const attrs = {
          id: "reading-" + format.key,
          "image-src": portrait,
          "image-credit": "Original vector study",
          "image-only": String(imagesOnly),
          editable: "session",
        };
        const artwork = (
          <Artwork headline={headlines[format.key]} index={index} />
        );
        switch (format.key) {
          case "instagramPost":
          case "instagramPortrait":
            return (
              <instagram-shell
                {...attrs}
                username="readingroom"
                aspect={format.key === "instagramPost" ? "square" : "portrait"}
                caption={copy[format.key]}
                location="Reading room studio"
              >
                {artwork}
              </instagram-shell>
            );
          case "story":
            return (
              <instagram-story {...attrs} username="readingroom" time="2h">
                {artwork}
              </instagram-story>
            );
          case "xPost":
            return (
              <x-shell
                {...attrs}
                name="Reading room"
                handle="@readingroom"
                text={copy.xPost}
              >
                {artwork}
              </x-shell>
            );
          case "facebook":
            return (
              <facebook-shell
                {...attrs}
                name="Reading room"
                text={copy.facebook}
              >
                {artwork}
              </facebook-shell>
            );
          case "linkedin":
            return (
              <linkedin-shell
                {...attrs}
                name="Reading room"
                headline="A studio for thoughtful work"
                text={copy.linkedin}
              >
                {artwork}
              </linkedin-shell>
            );
          case "pinterest":
            return (
              <pinterest-shell
                {...attrs}
                username="readingroom"
                title={copy.pinterest}
              >
                {artwork}
              </pinterest-shell>
            );
          case "reddit":
            return (
              <reddit-shell
                {...attrs}
                community="r/readingroom"
                username="u/readingroom"
                title={copy.reddit}
              >
                {artwork}
              </reddit-shell>
            );
          case "youtubeThumbnail":
            return (
              <youtube-shell
                {...attrs}
                channel="Reading room"
                title={copy.youtubeThumbnail}
                duration="3:12"
              >
                {artwork}
              </youtube-shell>
            );
          case "tiktok":
            return (
              <tiktok-shell
                {...attrs}
                username="@readingroom"
                caption={copy.tiktok}
              >
                {artwork}
              </tiktok-shell>
            );
        }
      },
    }));
  const desktop = campaignFormats
    .filter((format) => format.desktop)
    .map((format, index) => ({
      id: "reading-" + format.key,
      format: format.key,
      render: ({ imagesOnly }) => (
        <chrome-shell
          tab={`${format.platform} · Reading room`}
          url={`${format.platform}.example/readingroom`}
          image-only={String(imagesOnly)}
        >
          <div className="desktop-feed">
            <post-card
              platform={format.platform}
              name="Reading room"
              text={copy[format.platform === "x" ? "xPost" : format.platform]}
              image-only={String(imagesOnly)}
            >
              <div
                className="desktop-asset"
                data-codex-frame-export=""
                data-codex-frame-label={`${format.platform.toUpperCase()} desktop · ${format.width}×${format.height}`}
                style={{ aspectRatio: `${format.width}/${format.height}` }}
              >
                <image-slot
                  id={"reading-" + format.key + "-photo"}
                  src={portrait}
                  credit="Original vector study"
                  editable="session"
                  fit="cover"
                  shape="rect"
                  radius="0"
                />
                <Artwork
                  headline={
                    headlines[
                      format.platform === "x" ? "xPost" : format.platform
                    ]
                  }
                  index={index + 10}
                />
              </div>
            </post-card>
          </div>
        </chrome-shell>
      ),
    }));
  const carousel = [
    "One page can be a beginning.",
    "Leave a little room.",
    "Follow the useful question.",
    "Keep what stays with you.",
    "Make your own field notes.",
  ].map((headline, index) => ({
    id: `reading-carousel-${index + 1}`,
    format: "carousel",
    render: ({ imagesOnly }) => (
      <instagram-shell
        id={`reading-carousel-${index + 1}`}
        username="readingroom"
        aspect="portrait"
        image-src={portrait}
        image-credit="Original vector study"
        editable="session"
        image-only={String(imagesOnly)}
        caption={`Field notes · ${index + 1}/5`}
      >
        <Artwork headline={headline} index={index + 14} />
      </instagram-shell>
    ),
  }));
  return [...mobile, ...desktop, ...carousel];
}
function App({ onReady }) {
  const units = campaignUnits(),
    [values, set] = useTweaks(
      readTweakDefaults({ ...campaignDefaults(), carousel: false }),
      { id: "campaign" },
    );
  useEffect(() => {
    window.CodexCampaign = { units, store: set.store };
    onReady();
    return () => delete window.CodexCampaign;
  }, [set, onReady]);
  return (
    <>
      <main>
        <header>
          <a href="index.html">← All examples</a>
          <h1>
            One campaign.
            <br />
            Fourteen placements.
          </h1>
          <p>
            Ten mobile formats, four desktop feeds, and an optional five-frame
            narrative carousel. Open Campaign formats to choose placements or
            strip every platform context. Use the board's PNG and ZIP controls
            for actual downloads.
          </p>
          <p className="note">
            This original reading-room study uses illustrative account details
            and counts. Image and format edits in this public demo stay in the
            browser. Source-connected local previews can save project files.
          </p>
        </header>
        <CampaignBoard
          id="campaign"
          label="Reading room campaign"
          units={units}
          values={values}
        />
        <output id="campaign-result" aria-live="polite">
          Each asset downloads at its labeled dimensions.
        </output>
      </main>
      <TweaksPanel id="campaign" title="Campaign formats" store={set.store}>
        <CampaignControls units={units} values={values} onChange={set} />
      </TweaksPanel>
    </>
  );
}
window.CodexCampaignReady = (async () => {
  await window.CodexSocialReady;
  await new Promise((resolve) =>
    createRoot(document.getElementById("campaign-app")).render(
      <App onReady={resolve} />,
    ),
  );
})();
document.addEventListener("social-frames:export", (event) => {
  document.getElementById("campaign-result").textContent =
    `Downloaded ${event.detail.name} — ${event.detail.frames.length} assets`;
});
