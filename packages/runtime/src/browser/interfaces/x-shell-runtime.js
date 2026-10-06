import { SocialPhone, phoneAttributes } from "./social-phone.js";
import { icon } from "./social-icons.js";
const style = `
.screen{color:#0f1419}.top{display:flex;align-items:center;gap:22px;padding:58px 16px 10px;font-size:17px;font-weight:700}
.head{display:flex;align-items:center;gap:10px;padding:12px 16px 4px}.avatar{width:40px;height:40px;border-radius:50%}.author{flex:1}.name{font-size:15px;font-weight:700;line-height:1.25}.handle{font-size:14px;color:#536471;line-height:1.25}.follow{margin-left:auto;border:0;border-radius:999px;background:#0f1419;color:white;padding:7px 16px;font:700 14px system-ui}
.copy{padding:8px 16px 12px;font-size:16.5px;line-height:1.4;white-space:pre-wrap}.media{position:relative;flex:none;margin:0 16px;border:1px solid #e1e8ed;border-radius:16px;overflow:hidden}
.meta{padding:14px 16px 12px;font-size:14px;color:#536471;border-bottom:.5px solid #e1e8ed}.views{color:#0f1419;font-weight:700}.actions{display:flex;align-items:center;justify-content:space-around;padding:10px;border-bottom:.5px solid #e1e8ed;color:#6b7580}.action{display:flex;align-items:center;gap:5px;font-size:13px}
.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-around;padding:12px 10px 30px;border-top:.5px solid #e1e8ed}
:host([image-only=""]) .media,:host([image-only=true]) .media{margin:0;border:0;border-radius:0}
`;
class XShell extends SocialPhone {
  static observedAttributes = [
    ...phoneAttributes,
    "name",
    "handle",
    "text",
    "time",
    "views",
    "replies",
    "reposts",
    "likes",
    "aspect",
  ];
  constructor() {
    super({
      style,
      placeholder: "Drop the post image",
      markup: `<div class="screen"><div class="top" data-codex-chrome>${icon("back", 22)}<span>Post</span></div><div class="head" data-codex-chrome><div class="avatar"></div><div class="author"><div class="name"></div><div class="handle"></div></div><button class="follow" type="button">Follow</button></div><div class="copy" data-codex-chrome></div><div class="media"><div class="frame" part="asset"><slot class="extras"></slot></div></div><div class="meta" data-codex-chrome><span class="time"></span> · <b class="views"></b> Views</div><div class="actions" data-codex-chrome>${[
        ["comment", "replies"],
        ["repost", "reposts"],
        ["heart", "likes"],
        ["save", ""],
        ["share", ""],
      ]
        .map(
          ([symbol, count]) =>
            `<span class="action">${icon(symbol, 18)}${count ? `<span class="${count}"></span>` : ""}</span>`,
        )
        .join(
          "",
        )}</div><div class="nav" data-codex-chrome aria-label="Feed navigation">${icon("home", 25, true)}${icon("search")}${icon("bell")}${icon("inbox")}</div></div>`,
    });
  }
  sync() {
    super.sync();
    for (const [selector, attribute, fallback] of [
      [".name", "name", "Your brand"],
      [".handle", "handle", "@yourbrand"],
      [".time", "time", "9:41 AM · Today"],
      [".views", "views", "12.4K"],
      [".replies", "replies", "88"],
      [".reposts", "reposts", "340"],
      [".likes", "likes", "1.2K"],
    ])
      this.setText(selector, this.value(attribute, fallback));
    this.setText(".copy", this.value("text"), true);
    const square = this.value("aspect") === "square";
    this.frame.style.aspectRatio = square ? "1/1" : "1200/675";
    this.frame.setAttribute(
      "data-codex-frame-label",
      square ? "X post · 1080×1080" : "X post · 1200×675",
    );
  }
}
if (!customElements.get("x-shell")) customElements.define("x-shell", XShell);
