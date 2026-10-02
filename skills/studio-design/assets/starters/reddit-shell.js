window.CodexRedditReady = import("./social-phone-loader.js").then(
  ({ loadPhoneShell }) =>
    loadPhoneShell("reddit-shell", () => import("./reddit-shell-runtime.js")),
);
