function byteView(bytes) {
  if (ArrayBuffer.isView(bytes))
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    Array.isArray(bytes) &&
    bytes.every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 255,
    )
  )
    return new DataView(Uint8Array.from(bytes).buffer);
  throw new Error("blob must contain bytes");
}
function coordinate(value) {
  if (!Number.isFinite(value)) throw new Error("non-finite coordinate");
  const rounded = Math.round(value * 1000) / 1000;
  if (!Number.isFinite(rounded))
    throw new Error("non-finite rounded coordinate");
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
function axisScale(size, normalized) {
  if (normalized == null || normalized === 0 || size == null) return 1;
  if (!Number.isFinite(normalized) || !Number.isFinite(size))
    throw new Error("non-finite normalized size");
  const scale = size / normalized;
  if (!Number.isFinite(scale)) throw new Error("non-finite normalized scale");
  return scale;
}
export function decodeVectorNetwork(bytes, node = {}, warn = () => {}) {
  const data = byteView(bytes);
  if (data.byteLength < 12) throw new Error("truncated counts header");
  const vertices = data.getUint32(0, true),
    segments = data.getUint32(4, true),
    regions = data.getUint32(8, true),
    segmentBase = 12 + vertices * 12,
    regionBase = segmentBase + segments * 28;
  if (regionBase > data.byteLength)
    throw new Error("truncated vertex or segment table");
  const scaleX = axisScale(node.size?.x, node.vectorData?.normalizedSize?.x),
    scaleY = axisScale(node.size?.y, node.vectorData?.normalizedSize?.y);
  const vertex = (index) => {
    if (index >= vertices) throw new Error("vertex reference out of range");
    const base = 12 + index * 12;
    return [
      data.getFloat32(base + 4, true) * scaleX,
      data.getFloat32(base + 8, true) * scaleY,
    ];
  };
  const segment = (index) => {
    if (index >= segments) throw new Error("segment reference out of range");
    const base = segmentBase + index * 28;
    const start = data.getUint32(base + 4, true),
      end = data.getUint32(base + 16, true);
    const first = vertex(start),
      last = vertex(end),
      firstTangent = [
        data.getFloat32(base + 8, true) * scaleX,
        data.getFloat32(base + 12, true) * scaleY,
      ],
      lastTangent = [
        data.getFloat32(base + 20, true) * scaleX,
        data.getFloat32(base + 24, true) * scaleY,
      ];
    for (const value of [...first, ...last, ...firstTangent, ...lastTangent])
      if (!Number.isFinite(value)) throw new Error("non-finite coordinate");
    return { start, end, first, last, firstTangent, lastTangent };
  };
  let cursor = regionBase;
  const available = (count) => cursor + count <= data.byteLength;
  const read = () => {
    const value = data.getUint32(cursor, true);
    cursor += 4;
    return value;
  };
  const paths = [];
  for (let region = 0; region < regions; region++) {
    if (!available(8)) {
      warn("truncated region header");
      break;
    }
    const winding = read(),
      loops = read(),
      parts = [];
    if (winding > 1) warn("unknown region winding; using evenodd");
    for (let loop = 0; loop < loops; loop++) {
      if (!available(4)) {
        warn("truncated loop header");
        return paths;
      }
      const count = read();
      if (!available(count * 4)) {
        warn("truncated loop segment list");
        return paths;
      }
      let previous = null;
      for (let entry = 0; entry < count; entry++) {
        const index = read();
        try {
          let { start, end, first, last, firstTangent, lastTangent } =
            segment(index);
          if (previous !== null && start !== previous && end === previous) {
            [start, end] = [end, start];
            [first, last] = [last, first];
            [firstTangent, lastTangent] = [lastTangent, firstTangent];
          }
          const command = [...firstTangent, ...lastTangent].some(Boolean)
            ? "C " +
              [
                first[0] + firstTangent[0],
                first[1] + firstTangent[1],
                last[0] + lastTangent[0],
                last[1] + lastTangent[1],
                ...last,
              ]
                .map(coordinate)
                .join(" ")
            : "L " + last.map(coordinate).join(" ");
          if (previous === null || previous !== start) {
            if (previous !== null)
              warn("disconnected loop; starting another subpath");
            parts.push("M " + first.map(coordinate).join(" "));
          }
          parts.push(command);
          previous = end;
        } catch (error) {
          warn(`region ${region} loop ${loop}: ${error.message}`);
        }
      }
      if (previous !== null) parts.push("Z");
    }
    if (parts.length)
      paths.push({
        d: parts.join(" "),
        rule: winding === 0 ? "nonzero" : "evenodd",
      });
  }
  return paths;
}
export function vectorNetworkPaths(doc, node, warn = () => {}) {
  const index = node.vectorData?.vectorNetworkBlob;
  if (index == null) return [];
  const report = (message) => warn("vector network: " + message);
  if (!Number.isInteger(index) || index < 0) {
    report("invalid blob reference");
    return [];
  }
  const bytes = doc.blobs?.[index]?.bytes;
  if (!bytes) {
    report("missing blob");
    return [];
  }
  try {
    return decodeVectorNetwork(bytes, node, report);
  } catch (error) {
    report(error.message);
    return [];
  }
}
