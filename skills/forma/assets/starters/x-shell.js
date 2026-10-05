window.CodexXReady = import("./social-phone-loader.js").then(
  ({ loadPhoneShell }) =>
    loadPhoneShell("x-shell", () => import("./x-shell-runtime.js")),
);
