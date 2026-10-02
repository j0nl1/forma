import { assetOnly } from "./social-model.js";
import { cssImage } from "./social-dom.js";
let identity = 0;
const commonStyle = `
:host{display:block;width:fit-content}*{box-sizing:border-box}
.screen{position:relative;display:flex;flex-direction:column;width:var(--shell-inner-w,402px);height:var(--shell-screen-h,874px);background:white;font-family:-apple-system,system-ui,sans-serif}
.frame{position:relative;width:100%;flex:none;overflow:hidden;background:#f0f0f0}
.photo{position:absolute;inset:0;display:block;width:100%;height:100%}.extras{display:contents}
.photo::part(status-session){display:none}[hidden]{display:none!important}
svg{display:block;flex:none}.avatar{flex:none;background:linear-gradient(135deg,#e8e0d8,#c9c2ba) center/cover no-repeat}
:host([image-only=""]) .screen,:host([image-only=true]) .screen{height:auto;background:transparent}
:host([image-only=""]) [data-codex-chrome],:host([image-only=true]) [data-codex-chrome]{display:none}
`;
export const phoneAttributes = [
  "id",
  "width",
  "image-only",
  "image-src",
  "image-credit",
  "image-credit-href",
  "avatar-src",
  "editable",
];
export class SocialPhone extends HTMLElement {
  constructor({ style, markup, dark = false, placeholder }) {
    super();
    this.fallbackId = `social-phone-${++identity}`;
    const root =
      this.shadowRoot || this.attachShadow({ mode: "open", clonable: true });
    root.innerHTML = `<style>${commonStyle}${style}</style><ios-shell data-composed-phone ${dark ? "dark" : ""}>${markup}</ios-shell>`;
    this.phone = root.querySelector("ios-shell");
    this.frame = root.querySelector(".frame");
    this.image = document.createElement("image-slot");
    for (const [name, value] of Object.entries({
      class: "photo",
      fit: "cover",
      shape: "rect",
      radius: "0",
      placeholder,
    }))
      this.image.setAttribute(name, value);
    this.frame.prepend(this.image);
    this.frame.setAttribute("data-codex-frame-export", "");
  }
  connectedCallback() {
    this.sync();
  }
  attributeChangedCallback() {
    if (this.isConnected) this.sync();
  }
  value(name, fallback = "") {
    return this.getAttribute(name) || fallback;
  }
  setText(selector, value, hideEmpty = false) {
    const node = this.shadowRoot.querySelector(selector);
    node.textContent = value;
    if (hideEmpty) node.hidden = !value;
  }
  sync() {
    const parsed = Number.parseInt(this.getAttribute("width"), 10),
      outer = Number.isFinite(parsed) && parsed >= 27 ? parsed : 428;
    this.style.setProperty("--shell-inner-w", `${outer - 26}px`);
    this.style.setProperty(
      "--shell-screen-h",
      `${Math.round(((outer - 26) * 874) / 402)}px`,
    );
    this.phone.setAttribute("width", String(outer));
    this.phone.setAttribute(
      "screen-height",
      String(Math.round(((outer - 26) * 874) / 402)),
    );
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
    for (const avatar of this.shadowRoot.querySelectorAll(".avatar"))
      cssImage(avatar, this.getAttribute("avatar-src"));
  }
  async prepareCapture() {
    await this.image.prepareCapture?.();
  }
}
