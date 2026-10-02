window.CodexYouTubeReady = import("./social-phone-loader.js").then(
  ({ loadPhoneShell }) =>
    loadPhoneShell("youtube-shell", () => import("./youtube-shell-runtime.js")),
);
