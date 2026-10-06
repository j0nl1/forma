const intersects = (a, b, gap = 0) =>
  a.x < b.x + b.w + gap &&
  b.x < a.x + a.w + gap &&
  a.y < b.y + b.h + gap &&
  b.y < a.y + a.h + gap;
export function layoutCallouts(items, width, height, avoid = []) {
  const placed = [],
    output = Object.create(null);
  const sorted = [...items].sort(
    (a, b) => a.ay - b.ay || a.ax - b.ax || a.order - b.order,
  );
  const position = (item, x, y) => ({
    x: Math.max(8, Math.min(x, width - item.cw - 8)),
    y: Math.max(4, Math.min(y, height - item.ch - 4)),
    w: item.cw,
    h: item.ch,
  });
  const obstacles = (item) => [
    ...items
      .filter((it) => it.id !== item.id)
      .map((it) => ({ x: it.ax, y: it.ay, w: it.aw, h: it.ah })),
    ...avoid,
  ];
  const blocked = (rect) => placed.find((p) => intersects(rect, p, 8));
  const covers = (rect, item) =>
    obstacles(item).some((p) => intersects(rect, p));
  const damage = (rect, item) =>
    obstacles(item).reduce(
      (sum, p) =>
        sum +
        (Math.max(
          0,
          Math.min(rect.x + rect.w, p.x + p.w) - Math.max(rect.x, p.x),
        ) *
          Math.max(
            0,
            Math.min(rect.y + rect.h, p.y + p.h) - Math.max(rect.y, p.y),
          )) /
          Math.max(1, p.w * p.h),
      0,
    );
  const save = (item, rect) => {
    output[item.id] = { x: rect.x, y: rect.y };
    placed.push(rect);
  };
  for (const item of sorted.filter((it) => it.fixed))
    save(
      item,
      position(
        item,
        item.ax + (item.dx || 0),
        item.place === "above"
          ? item.ay - item.gap - item.ch
          : item.ay + item.ah + item.gap,
      ),
    );
  for (const item of sorted.filter((it) => !it.fixed)) {
    const candidates = [
      [item.ax, item.ay + item.ah + item.gap],
      [item.ax, item.ay - item.gap - item.ch],
      [item.ax + item.aw + 10, item.ay],
      [item.ax - item.cw - 10, item.ay],
    ].map(([x, y]) => position(item, x, y));
    const walk = (clean) => {
      let y = item.ay + item.ah + item.gap;
      for (let attempt = 0; attempt < 24; attempt++) {
        const rect = position(item, item.ax, y),
          conflict = blocked(rect);
        if (!conflict && (!clean || !covers(rect, item))) return rect;
        if (rect.y >= height - item.ch - 4) return null;
        y = (conflict ? conflict.y + conflict.h : rect.y + rect.h) + 8;
      }
      return null;
    };
    let chosen =
      candidates.find((rect) => !blocked(rect) && !covers(rect, item)) ||
      walk(true);
    if (!chosen) {
      const candidate = walk(false),
        pool = [...candidates, ...(candidate ? [candidate] : [])].filter(
          (rect) => !blocked(rect),
        );
      chosen = pool.reduce(
        (best, rect) =>
          !best || damage(rect, item) < damage(best, item) - 1e-9 ? rect : best,
        null,
      );
    }
    save(item, chosen || candidates[0]);
  }
  return output;
}
export function layoutTags(records, stageWidth) {
  const placed = [];
  for (const record of [...records].sort(
    (a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  )) {
    const { rect, node } = record,
      w = node.offsetWidth || 44,
      h = node.offsetHeight || 14;
    const x = Math.max(
      0,
      Math.min(stageWidth - w, rect.x + rect.w / 2 - w / 2),
    );
    let y;
    for (let lane = 0; lane < 8; lane++) {
      y =
        rect.y < 60
          ? rect.y + rect.h + 4 + lane * (h + 4)
          : rect.y - h - 4 - lane * (h + 4);
      if (lane === 7 || !placed.some((p) => intersects({ x, y, w, h }, p)))
        break;
    }
    Object.assign(node.style, { left: `${x}px`, top: `${y}px` });
    placed.push({ x, y, w, h });
  }
}
