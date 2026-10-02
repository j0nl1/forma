const bounded = (value, low, high, fallback) => {
  const number = value === null || value === "" ? fallback : Number(value);
  return Math.max(
    low,
    Math.min(high, Number.isNaN(number) ? fallback : number),
  );
};
export function fileGeometry(attributes) {
  const read = (name) => attributes.getAttribute(name);
  const width = bounded(read("width"), 120, 4000, 320),
    height = bounded(read("height"), 48, 4000, 200);
  const cropWidth = bounded(read("window-width"), 24, 4000, width);
  const documentWidth = bounded(
    read("document-width"),
    cropWidth,
    12000,
    cropWidth,
  );
  const x = bounded(read("window-x"), 0, 8000, 0),
    y = bounded(read("window-y"), 0, 8000, 0),
    scale = width / cropWidth;
  return {
    width,
    height,
    cropWidth,
    documentWidth,
    x,
    y,
    scale,
    frameHeight: y + height / scale,
    transform: `scale(${scale}) translate(${-x}px, ${-y}px)`,
  };
}
export function fileUrl(file, base) {
  if (!file || file.includes("\0") || /^[a-z][a-z\d+.-]*:|^\/\//i.test(file))
    throw new Error("Choose a project-relative file.");
  const url = new URL(encodeURI(file).replace(/#/g, "%23"), base);
  if (
    url.origin !== new URL(base).origin ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new Error("File previews require the project preview origin.");
  return url;
}
export function fileName(file, base) {
  try {
    return decodeURIComponent(
      fileUrl(file, base).pathname.split("/").pop(),
    ).replace(/\.dc\.html$|\.html$/i, "");
  } catch {
    return String(file).split("/").pop() || "Project file";
  }
}
export function sameFilePath(file, path, base, projectBase = "/") {
  if (!path) return true;
  try {
    const wanted = new URL(
      encodeURI(path).replace(/#/g, "%23"),
      new URL(projectBase, base),
    );
    const actual = fileUrl(file, base);
    return (
      wanted.origin === actual.origin &&
      decodeURIComponent(wanted.pathname) ===
        decodeURIComponent(actual.pathname)
    );
  } catch {
    return false;
  }
}
export function modalGeometry(
  geometry,
  viewportWidth,
  viewportHeight,
  documentHeight,
) {
  const maxWidth = Math.max(80, Math.min(viewportWidth - 128, 960)),
    maxHeight = Math.max(80, viewportHeight - 160);
  const scale = Math.min(2, Math.max(0.66, maxWidth / geometry.documentWidth));
  const fullHeight =
    documentHeight || geometry.y + geometry.height / geometry.scale;
  return {
    scale,
    width: Math.min(Math.round(geometry.documentWidth * scale), maxWidth),
    height: Math.min(Math.max(Math.round(fullHeight * scale), 120), maxHeight),
    pageWidth: Math.round(geometry.documentWidth * scale),
    pageHeight: Math.round(fullHeight * scale),
    maxWidth,
  };
}
