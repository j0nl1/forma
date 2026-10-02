import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { readPptxFont, encodePptxFont } from "./pptx-fonts-metadata.mjs";

const maximumFontBytes = 32 * 1024 * 1024;
const normalize = (name) => name.trim().toLocaleLowerCase("en-US");
const xmlEscape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character],
  );

export async function loadPptxFonts(entries = []) {
  if (
    !Array.isArray(entries) ||
    entries.length > 64 ||
    entries.some(
      (entry) =>
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        Object.keys(entry).some((key) => key !== "path") ||
        typeof entry.path !== "string" ||
        !path.isAbsolute(entry.path) ||
        !/\.(?:ttf|otf)$/i.test(entry.path),
    )
  )
    throw new Error(
      "pptxFonts must contain up to 64 explicit absolute local .ttf/.otf paths as {path} objects.",
    );
  const faces = [],
    keys = new Set();
  let totalBytes = 0;
  for (const entry of entries) {
    const handle = await fs.open(entry.path, "r");
    let bytes;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 12 || stat.size > maximumFontBytes)
        throw new Error(
          "Each PowerPoint font must be a regular file between 12 bytes and 32 MiB.",
        );
      bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(
          bytes,
          offset,
          bytes.length - offset,
          offset,
        );
        if (!bytesRead)
          throw new Error(
            "PowerPoint font changed while its bytes were being read.",
          );
        offset += bytesRead;
      }
      const after = await handle.stat();
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
        throw new Error(
          "PowerPoint font changed while its bytes were being read.",
        );
    } finally {
      await handle.close();
    }
    totalBytes += bytes.length;
    if (totalBytes > 128 * 1024 * 1024)
      throw new Error(
        "PowerPoint font snapshots exceed the combined 128 MiB limit.",
      );
    const metadata = readPptxFont(bytes),
      key = `${normalize(metadata.family)}:${metadata.slot}`;
    if (keys.has(key))
      throw new Error(
        `PowerPoint font ${metadata.family} has more than one supplied ${metadata.slot} face.`,
      );
    keys.add(key);
    faces.push({
      ...metadata,
      path: entry.path,
      bytes,
      eot: encodePptxFont(bytes, metadata),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return { faces };
}

export async function preparePptxFonts(page, plan) {
  if (!plan.faces.length) return;
  await page.evaluate(
    async (faces) => {
      for (const font of faces) {
        const bytes = Uint8Array.from(atob(font.data), (character) =>
          character.charCodeAt(0),
        );
        const face = new FontFace(font.family, bytes, {
          weight: String(font.weight),
          style: font.italic ? "italic" : "normal",
        });
        try {
          await face.load();
        } catch {
          throw new Error(
            `Chromium could not decode the supplied font ${font.family} ${font.slot}.`,
          );
        }
        // Programmatically loaded faces are considered after stylesheet faces, so
        // the supplied snapshot wins an otherwise matching family/style lookup.
        document.fonts.add(face);
      }
      await document.fonts.ready;
    },
    plan.faces.map((font) => ({
      family: font.family,
      slot: font.slot,
      weight: font.weight,
      italic: font.italic,
      data: font.bytes.toString("base64"),
    })),
  );
}

function usedFonts(slides) {
  const families = new Map();
  for (const slide of slides)
    for (const object of slide.objects) {
      if (object.kind !== "text") continue;
      const key = normalize(object.fontFace),
        slot = object.bold
          ? object.italic
            ? "boldItalic"
            : "bold"
          : object.italic
            ? "italic"
            : "regular";
      if (!families.has(key))
        families.set(key, { family: object.fontFace, slots: new Map() });
      const entry = families.get(key);
      if (!entry.slots.has(slot)) entry.slots.set(slot, new Set());
      for (const character of object.text)
        if (!/[\s\p{Cf}]/u.test(character)) {
          const code = character.codePointAt(0);
          if (
            !(code >= 0xfe00 && code <= 0xfe0f) &&
            !(code >= 0xe0100 && code <= 0xe01ef)
          )
            entry.slots.get(slot).add(code);
        }
    }
  return families;
}

export function embedPptxFonts(buffer, plan, slides) {
  const used = usedFonts(slides),
    warnings = [],
    embeddedFonts = [],
    selected = [];
  for (const [key, usage] of used) {
    const faces = plan.faces.filter((font) => normalize(font.family) === key);
    if (!faces.length) {
      warnings.push(
        `Font ${usage.family} is not embedded; supply its local font files through pptxFonts or ensure that the recipient has the font installed.`,
      );
      continue;
    }
    for (const [slot, characters] of usage.slots) {
      const face = faces.find((font) => font.slot === slot);
      if (!face)
        warnings.push(
          `Font ${usage.family} has no supplied ${slot} face; that style may be synthesized or substituted by the recipient's application.`,
        );
      else {
        const missing = [...characters].filter((code) => !face.covers(code));
        if (missing.length)
          warnings.push(
            `Font ${usage.family} ${slot} does not map ${missing.length} character(s) used by the slide text (${missing
              .slice(0, 8)
              .map(
                (code) =>
                  `U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
              )
              .join(", ")}); browser fallback glyphs may differ in PowerPoint.`,
          );
      }
    }
    selected.push({ family: faces[0].family, faces });
    embeddedFonts.push({
      family: faces[0].family,
      faces: faces.map((font) => ({
        style: font.slot,
        bytes: font.bytes.length,
        sha256: font.sha256,
        embeddingRights: font.fsType & 8 ? "editable" : "installable",
      })),
    });
  }
  for (const family of new Set(plan.faces.map((face) => face.family)))
    if (!used.has(normalize(family)))
      warnings.push(
        `Supplied font ${family} is not used by editable slide text and was not embedded.`,
      );
  if (!selected.length) return { buffer, embeddedFonts, warnings };
  const zip = unzipSync(buffer);
  const presentationFile = "ppt/presentation.xml",
    relationshipsFile = "ppt/_rels/presentation.xml.rels",
    contentTypesFile = "[Content_Types].xml";
  let presentation = strFromU8(zip[presentationFile]),
    relationships = strFromU8(zip[relationshipsFile]),
    contentTypes = strFromU8(zip[contentTypesFile]);
  if (/<p:embeddedFontLst\b/.test(presentation))
    throw new Error(
      "PowerPoint font embedding must run once on a newly generated presentation.",
    );
  let relationshipNumber =
      Math.max(
        0,
        ...[...relationships.matchAll(/\bId="rId(\d+)"/g)].map((match) =>
          Number(match[1]),
        ),
      ) + 1,
    fontNumber = 1;
  const fontEntries = [],
    newRelationships = [];
  const styleOrder = ["regular", "bold", "italic", "boldItalic"];
  for (const family of selected) {
    const variants = [];
    for (const font of [...family.faces].sort(
      (a, b) => styleOrder.indexOf(a.slot) - styleOrder.indexOf(b.slot),
    )) {
      while (zip[`ppt/fonts/font-${fontNumber}.fntdata`]) fontNumber++;
      const name = `font-${fontNumber++}.fntdata`,
        id = `rId${relationshipNumber++}`;
      zip[`ppt/fonts/${name}`] = font.eot;
      newRelationships.push(
        `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/${name}"/>`,
      );
      variants.push(`<p:${font.slot} r:id="${id}"/>`);
    }
    fontEntries.push(
      `<p:embeddedFont><p:font typeface="${xmlEscape(family.family)}" charset="1"/>${variants.join("")}</p:embeddedFont>`,
    );
  }
  const fontList = `<p:embeddedFontLst>${fontEntries.join("")}</p:embeddedFontLst>`;
  if (!/<p:notesSz\b[^>]*\/>/.test(presentation))
    throw new Error(
      "Generated PowerPoint presentation has no expected notes-size insertion point for font metadata.",
    );
  presentation = presentation
    .replace(/<p:notesSz\b[^>]*\/>/, (tag) => `${tag}${fontList}`)
    .replace(/<p:presentation\b[^>]*>/, (tag) =>
      tag
        .replace(/\s(?:embedTrueTypeFonts|saveSubsetFonts)="[^"]*"/g, "")
        .replace(/>$/, ' embedTrueTypeFonts="1" saveSubsetFonts="0">'),
    );
  relationships = relationships.replace(
    "</Relationships>",
    `${newRelationships.join("")}</Relationships>`,
  );
  if (!/Extension="fntdata"/.test(contentTypes))
    contentTypes = contentTypes.replace(
      "</Types>",
      '<Default Extension="fntdata" ContentType="application/x-fontdata"/></Types>',
    );
  zip[presentationFile] = strToU8(presentation);
  zip[relationshipsFile] = strToU8(relationships);
  zip[contentTypesFile] = strToU8(contentTypes);
  return {
    buffer: Buffer.from(zipSync(zip, { level: 6 })),
    embeddedFonts,
    warnings,
  };
}
