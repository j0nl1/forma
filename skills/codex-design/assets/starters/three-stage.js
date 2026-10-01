/* ES module source: bundle with scripts/build.mjs before use.
   <three-stage> then element.setObject(mesh) or await element.load('./model.glb'). */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
export { THREE };
class ThreeStage extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML =
      '<style>:host{display:block;height:500px;min-height:250px;background:#edf1f6;border-radius:12px;overflow:hidden}.viewport{height:calc(100% - 48px)}canvas{display:block;width:100%;height:100%}.tools{height:48px;display:flex;align-items:center;gap:8px;padding:0 12px}button{font:14px system-ui;background:white;border:1px solid #bdc6d2;border-radius:6px;padding:6px 12px;cursor:pointer}p{padding:20px;font:16px system-ui}</style><div class="viewport"></div><div class="tools"><button data-reset>Reset camera</button><button data-glb>Download GLB</button><button data-obj>Download OBJ</button></div>';
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      root.querySelector(".viewport").append(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color("#edf1f6");
      this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
      this.camera.position.set(3, 2, 3);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 3));
      const light = new THREE.DirectionalLight(0xffffff, 4);
      light.position.set(5, 8, 5);
      this.scene.add(light);
      const fill = new THREE.DirectionalLight(0xaabbee, 2);
      fill.position.set(-5, 3, -4);
      this.scene.add(fill);
      this.observer = new ResizeObserver(() => {
        const v = root.querySelector(".viewport");
        this.renderer.setSize(v.clientWidth, v.clientHeight);
        this.camera.aspect = v.clientWidth / Math.max(1, v.clientHeight);
        this.camera.updateProjectionMatrix();
      });
      this.observer.observe(root.querySelector(".viewport"));
      this.renderer.setAnimationLoop(() => {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
      });
      root.querySelector("[data-reset]").onclick = () => this.frame();
      root.querySelector("[data-obj]").onclick = () =>
        this.download(
          new OBJExporter().parse(this.object),
          "model.obj",
          "text/plain",
        );
      root.querySelector("[data-glb]").onclick = async () => {
        try {
          this.download(
            await new GLTFExporter().parseAsync(this.object, { binary: true }),
            "model.glb",
            "model/gltf-binary",
          );
        } catch (e) {
          this.status(e.message);
        }
      };
      this.setObject(
        new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial({ color: 0x275dad, roughness: 0.4 }),
        ),
      );
    } catch (e) {
      this.renderer?.dispose();
      root.querySelector(".viewport").innerHTML =
        "<p>WebGL is unavailable. Open this artifact in a browser with WebGL enabled.</p>";
      root.querySelectorAll("button").forEach((b) => (b.disabled = true));
    }
  }
  disconnectedCallback() {
    this.observer?.disconnect();
    this.controls?.dispose();
    this.renderer?.setAnimationLoop(null);
    this.renderer?.dispose();
    this.disposeObject();
  }
  disposeObject() {
    this.object?.traverse((n) => {
      n.geometry?.dispose();
      const materials = n.material
        ? Array.isArray(n.material)
          ? n.material
          : [n.material]
        : [];
      for (const m of materials) {
        for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
        m.dispose();
      }
    });
  }
  setObject(object) {
    if (this.object) {
      this.scene.remove(this.object);
      this.disposeObject();
    }
    this.object = object;
    this.scene.add(object);
    this.frame();
  }
  async load(url) {
    const model = await new GLTFLoader().loadAsync(url);
    this.setObject(model.scene);
    return model;
  }
  frame() {
    if (!this.object) return;
    const box = new THREE.Box3().setFromObject(this.object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const distance = Math.max(size.x, size.y, size.z, 1) * 2.7;
    this.controls.target.copy(center);
    this.camera.position
      .copy(center)
      .add(new THREE.Vector3(distance, distance * 0.65, distance));
    this.camera.near = distance / 1000;
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  download(data, name, type) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  status(message) {
    const p = document.createElement("p");
    p.textContent = message;
    this.shadowRoot.querySelector(".viewport").append(p);
  }
}
if (!customElements.get("three-stage"))
  customElements.define("three-stage", ThreeStage);
