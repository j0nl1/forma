const overlay = document.querySelector("data-overlay");
document
  .querySelector("#overlay-enabled")
  .addEventListener("change", (event) => {
    if (event.target.checked)
      overlay.setAttribute("src", "./overlay-data.json");
    else overlay.removeAttribute("src");
  });
document
  .querySelector("#overlay-controls")
  .addEventListener("change", (event) =>
    overlay.setAttribute("controls", event.target.checked ? "on" : "off"),
  );
document.querySelector("#cover-toggle").addEventListener("click", () => {
  const panel = document.querySelector(".cover-panel");
  panel.hidden = !panel.hidden;
  overlay.measure();
});
document
  .querySelector("#reload-data")
  .addEventListener("click", () =>
    overlay.dispatchEvent(new Event("overlay:reload")),
  );
document.querySelectorAll(".workspace button").forEach((button) =>
  button.addEventListener("click", () => {
    document.querySelector(".screen-status").textContent =
      `${button.textContent.trim()} selected in the local demonstration.`;
  }),
);
