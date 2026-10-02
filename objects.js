const stage = document.querySelector("three-d-stage");
window.Codex3DReady = stage.ready.then(({ THREE }) => {
  const lamp = new THREE.Group();
  lamp.name = "DeskLamp";
  const ceramic = new THREE.MeshStandardMaterial({
    color: "#3e6357",
    roughness: 0.38,
    metalness: 0.08,
  });
  ceramic.name = "GlazedCeramic";
  const brass = new THREE.MeshStandardMaterial({
    color: "#dab372",
    roughness: 0.34,
    metalness: 0.35,
  });
  brass.name = "BrushedBrass";
  const interior = new THREE.MeshStandardMaterial({
    color: "#efe4c8",
    roughness: 0.65,
    side: THREE.DoubleSide,
  });
  interior.name = "WarmInterior";
  function part(name, geometry, material, y) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.y = y;
    lamp.add(mesh);
    return mesh;
  }
  part(
    "Base",
    new THREE.CylinderGeometry(0.15, 0.17, 0.045, 64),
    ceramic,
    0.0225,
  );
  part(
    "BaseCollar",
    new THREE.CylinderGeometry(0.044, 0.048, 0.025, 48),
    brass,
    0.0575,
  );
  part("Stem", new THREE.CylinderGeometry(0.016, 0.016, 0.42, 32), brass, 0.28);
  part(
    "ShadeExterior",
    new THREE.CylinderGeometry(0.09, 0.22, 0.22, 64, 1, true),
    ceramic,
    0.55,
  ).material.side = THREE.DoubleSide;
  part(
    "ShadeInterior",
    new THREE.CylinderGeometry(0.084, 0.213, 0.213, 64, 1, true),
    interior,
    0.55,
  );
  const rim = part(
    "ShadeRim",
    new THREE.TorusGeometry(0.2165, 0.004, 12, 64),
    brass,
    0.44,
  );
  rim.rotation.x = Math.PI / 2;
  part(
    "ShadeCap",
    new THREE.CylinderGeometry(0.09, 0.09, 0.008, 64),
    ceramic,
    0.656,
  );
  part("Bulb", new THREE.SphereGeometry(0.042, 32, 20), interior, 0.49);
  stage.setObject(lamp);
  const turntable = document.querySelector("#turntable");
  function reflectRotation() {
    const active = stage.controls.autoRotate;
    turntable.textContent = active ? "Stop turntable" : "Start turntable";
    turntable.setAttribute("aria-pressed", String(active));
  }
  turntable.onclick = () => {
    if (stage.controls.autoRotate) stage.removeAttribute("autorotate");
    else {
      stage.removeAttribute("autorotate");
      stage.setAttribute("autorotate", "");
    }
    reflectRotation();
  };
  stage.controls.addEventListener("start", reflectRotation);
  return stage;
});

window.Codex3DReady.catch(() => {});
