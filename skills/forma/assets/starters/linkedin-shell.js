window.CodexLinkedInReady = import("./social-phone-loader.js").then(
  ({ loadPhoneShell }) =>
    loadPhoneShell(
      "linkedin-shell",
      () => import("./linkedin-shell-runtime.js"),
    ),
);
