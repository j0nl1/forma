import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { temporary, root } from "./helpers.mjs";
import { bundle } from "../packages/cli/src/commands/build.mjs";
import { serve } from "../packages/cli/src/commands/preview.mjs";
import { withPage } from "../packages/media/src/lib/browser.mjs";
import { inlineHtml } from "../packages/exports/src/lib/inline.mjs";
import {
  nameParts,
  releaseModel,
} from "../packages/runtime/src/browser/three-stage-model.js";

async function fixture(t, { fail = false } = {}) {
  const dir = await temporary(t);
  await bundle(
    path.join(root, "packages/runtime/src/browser/three-stage.js"),
    path.join(dir, "stage.js"),
  );
  const loaderEntry = path.join(dir, "loaders.js");
  await fs.writeFile(
    loaderEntry,
    `import { GLTFLoader } from ${JSON.stringify(path.join(root, "node_modules/three/examples/jsm/loaders/GLTFLoader.js"))};
import { OBJLoader } from ${JSON.stringify(path.join(root, "node_modules/three/examples/jsm/loaders/OBJLoader.js"))};
import { MTLLoader } from ${JSON.stringify(path.join(root, "node_modules/three/examples/jsm/loaders/MTLLoader.js"))};
window.TestLoaders = { GLTFLoader, OBJLoader, MTLLoader };`,
  );
  await bundle(loaderEntry, path.join(dir, "loaders.bundle.js"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>3D contract fixture</title><style>body{margin:0}three-d-stage{height:600px}</style>
<three-d-stage name="fixture / lamp" background="#efeee6"></three-d-stage>
${fail ? `<script>const originalContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:originalContext.call(this,type,...args)};</script>` : ""}
<script src="stage.js"></script><script src="loaders.bundle.js"></script>
<script>
window.stage=document.querySelector('three-d-stage');
window.fixtureReady=stage.ready.then(({THREE})=>{
window.THREE=THREE;const object=new THREE.Group();object.name='FixtureAssembly';
const body=new THREE.MeshStandardMaterial({color:'#34775d',roughness:.35});body.name='finish';
const cap=new THREE.MeshStandardMaterial({color:'#dfba75',roughness:.7,opacity:.65,transparent:true});cap.name='finish';
const shell=new THREE.Mesh(new THREE.BoxGeometry(.6,.8,.4),body);shell.name='Shell';shell.position.set(1,1,2);object.add(shell);
const lid=new THREE.Mesh(new THREE.BoxGeometry(.25,.15,.25),cap);lid.name='Lid';lid.position.set(1,1.5,2);object.add(lid);
const knob=new THREE.Mesh(new THREE.SphereGeometry(.08,12,8),body);knob.position.set(1.4,1.3,2);object.add(knob);
stage.setObject(object);window.originalObject=object;return stage;
});window.fixtureReady.catch(()=>{});
</script></html>`,
  );
  const { server, url } = await serve(dir, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { dir, url };
}
async function ready(page) {
  await page.evaluate(() => window.fixtureReady);
}

function close(actual, expected, epsilon = 1e-5) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
}

test("3D names are stable and replacing a model retains shared GPU resources", () => {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial();
  const texture = new THREE.Texture();
  material.map = texture;
  const first = new THREE.Group();
  first.add(new THREE.Mesh(geometry, material));
  const other = new THREE.MeshStandardMaterial();
  other.name = "mat_0";
  first.add(new THREE.Mesh(new THREE.BoxGeometry(), other));
  nameParts(first);
  assert.deepEqual(
    first.children.map((node) => node.name),
    ["part_0", "part_1"],
  );
  assert.deepEqual([material.name, other.name], ["mat_0", "mat_0_1"]);
  nameParts(first);
  assert.equal(other.name, "mat_0_1");
  const second = new THREE.Mesh(geometry, material);
  let shared = 0,
    exclusive = 0;
  for (const resource of [geometry, material, texture])
    resource.addEventListener("dispose", () => shared++);
  other.addEventListener("dispose", () => exclusive++);
  releaseModel(first, second);
  assert.equal(shared, 0);
  assert.equal(exclusive, 1);
  releaseModel(second);
  assert.equal(shared, 3);
});

test("3D readiness, original studio lighting, meter framing and preserved pixels", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    const result = await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const box = new THREE.Box3().setFromObject(stage.object);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const png = stage.renderer.domElement.toDataURL();
      const image = new Image();
      image.src = png;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0,
        shadow = 0,
        transparent = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 255) opaque++;
        else if (pixels[i] === 0) transparent++;
        else shadow++;
      }
      return {
        revision: THREE.REVISION,
        fov: stage.camera.fov,
        background: stage.scene.background,
        width: stage.renderer.domElement.width,
        height: stage.renderer.domElement.height,
        ground: stage.ground.position.y,
        min: box.min.y,
        target: stage.controls.target.toArray(),
        center: sphere.center.toArray(),
        distance: stage.camera.position.distanceTo(sphere.center),
        expected: (sphere.radius / Math.tan(Math.PI / 8)) * 1.35,
        shadows: stage.renderer.shadowMap.enabled,
        buffer: stage.renderer.getContext().getContextAttributes()
          .preserveDrawingBuffer,
        lights: stage.scene.children
          .filter((n) => n.isLight)
          .map((n) => n.intensity),
        damping: stage.controls.dampingFactor,
        key: stage.key.position.toArray(),
        map: stage.key.shadow.mapSize.toArray(),
        opaque,
        shadow,
        transparent,
        meshes: stage.object.children.map((n) => [
          n.castShadow,
          n.receiveShadow,
        ]),
        pngLength: png.length,
      };
    });
    assert.equal(result.revision, "184");
    assert.equal(result.fov, 45);
    assert.equal(result.background, null);
    assert.deepEqual(result.lights, [1, 2.2, 0.5]);
    assert.deepEqual(result.key, [4, 7, 5]);
    assert.deepEqual(result.map, [2048, 2048]);
    assert.equal(result.damping, 0.08);
    assert.equal(result.buffer, true);
    assert.equal(result.shadows, true);
    close(result.distance, result.expected);
    close(result.ground, result.min);
    assert.deepEqual(result.target, result.center);
    assert.equal(result.width, 1440);
    assert.equal(result.height, 600);
    assert.ok(result.opaque > 1000);
    assert.ok(result.shadow > 1000);
    assert.ok(result.transparent > 1000);
    assert.ok(result.meshes.every((pair) => pair.every(Boolean)));
    assert.ok(result.pngLength > 10000);
  });
});

test("3D actual orbit, zoom, pan and turntable interruption retain authored geometry", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    const initial = await page.evaluate(() => stage.camera.position.toArray());
    await page.mouse.move(700, 250);
    await page.mouse.down();
    await page.mouse.move(820, 300, { steps: 8 });
    await page.mouse.up();
    assert.notDeepEqual(
      await page.evaluate(() => stage.camera.position.toArray()),
      initial,
    );
    const distance = await page.evaluate(() =>
      stage.camera.position.distanceTo(stage.controls.target),
    );
    await page.mouse.wheel(0, -300);
    await page.waitForFunction(
      (before) =>
        stage.camera.position.distanceTo(stage.controls.target) < before,
      distance,
    );
    const target = await page.evaluate(() => stage.controls.target.toArray());
    await page.mouse.down({ button: "right" });
    await page.mouse.move(900, 350, { steps: 8 });
    await page.mouse.up({ button: "right" });
    assert.notDeepEqual(
      await page.evaluate(() => stage.controls.target.toArray()),
      target,
    );
    await page.evaluate(() => stage.setAttribute("autorotate", ""));
    const rotating = await page.evaluate(() => stage.camera.position.toArray());
    await page.waitForFunction(
      (before) =>
        stage.camera.position.distanceTo(new THREE.Vector3(...before)) > 0.001,
      rotating,
    );
    await page.mouse.down();
    await page.mouse.up();
    assert.equal(await page.evaluate(() => stage.controls.autoRotate), false);
    assert.deepEqual(
      await page.evaluate(() => stage.object.rotation.toArray()),
      [0, 0, 0, "XYZ"],
    );
    await page.getByRole("button", { name: "Reset camera" }).click();
    assert.equal(await page.evaluate(() => stage.interacted), false);
    assert.equal(await page.evaluate(() => stage.controls.autoRotate), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      stage.removeAttribute("autorotate");
      stage.setAttribute("autorotate", "");
    });
    assert.equal(await page.evaluate(() => stage.controls.autoRotate), false);
  });
});

test("3D portrait fit, reconnect identity and independent backgrounds survive lifecycle changes", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => Math.abs(stage.camera.aspect - 0.65) < 0.001,
    );
    const fits = await page.evaluate(() => {
      const box = new THREE.Box3().setFromObject(stage.object),
        corners = [];
      stage.camera.updateMatrixWorld();
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z])
            corners.push(
              new THREE.Vector3(x, y, z).project(stage.camera).toArray(),
            );
      window.identities = [
        stage.renderer,
        stage.scene,
        stage.controls,
        stage.object,
      ];
      stage.remove();
      document.body.append(stage);
      stage.setAttribute("background", "#f5e1ce");
      return corners;
    });
    assert.ok(
      fits.every(
        ([x, y, z]) => Math.abs(x) < 1 && Math.abs(y) < 1 && z > -1 && z < 1,
      ),
    );
    assert.equal(
      await page.evaluate(() =>
        identities.every(
          (value, i) =>
            value ===
            [stage.renderer, stage.scene, stage.controls, stage.object][i],
        ),
      ),
      true,
    );
    assert.equal(
      await page.evaluate(() => getComputedStyle(stage).backgroundColor),
      "rgb(245, 225, 206)",
    );
    await page.evaluate(() => stage.removeAttribute("background"));
    assert.equal(
      await page.evaluate(() => getComputedStyle(stage).backgroundColor),
      "rgb(240, 238, 230)",
    );
    await page.evaluate(() => {
      stage.setObject(new THREE.Group());
      stage.dispose();
      stage.remove();
      document.body.append(stage);
    });
    assert.equal(
      await page.getByRole("button", { name: "Download GLB" }).isDisabled(),
      true,
    );
  });
});

test("3D downloads OBJ + MTL with names, transformed meter vertices, shared finishes and opacity", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    const downloadsPromise = Promise.all(
      ["fixture_lamp.obj", "fixture_lamp.mtl"].map((name) =>
        page.waitForEvent("download", {
          predicate: (download) => download.suggestedFilename() === name,
          timeout: 10000,
        }),
      ),
    );
    await page.evaluate(() =>
      stage.addEventListener(
        "codex-3d-export",
        (event) => (window.lastExport = event.detail),
      ),
    );
    await page.getByRole("button", { name: "Download OBJ + MTL" }).click();
    const downloads = await downloadsPromise;
    const contents = {};
    for (const download of downloads)
      contents[download.suggestedFilename()] = await fs.readFile(
        await download.path(),
        "utf8",
      );
    const obj = contents["fixture_lamp.obj"],
      mtl = contents["fixture_lamp.mtl"];
    assert.ok(obj);
    assert.ok(mtl);
    assert.ok(obj.startsWith("mtllib fixture_lamp.mtl\n"));
    for (const name of ["Shell", "Lid", "part_2"])
      assert.ok(obj.includes(`o ${name}\n`));
    assert.ok(obj.includes("usemtl finish\n"));
    assert.ok(obj.includes("usemtl finish_0\n"));
    assert.equal((mtl.match(/newmtl /g) || []).length, 2);
    assert.ok(mtl.includes("Ns 130"));
    assert.ok(mtl.includes("Ns 60"));
    assert.ok(mtl.includes("d 0.6500"));
    const expected = await page.evaluate(() =>
      stage.object.children[0].material.color
        .toArray()
        .map((v) => v.toFixed(4))
        .join(" "),
    );
    assert.ok(mtl.includes(`Kd ${expected}`));
    const vertices = obj
      .split("\n")
      .filter((line) => line.startsWith("v "))
      .map((line) => line.split(" ").slice(1).map(Number));
    close(Math.min(...vertices.map((v) => v[0])), 0.7);
    close(Math.min(...vertices.map((v) => v[1])), 0.6);
    close(Math.max(...vertices.map((v) => v[1])), 1.575);
    const parsed = await page.evaluate(
      ({ obj, mtl }) => {
        const materials = new TestLoaders.MTLLoader().parse(mtl, "");
        const loaded = new TestLoaders.OBJLoader()
          .setMaterials(materials)
          .parse(obj);
        return loaded.children.map((n) => ({
          name: n.name,
          material: n.material.name,
        }));
      },
      { obj, mtl },
    );
    assert.deepEqual(
      parsed.map((n) => n.name),
      ["Shell", "Lid", "part_2"],
    );
    assert.deepEqual(
      parsed.map((n) => n.material),
      ["finish", "finish_0", "finish"],
    );
    assert.deepEqual(await page.evaluate(() => lastExport), {
      format: "obj",
      ok: true,
      files: ["fixture_lamp.obj", "fixture_lamp.mtl"],
    });
  });
});

test("3D actual GLB round trip retains hierarchy, units, PBR values and can be loaded locally", async (t) => {
  const { dir, url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download GLB" }).click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), "fixture_lamp.glb");
    const bytes = await fs.readFile(await download.path());
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const json = JSON.parse(
      bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
    );
    assert.deepEqual(
      json.nodes.find((node) => node.name === "Shell").matrix.slice(12, 15),
      [1, 1, 2],
    );
    assert.equal(json.materials.length, 2);
    assert.equal(json.materials[0].pbrMetallicRoughness.roughnessFactor, 0.35);
    assert.equal(
      json.materials[1].pbrMetallicRoughness.baseColorFactor[3],
      0.65,
    );
    await fs.copyFile(await download.path(), path.join(dir, "roundtrip.glb"));
    const roundtrip = await page.evaluate(async () => {
      const before = new THREE.Box3().setFromObject(stage.object);
      const loaded = await stage.load("./roundtrip.glb");
      const after = new THREE.Box3().setFromObject(stage.object);
      return {
        name: loaded.scene.children[0].name,
        parts: loaded.scene.children[0].children.map((n) => n.name),
        min: after.min.toArray(),
        max: after.max.toArray(),
        expectedMin: before.min.toArray(),
        expectedMax: before.max.toArray(),
        ground: stage.ground.position.y,
      };
    });
    assert.equal(roundtrip.name, "FixtureAssembly");
    assert.deepEqual(roundtrip.parts, ["Shell", "Lid", "part_2"]);
    roundtrip.min.forEach((v, i) => close(v, roundtrip.expectedMin[i]));
    roundtrip.max.forEach((v, i) => close(v, roundtrip.expectedMax[i]));
    close(roundtrip.ground, roundtrip.min[1]);
  });
});

test("3D export failure is visible, emits a local result and permits retry", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    await page.evaluate(() => {
      stage.addEventListener(
        "codex-3d-export",
        (event) => (window.lastExport = event.detail),
      );
      window.realExport = stage.exportGLB;
      stage.exportGLB = async () => {
        throw new Error("Deliberate fixture failure");
      };
    });
    await page.getByRole("button", { name: "Download GLB" }).click();
    assert.match(
      await page.getByRole("status").innerText(),
      /Deliberate fixture failure/,
    );
    assert.deepEqual(await page.evaluate(() => lastExport), {
      format: "glb",
      ok: false,
      error: "Deliberate fixture failure",
    });
    assert.equal(
      await page.getByRole("button", { name: "Download GLB" }).isEnabled(),
      true,
    );
    await page.evaluate(() => (stage.exportGLB = realExport));
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download GLB" }).click();
    await download;
    assert.equal(await page.getByRole("status").isVisible(), false);
  });
});

test("3D WebGL failure rejects ready and disables export with a readable fallback", async (t) => {
  const { url } = await fixture(t, { fail: true });
  await withPage(url, async (page, errors) => {
    assert.match(
      await page.locator("three-d-stage .error").innerText(),
      /WebGL is unavailable/,
    );
    assert.equal(
      await page.evaluate(async () => {
        try {
          await stage.ready;
          return false;
        } catch {
          return true;
        }
      }),
      true,
    );
    assert.equal(
      await page.getByRole("button", { name: "Download GLB" }).isDisabled(),
      true,
    );
    assert.equal(errors.length, 1);
    assert.match(
      errors[0],
      /THREE.WebGLRenderer: Error creating WebGL context/,
    );
    errors.splice(0);
  });
});

test("3D standalone HTML retains the local runtime after source files are removed", async (t) => {
  const { dir, url } = await fixture(t);
  const output = await inlineHtml(path.join(dir, "index.html"));
  await fs.writeFile(path.join(dir, "standalone.html"), output);
  await fs.rm(path.join(dir, "stage.js"));
  await fs.rm(path.join(dir, "loaders.bundle.js"));
  await withPage(url + "standalone.html", async (page) => {
    await ready(page);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download GLB" }).click();
    assert.equal((await download).suggestedFilename(), "fixture_lamp.glb");
  });
});

test("3D empty stage waits for author geometry and emits no spurious exports", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    const result = await page.evaluate(async () => {
      const empty = document.createElement("three-d-stage");
      let early = false;
      try {
        empty.setObject(new THREE.Group());
      } catch (error) {
        early = error.message.includes("ready");
      }
      document.body.append(empty);
      const { THREE: library } = await empty.ready;
      const disabled = [...empty.shadowRoot.querySelectorAll("button")].every(
        (button) => button.disabled,
      );
      let events = 0;
      empty.addEventListener("codex-3d-export", () => events++);
      await empty._runExport("obj");
      let invalid = false;
      try {
        empty.setObject({});
      } catch (error) {
        invalid = error instanceof TypeError;
      }
      const group = new library.Group();
      empty.setObject(group);
      const validEmpty = [...empty.shadowRoot.querySelectorAll("button")].every(
        (button) => !button.disabled,
      );
      empty.dispose();
      empty.dispose();
      empty.remove();
      return { early, disabled, events, invalid, validEmpty };
    });
    assert.deepEqual(result, {
      early: true,
      disabled: true,
      events: 0,
      invalid: true,
      validEmpty: true,
    });
  });
});

test("3D GLB embeds a real image, grouped materials and texture transforms", async (t) => {
  const { url } = await fixture(t);
  await withPage(url, async (page) => {
    await ready(page);
    const result = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 1, 2);
      context.fillStyle = "#00ff00";
      context.fillRect(1, 0, 1, 2);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.offset.set(0.1, 0.2);
      texture.repeat.set(0.5, 0.75);
      const painted = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.4,
        metalness: 0.2,
      });
      painted.name = "Painted";
      const plain = new THREE.MeshStandardMaterial({
        color: "#e5bf7b",
        roughness: 0.6,
      });
      plain.name = "Brass";
      const geometry = new THREE.BoxGeometry(0.2, 0.3, 0.4);
      for (let i = 0; i < geometry.groups.length; i++)
        geometry.groups[i].materialIndex = i % 2;
      const mesh = new THREE.Mesh(geometry, [painted, plain]);
      mesh.name = "TwoFinishes";
      mesh.position.y = 0.15;
      const root = new THREE.Group();
      root.name = "TexturedAssembly";
      root.add(mesh);
      stage.setObject(root);
      const file = await stage.exportGLB();
      const bytes = new DataView(file.data);
      const json = JSON.parse(
        new TextDecoder().decode(
          new Uint8Array(file.data, 20, bytes.getUint32(12, true)),
        ),
      );
      const imageRecord = json.images[0],
        view = json.bufferViews[imageRecord.bufferView];
      const binaryStart = 20 + bytes.getUint32(12, true) + 8;
      const blob = new Blob(
        [
          new Uint8Array(
            file.data,
            binaryStart + (view.byteOffset || 0),
            view.byteLength,
          ),
        ],
        { type: imageRecord.mimeType },
      );
      const decoded = await createImageBitmap(blob);
      const pixels = document.createElement("canvas");
      pixels.width = 2;
      pixels.height = 2;
      const ctx = pixels.getContext("2d");
      ctx.drawImage(decoded, 0, 0);
      const rgba = [...ctx.getImageData(0, 0, 2, 2).data];
      const loaded = await new TestLoaders.GLTFLoader().parseAsync(
        file.data,
        "",
      );
      const maps = [],
        names = [];
      loaded.scene.traverse((node) => {
        if (!node.isMesh) return;
        for (const material of Array.isArray(node.material)
          ? node.material
          : [node.material]) {
          names.push(material.name);
          if (material.map)
            maps.push({
              width: material.map.image.width,
              height: material.map.image.height,
              offset: material.map.offset.toArray(),
              repeat: material.map.repeat.toArray(),
            });
        }
      });
      return {
        images: json.images.length,
        mime: imageRecord.mimeType,
        materials: json.materials.map((m) => m.name),
        primitiveMaterials: json.meshes[0].primitives.map((p) => p.material),
        names,
        maps,
        rgba,
      };
    });
    assert.equal(result.images, 1);
    assert.equal(result.mime, "image/png");
    assert.deepEqual(result.materials, ["Painted", "Brass"]);
    assert.ok(
      result.primitiveMaterials.includes(0) &&
        result.primitiveMaterials.includes(1),
    );
    assert.ok(
      result.names.includes("Painted") && result.names.includes("Brass"),
    );
    assert.ok(result.maps.length > 0);
    assert.deepEqual(result.maps[0], {
      width: 2,
      height: 2,
      offset: [0.1, 0.2],
      repeat: [0.5, 0.75],
    });
    assert.deepEqual(result.rgba.slice(0, 8), [255, 0, 0, 255, 0, 255, 0, 255]);
  });
});

test("3D touch orbit, two-finger zoom/pan and capped high-density rendering work", async (t) => {
  const { url } = await fixture(t);
  await withPage(
    url,
    async (page) => {
      await ready(page);
      assert.equal(
        await page.evaluate(() => stage.renderer.getPixelRatio()),
        2,
      );
      await page.evaluate(() => stage.setAttribute("autorotate", ""));
      const session = await page.context().newCDPSession(page);
      const send = (type, touchPoints) =>
        session.send("Input.dispatchTouchEvent", { type, touchPoints });
      const point = (x, y, id = 1) => ({
        x,
        y,
        id,
        radiusX: 2,
        radiusY: 2,
        force: 1,
      });
      const initial = await page.evaluate(() =>
        stage.camera.position.toArray(),
      );
      await send("touchStart", [point(160, 260)]);
      await send("touchMove", [point(230, 300)]);
      await send("touchEnd", []);
      assert.notDeepEqual(
        await page.evaluate(() => stage.camera.position.toArray()),
        initial,
      );
      assert.equal(await page.evaluate(() => stage.controls.autoRotate), false);
      const distance = await page.evaluate(() =>
        stage.camera.position.distanceTo(stage.controls.target),
      );
      await send("touchStart", [point(140, 300, 1), point(240, 300, 2)]);
      await send("touchMove", [point(100, 300, 1), point(280, 300, 2)]);
      await send("touchEnd", []);
      assert.ok(
        await page.evaluate(
          (before) =>
            stage.camera.position.distanceTo(stage.controls.target) < before,
          distance,
        ),
      );
      const target = await page.evaluate(() => stage.controls.target.toArray());
      await send("touchStart", [point(140, 300, 1), point(240, 300, 2)]);
      await send("touchMove", [point(160, 330, 1), point(260, 330, 2)]);
      await send("touchEnd", []);
      assert.notDeepEqual(
        await page.evaluate(() => stage.controls.target.toArray()),
        target,
      );
      await session.detach();
    },
    { width: 390, height: 844, deviceScaleFactor: 3 },
  );
});
