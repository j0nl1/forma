import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { nameParts } from "./three-stage-model.js";
function baseName(value) {
  return (value || "model").replace(/[^\w.-]+/g, "_");
}
export function objFiles(object, name) {
  object.updateWorldMatrix(true, true);
  const materials = nameParts(object),
    base = baseName(name);
  const mtl = materials
    .map((material) => {
      const color = material.color ?? { r: 0.8, g: 0.8, b: 0.8 };
      return [
        `newmtl ${material.name}`,
        `Kd ${[color.r, color.g, color.b].map((value) => value.toFixed(4)).join(" ")}`,
        "Ks 0.2000 0.2000 0.2000",
        `Ns ${Math.round((1 - (material.roughness ?? 0.5)) * 200)}`,
        `d ${(material.opacity ?? 1).toFixed(4)}`,
        "",
      ].join("\n");
    })
    .join("\n");
  return [
    {
      name: `${base}.obj`,
      type: "text/plain",
      data: `mtllib ${base}.mtl\n${new OBJExporter().parse(object)}`,
    },
    { name: `${base}.mtl`, type: "text/plain", data: mtl },
  ];
}
export async function glbFile(object, name) {
  object.updateWorldMatrix(true, true);
  nameParts(object);
  return {
    name: `${baseName(name)}.glb`,
    type: "model/gltf-binary",
    data: await new GLTFExporter().parseAsync(object, { binary: true }),
  };
}
export function saveFile(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
