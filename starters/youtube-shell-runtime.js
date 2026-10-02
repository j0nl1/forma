import { SocialPhone, phoneAttributes } from "./social-phone.js";
import { icon } from "./social-icons.js";
const style = `
.screen{color:#0f0f0f}.top{display:flex;align-items:center;justify-content:space-between;padding:58px 16px 8px}.feed-title{font-size:20px;font-weight:700;letter-spacing:-.3px}.icons{display:flex;gap:18px;align-items:center}.chips{display:flex;gap:8px;padding:8px 16px 12px;overflow:hidden}.chip{background:#f2f2f2;border-radius:8px;padding:6px 12px;font-size:13.5px;font-weight:500;white-space:nowrap}.chip.active{background:#0f0f0f;color:white}.frame{aspect-ratio:1280/720}.duration{position:absolute;right:8px;bottom:8px;background:#000b;color:white;font-size:12px;font-weight:500;line-height:1;padding:3px 5px;border-radius:4px;z-index:5}
.meta{display:flex;align-items:flex-start;gap:12px;padding:12px 16px 10px}.avatar{width:36px;height:36px;border-radius:50%}.description{flex:1;min-width:0}.video-title{font-size:15px;font-weight:600;line-height:1.35}.sub{font-size:12.5px;color:#606060;line-height:1.3;margin-top:4px}.kebab{flex:none;margin-top:2px}.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-around;padding:10px 10px 30px;border-top:.5px solid #e5e5e5}
`;
class YouTubeShell extends SocialPhone {
  static observedAttributes = [
    ...phoneAttributes,
    "title",
    "channel",
    "views",
    "time",
    "duration",
  ];
  constructor() {
    super({
      style,
      placeholder: "Drop the thumbnail image",
      markup: `<div class="screen"><div class="top" data-codex-chrome><span class="feed-title">Home</span><span class="icons">${icon("cast", 20)}${icon("bell", 20)}${icon("search", 20)}</span></div><div class="chips" data-codex-chrome><span class="chip active">All</span><span class="chip">Music</span><span class="chip">Live</span><span class="chip">Gaming</span></div><div class="frame" part="asset" data-codex-frame-label="YouTube thumbnail · 1280×720"><span class="duration" data-codex-chrome></span><slot class="extras"></slot></div><div class="meta" data-codex-chrome><span class="avatar"></span><div class="description"><div class="video-title"></div><div class="sub"><span class="channel"></span> · <span class="views"></span> · <span class="time"></span></div></div><span class="kebab">${icon("kebab", 16)}</span></div><div class="nav" data-codex-chrome>${icon("home", 24, true)}${icon("shorts")}${icon("createCircle", 28)}${icon("subscriptions")}${icon("person")}</div></div>`,
    });
  }
  sync() {
    super.sync();
    for (const [selector, name, fallback] of [
      [".video-title", "title", "Your video title"],
      [".channel", "channel", "Your brand"],
      [".views", "views", "12K views"],
      [".time", "time", "2 days ago"],
      [".duration", "duration", "3:12"],
    ])
      this.setText(selector, this.value(name, fallback));
  }
}
if (!customElements.get("youtube-shell"))
  customElements.define("youtube-shell", YouTubeShell);
