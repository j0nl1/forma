import { SocialPhone, phoneAttributes } from "./social-phone.js";
import { icon } from "./social-icons.js";
const style = `
.screen{justify-content:center;background:black}.frame{aspect-ratio:9/16;background:#111}
.tabs{position:absolute;top:14px;left:0;right:0;display:flex;justify-content:center;gap:18px;z-index:40;color:white;font-size:15px;text-shadow:0 1px 4px #0007}.tabs span{opacity:.7}.tabs .active{font-weight:700;opacity:1;position:relative}.tabs .active:after{content:"";position:absolute;left:50%;transform:translateX(-50%);bottom:-7px;width:28px;height:3px;border-radius:2px;background:white}
.rail{position:absolute;right:8px;bottom:16px;display:flex;flex-direction:column;align-items:center;gap:17px;z-index:40;color:white}.action{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:12px;font-weight:600;text-shadow:0 1px 4px #0007}.rail svg{filter:drop-shadow(0 1px 3px #0006)}.avatar-wrap{position:relative;width:42px;height:42px;margin-bottom:4px}.avatar{display:block;width:42px;height:42px;border-radius:50%;border:1.5px solid white}.follow{position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);width:18px;height:18px;border-radius:50%;background:#fe2c55;color:white;display:grid;place-items:center;font-size:13px;font-weight:700;line-height:1}.disc{width:38px;height:38px;border-radius:50%;margin-top:2px;background:radial-gradient(circle,#e8e0d8 0 9px,#1c1c1e 9px 15px,#3a3a3c 15px)}
.meta{position:absolute;left:12px;right:76px;bottom:16px;display:flex;flex-direction:column;gap:7px;z-index:40;color:white;text-shadow:0 1px 4px #0007}.username{font-size:16px;font-weight:700;line-height:1.2}.caption{font-size:14px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sound{display:flex;align-items:center;gap:7px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sound span{overflow:hidden;text-overflow:ellipsis}
.nav{position:absolute;left:0;right:0;bottom:14px;display:flex;align-items:center;justify-content:space-around;padding:0 10px;z-index:40;color:#ffffff9e}.nav-item{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px}.nav-item.active{color:white;font-weight:600}.create{position:relative;width:42px;height:28px;margin:0 4px}.create:before,.create:after{content:"";position:absolute;inset:0;border-radius:8px}.create:before{background:#25f4ee;transform:translateX(-4px)}.create:after{background:#fe2c55;transform:translateX(4px)}.create b{position:absolute;inset:0;z-index:1;border-radius:8px;background:white;color:black;display:grid;place-items:center;font-size:19px;font-weight:600;line-height:1}
`;
class TikTokShell extends SocialPhone {
  static observedAttributes = [
    ...phoneAttributes,
    "username",
    "caption",
    "sound",
    "likes",
    "comments",
    "saves",
    "shares",
  ];
  constructor() {
    super({
      style,
      dark: true,
      placeholder: "Drop the video still",
      markup: `<div class="screen"><div class="frame" part="asset" data-codex-frame-label="TikTok · 1080×1920"><slot class="extras"></slot><div class="tabs" data-codex-chrome><span>Following</span><span class="active">For You</span></div><div class="rail" data-codex-chrome><span class="avatar-wrap"><span class="avatar"></span><span class="follow">+</span></span>${[
        ["heart", 32, "likes"],
        ["comment", 30, "comments"],
        ["save", 28, "saves"],
        ["forward", 30, "shares"],
      ]
        .map(
          ([symbol, size, count]) =>
            `<span class="action">${icon(symbol, size, true)}<span class="${count}"></span></span>`,
        )
        .join(
          "",
        )}<span class="disc"></span></div><div class="meta" data-codex-chrome><span class="username"></span><span class="caption"></span><span class="sound">${icon("music", 14, true)}<span></span></span></div></div><div class="nav" data-codex-chrome><span class="nav-item active">${icon("home", 23, true)}Home</span><span class="nav-item">${icon("people", 23)}Friends</span><span class="create"><b>+</b></span><span class="nav-item">${icon("inbox", 23)}Inbox</span><span class="nav-item">${icon("person", 23)}Profile</span></div></div>`,
    });
  }
  sync() {
    super.sync();
    const username = this.value("username", "yourbrand").replace(/^@/, "");
    this.setText(".username", "@" + username);
    this.setText(".caption", this.value("caption"), true);
    this.setText(
      ".sound span",
      this.value("sound", "Original sound · " + username),
    );
    for (const [name, fallback] of [
      ["likes", "24.5K"],
      ["comments", "482"],
      ["saves", "1,208"],
      ["shares", "3,407"],
    ])
      this.setText("." + name, this.value(name, fallback));
  }
}
if (!customElements.get("tiktok-shell"))
  customElements.define("tiktok-shell", TikTokShell);
