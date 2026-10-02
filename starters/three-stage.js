/*! @license Three.js 0.184.0
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
/* Bundle this entry with scripts/build.mjs. Models use meters and Y-up. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { modelBounds, releaseModel } from "./three-stage-model.js";
import { objFiles, glbFile, saveFile } from "./three-stage-export.js";
import { stageStyle } from "./three-stage-style.js";
export { THREE };
export class ThreeDStage extends HTMLElement {
  static observedAttributes = ["background", "autorotate"];
  constructor() {
    super();
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // The visible boot error also works when an author does not await ready.
    this.ready.catch(() => {});
    this.interacted = false;
    this.disposed = false;
  }
  connectedCallback() {
    if (this.disposed) return;
    if (!this.shadowRoot) this.boot();
    if (this.renderer) this.resume();
  }
  boot() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${stageStyle}</style><div class="viewport"></div>
      <p class="note">Drag to orbit · scroll to zoom · right-drag to pan</p>
      <div class="tools"><button data-reset disabled>Reset camera</button>
      <button data-obj disabled>Download OBJ + MTL</button><button data-glb disabled>Download GLB</button></div>
      <p class="status" role="status" hidden></p>`;
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      this.renderer.setPixelRatio(
        Math.min(globalThis.devicePixelRatio || 1, 2),
      );
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      root.querySelector(".viewport").append(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
      this.camera.position.set(3, 2.2, 4);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.autoRotateSpeed = 1.2;
      this.controls.addEventListener("start", () => {
        this.interacted = true;
        this.controls.autoRotate = false;
      });
      this.motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
      this.motionChanged = () => this.configureRotation();
      this.motionPreference.addEventListener("change", this.motionChanged);
      this.configureRotation();
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1));
      this.key = new THREE.DirectionalLight(0xffffff, 2.2);
      this.key.position.set(4, 7, 5);
      this.key.castShadow = true;
      this.key.shadow.mapSize.set(2048, 2048);
      this.key.shadow.bias = -0.0002;
      this.scene.add(this.key);
      const fill = new THREE.DirectionalLight(0xfff4e6, 0.5);
      fill.position.set(-5, 3, -4);
      this.scene.add(fill);
      this.ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.ShadowMaterial({ opacity: 0.18 }),
      );
      this.ground.rotation.x = -Math.PI / 2;
      this.ground.receiveShadow = true;
      this.scene.add(this.ground);
      this.observer = new ResizeObserver(() => this.resize());
      root.querySelector("[data-reset]").onclick = () => {
        this.interacted = false;
        this.frame();
      };
      for (const format of ["obj", "glb"])
        root.querySelector(`[data-${format}]`).onclick = () =>
          this._runExport(format).catch(() => {});
      this.configureBackground();
      this.resize();
      this.resolveReady({ THREE });
    } catch (error) {
      this.controls?.dispose();
      this.renderer?.dispose();
      this.renderer = null;
      const message = document.createElement("p");
      message.className = "error";
      message.textContent =
        "WebGL is unavailable. Open this artifact in a browser with WebGL enabled.";
      root.querySelector(".viewport").replaceChildren(message);
      this.rejectReady(error);
    }
  }
  attributeChangedCallback(name) {
    if (name === "background") this.configureBackground();
    if (name === "autorotate") {
      this.interacted = false;
      this.configureRotation();
    }
  }
  configureBackground() {
    const value = this.getAttribute("background");
    if (value) this.style.setProperty("--stage-bg", value);
    else this.style.removeProperty("--stage-bg");
  }
  configureRotation() {
    if (this.controls)
      this.controls.autoRotate =
        this.hasAttribute("autorotate") &&
        !this.interacted &&
        !this.motionPreference?.matches;
  }
  resume() {
    this.resize();
    this.observer.observe(this);
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
  disconnectedCallback() {
    this.observer?.disconnect();
    this.renderer?.setAnimationLoop(null);
  }
  resize() {
    if (!this.renderer) return;
    const width = Math.max(1, this.clientWidth),
      height = Math.max(1, this.clientHeight);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (!this.interacted) this.frame();
  }
  setObject(object) {
    if (!this.scene || this.disposed)
      throw new Error("Await stage.ready before setting an object.");
    if (!object?.isObject3D)
      throw new TypeError("setObject expects a Three.js Object3D.");
    const previous = this.object;
    if (previous && previous !== object) this.scene.remove(previous);
    this.object = object;
    object.traverse((node) => {
      if (node.isMesh) node.castShadow = node.receiveShadow = true;
    });
    this.scene.add(object);
    if (previous && previous !== object) releaseModel(previous, object);
    this.interacted = false;
    this.frame();
    this.updateButtons();
  }
  async load(url) {
    await this.ready;
    const model = await new GLTFLoader().loadAsync(url);
    this.setObject(model.scene);
    return model;
  }
  frame() {
    if (!this.object || !this.renderer) return;
    const bounds = modelBounds(this.object);
    if (!bounds) return;
    this.ground.position.y = bounds.box.min.y;
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const distance =
      (Math.max(bounds.sphere.radius, 1e-6) /
        Math.tan(Math.min(vertical, horizontal))) *
      1.35;
    this.camera.position
      .copy(bounds.sphere.center)
      .addScaledVector(new THREE.Vector3(1, 0.55, 1.25).normalize(), distance);
    this.camera.near = Math.min(Math.max(distance / 100, 0.01), distance / 10);
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(bounds.sphere.center);
    this.controls.update();
    const radius = Math.max(bounds.sphere.radius, 1e-6) * 3;
    Object.assign(this.key.shadow.camera, {
      left: -radius,
      right: radius,
      top: radius,
      bottom: -radius,
    });
    this.key.shadow.camera.updateProjectionMatrix();
  }
  updateButtons() {
    this.shadowRoot?.querySelectorAll("button").forEach((button) => {
      button.disabled = !this.object || this.exporting || this.disposed;
    });
  }
  exportOBJ() {
    if (!this.object) throw new Error("Set an object before exporting.");
    return objFiles(this.object, this.getAttribute("name"));
  }
  exportGLB() {
    if (!this.object) throw new Error("Set an object before exporting.");
    return glbFile(this.object, this.getAttribute("name"));
  }
  async _runExport(format) {
    if (!this.object || this.exporting || this.disposed) return;
    if (!["obj", "glb"].includes(format))
      throw new Error("Unknown export format.");
    this.exporting = true;
    this.updateButtons();
    this.status("");
    try {
      const files =
        format === "obj" ? this.exportOBJ() : [await this.exportGLB()];
      for (const file of files) this.download(file.data, file.name, file.type);
      this.dispatchEvent(
        new CustomEvent("codex-3d-export", {
          bubbles: true,
          composed: true,
          detail: { format, ok: true, files: files.map((file) => file.name) },
        }),
      );
      return files;
    } catch (error) {
      this.status(`Export failed: ${error.message}`);
      this.dispatchEvent(
        new CustomEvent("codex-3d-export", {
          bubbles: true,
          composed: true,
          detail: { format, ok: false, error: error.message },
        }),
      );
      throw error;
    } finally {
      this.exporting = false;
      this.updateButtons();
    }
  }
  download(data, name, type) {
    saveFile(data, name, type);
  }
  status(message) {
    const label = this.shadowRoot?.querySelector(".status");
    if (label) {
      label.textContent = message;
      label.hidden = !message;
    }
  }
  disposeObject() {
    if (!this.object) return;
    this.scene.remove(this.object);
    releaseModel(this.object);
    this.object = null;
    this.updateButtons();
  }
  dispose() {
    if (this.disposed) return;
    this.disconnectedCallback();
    this.disposed = true;
    this.disposeObject();
    this.motionPreference?.removeEventListener("change", this.motionChanged);
    this.controls?.dispose();
    this.key?.shadow.dispose();
    this.ground?.geometry.dispose();
    this.ground?.material.dispose();
    this.renderer?.dispose();
  }
}
// Compatibility with artifacts authored against the first Codex port.
class ThreeStage extends ThreeDStage {
  boot() {
    super.boot();
    if (!this.renderer) return;
    this.shadowRoot.querySelector("[data-obj]").textContent = "Download OBJ";
    this.setObject(
      new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: 0x275dad, roughness: 0.4 }),
      ),
    );
  }
}
if (!customElements.get("three-d-stage"))
  customElements.define("three-d-stage", ThreeDStage);
if (!customElements.get("three-stage"))
  customElements.define("three-stage", ThreeStage);
