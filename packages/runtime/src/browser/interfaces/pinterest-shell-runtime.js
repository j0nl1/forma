import { SocialPhone, phoneAttributes } from "./social-phone.js";
import { icon } from "./social-icons.js";
const style = `
.screen{color:#111}.top{display:flex;align-items:center;justify-content:space-between;padding:58px 14px 8px}.pin-wrap{position:relative;margin:4px 12px 0;border-radius:24px;overflow:hidden}.frame{aspect-ratio:1000/1500}.save{position:absolute;top:14px;right:14px;background:#e60023;color:white;border:0;border-radius:999px;padding:12px 20px;font-size:15px;font-weight:700;z-index:5}.visit{position:absolute;bottom:14px;left:14px;background:#fffffff2;color:#111;border:0;border-radius:999px;padding:11px 18px;font-size:14px;font-weight:600;z-index:5}.share{position:absolute;bottom:14px;right:14px;display:flex;gap:8px;z-index:5}.share span{width:40px;height:40px;border-radius:50%;background:#fffffff2;display:grid;place-items:center;color:#111}
.meta{padding:14px 18px 10px}.pin-title{font-size:17px;font-weight:700;line-height:1.3}.head{display:flex;align-items:center;gap:10px;padding:2px 18px 10px}.avatar{width:36px;height:36px;border-radius:50%}.author{flex:1}.username{font-size:14px;font-weight:600;line-height:1.3}.followers{font-size:12.5px;color:#767676;line-height:1.3}.follow{margin-left:auto;background:#efefef;color:#111;border:0;border-radius:999px;padding:9px 16px;font-size:13.5px;font-weight:700}.nav{margin-top:auto;display:flex;align-items:center;justify-content:space-around;padding:12px 10px 30px;border-top:.5px solid #eee;color:#111}.nav .avatar{width:26px;height:26px}
:host([image-only=""]) .pin-wrap,:host([image-only=true]) .pin-wrap{margin:0;border-radius:0}
`;
class PinterestShell extends SocialPhone {
  static observedAttributes = [
    ...phoneAttributes,
    "title",
    "username",
    "followers",
    "site",
  ];
  constructor() {
    super({
      style,
      placeholder: "Drop the pin image",
      markup: `<div class="screen"><div class="top" data-codex-chrome>${icon("back", 22)}${icon("more", 20)}</div><div class="pin-wrap"><div class="frame" part="asset" data-codex-frame-label="Pinterest pin · 1000×1500"><slot class="extras"></slot></div><button class="save" data-codex-chrome type="button">Save</button><button class="visit" data-codex-chrome type="button"></button><div class="share" data-codex-chrome><span>${icon("share", 17)}</span><span>${icon("more", 20)}</span></div></div><div class="meta" data-codex-chrome><div class="pin-title"></div></div><div class="head" data-codex-chrome><div class="avatar"></div><div class="author"><div class="username"></div><div class="followers"></div></div><button class="follow" type="button">Follow</button></div><div class="nav" data-codex-chrome>${icon("home", 24, true)}${icon("search")}${icon("plus")}${icon("comment")}<span class="avatar"></span></div></div>`,
    });
  }
  sync() {
    super.sync();
    const title = this.value("title");
    this.setText(".pin-title", title);
    this.shadowRoot.querySelector(".meta").hidden = !title;
    for (const [selector, name, fallback] of [
      [".username", "username", "yourbrand"],
      [".followers", "followers", "12k followers"],
      [".visit", "site", "Visit site"],
    ])
      this.setText(selector, this.value(name, fallback));
  }
}
if (!customElements.get("pinterest-shell"))
  customElements.define("pinterest-shell", PinterestShell);
