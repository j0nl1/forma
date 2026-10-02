window.CodexFacebookReady = import("./social-phone-loader.js").then(
  ({ loadPhoneShell }) =>
    loadPhoneShell(
      "facebook-shell",
      () => import("./facebook-shell-runtime.js"),
    ),
);
