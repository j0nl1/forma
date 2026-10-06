# Connected paths and 3D scene integrity

Use for connected diagrams, traveling objects, spatial handoffs and 3D films. Preserve the user's chosen style: simple geometry, overlap and cuts can be deliberate. These checks prevent accidental breaks rather than prescribe complexity or a house aesthetic. Use [motion](motion.md) for native timing and [video review](video-review.md) for acceptance.

## Give related geometry one source of truth

Name the anchors, route segments, recurring object and handoff events that carry the explanation. Use the same curve for the visible route and the traveling object's position. Derive joins from shared anchors in a consistent coordinate space; when groups have transforms, compare world-space endpoints. Decorative paths must not appear to be the route followed by the focal object unless they actually are.

Check connected endpoints with a tolerance selected for the artifact's scale and tube thickness, and check the direction at a join when the viewer should perceive smooth travel. Do not conceal a gap with a fast camera move. For a route that intentionally breaks, stage a readable release, cut or transfer.

Keep the task/result identity through its transformation, or show an explicit transfer to the new object. Record when each object enters, transforms, rests and exits. A visibility toggle or unrelated object spawned elsewhere does not by itself explain a handoff.

## Keep assemblies intact

Attach outlines, labels and accessories to the moving object's local hierarchy, or derive all their transforms from the same owner on every frame. Copying a transform only at creation leaves details behind when the owner moves. Do not apply world coordinates twice to a child.

For example, an owned Three.js outline can inherit its mesh's transform:

```js
const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(mesh.geometry), outlineMaterial,
);
mesh.add(outline); // Local identity transform; follows position, rotation and scale.
```

Preserve the existing resource-disposal contract. Derive motion from authored time so seeking backward restores the complete assembly, including visibility.

## Stage for the moving camera

Place objects for readable silhouettes across the entire camera interval, not only one attractive still. Check intended contacts separately from accidental intersections. Reserve clear screen space for essential text; projected 3D labels must not enter it during an orbit. Reduce competing objects or separate actions before adding effects.

Translucency is not a substitute for separation. Prefer a few purposeful panes, cutaway geometry or visible frames when stacked glass hides the action. Inspect transparent sorting and depth behavior where surfaces overlap. Ensure labels do not sit coplanar with their supporting faces.

## Establish finish through relationships

Specify which object is focal and how its silhouette, material and light distinguish it from the background and supporting objects. Primitives can be appropriate, but repeating generic shapes and identical finishes is insufficient when the brief calls for differentiated assemblies. Use details that explain function rather than add noise.

After applying brand colors, inspect the lit result: token equality does not guarantee visible separation. Adjust illumination, roughness, opacity, surface value and framing while preserving the brand direction. Effects such as bloom or depth of field cannot repair disconnected geometry or unreadable staging.

## Prove before extending

Inspect representative stills and a short encoded interval containing the hardest action and its handoff. Where measurable, check endpoint coincidence, path-following and shared transforms using the scene's own data; do not invent a universal geometry validator. Pair those checks with playback for occlusion, identity, rhythm and finish. Resolve observed message-breaking defects before a full export, then review the complete encoded film.
