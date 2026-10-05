import { SocialPhone, phoneAttributes } from "./social-phone.js";
import { icon } from "./social-icons.js";
const style = `
.screen{color:#1a1a1b}.top{display:flex;align-items:center;gap:12px;padding:58px 16px 10px;border-bottom:.5px solid #e0e0e0}.community-top{font-size:15px;font-weight:700;flex:1}.head{display:flex;align-items:center;gap:9px;padding:12px 14px 6px}.community-disc{width:32px;height:32px;border-radius:50%;flex:none;background:linear-gradient(135deg,#ff6a3d,#ff9b63)}.author{flex:1}.community{font-size:13px;font-weight:700;line-height:1.3}.sub{font-size:11.5px;color:#7c7c7c;line-height:1.3}.join{margin-left:auto;background:#ff4500;color:white;border:0;border-radius:999px;padding:6px 14px;font-size:12.5px;font-weight:700}.post-title{padding:4px 14px 10px;font-size:16px;font-weight:600;line-height:1.35}
.actions{display:flex;align-items:center;gap:10px;padding:10px 14px}.chip{display:flex;align-items:center;gap:7px;border:1px solid #e0e0e0;border-radius:999px;padding:7px 13px;font-size:13px;font-weight:600;color:#333}.spacer{flex:1}.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-around;padding:12px 10px 30px;border-top:.5px solid #e0e0e0;color:#1a1a1b}.notifications{position:relative}.notifications:after{content:"";position:absolute;right:3px;top:2px;width:6px;height:6px;border-radius:50%;background:#ff4500}
`;
class RedditShell extends SocialPhone {
  static observedAttributes = [
    ...phoneAttributes,
    "community",
    "username",
    "time",
    "title",
    "upvotes",
    "comments",
    "aspect",
  ];
  constructor() {
    super({
      style,
      placeholder: "Drop the post image",
      markup: `<div class="screen"><div class="top" data-codex-chrome>${icon("back", 22)}<span class="community-top"></span>${icon("more", 20)}</div><div class="head" data-codex-chrome><span class="community-disc"></span><div class="author"><div class="community"></div><div class="sub"></div></div><button class="join" type="button">Join</button></div><div class="post-title" data-codex-chrome></div><div class="frame" part="asset"><slot class="extras"></slot></div><div class="actions" data-codex-chrome><span class="chip">${icon("up", 17)}<span class="upvotes"></span>${icon("down", 17)}</span><span class="chip">${icon("comment", 16)}<span class="comments"></span></span><span class="spacer"></span><span class="chip">${icon("forward", 16)}Share</span></div><div class="nav" data-codex-chrome>${icon("home", 24, true)}${icon("orbit")}${icon("plus")}${icon("comment", 23)}<span class="notifications">${icon("bell")}</span></div></div>`,
    });
  }
  sync() {
    super.sync();
    const community = this.value("community", "r/yourcommunity");
    this.setText(".community-top", community);
    this.setText(".community", community);
    this.setText(
      ".sub",
      this.value("username", "u/yourbrand") + " · " + this.value("time", "5h"),
    );
    this.setText(".post-title", this.value("title"), true);
    this.setText(".upvotes", this.value("upvotes", "1.2k"));
    this.setText(".comments", this.value("comments", "84"));
    const square = this.value("aspect") === "square";
    this.frame.style.aspectRatio = square ? "1/1" : "1200/675";
    this.frame.setAttribute(
      "data-codex-frame-label",
      square ? "Reddit post · 1080×1080" : "Reddit post · 1200×675",
    );
  }
}
if (!customElements.get("reddit-shell"))
  customElements.define("reddit-shell", RedditShell);
