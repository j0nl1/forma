export async function loadPhoneShell(tag, runtime) {
  if (!customElements.get("ios-shell")) await import("./platform-shells.js");
  if (!customElements.get("image-slot"))
    await import("../images/image-runtime.js");
  await runtime();
  await Promise.all(
    [...document.querySelectorAll(tag)].map((shell) =>
      shell.image?.settled?.(),
    ),
  );
}
