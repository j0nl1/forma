import { fields, triple, phraseOK, requestFor } from "./data-overlay-model.js";
import { node } from "./data-overlay-dom.js";
const suggestions = {
  metric: ["bounce rate"],
  cohort: ["new users only", "returning users"],
  window: ["last 7 days", "weekends only"],
};
export class OverlayControls {
  constructor(host) {
    this.host = host;
  }
  renderSentence() {
    this.closeMenu();
    this.host.sentence.replaceChildren();
    if (this.host.getAttribute("controls") !== "on" || !this.host.enabled())
      return;
    const active = this.host.active(),
      busy = this.host.getAttribute("data-state") === "loading";
    if (!active) {
      this.host.sentence.append(document.createTextNode("No data views yet."));
      this.host.sentence.append(this.askButton(busy));
      return;
    }
    const current = this.host.want || triple(active);
    this.host.sentence.append(document.createTextNode("Showing "));
    for (const field of fields) {
      if (field !== "metric" && !this.host.options(field).length) continue;
      if (field !== "metric")
        this.host.sentence.append(
          document.createTextNode(field === "cohort" ? " for " : " over "),
        );
      const token = node("button", "dv-tok", current[field] || "—");
      token.type = "button";
      token.dataset.tok = field;
      token.setAttribute("aria-label", `${field}: ${current[field] || "none"}`);
      token.setAttribute("aria-haspopup", "listbox");
      token.setAttribute("aria-expanded", "false");
      token.append(node("span", "dv-tcar", "▾"));
      token.addEventListener("click", () => {
        if (this.host.menuToken === token) this.closeMenu();
        else this.openMenu(field, token);
      });
      token.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (this.host.menuToken === token)
            this.host.menu.querySelector(".dv-mi,input")?.focus();
          else this.openMenu(field, token, true);
        } else if (["Enter", " "].includes(event.key)) {
          event.preventDefault();
          if (this.host.menuToken === token) this.closeMenu(true);
          else this.openMenu(field, token, true);
        }
      });
      this.host.sentence.append(token);
    }
    this.host.sentence.append(document.createTextNode("."));
    if (busy || this.host.want || active.refreshable)
      this.host.sentence.append(this.askButton(busy));
  }
  askButton(busy) {
    const button = node(
      "button",
      "dv-ask",
      busy
        ? "Draft ready — awaiting data"
        : "Ask your assistant to fetch metrics",
    );
    button.type = "button";
    button.toggleAttribute("data-busy", busy);
    button.addEventListener("click", () => {
      if (this.host.getAttribute("data-state") === "loading") {
        this.host.stopWaiting();
        this.host.timedOut = false;
        this.host.rest();
        this.renderSentence();
        return;
      }
      this.ask(
        this.host.want || !this.host.data.length ? "missing" : "refresh",
      );
    });
    return button;
  }
  openMenu(field, token, focus = false) {
    this.closeMenu();
    const menu = node("div", "dv-menu");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", `Choose ${field}`);
    const current = (this.host.want || triple(this.host.active() || {}))[field];
    for (const value of this.host.options(field)) {
      const option = node(
        "button",
        `dv-mi${value === current ? " dv-cur" : ""}`,
        value || "—",
      );
      option.type = "button";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(value === current));
      option.dataset.value = value;
      option.addEventListener("click", () => {
        this.closeMenu();
        this.host.pick(field, value);
        this.focusToken(field);
      });
      menu.append(option);
    }
    if (this.host.options(field).length) menu.append(node("div", "dv-mdiv"));
    const row = node("div", "dv-min"),
      input = node("input", "dv-minp"),
      go = node("button", "dv-mgo", "ask");
    input.type = "text";
    input.maxLength = 64;
    input.spellcheck = false;
    input.setAttribute("aria-label", `ask for a different ${field}`);
    input.placeholder =
      field === "window"
        ? "try another range…"
        : field === "metric"
          ? "try a different metric…"
          : "try a different cut…";
    go.type = "button";
    go.hidden = true;
    const submit = () => {
      const typed = input.value
        .replace(/[‘’‛]/g, "'")
        .replace(/[–—]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 64);
      if (!typed) return;
      const authored = this.host
        .options(field)
        .find((value) => value.toLowerCase() === typed.toLowerCase());
      if (authored) {
        this.closeMenu();
        this.host.pick(field, authored);
        this.focusToken(field);
        return;
      }
      if (!phraseOK(typed)) {
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      this.host.want = {
        ...(this.host.want || triple(this.host.active() || {})),
        [field]: typed,
      };
      this.closeMenu();
      this.ask("missing");
      this.focusToken(field);
    };
    input.addEventListener("input", () => {
      input.removeAttribute("aria-invalid");
      go.hidden = !input.value.trim();
      row.toggleAttribute("data-filled", !go.hidden);
    });
    input.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" &&
        !event.isComposing &&
        event.keyCode !== 229
      ) {
        event.preventDefault();
        submit();
      }
    });
    go.addEventListener("click", submit);
    row.append(input, go);
    menu.append(row);
    this.host.shadowRoot.append(menu);
    this.host.menu = menu;
    this.host.menuToken = token;
    token.setAttribute("aria-expanded", "true");
    this.positionMenu();
    menu.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const items = [...menu.querySelectorAll(".dv-mi,input")],
        index = items.indexOf(event.target);
      items[
        Math.max(
          0,
          Math.min(
            items.length - 1,
            index + (event.key === "ArrowDown" ? 1 : -1),
          ),
        )
      ]?.focus();
    });
    this.host.outside = (event) => {
      if (
        !event.composedPath().includes(menu) &&
        !event.composedPath().includes(token)
      )
        this.closeMenu();
    };
    document.addEventListener("click", this.host.outside, true);
    this.rotatePlaceholder(input, field);
    if (focus) menu.querySelector(".dv-mi,input")?.focus();
  }
  positionMenu() {
    if (!this.host.menu || !this.host.menuToken) return;
    const box = this.host.menuToken.getBoundingClientRect();
    Object.assign(this.host.menu.style, {
      left: `${Math.max(8, Math.min(box.left - 8, innerWidth - this.host.menu.offsetWidth - 8))}px`,
      top: `${Math.max(8, Math.min(box.bottom + 8, innerHeight - this.host.menu.offsetHeight - 8))}px`,
      maxHeight: `${Math.max(80, innerHeight - 16)}px`,
    });
  }
  focusToken(field) {
    this.host.sentence
      .querySelector(`[data-tok="${field}"]`)
      ?.focus({ preventScroll: true });
  }
  rotatePlaceholder(input, field) {
    const authored =
      Array.isArray(this.host.suggest?.[field]) &&
      this.host.suggest[field].length
        ? this.host.suggest[field]
        : suggestions[field];
    const options = this.host.options(field).map((v) => v.toLowerCase());
    const list = authored.filter(
      (s) => typeof s === "string" && s && !options.includes(s.toLowerCase()),
    );
    if (!list.length) return;
    input.placeholder = list[0];
    if (list.length === 1) return;
    let index = 0;
    this.host.placeholderTimer = setInterval(() => {
      if (input.value) return;
      input.classList.add("dv-phfade");
      this.host.placeholderFade = setTimeout(() => {
        if (input.value) {
          input.classList.remove("dv-phfade");
          return;
        }
        input.placeholder = list[++index % list.length];
        input.classList.remove("dv-phfade");
      }, 360);
    }, 3200);
  }
  closeMenu(focus = false) {
    clearInterval(this.host.placeholderTimer);
    clearTimeout(this.host.placeholderFade);
    document.removeEventListener("click", this.host.outside, true);
    this.host.menu?.remove();
    if (this.host.menuToken) {
      this.host.menuToken.setAttribute("aria-expanded", "false");
      if (focus && this.host.menuToken.isConnected)
        this.host.menuToken.focus({ preventScroll: true });
    }
    this.host.menu = null;
    this.host.menuToken = null;
  }
  async ask(mode) {
    const request = requestFor({
      src: this.host.getAttribute("src") || "",
      mode,
      active: this.host.active(),
      want: this.host.want,
    });
    if (request.mode === "missing" && !this.host.want && request.want)
      this.host.want = request.want;
    this.host.timedOut = false;
    this.host.state("loading");
    clearTimeout(this.host.waitTimer);
    this.host.waitTimer = setTimeout(() => {
      if (this.host.getAttribute("data-state") === "loading") {
        this.host.timedOut = true;
        this.host.state("stale");
        this.renderSentence();
      }
    }, 90000);
    this.host.render();
    this.showDraft(request);
    this.host.dispatchEvent(
      new CustomEvent("data-overlay:fetch", {
        detail: request,
        bubbles: true,
        composed: true,
      }),
    );
    try {
      if (typeof this.host.onRequest === "function") {
        await this.host.onRequest(request);
        this.host.draftStatus.textContent =
          "Draft delivered for review. Send it in your assistant chat when ready.";
      } else {
        await navigator.clipboard.writeText(request.text);
        this.host.draftStatus.textContent =
          "Copied. Paste into your assistant chat, review and send.";
      }
    } catch {
      this.host.draftStatus.textContent =
        "Copy the draft below, then paste it into your assistant chat to review and send.";
    }
    return request;
  }
  showDraft(request) {
    this.host.draft.hidden = false;
    this.host.draft.replaceChildren(node("strong", null, "Request fresh data"));
    this.host.draftText = node("textarea");
    this.host.draftText.readOnly = true;
    this.host.draftText.value = request.text;
    this.host.draftText.setAttribute("aria-label", "Metric request text");
    this.host.draftStatus = node("p");
    this.host.draftStatus.setAttribute("role", "status");
    const copy = node("button", null, "Copy request"),
      close = node("button", null, "Hide draft");
    copy.type = close.type = "button";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(this.host.draftText.value);
        this.host.draftStatus.textContent =
          "Copied. Paste into your assistant chat, review and send.";
      } catch {
        this.host.draftText.select();
        this.host.draftStatus.textContent =
          "Select and copy the draft, then review and send it in your assistant chat.";
      }
    });
    close.addEventListener("click", () => {
      this.host.draft.hidden = true;
    });
    this.host.draft.append(
      this.host.draftText,
      this.host.draftStatus,
      copy,
      document.createTextNode(" "),
      close,
    );
  }
}
