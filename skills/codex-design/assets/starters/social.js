/* <social-frame platform="instagram|story|x|linkedin|reddit|youtube|tiktok|facebook|pinterest">
   <post-card author="...">...</post-card></social-frame>. Generic editable context. */
(() => {
  class Social extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML =
        "<style>:host{display:block;max-width:540px;margin:auto;border:1px solid #d5dbe4;border-radius:14px;overflow:hidden;background:white;color:#192330;font:14px system-ui}header{padding:15px 20px;border-bottom:1px solid #ddd;font-weight:700}slot{display:block}</style><header></header><slot></slot>";
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
      root.querySelector("header").textContent =
        (names[this.getAttribute("platform")] || "Social") + " · local mockup";
    }
  }
  class Post extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML =
        '<style>:host{display:block;padding:18px;border-bottom:1px solid #ddd}header{display:flex;gap:10px;align-items:center;margin-bottom:12px}i{display:grid;place-items:center;background:#e4ebf7;width:36px;height:36px;border-radius:50%;font-style:normal}slot{display:block}</style><header><i aria-hidden="true"></i><strong></strong></header><slot></slot>';
      const author = this.getAttribute("author") || "Example account";
      root.querySelector("strong").textContent = author;
      root.querySelector("i").textContent = author.slice(0, 1);
    }
  }
  if (!customElements.get("social-frame"))
    customElements.define("social-frame", Social);
  if (!customElements.get("post-card"))
    customElements.define("post-card", Post);
})();
