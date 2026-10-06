/* The metadata canvas retains authored body children and adds only local viewport chrome. */
window.CodexPlainCanvasReady = import("./plain-canvas-runtime.js").then(
  ({ installPlainCanvas }) => installPlainCanvas(),
);
