// Media repetition and activation use the standard PresentationML time tree.
// https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.commonmedianode
// https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.commontimenode
export function addPptxMediaTiming(xml, objects) {
  const targets = new Map();
  for (const [picture] of xml.matchAll(/<p:pic\b[^>]*>[\s\S]*?<\/p:pic>/g)) {
    if (!/<(?:p14:media|a:videoFile|a:audioFile)\b/.test(picture)) continue;
    const properties = picture.match(/<p:cNvPr\b[^>]*>/)?.[0];
    targets.set(
      properties?.match(/\bname="([^"]*)"/)?.[1],
      properties?.match(/\bid="(\d+)"/)?.[1],
    );
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
  const nodes = media
    .map((object) => {
      const id = targets.get(object.objectName);
      if (!/^\d+$/.test(id || ""))
        throw new Error(
          "PowerPoint media timing could not resolve its native object.",
        );
      const playback = object.playback;
      const duration =
        Number.isFinite(playback.duration) && playback.duration > 0
          ? Math.max(1, Math.round(playback.duration * 1000))
          : "indefinite";
      const start =
        playback.trigger === "automatic"
          ? '<p:cond delay="0"/>'
          : `<p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="${id}"/></p:tgtEl></p:cond>`;
      const kind = object.mediaType === "audio" ? "audio" : "video";
      return `<p:${kind}><p:cMediaNode vol="100000" mute="0" showWhenStopped="1"><p:cTn id="${next++}" dur="${duration}" fill="hold"${playback.loop ? ' repeatCount="indefinite"' : ""}><p:stCondLst>${start}</p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${id}"/></p:tgtEl></p:cMediaNode></p:${kind}>`;
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
  const tail = xml.slice(root.index + root[0].length);
  let depth = 0;
  for (const match of tail.matchAll(/<\/?p:childTnLst>/g)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) {
      const at = root.index + root[0].length + match.index;
      return xml.slice(0, at) + nodes + xml.slice(at);
    }
  }
  throw new Error(
    "PowerPoint media requires an existing root child time list.",
  );
}
