import { zipSync } from "fflate";
import { exportRegion, downloadBlob } from "./canvas-export.js";
import { nominalFrame, assetName } from "./social-model.js";
import { descendants } from "./social-dom.js";
export async function captureFrame(frame, allowExternal = false) {
  const model = nominalFrame(frame);
  const nodes = [frame, ...descendants(frame)];
  for (const slot of nodes.filter((node) => node.localName === "image-slot"))
    await slot.prepareCapture?.();
  for (const image of nodes.filter((node) => node instanceof HTMLImageElement))
    if (image.getAttribute("src")) await image.decode();
  const blob = await exportRegion(frame, "png", {
    title: model.title,
    outputWidth: model.width,
    outputHeight: model.height,
    allowExternal,
    download: false,
  });
  return { ...model, blob };
}
export async function downloadFrames(
  frames,
  {
    all = false,
    allowExternal = false,
    title = "Social assets",
    onProgress = () => {},
  } = {},
) {
  const outputs = [],
    names = new Set();
  for (let index = 0; index < frames.length; index++) {
    onProgress(index, frames.length);
    const captured = await captureFrame(frames[index], allowExternal),
      name = assetName(captured.title, names);
    outputs.push({ ...captured, name });
  }
  if (!outputs.length)
    throw new Error("There are no visible frames to export.");
  let blob, name;
  if (all) {
    const files = Object.create(null);
    for (const output of outputs)
      files[output.name] = new Uint8Array(await output.blob.arrayBuffer());
    blob = new Blob([zipSync(files, { level: 0 })], {
      type: "application/zip",
    });
    name = assetName(title).replace(/\.png$/, ".zip");
  } else {
    blob = outputs[0].blob;
    name = outputs[0].name;
  }
  downloadBlob(blob, name);
  return {
    blob,
    name,
    frames: outputs.map(({ label, width, height, name }) => ({
      label,
      width,
      height,
      name,
    })),
  };
}
