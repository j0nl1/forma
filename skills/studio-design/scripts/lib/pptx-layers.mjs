// Capture an isolated paint layer without changing the source's layout. Each
// touched style attribute is restored byte for byte, including an absent one.
export async function capturePptxImage(page, slideLocator, object) {
  if (object.hidden)
    return Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==",
      "base64",
    );
  if (object.root && object.layer !== "paint")
    return slideLocator.screenshot({ type: "png", animations: "disabled" });
  await slideLocator.scrollIntoViewIfNeeded();
  const transaction = await page.evaluateHandle(
    ({ sourceId, layer, neutralizeTransforms }) => {
      const target = document.querySelector(
        `[data-codex-pptx-source="${sourceId}"]`,
      );
      if (!target)
        throw new Error("PowerPoint capture target no longer exists.");
      const all = [];
      const collect = (node) => {
        for (const element of node.querySelectorAll("*")) {
          all.push(element);
          if (element.shadowRoot) collect(element.shadowRoot);
        }
      };
      collect(document);
      const insideTarget = (element) => {
        for (
          let current = element;
          current;
          current = current.parentElement ?? current.getRootNode().host
        ) {
          if (current === target) return true;
        }
        return false;
      };
      const state = all
        .filter((element) => getComputedStyle(element).display !== "none")
        .map((element) => ({
          element,
          style: element.getAttribute("style"),
          visibility: getComputedStyle(element).visibility,
          textFill:
            getComputedStyle(element).webkitTextFillColor ===
            getComputedStyle(element).color
              ? "currentColor"
              : getComputedStyle(element).webkitTextFillColor,
          keep:
            element === target || (layer !== "paint" && insideTarget(element)),
        }));
      for (const item of state) {
        const style = item.element.style;
        if (
          neutralizeTransforms &&
          item.element.hasAttribute("data-codex-pptx-source")
        ) {
          const computed = getComputedStyle(item.element);
          for (const [property, identity] of Object.entries({
            transform: "matrix(1,0,0,1,0,0)",
            translate: "0px 0px",
            rotate: "0deg",
            scale: "1",
          }))
            if (computed[property] !== "none")
              style.setProperty(property, identity, "important");
        }
        style.setProperty(
          "visibility",
          item.keep ? item.visibility : "hidden",
          "important",
        );
        style.setProperty(
          "-webkit-text-fill-color",
          item.keep && layer !== "paint" ? item.textFill : "transparent",
          "important",
        );
        if (!item.keep) {
          // The deck's shadow-root print rules can force slide visibility. Clear
          // paint explicitly while retaining border widths and all geometry.
          for (const [name, value] of Object.entries({
            "background-color": "transparent",
            "background-image": "none",
            "border-color": "transparent",
            "box-shadow": "none",
            "text-shadow": "none",
            "outline-color": "transparent",
          }))
            style.setProperty(name, value, "important");
        } else if (layer === "paint")
          style.setProperty("text-shadow", "none", "important");
      }
      return state;
    },
    {
      sourceId: object.sourceId,
      layer: object.layer ?? "subtree",
      neutralizeTransforms: object.neutralizeTransforms,
    },
  );
  try {
    const origin = await slideLocator.boundingBox();
    if (!origin)
      throw new Error("PowerPoint slide is not visible during capture.");
    const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    const geometry = object.captureGeometry ?? object;
    return await page.screenshot({
      type: "png",
      // The clip below uses document coordinates, including scroll offsets.
      // Viewport screenshots would truncate or miss later print-layout slides.
      fullPage: true,
      animations: "disabled",
      omitBackground: true,
      clip: {
        x: origin.x + scroll.x + geometry.x,
        y: origin.y + scroll.y + geometry.y,
        width: geometry.w,
        height: geometry.h,
      },
    });
  } finally {
    await transaction.evaluate((state) => {
      for (const { element, style } of state) {
        // Synchronize pending CSSOM edits before removing an absent attribute.
        element.setAttribute("style", style ?? "");
        if (style === null) element.removeAttribute("style");
      }
    });
    await transaction.dispose();
  }
}
