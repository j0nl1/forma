// Native timing containers follow PresentationML click, with, and effect nesting.
// https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-animation
const number = (value) => Number(value.toFixed(8));

export function timingWriter(nextId) {
  let current = nextId;
  const id = () => current++;
  const condition = (delay) =>
    `<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>`;
  const behavior = (shapeId, attributes, duration, delay = 0) =>
    `<p:cBhvr additive="base"><p:cTn id="${id()}" dur="${Math.max(0, Math.round(duration))}" fill="hold">${condition(Math.round(delay))}</p:cTn><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl><p:attrNameLst>${attributes.map((name) => `<p:attrName>${name}</p:attrName>`).join("")}</p:attrNameLst></p:cBhvr>`;
  const visibility = (shapeId, visible, delay = 0, duration = 1) =>
    `<p:set>${behavior(shapeId, ["style.visibility"], duration, delay)}<p:to><p:strVal val="${visible ? "visible" : "hidden"}"/></p:to></p:set>`;
  const filterEffect = (shapeId, entry) =>
    `<p:animEffect transition="${entry.kind === "exit" ? "out" : "in"}" filter="${entry.filter}">${behavior(shapeId, [], entry.duration).replace("<p:attrNameLst></p:attrNameLst>", "")}</p:animEffect>`;
  const numeric = (shapeId, attribute, track, duration, delay = 0) =>
    `<p:anim calcmode="lin" valueType="num">${behavior(shapeId, [attribute], duration, delay)}<p:tavLst>${track
      .map(([offset, value]) => {
        const content = attribute.startsWith("ppt_")
          ? `<p:strVal val="${`#${attribute}${value < 0 ? "" : "+"}${number(value)}`}"/>`
          : `<p:fltVal val="${number(value)}"/>`;
        return `<p:tav tm="${Math.round(offset * 100000)}"><p:val>${content}</p:val></p:tav>`;
      })
      .join("")}</p:tavLst></p:anim>`;
  const transform = (shapeId, type, track, duration, delay = 0) =>
    track
      .slice(1)
      .map(([offset, value], index) => {
        const [previous, from] = track[index];
        const common = behavior(
          shapeId,
          type === "rotation" ? ["r"] : ["ScaleX", "ScaleY"],
          Math.round(offset * duration) - Math.round(previous * duration),
          delay + previous * duration,
        );
        return type === "rotation"
          ? `<p:animRot from="${Math.round(from * 60000)}" to="${Math.round(value * 60000)}">${common}</p:animRot>`
          : `<p:animScale>${common}<p:from x="${Math.round(from * 100000)}" y="${Math.round(from * 100000)}"/><p:to x="${Math.round(value * 100000)}" y="${Math.round(value * 100000)}"/></p:animScale>`;
      })
      .join("");
  function effect(entry, start, groupId) {
    const nodeId = id();
    const duration = entry.duration * (entry.autoReverse ? 2 : 1);
    const contents = entry.frameVisibility
      ? entry.frameVisibility
          .map(({ target, visible }) => visibility(target, visible, 0, 0))
          .join("")
      : (entry.targets ?? [])
          .map((target) => {
            const body = (
              entry.segments ?? [{ start: 0, duration, tracks: entry.tracks }]
            )
              .map((segment) =>
                [...segment.tracks]
                  .map(([attribute, values]) =>
                    ["rotation", "scale"].includes(attribute)
                      ? transform(
                          target,
                          attribute,
                          values,
                          segment.duration,
                          segment.start,
                        )
                      : numeric(
                          target,
                          attribute,
                          values,
                          segment.duration,
                          segment.start,
                        ),
                  )
                  .join(""),
              )
              .join("");
            return (
              (entry.kind === "entrance" ? visibility(target, true) : "") +
              body +
              (entry.filter ? filterEffect(target, entry) : "") +
              (entry.kind === "exit"
                ? visibility(target, false, entry.duration, 0)
                : "")
            );
          })
          .join("");
    const presetClass = {
      entrance: "entr",
      exit: "exit",
      emphasis: "emph",
      path: "path",
    }[entry.kind];
    const nodeType = {
      click: "clickEffect",
      with: "withEffect",
      after: "afterEffect",
    }[entry.trigger];
    return `<p:par><p:cTn id="${nodeId}"${contents && !entry.segments ? "" : ` dur="${Math.round(duration)}"`} fill="hold" grpId="${groupId}" nodeType="${nodeType}" presetClass="${presetClass}" repeatCount="${entry.repeat * 1000}">${condition(Math.round(start))}${contents ? `<p:childTnLst>${contents}</p:childTnLst>` : ""}</p:cTn></p:par>`;
  }
  function sequence(steps) {
    const seqId = id();
    const groups = steps
      .map((step, index) => {
        if (!index && !step.items.length) return "";
        const groupId = id();
        const effects = step.items
          .map(({ entry, start }) => effect(entry, start, groupId))
          .join("");
        // Keep unsupported entries in the shared schedule: their elapsed time and
        // click boundaries must not pull later supported animations forward.
        const start = index
          ? condition("indefinite")
          : `<p:stCondLst><p:cond evt="onBegin" delay="0"><p:tn val="${seqId}"/></p:cond></p:stCondLst>`;
        return `<p:par><p:cTn id="${groupId}" fill="hold">${start}<p:childTnLst><p:par><p:cTn id="${id()}" fill="hold">${condition(0)}<p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
      })
      .join("");
    return `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${seqId}" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${groups}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>`;
  }
  return { id, sequence, visibility, numeric };
}
