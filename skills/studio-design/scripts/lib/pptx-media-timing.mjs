// Media repetition and activation use the standard PresentationML time tree.
// https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.commonmedianode
// https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.commontimenode
const target = (id) => `<p:tgtEl><p:spTgt spid="${id}"/></p:tgtEl>`;

// An explicit stop prevents Impress from starting the media shape on entry.
// Its cover disappears when stopped, so a separate picture supplies the resting
// frame and is hidden by the same native click that starts the real player.
function manualVideoNodes(mediaId, posterId, allocate) {
  const command = (name, start = "") =>
    `<p:cmd type="call" cmd="${name}"><p:cBhvr><p:cTn id="${allocate()}" dur="1" fill="hold">${start}</p:cTn>${target(mediaId)}</p:cBhvr></p:cmd>`;
  const immediate = '<p:stCondLst><p:cond delay="0"/></p:stCondLst>';
  const stop = command("stop", immediate);
  const hide = `<p:set><p:cBhvr additive="base"><p:cTn id="${allocate()}" dur="1" fill="hold">${immediate}</p:cTn>${target(posterId)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="hidden"/></p:to></p:set>`;
  const play = command("playFrom(0.0)");
  return `${stop}<p:seq concurrent="1" nextAc="seek"><p:cTn id="${allocate()}" restart="whenNotActive" fill="hold" nodeType="interactiveSeq"><p:stCondLst><p:cond evt="onClick" delay="0">${target(posterId)}</p:cond></p:stCondLst><p:childTnLst><p:par><p:cTn id="${allocate()}" fill="hold">${immediate}<p:childTnLst><p:par><p:cTn id="${allocate()}" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="clickEffect">${immediate}<p:childTnLst>${hide}${play}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:seq>`;
}

function addPoster(xml, picture, id) {
  const poster = picture
    .replace(/<p:cNvPr\b[^>]*>[\s\S]*?<\/p:cNvPr>/, (properties) => {
      const name = properties.match(/\bname="([^"]*)"/)?.[1];
      return `<p:cNvPr id="${id}" name="${name}-poster"/>`;
    })
    .replace(/<p:nvPr>[\s\S]*?<\/p:nvPr>/, "<p:nvPr/>");
  return xml.replace(picture, picture + poster);
}

export function addPptxMediaTiming(xml, objects) {
  const targets = new Map();
  for (const [picture] of xml.matchAll(/<p:pic\b[^>]*>[\s\S]*?<\/p:pic>/g)) {
    if (!/<(?:p14:media|a:videoFile|a:audioFile)\b/.test(picture)) continue;
    const properties = picture.match(/<p:cNvPr\b[^>]*>/)?.[0];
    targets.set(properties?.match(/\bname="([^"]*)"/)?.[1], {
      id: properties?.match(/\bid="(\d+)"/)?.[1],
      picture,
    });
  }
  const media = objects.filter(
    (object) => object.kind === "media" && object.playback,
  );
  if (!media.length) return xml;
  let next =
    Math.max(
      0,
      ...[...xml.matchAll(/<p:cTn\b[^>]*\bid="(\d+)"/g)].map((match) =>
        Number(match[1]),
      ),
    ) + 1;
  const root = xml.match(/<p:cTn\b[^>]*\bnodeType="tmRoot"[^>]*>/);
  const rootId = root ? null : next++;
  let nextShape =
    Math.max(
      0,
      ...[...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map((match) =>
        Number(match[1]),
      ),
    ) + 1;
  const nodes = media
    .map((object) => {
      const { id, picture } = targets.get(object.objectName) ?? {};
      if (!/^\d+$/.test(id || ""))
        throw new Error(
          "PowerPoint media timing could not resolve its native object.",
        );
      const playback = object.playback;
      const manual = playback.activation === "poster-click";
      const posterId = manual ? nextShape++ : null;
      if (manual) xml = addPoster(xml, picture, posterId);
      const duration =
        Number.isFinite(playback.duration) && playback.duration > 0
          ? Math.max(1, Math.round(playback.duration * 1000))
          : "indefinite";
      const start = manual
        ? '<p:cond delay="indefinite"/>'
        : playback.trigger === "automatic"
          ? '<p:cond delay="0"/>'
          : `<p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="${id}"/></p:tgtEl></p:cond>`;
      const kind = object.mediaType === "audio" ? "audio" : "video";
      const carrier = `<p:${kind}><p:cMediaNode vol="100000" mute="0" showWhenStopped="1"><p:cTn id="${next++}" dur="${duration}" fill="hold"${manual ? ' display="0"' : ""}${playback.loop ? ' repeatCount="indefinite"' : ""}><p:stCondLst>${start}</p:stCondLst></p:cTn>${target(id)}</p:cMediaNode></p:${kind}>`;
      return (
        carrier + (manual ? manualVideoNodes(id, posterId, () => next++) : "")
      );
    })
    .join("");
  if (!root) {
    if (/<p:timing\b/.test(xml))
      throw new Error(
        "PowerPoint media cannot extend an incompatible existing time tree.",
      );
    const timing = `<p:timing><p:tnLst><p:par><p:cTn id="${rootId}" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${nodes}</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
    return xml.replace(/<\/p:sld>/, `${timing}</p:sld>`);
  }
  // Poster insertion changes the shape-tree length before the existing time tree.
  const rootIndex = xml.indexOf(root[0]);
  const tail = xml.slice(rootIndex + root[0].length);
  let depth = 0;
  for (const match of tail.matchAll(/<\/?p:childTnLst>/g)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) {
      const at = rootIndex + root[0].length + match.index;
      return xml.slice(0, at) + nodes + xml.slice(at);
    }
  }
  throw new Error(
    "PowerPoint media requires an existing root child time list.",
  );
}
