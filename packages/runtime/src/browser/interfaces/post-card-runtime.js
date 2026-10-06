import { postPlatforms } from "./social-model.js";
import { cssImage } from "./social-dom.js";
const style = `
:host{display:block;padding:22px 26px;color:#14130f;background:#fff;font-family:system-ui}*{box-sizing:border-box}[hidden]{display:none!important}.head{display:flex;align-items:center;gap:12px;margin-bottom:12px}.avatar{width:48px;height:48px;border-radius:50%;background:#cfd4da center/cover no-repeat;flex:none}.names{flex:1}.name{font-size:16px;font-weight:700;line-height:1.25}.sub{font-size:14px;color:#77726a}.copy{font-size:16px;line-height:1.5;margin:0 0 14px;white-space:pre-wrap}.media{position:relative;border:1px solid #0f0c081a;border-radius:16px;overflow:hidden}slot{display:block}::slotted([data-codex-frame-export]),::slotted([data-om-frame-export]){border:0!important;border-radius:0!important}.link{border:1px solid #0f0c081a;border-top:0;padding:13px 16px;background:#faf9f7}.domain{font-size:12px;color:#8b8578;text-transform:uppercase;letter-spacing:.04em}.link-title{font-size:16px;font-weight:700;margin-top:3px}.reactions{display:flex;gap:34px;padding:14px 2px 2px;color:#57534a;font-weight:600;font-size:14px}.reactions span{display:flex;align-items:center;gap:7px;white-space:nowrap}.row{display:flex;gap:14px}.main{flex:1;min-width:0}.votes{display:none;flex-direction:column;align-items:center;gap:3px;color:#878a8c;font-size:13px;font-weight:700}.votes svg{display:block}.votes span{color:#14130f}
:host([data-platform=reddit]) .votes{display:flex}:host([data-platform=reddit]) .avatar{display:none}:host([data-platform=reddit]) .head{display:block}:host([data-platform=reddit]) .names{display:flex;flex-direction:column}:host([data-platform=reddit]) .sub{order:-1}:host([data-platform=reddit]) .name{font-size:18px;margin:5px 0 12px}:host([data-platform=reddit]) .head{margin-bottom:0}
:host([image-only=""]),:host([image-only=true]){padding:0;background:transparent}:host([image-only=""]) .head,:host([image-only=true]) .head,:host([image-only=""]) .copy,:host([image-only=true]) .copy,:host([image-only=""]) .reactions,:host([image-only=true]) .reactions,:host([image-only=""]) .link,:host([image-only=true]) .link,:host([image-only=""]) .votes,:host([image-only=true]) .votes{display:none}:host([image-only=""]) .media,:host([image-only=true]) .media{border:0;border-radius:0}
`;
class PostCard extends HTMLElement {
  static observedAttributes = [
    "platform",
    "name",
    "author",
    "sub",
    "text",
    "avatar",
    "link-domain",
    "link-title",
  ];
  constructor() {
    super();
    const root =
      this.shadowRoot || this.attachShadow({ mode: "open", clonable: true });
    root.innerHTML = `<style>${style}</style><div class="row"><div class="votes" aria-label="Illustrative vote count"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 4 17 11H3Z"/></svg><span>2.4k</span><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 16 3 9H17Z"/></svg></div><div class="main"><div class="head"><div class="avatar" aria-hidden="true"></div><div class="names"><div class="name"></div><div class="sub"></div></div></div><p class="copy"></p><div class="media" part="media"><slot></slot></div><div class="link" hidden><div class="domain"></div><div class="link-title"></div></div><div class="reactions" aria-label="Illustrative reaction row"></div></div></div>`;
  }
  connectedCallback() {
    this.sync();
  }
  attributeChangedCallback() {
    if (this.isConnected) this.sync();
  }
  sync() {
    const platform = Object.hasOwn(postPlatforms, this.getAttribute("platform"))
        ? this.getAttribute("platform")
        : "x",
      defaults = postPlatforms[platform],
      root = this.shadowRoot;
    this.dataset.platform = platform;
    root.querySelector(".name").textContent =
      this.getAttribute("name") || this.getAttribute("author") || "Your brand";
    root.querySelector(".sub").textContent =
      this.getAttribute("sub") || defaults.sub;
    const copy = root.querySelector(".copy");
    copy.textContent = this.getAttribute("text") || "";
    copy.hidden = !copy.textContent;
    cssImage(root.querySelector(".avatar"), this.getAttribute("avatar"));
    root.querySelector(".domain").textContent =
      this.getAttribute("link-domain") || "";
    root.querySelector(".link-title").textContent =
      this.getAttribute("link-title") || "";
    root.querySelector(".link").hidden =
      platform !== "facebook" ||
      !(this.getAttribute("link-domain") || this.getAttribute("link-title"));
    root.querySelector(".reactions").replaceChildren(
      ...defaults.reactions.map((text) => {
        const span = document.createElement("span");
        span.textContent = text;
        return span;
      }),
    );
  }
}
if (!customElements.get("post-card"))
  customElements.define("post-card", PostCard);
