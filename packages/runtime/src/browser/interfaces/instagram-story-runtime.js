import { assetOnly } from "./social-model.js";
import { cssImage } from "./social-dom.js";
let identity = 0;
const style = `
:host{display:block;width:fit-content}*{box-sizing:border-box}.screen{position:relative;display:flex;flex-direction:column;justify-content:center;height:var(--story-height,874px);width:var(--story-width,402px);background:#000;font-family:system-ui}.stage{position:relative;width:100%;aspect-ratio:9/16;overflow:hidden;background:#111}.photo{display:block;position:absolute;inset:0;width:100%;height:100%}.progress{position:absolute;top:10px;left:10px;right:10px;display:flex;gap:4px;z-index:40}.progress i{flex:1;height:2.5px;border-radius:2px;background:#ffffff59}.progress i:first-child{background:white}.head{position:absolute;top:22px;left:14px;right:12px;display:flex;align-items:center;gap:10px;z-index:40;color:white;text-shadow:0 1px 4px #0007}.avatar{width:34px;height:34px;border-radius:50%;flex:none;background:linear-gradient(135deg,#e8e0d8,#c9c2ba) center/cover no-repeat;border:1px solid #ffffff66}.username{font-size:14px;font-weight:600;line-height:1.25}.time{font-size:14px;font-weight:400;opacity:.75}.icons{margin-left:auto;display:flex;align-items:center;gap:16px}.icons svg,.reply svg{display:block;flex:none}.reply{position:absolute;left:14px;right:14px;bottom:24px;display:flex;align-items:center;gap:14px;z-index:40;color:white}.field{flex:1;height:44px;border:1px solid #ffffff8c;border-radius:22px;display:flex;align-items:center;padding:0 18px;font-size:14px;color:#ffffffbf}.extras{display:contents}
.photo::part(status-session){display:none}
:host([image-only=""]) .screen,:host([image-only=true]) .screen{height:auto;background:transparent}:host([image-only=""]) [data-codex-chrome],:host([image-only=true]) [data-codex-chrome]{display:none}
`;
const icons = {
  more: '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><circle cx="3" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="17" cy="10" r="1.6"/></svg>',
  close:
    '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m5 5 12 12M17 5 5 17"/></svg>',
  heart:
    '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M13 22 4 13C-2 6 7 0 13 7c6-7 15-1 9 6Z"/></svg>',
  send: '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m3 11 20-8-8 20-4-8Zm8 4L23 3"/></svg>',
};
class InstagramStory extends HTMLElement {
  static observedAttributes = [
    "id",
    "image-src",
    "image-credit",
    "image-credit-href",
    "username",
    "avatar-src",
    "time",
    "image-only",
    "width",
    "editable",
  ];
  constructor() {
    super();
    this.fallbackId = `instagram-story-${++identity}`;
    const root =
      this.shadowRoot || this.attachShadow({ mode: "open", clonable: true });
    root.innerHTML = `<style>${style}</style><ios-shell data-composed-phone dark><div class="screen"><div class="stage" part="asset" data-codex-frame-export data-codex-frame-label="Instagram story · 1080×1920"><image-slot class="photo" fit="cover" shape="rect" radius="0" placeholder="Drop the story photo"></image-slot><slot class="extras"></slot><div class="progress" data-codex-chrome aria-hidden="true"><i></i><i></i><i></i></div><div class="head" data-codex-chrome><div class="avatar" aria-hidden="true"></div><span class="username"></span><span class="time"></span><span class="icons" aria-hidden="true">${icons.more}${icons.close}</span></div></div><div class="reply" data-codex-chrome><div class="field">Send message</div><span aria-hidden="true">${icons.heart}</span><span aria-hidden="true">${icons.send}</span></div></div></ios-shell>`;
    this.phone = root.querySelector("ios-shell");
    this.image = root.querySelector("image-slot");
    this.frame = root.querySelector(".stage");
  }
  connectedCallback() {
    this.sync();
  }
  attributeChangedCallback() {
    if (this.isConnected) this.sync();
  }
  sync() {
    const raw = Number.parseInt(this.getAttribute("width"), 10),
      outer = Number.isFinite(raw) && raw >= 27 ? raw : 428,
      inner = outer - 26,
      height = Math.round((inner * 874) / 402);
    this.style.setProperty("--story-width", `${inner}px`);
    this.style.setProperty("--story-height", `${height}px`);
    this.phone.setAttribute("width", String(outer));
    this.phone.setAttribute("screen-height", String(height));
    this.phone.setAttribute("image-only", assetOnly(this) ? "true" : "false");
    this.image.id = `${this.id || this.fallbackId}-photo`;
    for (const [attribute, target] of [
      ["image-src", "src"],
      ["image-credit", "credit"],
      ["image-credit-href", "credit-href"],
      ["editable", "editable"],
    ]) {
      const value = this.getAttribute(attribute);
      if (value !== null) this.image.setAttribute(target, value);
      else this.image.removeAttribute(target);
    }
    this.shadowRoot.querySelector(".username").textContent =
      this.getAttribute("username") || "yourbrand";
    this.shadowRoot.querySelector(".time").textContent =
      this.getAttribute("time") || "2h";
    cssImage(
      this.shadowRoot.querySelector(".avatar"),
      this.getAttribute("avatar-src"),
    );
  }
  async prepareCapture() {
    await this.image.prepareCapture?.();
  }
}
if (!customElements.get("instagram-story"))
  customElements.define("instagram-story", InstagramStory);
