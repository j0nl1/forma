window.CodexTikTokReady = import("./social-phone-loader.js").then(
  ({ loadPhoneShell }) =>
    loadPhoneShell("tiktok-shell", () => import("./tiktok-shell-runtime.js")),
);
