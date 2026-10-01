# 3D objects and scenes

Use `three-stage.js`, a source entry bundled with the local build helper, and Three.js from the pinned npm dependency. It provides studio lights, OrbitControls, framing, GLB loading, and GLB/OBJ download. No remote CDN or opaque vendor file is needed.

Choose geometry, scale, materials, and lighting for the actual object. Keep a non-WebGL fallback message. Label controls, support resetting the camera, and verify rotation and downloads. Keep input models local, track their licenses, and clean up GPU resources when replacing objects.

A render is a visual reference, not manufacturing or CAD data. Use a CAD workflow when the task needs mechanical dimensions or fabrication guarantees.
