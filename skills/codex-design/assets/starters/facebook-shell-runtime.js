import { SocialPhone, phoneAttributes } from "./social-phone.js";
import { icon } from "./social-icons.js";
const style = `
.screen{background:#f0f2f5;color:#050505}.top{display:flex;align-items:center;justify-content:space-between;padding:58px 16px 10px;background:white}.feed-title{font-size:22px;font-weight:800;letter-spacing:-.4px}.icons{display:flex;gap:12px;align-items:center}.icon-disc{width:36px;height:36px;border-radius:50%;background:#e4e6eb;display:grid;place-items:center}
.card{background:white;margin-top:8px}.head{display:flex;align-items:center;gap:9px;padding:12px 14px 8px}.avatar{width:40px;height:40px;border-radius:50%}.author{flex:1}.name{font-size:15px;font-weight:600;line-height:1.25}.sub{font-size:12.5px;color:#65676b;line-height:1.25;display:flex;align-items:center;gap:4px}.copy{padding:0 14px 10px;font-size:15px;line-height:1.35}
.counts{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;font-size:13.5px;color:#65676b}.reactions{display:flex;align-items:center;gap:5px}.reaction-disc{width:18px;height:18px;border-radius:50%;background:#1877f2;display:inline-flex;align-items:center;justify-content:center;color:white}.reaction-disc.love{background:#f33e58;margin-left:-6px}.actions{display:flex;align-items:center;border-top:.5px solid #e4e6eb;margin:0 10px;padding:2px 0}.action{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:9px 0;font-size:14px;font-weight:600;color:#65676b}
.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-around;padding:12px 10px 30px;background:white;border-top:.5px solid #e4e6eb;color:#65676b}.nav .active{color:#1877f2}
:host([image-only=""]) .card,:host([image-only=true]) .card{margin:0;background:transparent}
`;
class FacebookShell extends SocialPhone {
  static observedAttributes = [
    ...phoneAttributes,
    "name",
    "time",
    "text",
    "likes",
    "comments",
    "shares",
    "aspect",
  ];
  constructor() {
    super({
      style,
      placeholder: "Drop the post image",
      markup: `<div class="screen"><div class="top" data-codex-chrome><span class="feed-title">Feed</span><span class="icons"><span class="icon-disc">${icon("search", 19)}</span><span class="icon-disc">${icon("comment", 19)}</span></span></div><div class="card"><div class="head" data-codex-chrome><div class="avatar"></div><div class="author"><div class="name"></div><div class="sub"><span class="time"></span> · ${icon("globe", 12)}</div></div></div><div class="copy" data-codex-chrome></div><div class="frame" part="asset"><slot class="extras"></slot></div><div class="counts" data-codex-chrome><span class="reactions"><span class="reaction-disc">${icon("thumb", 11, true)}</span><span class="reaction-disc love">${icon("heart", 10, true)}</span><span class="likes"></span></span><span><span class="comments"></span> · <span class="shares"></span></span></div><div class="actions" data-codex-chrome>${[
        ["thumb", "Like"],
        ["comment", "Comment"],
        ["forward", "Share"],
      ]
        .map(
          ([symbol, label]) =>
            `<span class="action">${icon(symbol, 18)}${label}</span>`,
        )
        .join(
          "",
        )}</div></div><div class="nav" data-codex-chrome><span class="active">${icon("home", 25, true)}</span>${icon("video", 25)}${icon("store", 25)}${icon("bell", 25)}${icon("menu", 25)}</div></div>`,
    });
  }
  sync() {
    super.sync();
    for (const [name, fallback] of [
      ["name", "Your brand"],
      ["time", "2h"],
      ["likes", "1.2K"],
      ["comments", "84 comments"],
      ["shares", "23 shares"],
    ])
      this.setText("." + name, this.value(name, fallback));
    this.setText(".copy", this.value("text"), true);
    const square = this.value("aspect") === "square";
    this.frame.style.aspectRatio = square ? "1/1" : "1200/630";
    this.frame.setAttribute(
      "data-codex-frame-label",
      square ? "Facebook post · 1080×1080" : "Facebook post · 1200×630",
    );
  }
}
if (!customElements.get("facebook-shell"))
  customElements.define("facebook-shell", FacebookShell);
