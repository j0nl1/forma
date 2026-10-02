// Stable authoring function shared by live replay, layers and PNG output.
export function paintBird(p) {
  const body = [
    "path",
    (c) => {
      c.moveTo(117, 262);
      c.bezierCurveTo(107, 225, 139, 206, 165, 199);
      c.bezierCurveTo(179, 156, 229, 142, 251, 180);
      c.bezierCurveTo(264, 206, 246, 226, 225, 238);
      c.bezierCurveTo(227, 287, 179, 321, 117, 262);
      c.closePath();
    },
  ];
  const wing = ["blob", 159, 248, 37, 51, { wobble: 0.13, rot: 25, seed: 12 }];
  const belly = [
    "path",
    (c) => {
      c.moveTo(119, 254);
      c.bezierCurveTo(146, 285, 199, 293, 226, 242);
      c.bezierCurveTo(224, 287, 177, 315, 119, 254);
      c.closePath();
    },
  ];
  p.wash(["blob", 178, 227, 128, 115, { wobble: 0.25, seed: 3 }], "aqua", {
    load: 0.45,
    deckle: 6,
    feather: 2.5,
    mottle: 0.7,
    edgePool: 1.2,
    seed: 14,
    blooms: [[89, 195, 17]],
  });
  p.reserve(body, { feather: 3 });
  p.gradedWash(
    body,
    [
      [0, "fawn"],
      [0.7, "rust"],
      [1, "burnt_sienna"],
    ],
    { load: 0.85, axis: "y", deckle: 2, feather: 1.2, mottle: 0.55, seed: 24 },
  );
  p.reserve(belly, { alpha: 0.8, feather: 4 });
  p.wash(belly, "cream", {
    load: 0.3,
    deckle: 0.7,
    feather: 1.3,
    edgePool: 0.3,
    seed: 31,
  });
  p.glaze(wing, "shadow_violet", { load: 0.45, feather: 2, seed: 42 });
  p.hatch(wing, {
    angle: 32,
    spacing: 7,
    width: 0.8,
    wobble: 0.6,
    lost: 0.35,
    load: 0.5,
    color: "sepia",
    seed: 52,
  });
  p.dryStroke(
    [
      [45, 330],
      [151, 324],
      [226, 313],
      [306, 308],
    ],
    "raw_umber",
    { width: 8, load: 1.1, toothBias: 0.55 },
  );
  p.ink(
    [
      [
        [157, 296],
        [154, 322],
        [143, 327],
      ],
      [
        [177, 296],
        [179, 318],
        [193, 319],
      ],
      [
        [251, 194],
        [270, 200],
        [249, 207],
      ],
      [
        [116, 263],
        [96, 283],
        [77, 303],
      ],
    ],
    { width: 1.4, lost: 0.17, wobble: 0.7, color: "warm_dark", seed: 62 },
  );
  p.wash(["blob", 236, 187, 3.4, 3.4, { wobble: 0.07 }], "warm_dark", {
    load: 2.1,
    feather: 0.3,
    deckle: 0,
    edgePool: 0,
    seed: 71,
  });
  p.ink(
    [
      [177, 166],
      [195, 155],
      [218, 153],
      [240, 160],
    ],
    { width: 1, wobble: 0.8, lost: 0.38, load: 0.8, color: "sepia", seed: 72 },
  );
  p.splatter(286, 252, 25, "teal", {
    n: 8,
    size: [0.8, 2.3],
    load: 0.9,
    seed: 82,
  });
  p.caption("a moment on the branch", {
    size: 9,
    spacing: 2.3,
    y: 443,
    color: "grey",
  });
}
