window.CodexInstagramReady = import("./social-phone-loader.js").then(
  ({ loadPhoneShell }) =>
    loadPhoneShell(
      "instagram-shell",
      () => import("./instagram-shell-runtime.js"),
    ),
);
