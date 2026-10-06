import * as THREE from "three";
export function modelBounds(object) {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;
  return { box, sphere: box.getBoundingSphere(new THREE.Sphere()) };
}
function resources(object) {
  const result = new Set();
  object?.traverse((node) => {
    if (node.geometry) result.add(node.geometry);
    for (const material of Array.isArray(node.material)
      ? node.material
      : node.material
        ? [node.material]
        : []) {
      if (!material) continue;
      result.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) result.add(value);
    }
  });
  return result;
}
export function releaseModel(previous, replacement) {
  const retained = resources(replacement);
  for (const resource of resources(previous))
    if (!retained.has(resource)) resource.dispose();
}
export function nameParts(object) {
  const materials = [],
    names = new Set();
  let part = 0,
    materialIndex = 0;
  object.traverse((node) => {
    if (!node.isMesh && !node.isLine && !node.isPoints) return;
    if (!node.name) node.name = `part_${part}`;
    part++;
    for (const material of Array.isArray(node.material)
      ? node.material
      : node.material
        ? [node.material]
        : []) {
      if (!material || materials.includes(material)) continue;
      if (!material.name) material.name = `mat_${materialIndex++}`;
      while (names.has(material.name))
        material.name = `${material.name}_${materialIndex++}`;
      names.add(material.name);
      materials.push(material);
    }
  });
  return materials;
}
