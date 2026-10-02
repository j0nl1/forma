import { SocialPhone, phoneAttributes } from "./social-phone.js";
import { icon } from "./social-icons.js";
const style = `
.screen{color:#000}.top{display:flex;align-items:center;justify-content:space-between;padding:58px 16px 8px}.title{font-size:22px;font-weight:700;letter-spacing:-.4px}.icons{display:flex;gap:20px;align-items:center}
.head{display:flex;align-items:center;gap:10px;padding:8px 14px}.avatar-ring{width:34px;height:34px;border-radius:50%;padding:2px;background:linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5);flex:none}.avatar-ring .avatar{width:100%;height:100%;border-radius:50%;border:2px solid white}.author{flex:1}.username{font-size:13px;font-weight:600;line-height:1.25}.location{font-size:11px;line-height:1.25}
.actions{display:flex;align-items:center;gap:15px;padding:8px 14px 4px}.save{margin-left:auto}.meta{padding:0 14px;display:flex;flex-direction:column;gap:5px;flex:0 1 auto;min-height:0;overflow:hidden}.likes{font-size:13px;font-weight:600}.caption{font-size:13px;line-height:1.4}.caption b{font-weight:600;margin-right:4px}.comments{font-size:13px;color:#8e8e8e;margin-top:2px}.time{font-size:10px;color:#8e8e8e;letter-spacing:.3px;text-transform:uppercase;margin-top:4px}
.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-between;padding:12px 22px 30px;border-top:.5px solid #dbdbdb}.nav .avatar{width:26px;height:26px;border-radius:50%;border:1.5px solid #000}
`;
class InstagramShell extends SocialPhone {
  static observedAttributes = [
    ...phoneAttributes,
    "username",
    "location",
    "caption",
    "likes",
    "comments",
    "time",
    "aspect",
  ];
  constructor() {
    super({
      style,
      placeholder: "Drop the post photo",
      markup: `<div class="screen"><div class="top" data-codex-chrome><span class="title">Home</span><span class="icons">${icon("plus")}${icon("heart")}${icon("send")}</span></div><div class="head" data-codex-chrome><div class="avatar-ring"><div class="avatar"></div></div><div class="author"><div class="username"></div><div class="location"></div></div>${icon("more", 22)}</div><div class="frame" part="asset"><slot class="extras"></slot></div><div class="actions" data-codex-chrome>${icon("heart", 25)}${icon("comment", 25)}${icon("send", 25)}<span class="save">${icon("save", 25)}</span></div><div class="meta" data-codex-chrome><div class="likes"></div><div class="caption"><b></b><span></span></div><div class="comments"></div><div class="time"></div></div><div class="nav" data-codex-chrome aria-label="Feed navigation">${icon("home", 26, true)}${icon("search", 25)}${icon("create", 25)}${icon("heart", 26)}<span class="avatar"></span></div></div>`,
    });
  }
  sync() {
    super.sync();
    const username = this.value("username", "yourbrand");
    this.setText(".username", username);
    this.setText(".caption b", username);
    this.setText(".caption span", this.value("caption").replace(/^\s+/, ""));
    this.setText(".location", this.value("location"), true);
    this.setText(".comments", this.value("comments"), true);
    this.setText(".likes", this.value("likes", "1,024 likes"));
    this.setText(".time", this.value("time", "2 hours ago"));
    const portrait = this.value("aspect") === "portrait";
    this.frame.style.aspectRatio = portrait ? "1080/1350" : "1/1";
    this.frame.setAttribute(
      "data-codex-frame-label",
      portrait
        ? "Instagram portrait · 1080×1350"
        : "Instagram post · 1080×1080",
    );
  }
}
if (!customElements.get("instagram-shell"))
  customElements.define("instagram-shell", InstagramShell);
