import { SocialPhone, phoneAttributes } from "./social-phone.js";
import { icon } from "./social-icons.js";
const style = `
.screen{background:#f3f2ef;color:#1d1d1d}.top{display:flex;align-items:center;gap:10px;padding:58px 14px 10px;background:white}.profile-disc{width:32px;height:32px;border-radius:50%;flex:none;background:linear-gradient(135deg,#e8e0d8,#c9c2ba) center/cover no-repeat}.search{flex:1;background:#eef3f8;border-radius:6px;padding:8px 12px;font-size:14px;color:#5b6770;display:flex;align-items:center;gap:8px}
.card{background:white;margin-top:8px}.head{display:flex;align-items:flex-start;gap:9px;padding:12px 14px 8px}.avatar{width:44px;height:44px;border-radius:50%}.author{flex:1;min-width:0}.name{font-size:14.5px;font-weight:600;line-height:1.3}.headline{font-size:12.5px;color:#666;line-height:1.35}.sub{font-size:12.5px;color:#666;display:flex;align-items:center;gap:4px}.follow{margin-left:auto;color:#0a66c2;font-size:14.5px;font-weight:600;background:none;border:0;display:flex;align-items:center;gap:4px}.copy{padding:0 14px 10px;font-size:14.5px;line-height:1.4}
.counts{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;font-size:12.5px;color:#666;border-bottom:.5px solid #e8e8e8;margin:0 0 2px}.reaction-disc{width:16px;height:16px;border-radius:50%;background:#378fe9;display:inline-flex;align-items:center;justify-content:center;color:white;margin-right:4px}.actions{display:flex;align-items:center;padding:2px 6px 6px}.action{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 0;font-size:12px;font-weight:600;color:#5b6770;white-space:nowrap}
.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-around;padding:12px 10px 30px;background:white;border-top:.5px solid #e8e8e8;color:#5b6770}
:host([image-only=""]) .card,:host([image-only=true]) .card{margin:0;background:transparent}
`;
class LinkedInShell extends SocialPhone {
  static observedAttributes = [
    ...phoneAttributes,
    "name",
    "headline",
    "time",
    "text",
    "reactions",
    "comments",
    "reposts",
    "aspect",
  ];
  constructor() {
    super({
      style,
      placeholder: "Drop the post image",
      markup: `<div class="screen"><div class="top" data-codex-chrome><span class="profile-disc"></span><div class="search">${icon("search", 15)}Search</div></div><div class="card"><div class="head" data-codex-chrome><div class="avatar"></div><div class="author"><div class="name"></div><div class="headline"></div><div class="sub"><span class="time"></span> · ${icon("globe", 11)}</div></div><button class="follow" type="button">${icon("plus", 14)}Follow</button></div><div class="copy" data-codex-chrome></div><div class="frame" part="asset"><slot class="extras"></slot></div><div class="counts" data-codex-chrome><span><span class="reaction-disc">${icon("thumb", 9, true)}</span><span class="reactions"></span></span><span><span class="comments"></span> · <span class="reposts"></span></span></div><div class="actions" data-codex-chrome>${[
        ["thumb", "Like"],
        ["comment", "Comment"],
        ["repost", "Repost"],
        ["send", "Send"],
      ]
        .map(
          ([symbol, label]) =>
            `<span class="action">${icon(symbol, 18)}${label}</span>`,
        )
        .join(
          "",
        )}</div></div><div class="nav" data-codex-chrome>${icon("home", 24, true)}${icon("people")}${icon("create")}${icon("bell")}${icon("briefcase")}</div></div>`,
    });
  }
  sync() {
    super.sync();
    for (const [name, fallback] of [
      ["name", "Your brand"],
      ["time", "2h"],
      ["reactions", "847"],
      ["comments", "63 comments"],
      ["reposts", "12 reposts"],
    ])
      this.setText("." + name, this.value(name, fallback));
    this.setText(".headline", this.value("headline"));
    this.setText(".copy", this.value("text"), true);
    const square = this.value("aspect") === "square";
    this.frame.style.aspectRatio = square ? "1/1" : "1200/627";
    this.frame.setAttribute(
      "data-codex-frame-label",
      square ? "LinkedIn post · 1080×1080" : "LinkedIn post · 1200×627",
    );
  }
}
if (!customElements.get("linkedin-shell"))
  customElements.define("linkedin-shell", LinkedInShell);
