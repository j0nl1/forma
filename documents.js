window.CodexDocumentReady.then(() => {
  const stage = document.querySelector("doc-page");
  const mode = document.querySelector("#mode"),
    paper = document.querySelector("#paper");
  const notes = {
    flow: "Flowing text uses your chosen paper at print. Running headers and footers repeat on every sheet. Sample content describes a fictional study.",
    flier:
      "One full-bleed page. The design owns its insets; content outside the page box is clipped. This is a fictional event.",
    brochure:
      "Exactly two landscape pages. Outside order: inside flap, back cover, front cover. Print double-sided, flip on the short edge, use actual size and fold the right panel in first.",
    poster:
      "An explicitly requested 22 × 30 in poster. Its PDF retains those true dimensions. The sheet fits the screen; choose Actual-size preview to inspect it with scrolling.",
    fit: "A 1400 × 990 px design scaled onto the printable area of your selected sheet. It remains one page, with its bottom content intact.",
  };
  function update() {
    document.querySelector("#preview-choice").hidden = mode.value !== "poster";
    for (const attribute of [
      "width",
      "height",
      "content-width",
      "content-height",
      "orientation",
    ])
      stage.removeAttribute(attribute);
    stage.setAttribute("size", paper.value);
    if (mode.value === "brochure")
      stage.setAttribute("orientation", "landscape");
    if (mode.value === "poster") {
      stage.setAttribute("width", "22in");
      stage.setAttribute("height", "30in");
    }
    if (mode.value === "fit") {
      stage.setAttribute("content-width", "1400px");
      stage.setAttribute("content-height", "990px");
    }
    updatePreview();
    stage.replaceChildren(
      document.querySelector(`#${mode.value}`).content.cloneNode(true),
    );
    document.querySelector("#instructions").textContent = notes[mode.value];
  }
  mode.onchange = paper.onchange = update;
  function updatePreview() {
    if (
      mode.value === "poster" &&
      document.querySelector("#actual-size").checked
    )
      stage.setAttribute("preview", "actual-size");
    else stage.removeAttribute("preview");
  }
  document.querySelector("#actual-size").onchange = updatePreview;
  document.querySelector("#print").onclick = async () => {
    await document.fonts.ready;
    await window.CodexDocument.preparePrint({ paper: paper.value });
    try {
      window.print();
    } finally {
      window.CodexDocument.restorePrint();
    }
  };
  update();
});
