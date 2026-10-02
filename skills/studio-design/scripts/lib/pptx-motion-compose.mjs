// Impress ignores child transforms while an ancestor group is animated. Keep
// editable artwork in disjoint sibling groups and compose the supported affine
// transforms on each group instead. Masks and group alpha need a compositor.
const supported = new Set(["spin", "grow", "shrink", "teeter", "path"]);
const identity = [1, 0, 0, 1, 0, 0];
const multiply = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
function value(track, progress, fallback) {
  if (!track) return fallback;
  const index = track.findIndex(([time]) => time >= progress);
  if (index === 0) return track[0][1];
  if (index < 0) return track.at(-1)[1];
  const [left, right] = [track[index - 1], track[index]];
  return (
    left[1] +
    ((right[1] - left[1]) * (progress - left[0])) / (right[0] - left[0])
  );
}
function bounds(objects) {
  const boxes = objects.map((object) => {
    const angle = ((object.rotate ?? 0) * Math.PI) / 180;
    const w =
        Math.abs(object.w * Math.cos(angle)) +
        Math.abs(object.h * Math.sin(angle)),
      h =
        Math.abs(object.w * Math.sin(angle)) +
        Math.abs(object.h * Math.cos(angle));
    return {
      x: object.x + object.w / 2 - w / 2,
      y: object.y + object.h / 2 - h / 2,
      w,
      h,
    };
  });
  const x = Math.min(...boxes.map((box) => box.x)),
    y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((box) => box.x + box.w)) - x,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - y,
  };
}

export function composedTargets(entries, objects) {
  const byId = new Map(entries.map((entry) => [entry.id, entry])),
    links = new Map(entries.map((entry) => [entry.id, new Set()]));
  for (const object of objects) {
    const ids = object.animIds ?? [];
    if (ids.length < 2) continue;
    for (const id of ids)
      for (const other of ids) if (other !== id) links.get(id)?.add(other);
  }
  const seen = new Set(),
    components = [];
  for (const [id, neighbors] of links) {
    if (!neighbors.size || seen.has(id)) continue;
    const ids = new Set(),
      pending = [id];
    while (pending.length) {
      const next = pending.pop();
      if (ids.has(next)) continue;
      ids.add(next);
      seen.add(next);
      pending.push(...(links.get(next) ?? []));
    }
    const members = [...ids].map((id) => byId.get(id));
    const component = { ids, entries: members, cohorts: [] };
    if (members.some((entry) => !entry))
      component.issue = "nested animation metadata is incomplete";
    else if (members.some((entry) => !supported.has(entry.family)))
      component.issue =
        "nested masks, visibility, or group opacity require compositing beyond native affine transforms";
    else if (members.length > 8)
      component.issue =
        "nested animation exceeds the eight composed build limit";
    else if (members.some((entry) => entry.repeat > 1))
      component.issue =
        "nested repeated builds require discontinuous composed timing";
    else {
      // Split at unrelated paint so exported stacking order never changes.
      let previous = -2;
      for (const [index, object] of objects.entries()) {
        const chain = (object.animIds ?? []).filter((id) => ids.has(id));
        if (!chain.length) continue;
        const key = chain.join("/");
        let cohort = component.cohorts.at(-1);
        if (index !== previous + 1 || cohort?.key !== key) {
          cohort = { id: `composed-${id}-${index}`, key, chain, objects: [] };
          component.cohorts.push(cohort);
        }
        cohort.objects.push(object);
        previous = index;
      }
      if (component.cohorts.length > 32)
        component.issue =
          "nested animation exceeds the 32 editable artwork group limit";
      for (const cohort of component.cohorts)
        cohort.geometry = bounds(cohort.objects);
    }
    components.push(component);
  }
  return components;
}

export function composeSteps(steps, components, slide) {
  const scheduled = new Map();
  for (const [stepIndex, step] of steps.entries())
    for (const item of step.items)
      scheduled.set(item.entry.id, { ...item, stepIndex });
  return steps.map((step, stepIndex) => {
    const items = [...step.items];
    for (const component of components.filter((value) => !value.issue)) {
      if (
        !component.entries.some(
          (entry) => scheduled.get(entry.id).stepIndex === stepIndex,
        )
      )
        continue;
      const offsets = new Set([0, step.duration]);
      for (const entry of component.entries) {
        const schedule = scheduled.get(entry.id);
        if (schedule.stepIndex !== stepIndex) continue;
        const duration = entry.duration * (entry.autoReverse ? 2 : 1);
        // Use each authored behavior's own interval, even across long delays.
        for (let sample = 0; sample <= 100; sample++)
          offsets.add(schedule.start + (duration * sample) / 100);
        for (const track of entry.tracks.values())
          for (const [offset] of track)
            offsets.add(schedule.start + duration * offset);
      }
      for (const cohort of component.cohorts) {
        const tracks = new Map(
          ["ppt_x", "ppt_y", "rotation", "scale"].map((key) => [key, []]),
        );
        const center = [
          cohort.geometry.x + cohort.geometry.w / 2,
          cohort.geometry.y + cohort.geometry.h / 2,
        ];
        for (const time of [...offsets].sort((a, b) => a - b)) {
          let matrix = identity,
            rotation = 0,
            scale = 1;
          for (const id of [...cohort.chain].reverse()) {
            const schedule = scheduled.get(id),
              entry = schedule.entry;
            if (schedule.stepIndex > stepIndex) continue;
            const duration = entry.duration * (entry.autoReverse ? 2 : 1),
              progress =
                schedule.stepIndex < stepIndex
                  ? 1
                  : Math.max(
                      0,
                      Math.min(1, (time - schedule.start) / duration),
                    );
            const angle = value(entry.tracks.get("rotation"), progress, 0),
              size = value(entry.tracks.get("scale"), progress, 1),
              dx = value(entry.tracks.get("ppt_x"), progress, 0) * slide.width,
              dy = value(entry.tracks.get("ppt_y"), progress, 0) * slide.height,
              cx = entry.geometry.x + entry.geometry.w / 2,
              cy = entry.geometry.y + entry.geometry.h / 2,
              c = Math.cos((angle * Math.PI) / 180) * size,
              s = Math.sin((angle * Math.PI) / 180) * size;
            matrix = multiply(matrix, [
              c,
              s,
              -s,
              c,
              cx + dx - c * cx + s * cy,
              cy + dy - s * cx - c * cy,
            ]);
            rotation += angle;
            scale *= size;
          }
          const values = {
            ppt_x:
              (matrix[0] * center[0] +
                matrix[2] * center[1] +
                matrix[4] -
                center[0]) /
              slide.width,
            ppt_y:
              (matrix[1] * center[0] +
                matrix[3] * center[1] +
                matrix[5] -
                center[1]) /
              slide.height,
            rotation,
            scale,
          };
          for (const [key, track] of tracks)
            track.push([time / step.duration, values[key]]);
        }
        items.push({
          start: 0,
          entry: {
            targets: cohort.targets,
            tracks,
            duration: step.duration,
            repeat: 1,
            autoReverse: false,
            kind: "path",
            trigger: stepIndex ? "click" : "after",
          },
        });
      }
    }
    return { ...step, items };
  });
}
