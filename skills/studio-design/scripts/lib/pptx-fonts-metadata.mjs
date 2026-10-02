// SFNT metadata and EOT layout follow Microsoft's OpenType specifications and
// the Microsoft-authored EOT submission: https://www.w3.org/submissions/EOT/.
const required = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
];
const invalid = (message) => new Error(`Invalid PowerPoint font: ${message}`);
function bounded(buffer, offset, length, label) {
  if (
    !Number.isInteger(offset) ||
    !Number.isInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > buffer.length
  )
    throw invalid(`${label} lies outside the font data.`);
  return buffer.subarray(offset, offset + length);
}
function names(table) {
  if (table.length < 6) throw invalid("the name table is truncated.");
  const format = table.readUInt16BE(0),
    count = table.readUInt16BE(2),
    storage = table.readUInt16BE(4);
  if (format > 1 || storage < 6 + count * 12)
    throw invalid("the name table header is malformed.");
  bounded(table, 6, count * 12, "name records");
  const found = new Map();
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12,
      platform = table.readUInt16BE(at),
      encoding = table.readUInt16BE(at + 2),
      language = table.readUInt16BE(at + 4),
      id = table.readUInt16BE(at + 6);
    const data = bounded(
      table,
      storage + table.readUInt16BE(at + 10),
      table.readUInt16BE(at + 8),
      "name string",
    );
    let priority = 0,
      decoder;
    if (
      platform === 3 &&
      [0, 1, 10].includes(encoding) &&
      (language & 1023) === 9
    ) {
      priority = language === 0x409 ? 4 : 3;
      decoder = "utf-16be";
    } else if (platform === 0) {
      priority = 2;
      decoder = "utf-16be";
    } else if (platform === 1 && encoding === 0 && language === 0) {
      priority = 1;
      decoder = "macintosh";
    }
    if (!priority || (found.get(id)?.priority ?? 0) >= priority) continue;
    try {
      found.set(id, {
        value: new TextDecoder(decoder, { fatal: true }).decode(data),
        priority,
      });
    } catch {
      throw invalid("a font name has invalid text encoding.");
    }
  }
  const read = (id, label, limit = 255) => {
    const value = found.get(id)?.value;
    if (
      !value?.trim() ||
      value.length > limit ||
      /[\u0000-\u001f\u007f]/.test(value)
    )
      throw invalid(`an English or Unicode ${label} is required.`);
    return value;
  };
  return {
    family: read(1, "family name"),
    subfamily: read(2, "style name"),
    fullName: read(4, "full name"),
    versionName: read(5, "version name", 1024),
  };
}
function characterMap(table) {
  if (table.length < 4) throw invalid("the cmap table is truncated.");
  const count = table.readUInt16BE(2),
    maps = [];
  bounded(table, 4, count * 8, "cmap records");
  for (let i = 0; i < count; i++) {
    const at = 4 + i * 8,
      platform = table.readUInt16BE(at),
      encoding = table.readUInt16BE(at + 2);
    if (platform !== 0 && !(platform === 3 && [1, 10].includes(encoding)))
      continue;
    const offset = table.readUInt32BE(at + 4);
    const head = bounded(table, offset, 4, "cmap subtable");
    const format = head.readUInt16BE(0);
    if (![4, 12, 13].includes(format)) continue;
    const size =
      format === 4
        ? head.readUInt16BE(2)
        : bounded(table, offset, 16, "cmap header").readUInt32BE(4);
    const sub = bounded(table, offset, size, "cmap subtable");
    bounded(sub, 0, 16, "cmap fields");
    if (format === 4) {
      const segments = sub.readUInt16BE(6) / 2;
      if (!Number.isInteger(segments) || !segments)
        throw invalid("cmap format 4 has invalid segments.");
      bounded(sub, 14, segments * 8 + 2, "cmap segments");
      maps.push((code) => {
        if (code > 65535) return false;
        for (let segment = 0; segment < segments; segment++) {
          const end = sub.readUInt16BE(14 + segment * 2),
            start = sub.readUInt16BE(16 + segments * 2 + segment * 2);
          if (code < start || code > end) continue;
          const delta = sub.readInt16BE(16 + segments * 4 + segment * 2),
            rangeAt = 16 + segments * 6 + segment * 2,
            range = sub.readUInt16BE(rangeAt);
          if (!range) return ((code + delta) & 65535) !== 0;
          const glyphAt = rangeAt + range + (code - start) * 2;
          if (glyphAt + 2 > sub.length) return false;
          const glyph = sub.readUInt16BE(glyphAt);
          return glyph !== 0 && ((glyph + delta) & 65535) !== 0;
        }
        return false;
      });
    } else {
      const groups = sub.readUInt32BE(12);
      bounded(sub, 16, groups * 12, "cmap groups");
      maps.push((code) => {
        let low = 0,
          high = groups - 1;
        while (low <= high) {
          const middle = (low + high) >>> 1,
            at = 16 + middle * 12,
            first = sub.readUInt32BE(at),
            last = sub.readUInt32BE(at + 4);
          if (code < first) high = middle - 1;
          else if (code > last) low = middle + 1;
          else
            return (
              sub.readUInt32BE(at + 8) + (format === 12 ? code - first : 0) !==
              0
            );
        }
        return false;
      });
    }
  }
  if (!maps.length) throw invalid("a supported Unicode cmap is required.");
  return (code) => maps.some((has) => has(code));
}
export function readPptxFont(bytes) {
  if (
    bytes.length < 12 ||
    ![0x00010000, 0x4f54544f].includes(bytes.readUInt32BE(0))
  )
    throw invalid(
      "supply a static TrueType or OpenType file; collections, WOFF and WOFF2 are unsupported.",
    );
  const count = bytes.readUInt16BE(4),
    tables = new Map();
  if (!count || count > 256) throw invalid("the SFNT table count is invalid.");
  bounded(bytes, 12, count * 16, "SFNT directory");
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16,
      tag = bytes.toString("ascii", at, at + 4),
      offset = bytes.readUInt32BE(at + 8),
      length = bytes.readUInt32BE(at + 12);
    if (tables.has(tag) || offset < 12 + count * 16 || offset % 4)
      throw invalid(`table ${tag} has an invalid directory entry.`);
    tables.set(tag, bounded(bytes, offset, length, `table ${tag}`));
  }
  for (const tag of required)
    if (!tables.has(tag)) throw invalid(`required table ${tag} is missing.`);
  if (tables.has("fvar") || tables.has("CFF2"))
    throw invalid(
      "variable fonts require an explicitly generated static font file before embedding.",
    );
  if (
    bytes.readUInt32BE(0) === 0x4f54544f
      ? !tables.has("CFF ")
      : !tables.has("glyf") || !tables.has("loca")
  )
    throw invalid("the outline tables do not match the SFNT type.");
  const head = bounded(tables.get("head"), 0, 54, "head fields"),
    os2 = tables.get("OS/2");
  if (head.readUInt32BE(12) !== 0x5f0f3cf5 || os2.length < 78)
    throw invalid("the head or OS/2 table is malformed.");
  const version = os2.readUInt16BE(0),
    fsType = os2.readUInt16BE(8),
    permissions = fsType & 14;
  if (
    version > 5 ||
    fsType & 1 ||
    (version >= 3 && ![0, 2, 4, 8].includes(permissions))
  )
    throw invalid("the embedding permission flags are invalid or unsupported.");
  if ((permissions & 8) === 0 && permissions !== 0)
    throw invalid(
      permissions & 4
        ? "preview-and-print-only embedding cannot preserve an editable presentation."
        : "restricted-license embedding is not permitted.",
    );
  if (version >= 2 && fsType & 512)
    throw invalid("bitmap-only embedding does not permit these font outlines.");
  const identity = names(tables.get("name")),
    selection = os2.readUInt16BE(62),
    bold = Boolean(selection & 32),
    italic = Boolean(selection & 1 || selection & 512),
    weight = os2.readUInt16BE(4);
  if (weight < 1 || weight > 1000)
    throw invalid("the font weight is outside 1–1000.");
  return {
    ...identity,
    fsType,
    bold,
    italic,
    weight,
    slot: bold
      ? italic
        ? "boldItalic"
        : "bold"
      : italic
        ? "italic"
        : "regular",
    panose: os2.subarray(32, 42),
    unicodeRanges: [42, 46, 50, 54].map((at) => os2.readUInt32BE(at)),
    codePages:
      version >= 1 && os2.length >= 86
        ? [os2.readUInt32BE(78), os2.readUInt32BE(82)]
        : [0, 0],
    checksumAdjustment: head.readUInt32BE(8),
    covers: characterMap(tables.get("cmap")),
  };
}
export function encodePptxFont(bytes, font = readPptxFont(bytes)) {
  // Uncompressed EOT v2.1 carries the complete original SFNT after its names.
  const header = Buffer.alloc(80),
    strings = [];
  for (const value of [
    font.family,
    font.subfamily,
    font.versionName,
    font.fullName,
    "",
  ]) {
    const data = Buffer.from(value, "utf16le"),
      record = Buffer.alloc(4 + data.length);
    record.writeUInt16LE(data.length, 2);
    data.copy(record, 4);
    strings.push(record);
  }
  const size =
    header.length +
    strings.reduce((sum, item) => sum + item.length, 0) +
    bytes.length;
  header.writeUInt32LE(size, 0);
  header.writeUInt32LE(bytes.length, 4);
  header.writeUInt32LE(0x00020001, 8);
  font.panose.copy(header, 16);
  header[26] = 1;
  header[27] = font.italic ? 1 : 0;
  header.writeUInt32LE(font.weight, 28);
  header.writeUInt16LE(font.fsType, 32);
  header.writeUInt16LE(0x504c, 34);
  font.unicodeRanges.forEach((value, index) =>
    header.writeUInt32LE(value, 36 + index * 4),
  );
  font.codePages.forEach((value, index) =>
    header.writeUInt32LE(value, 52 + index * 4),
  );
  header.writeUInt32LE(font.checksumAdjustment, 60);
  return Buffer.concat([header, ...strings, bytes]);
}
