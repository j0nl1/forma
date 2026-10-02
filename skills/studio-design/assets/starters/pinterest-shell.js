window.CodexPinterestReady = import("./social-phone-loader.js").then(
  ({ loadPhoneShell }) =>
    loadPhoneShell(
      "pinterest-shell",
      () => import("./pinterest-shell-runtime.js"),
    ),
);
