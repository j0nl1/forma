// Full feed/story/board contracts plus the earlier generic context wrapper.
window.CodexSocialReady = (async () => {
  await Promise.all([
    import("./post-card.js"),
    import("./instagram-story.js"),
    import("./social-frames.js"),
    import("./x-shell.js"),
    import("./instagram-shell.js"),
    import("./tiktok-shell.js"),
  ]);
  await Promise.all([
    window.CodexPostsReady,
    window.CodexStoriesReady,
    window.CodexSocialFramesReady,
    window.CodexXReady,
    window.CodexInstagramReady,
    window.CodexTikTokReady,
  ]);
  const names = {
    instagram: "Instagram",
    story: "Instagram Story",
    x: "X",
    linkedin: "LinkedIn",
    reddit: "Reddit",
    youtube: "YouTube",
    tiktok: "TikTok",
    facebook: "Facebook",
    pinterest: "Pinterest",
  };
  class SocialFrame extends HTMLElement {
    static observedAttributes = ["platform"];
    connectedCallback() {
      if (!this.shadowRoot) {
        const root = this.attachShadow({ mode: "open", clonable: true });
        root.innerHTML =
          "<style>:host{display:block;max-width:540px;margin:auto;border:1px solid #d5dbe4;border-radius:14px;overflow:hidden;background:white;color:#192330;font:14px system-ui}header{padding:15px 20px;border-bottom:1px solid #ddd;font-weight:700}slot{display:block}</style><header></header><slot></slot>";
      }
      this.sync();
    }
    attributeChangedCallback() {
      if (this.isConnected && this.shadowRoot) this.sync();
    }
    sync() {
      this.shadowRoot.querySelector("header").textContent =
        (names[this.getAttribute("platform")] || "Social") + " · local mockup";
    }
  }
  if (!customElements.get("social-frame"))
    customElements.define("social-frame", SocialFrame);
})();
