// Twenty independently drawn waiting layouts share one seeded, slow sketch cycle.
const NS = "http://www.w3.org/2000/svg";
function shape(name, attributes) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, String(value));
  return node;
}
export function sketch(seed, width, height) {
  let hash = 2166136261;
  for (const letter of seed)
    hash = Math.imul(hash ^ letter.codePointAt(0), 16777619) >>> 0;
  const ratio = width / height,
    sheet = 264 / 152;
  const root = shape("svg", {
    class: "fw-sketch",
    viewBox: "0 0 264 152",
    preserveAspectRatio: `xMidYMid ${Math.max(ratio / sheet, sheet / ratio) <= 1.8 ? "slice" : "meet"}`,
    "aria-hidden": "true",
  });
  root.append(
    shape("rect", {
      x: 14,
      y: 12,
      width: 236,
      height: 86,
      rx: 2,
      class: "fw-base",
    }),
    shape("path", { d: "M14 113H250", class: "fw-base" }),
  );
  for (let i = 0; i < 20; i++) {
    const delay = i * 5 - 100 - (hash % 1000) / 10;
    const group = shape("g", {
      class: "fw-plan",
      style: `animation-delay:${delay}s`,
    });
    const parts = [];
    const line = (x, y, x2, y2, faint = false) =>
      parts.push([
        "path",
        { d: `M${x} ${y}L${x2} ${y2}`, "data-faint": String(faint) },
      ]);
    const rect = (x, y, w, h, faint = false) =>
      parts.push([
        "rect",
        { x, y, width: w, height: h, rx: 2, "data-faint": String(faint) },
      ]);
    const circle = (x, y, r, faint = false) =>
      parts.push(["circle", { cx: x, cy: y, r, "data-faint": String(faint) }]);
    switch (i) {
      case 0:
        rect(14, 12, 236, 86);
        line(14, 12, 250, 98, true);
        line(250, 12, 14, 98, true);
        break;
      case 1:
        rect(14, 12, 146, 86);
        rect(168, 12, 82, 86);
        line(14, 54, 160, 54, true);
        break;
      case 2:
        rect(14, 12, 58, 86);
        rect(80, 12, 170, 86);
        line(80, 12, 250, 98, true);
        break;
      case 3:
        circle(132, 55, 38);
        rect(14, 12, 236, 86, true);
        break;
      case 4:
        line(14, 22, 160, 22);
        line(14, 32, 110, 32, true);
        circle(70, 70, 22);
        circle(140, 70, 22, true);
        rect(181, 48, 69, 44);
        break;
      case 5:
        line(132, 12, 132, 98, true);
        for (let n = 0; n < 4; n++)
          line(14, 25 + n * 16, 120 - n * 8, 25 + n * 16);
        rect(144, 12, 106, 60);
        line(144, 85, 250, 85, true);
        break;
      case 6:
        for (let n = 0; n < 3; n++) rect(14 + n * 83, 20, 70, 54);
        parts.push([
          "path",
          { d: "M20 96 C80 70 180 118 244 88", "data-faint": "true" },
        ]);
        break;
      case 7:
        for (let n = 0; n < 5; n++)
          circle(42 + n * 44, 38 + (n % 2) * 32, 12 + (n % 3) * 6, n % 2 === 1);
        break;
      case 8:
        rect(14, 12, 236, 86, true);
        parts.push(["path", { d: "M20 90L80 66L140 74L200 34L244 24" }]);
        line(20, 93, 244, 93, true);
        break;
      case 9:
        parts.push(["path", { d: "M132 13L236 55L132 97L28 55Z" }]);
        circle(132, 55, 17, true);
        break;
      case 10:
        for (let y = 0; y < 2; y++)
          for (let x = 0; x < 3; x++)
            rect(14 + x * 82, 12 + y * 48, 72, 38, y === 1 && x === 1);
        break;
      case 11:
        rect(88, 8, 88, 106);
        line(100, 30, 164, 30, true);
        line(100, 40, 146, 40, true);
        circle(132, 78, 20);
        break;
      case 12:
        rect(14, 12, 236, 86);
        for (let n = 1; n < 4; n++)
          line(14 + n * 59, 12, 14 + n * 59, 98, true);
        line(14, 40, 250, 40);
        line(14, 68, 250, 68, true);
        break;
      case 13:
        line(56, 36, 136, 72, true);
        line(136, 72, 212, 30, true);
        line(56, 36, 212, 30, true);
        circle(56, 36, 13);
        circle(136, 72, 19);
        circle(212, 30, 10);
        break;
      case 14:
        rect(14, 26, 236, 56);
        for (let n = 1; n < 4; n++)
          line(14 + n * 59, 26, 14 + n * 59, 82, true);
        line(14, 16, 250, 16);
        line(14, 93, 250, 93);
        break;
      case 15:
        circle(76, 55, 36);
        parts.push([
          "path",
          { d: "M76 19A36 36 0 0 1 107 74L76 55Z", "data-faint": "true" },
        ]);
        for (let n = 0; n < 3; n++)
          line(140, 34 + n * 20, 220 - n * 12, 34 + n * 20);
        break;
      case 16:
        for (let n = 0; n < 4; n++)
          line(14, 20 + n * 18, 228 - n * 40, 20 + n * 18, n === 3);
        rect(14, 89, 24, 24);
        line(50, 101, 160, 101, true);
        break;
      case 17:
        for (let n = 0; n < 3; n++)
          parts.push([
            "path",
            {
              d: `M18 ${84 - n * 14}C70 ${40 - n * 12} 130 ${96 - n * 14} 246 ${40 - n * 12}`,
              "data-faint": String(n > 0),
            },
          ]);
        circle(150, 66, 9);
        break;
      case 18:
        circle(104, 55, 35);
        circle(160, 55, 35);
        line(132, 12, 132, 98, true);
        break;
      case 19:
        rect(14, 12, 96, 38);
        rect(130, 50, 120, 48);
        line(14, 12, 250, 98, true);
        line(110, 50, 130, 50, true);
        break;
    }
    line(14, 124, 190 - (i % 4) * 18, 124);
    if (i % 3 === 0) line(14, 137, 142, 137);
    parts.forEach(([name, attrs], index) =>
      group.append(
        shape(name, {
          ...attrs,
          class: "fw-hair",
          pathLength: 1,
          style: `animation-delay:${delay + index * 0.12}s`,
        }),
      ),
    );
    root.append(group);
  }
  return root;
}
export const sketchStyle = `
.fw-sketch{position:absolute;inset:0;width:100%;height:100%;color:var(--fw-ud,#6a9bcc)}
.fw-base,.fw-hair{fill:none;stroke:currentColor;stroke-width:.8}.fw-base{opacity:.15}
.fw-plan{animation:fw-plan-cycle 100s step-end infinite,fw-plan-breathe 100s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.fw-hair{stroke-dasharray:1;stroke-dashoffset:1;opacity:0;animation:fw-pencil 100s linear infinite}.fw-hair[data-faint=true]{stroke-opacity:.48}
@keyframes fw-plan-cycle{0%,5.1%{visibility:visible}5.2%,100%{visibility:hidden}}
@keyframes fw-plan-breathe{0%,5%,100%{transform:translateY(0) scale(1)}2%{transform:translateY(-.9px) scale(1.006)}3.9%{transform:translateY(.5px) scale(.997)}}
@keyframes fw-pencil{0%{stroke-dashoffset:1;opacity:0}.3%{opacity:.85}1.7%{stroke-dashoffset:0;opacity:.85}2.2%{opacity:.55}2.8%{opacity:.85}3.3%{opacity:.6}3.8%{stroke-dashoffset:0;opacity:.8}4%{opacity:0}4.2%,100%{stroke-dashoffset:1;opacity:0}}
@media(prefers-reduced-motion:reduce){.fw-plan,.fw-hair{animation:none}.fw-plan:not(:first-of-type){display:none}.fw-hair{stroke-dashoffset:0;opacity:.72}}
`;
