import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { parseEffect, buildSteps } from "../../assets/starters/deck-effects.js";

import {
  families,
  centered,
  nativeFilter,
  tracksFor,
} from "./pptx-motion-effects.mjs";
import { timingWriter } from "./pptx-motion-timing.mjs";

// PresentationML property behavior and timing contracts:
// https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-animation
// https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/baf99b7b-b2a7-44bb-a501-f6147d6c7123
// https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.commontimenode
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char],
  );
const decode = (value) =>
  value.replace(
    /&(?:amp|lt|gt|quot|apos);/g,
    (entity) =>
      ({
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&apos;": "'",
      })[entity],
  );

// This reader only handles XML emitted by our presentation generator. Preserve
// untouched XML verbatim, including extensions and media timing branches.
function xmlNodes(xml) {
  const roots = [],
    stack = [];
  for (const match of xml.matchAll(/<\/?([\w:.-]+)\b[^>]*>/g)) {
    const [raw, name] = match;
    if (raw.startsWith("</")) {
      const node = stack.pop();
      if (node?.name !== name)
        throw new Error("Invalid generated presentation XML.");
      node.close = match.index;
      node.end = match.index + raw.length;
    } else {
      const node = {
        name,
        start: match.index,
        openEnd: match.index + raw.length,
        end: match.index + raw.length,
        close: match.index,
        attributes: Object.fromEntries(
          [...raw.matchAll(/([\w:.-]+)="([^"]*)"/g)].map(([, key, value]) => [
            key,
            decode(value),
          ]),
        ),
        children: [],
      };
      (stack.at(-1)?.children ?? roots).push(node);
      if (!raw.endsWith("/>")) stack.push(node);
    }
  }
  if (stack.length) throw new Error("Incomplete generated presentation XML.");
  return roots;
}
const descendants = (nodes) =>
  nodes.flatMap((node) => [node, ...descendants(node.children)]);
const child = (node, name) => node?.children.find((item) => item.name === name);

function targetIssue(entry, objects) {
  if (entry.unsupportedReason) return entry.unsupportedReason;
  if (!families.has(entry.family) && !nativeFilter(entry))
    return `the ${entry.effect} effect has no verified native mapping`;
  if (
    objects.some((object) => object.flattenedAnimationIds?.includes(entry.id))
  )
    return "the target is flattened inside another picture";
  const targets = objects.filter((object) =>
    object.animIds?.includes(entry.id),
  );
  if (!targets.length)
    return "the target has no independently exported artwork";
  if (targets.some((object) => object.kind === "media"))
    return "the target includes playable media";
  if (targets.some((object) => (object.animIds?.length ?? 0) > 1))
    return "nested animated targets require composed transforms";
  if (
    (centered.has(entry.family) ||
      nativeFilter(entry) ||
      ["fly", "float", "path", "bounce"].includes(entry.family)) &&
    (!entry.geometry ||
      ["x", "y", "w", "h"].some(
        (key) => !Number.isFinite(entry.geometry[key]),
      ) ||
      entry.geometry.w <= 0 ||
      entry.geometry.h <= 0)
  )
    return "the target has no captured motion geometry";
  if (
    centered.has(entry.family) &&
    entry.transformOrigin &&
    (Math.abs(entry.transformOrigin.x - entry.geometry.w / 2) > 1 ||
      Math.abs(entry.transformOrigin.y - entry.geometry.h / 2) > 1)
  )
    return "the target uses a custom CSS transform origin";
  return null;
}

function groupTargets(xml, entry, shapeIds, slide, slideSize) {
  const nodes = xmlNodes(xml),
    all = descendants(nodes);
  const tree = all.find((node) => node.name === "p:spTree");
  const positions = tree.children.flatMap((node, index) => {
    const identity = descendants([node]).find(
      (item) => item.name === "p:cNvPr",
    );
    return shapeIds.includes(identity?.attributes.id) ? [{ node, index }] : [];
  });
  if (
    positions.length !== shapeIds.length ||
    positions.at(-1).index - positions[0].index + 1 !== positions.length
  )
    return {
      issue: "the target's artwork is interleaved with unrelated slide objects",
    };
  const groupId =
    Math.max(
      ...all
        .filter((node) => node.name === "p:cNvPr")
        .map((node) => Number(node.attributes.id)),
    ) + 1;
  const rect = entry.geometry;
  const x = Math.round((rect.x / slide.width) * slideSize.cx),
    y = Math.round((rect.y / slide.height) * slideSize.cy);
  const w = Math.round((rect.w / slide.width) * slideSize.cx),
    h = Math.round((rect.h / slide.height) * slideSize.cy);
  const start = positions[0].node.start,
    end = positions.at(-1).node.end;
  const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${groupId}" name="${escape(`Studio animation ${entry.id}`)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${w}" cy="${h}"/></a:xfrm></p:grpSpPr>${xml.slice(start, end)}</p:grpSp>`;
  return {
    xml: xml.slice(0, start) + group + xml.slice(end),
    targets: [String(groupId)],
  };
}

/** Add native builds to generator-owned PPTX bytes, preserving other ZIP parts.
 * Slides are in output order; objects identify emitted shapes through objectName.
 * Animation descriptors contain id, attributes, documentIndex and pixel geometry.
 */
export function applyPptxMotion(buffer, slides, options = {}) {
  const zip = unzipSync(buffer),
    warnings = new Set();
  const presentationNodes = descendants(
    xmlNodes(strFromU8(zip["ppt/presentation.xml"])),
  );
  const slideSize = presentationNodes.find(
    (node) => node.name === "p:sldSz",
  )?.attributes;
  let animationCount = 0,
    staticAnimationCount = 0,
    changed = false;
  for (const [index, slide] of slides.entries()) {
    const entries = (slide.animations ?? []).flatMap(
      (captured, documentIndex) => {
        const parsed = parseEffect(captured.attributes ?? {});
        return parsed
          ? [
              {
                ...captured,
                ...parsed,
                documentIndex: captured.documentIndex ?? documentIndex,
              },
            ]
          : [];
      },
    );
    if (!entries.length) continue;
    const warn = (entry, reason) => {
      warnings.add(
        `Slide ${(slide.sourceIndex ?? index) + 1}: ${entry.effect} remains static because ${reason}.`,
      );
      staticAnimationCount++;
    };
    const filename = `ppt/slides/slide${index + 1}.xml`;
    if (!zip[filename])
      throw new Error(`Missing generated PowerPoint slide ${index + 1}.`);
    let xml = strFromU8(zip[filename]);
    const nodes = xmlNodes(xml),
      all = descendants(nodes);
    const shapeIds = new Map();
    for (const node of all.filter((node) => node.name === "p:cNvPr")) {
      const { name, id } = node.attributes;
      if (shapeIds.has(name)) shapeIds.set(name, null);
      else shapeIds.set(name, id);
    }
    const timing = all.find((node) => node.name === "p:timing");
    const root = all.find(
      (node) => node.name === "p:cTn" && node.attributes.nodeType === "tmRoot",
    );
    const rootChildren = child(root, "p:childTnLst");
    const conflict =
      timing &&
      (!rootChildren ||
        all.some(
          (node) =>
            node.name === "p:cTn" && node.attributes.nodeType === "mainSeq",
        ));
    let supported = 0;
    for (const entry of entries) {
      const issue =
        options.enabled === false
          ? "native build export is disabled"
          : conflict
            ? "the slide already owns an incompatible main animation sequence"
            : targetIssue(entry, slide.objects ?? []);
      if (issue) {
        warn(entry, issue);
        continue;
      }
      let targets = slide.objects
        .filter((object) => object.animIds?.includes(entry.id))
        .map((object) => shapeIds.get(object.objectName));
      if (targets.some((id) => !/^\d+$/.test(id ?? ""))) {
        warn(entry, "its emitted shape names cannot be resolved uniquely");
        continue;
      }
      if (centered.has(entry.family) || nativeFilter(entry)) {
        const grouped = groupTargets(xml, entry, targets, slide, slideSize);
        if (grouped.issue) {
          warn(entry, grouped.issue);
          continue;
        }
        xml = grouped.xml;
        targets = grouped.targets;
      }
      const { tracks, sampled, filter } = tracksFor(entry, slide);
      Object.assign(entry, { targets, tracks, filter });
      if (filter)
        warnings.add(
          `Native PowerPoint ${entry.family} builds use the application's own filter geometry and pattern, which can differ from the HTML mask.`,
        );
      if (entry.effect === "box-out")
        warnings.add(
          "Native box-out can hold until completion and leave a one-pixel outline in LibreOffice Impress; inspect playback in the target presentation application.",
        );
      if (sampled)
        warnings.add(
          "Native PowerPoint builds approximate CSS ease with up to 101 linear samples; inspect playback in the target presentation application.",
        );
      supported++;
    }
    if (!supported) continue;
    const ids = all
      .filter((node) => node.name === "p:cTn")
      .map((node) => Number(node.attributes.id));
    const writer = timingWriter(Math.max(0, ...ids) + 1);
    const rootId = root ? null : writer.id();
    const sequence = writer.sequence(buildSteps(entries));
    const finalNodes = xmlNodes(xml);
    const finalRoot = descendants(finalNodes).find(
      (node) => node.name === "p:cTn" && node.attributes.nodeType === "tmRoot",
    );
    const finalRootChildren = child(finalRoot, "p:childTnLst");
    if (finalRootChildren)
      xml =
        xml.slice(0, finalRootChildren.close) +
        sequence +
        xml.slice(finalRootChildren.close);
    else {
      const generated = `<p:timing><p:tnLst><p:par><p:cTn id="${rootId}" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${sequence}</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
      const slideNode = finalNodes.find((node) => node.name === "p:sld");
      const insert = child(slideNode, "p:extLst")?.start ?? slideNode.close;
      xml = xml.slice(0, insert) + generated + xml.slice(insert);
    }
    zip[filename] = strToU8(xml);
    animationCount += supported;
    changed = true;
  }
  return {
    buffer: changed ? Buffer.from(zipSync(zip, { level: 6 })) : buffer,
    animationCount,
    staticAnimationCount,
    warnings: [...warnings],
  };
}
