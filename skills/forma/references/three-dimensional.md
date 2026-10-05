# 3D objects and scenes

Use the independently written `three-stage.js` entry and pinned local Three.js **0.184.0**. Bundle it with the local build helper; the three companion source modules must stay beside the entry while building. The resulting classic-script bundle includes OrbitControls, GLTFLoader, GLTFExporter and OBJExporter, together with the Three.js MIT notice. It needs no CDN, import map, hosted model generator or parent-window protocol.

## Build and author

From this repository:

```sh
npm ci --ignore-scripts
node skills/forma/scripts/build.mjs skills/forma/assets/starters/three-stage.js /tmp/three-stage.bundle.js
```

In an installed skill, run its `scripts/build.mjs` against its own `assets/starters/three-stage.js`. Load the resulting bundle before author code:

```html
<three-d-stage name="desk-lamp" background="#f0eee6" autorotate></three-d-stage>
<script src="three-stage.bundle.js"></script>
<script>
  const stage = document.querySelector("three-d-stage");
  stage.ready.then(({ THREE }) => {
    const object = new THREE.Group();
    object.name = "LampAssembly";
    const finish = new THREE.MeshStandardMaterial({
      color: "#3e6357", roughness: 0.4, metalness: 0.15,
    });
    finish.name = "Ceramic";
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.17, 0.045, 64), finish,
    );
    base.name = "Base";
    base.position.y = 0.0225;
    object.add(base);
    stage.setObject(object);
  }).catch(console.error);
</script>
```

Author in **meters with Y-up**, using named meshes inside a named assembly and shared named materials. Geometry and authored transforms retain their units and origin. The studio ground moves to the lowest model bound; the object is not translated to rest on it. Keep assets local and record their source/license. Use moderate metalness and a bright base color for polished finishes: this neutral studio has no environment map. Appearance depends on geometry, roughness, color, normals and lighting; it is not a manufacturing/CAD workflow.

`examples/objects.html` and `objects.js` provide a complete independently authored lamp with eight named parts and three shared finishes. `node tools/demo.mjs` builds its local runtime. The previous `examples/three.html` remains compatible through `<three-stage>`, which keeps its default cube, 500 px height and older OBJ button label. That button now also produces the accompanying MTL.

## Stage contract

| Surface | Behavior |
| --- | --- |
| `<three-d-stage>` | Full-container canvas, warm background, orbit instructions and OBJ + MTL / GLB buttons. Default height is `100vh`; override the element's height for a card or embedded scene. There is no implicit model. |
| `ready` | Promise resolving to `{ THREE }` after renderer, camera, controls and studio setup. Boot/WebGL failure rejects it, displays a readable fallback and keeps buttons disabled. Await it before setting an object. |
| `setObject(object)` | Takes a Three.js Object3D, replaces the displayed object, enables mesh shadows, positions the ground, frames the bounds and enables exports. Empty groups are valid. Invalid values fail explicitly. |
| `name` | Export basename, default `model`; characters outside letters, digits, underscore, period and hyphen become underscores. |
| `background` | Optional CSS background, default `#f0eee6`; renderer and scene remain transparent. Removing the attribute restores the default. CSS `--stage-bg` is also available. |
| `autorotate` | Enables a slow camera turntable. The first drag, pan, zoom or touch gesture stops it. Explicitly remove/re-add the attribute to restart. The model's own rotation never changes. Reduced-motion preference disables automatic rotation. |
| `frame()` / Reset camera | Reframes the current model using its bounding sphere, centered target and an oblique `(1, .55, 1.25)` direction. Reset does not restart an interrupted turntable. |
| `load(url)` | Awaits readiness, loads a local GLB/glTF with GLTFLoader, displays its scene and returns the loaded glTF object. Additional referenced buffers/textures must be local too. |
| `exportOBJ()` | Returns two `{ name, type, data }` file descriptors without downloading. |
| `exportGLB()` | Resolves to one binary `{ name, type, data }` descriptor without downloading. |
| `codex-3d-export` | Local bubbling/composed event after a toolbar export attempt. Success detail is `{ format, ok: true, files }`; failure detail is `{ format, ok: false, error }`. This replaces the original proprietary export notification. |
| `disposeObject()` / `dispose()` | Explicitly release the current model, or permanently release the entire stage. Permanent disposal is idempotent; create another stage to start again. |

OrbitControls supplies left-drag orbit, wheel zoom, right-drag pan and its standard one-/two-finger touch gestures. Damping is `0.08`; turntable speed is `1.2`. The camera has a 45° vertical field of view. Landscape framing uses the radius/tangent distance with 1.35 margin. Portrait framing additionally respects the horizontal field of view so the model fits. Resize reframes until the first user gesture, then preserves the user's camera/target; Reset restores automatic framing. Tiny objects get positive near/far planes without the reference's fixed near-plane clipping.

The studio retains the inspected lighting values: hemisphere intensity 1 with warm ground color; white key intensity 2.2 at `(4, 7, 5)`; warm fill intensity 0.5 at `(-5, 3, -4)`; soft PCF shadows, a 2048² key shadow map, bias `-0.0002`, and a transparent 200 m ground plane at opacity 0.18. Pixel ratio is capped at 2. `preserveDrawingBuffer` makes the completed canvas frame readable for screenshots.

Detaching stops rendering and resize observation; reattaching resumes with the same renderer, scene, controls and object. It does not destroy GPU state. Replacing a model releases geometry, materials and textures exclusively owned by the old model, retaining resources referenced by the replacement. The stage owns resources passed to `setObject`; externally shared resources must also be included in the replacement or managed outside this ownership contract.

## Exports and verification

Toolbar exports download real files locally. OBJ creates **both** `<name>.obj` and `<name>.mtl`; keep them together. The OBJ references the MTL with `mtllib`, includes current world transforms, normals/UVs and named mesh parts, and excludes the studio lights/ground. MTL writes linear diffuse RGB, fixed specular 0.2, roughness-derived shininess and opacity. Shared materials appear once. Unnamed parts receive stable `part_<index>` names; unnamed materials receive `mat_<index>`, and collisions receive stable numeric suffixes. Naming also applies before GLB export.

OBJ + MTL is a basic geometry/color interchange: textures, PBR properties and hierarchy do not survive as they do in GLB. The underlying OBJExporter, also used by the runtime, does not assign per-face material-array groups. Author one material per named mesh for reliable OBJ interchange, or use GLB for grouped multi-material geometry. GLB preserves supported Three.js geometry, hierarchy, transforms and PBR material properties through GLTFExporter. FBX, STEP and CAD exports are not supported.

An export failure is shown in the stage and emits a local failure event. Buttons recover for retry. No host notification, telemetry or external upload occurs. Portable HTML export embeds the runtime; loading additional model files still requires those files unless they are explicitly embedded.

Verification covers actual camera gestures, turntable interruption, reduced motion, studio/shadow pixels, screenshot buffer readback, portrait bounds, shared-resource cleanup, empty/failure states, reconnect identity, downloaded OBJ + MTL parsed back with OBJLoader/MTLLoader, GLB binary headers and local GLTFLoader round trips preserving units, transforms, hierarchy, PBR values, an embedded image, grouped materials and texture transforms. Emulated one-/two-finger orbit/zoom/pan and high-density rendering are exercised. Standalone HTML is tested after removing its separate script files.
