import { readFile } from 'node:fs/promises';

/**
 * Reads the Unicode code points a TrueType/OpenType font can display
 * (cmap subtables of format 4 and 12). Used to fail the build early when a
 * text contains characters the poster fonts cannot render.
 */
export async function readCodePoints(fontFile) {
  const buf = await readFile(fontFile);
  const tables = buf.readUInt16BE(4);
  let cmap = -1;
  for (let i = 0; i < tables; i += 1) {
    const rec = 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) === 'cmap') cmap = buf.readUInt32BE(rec + 8);
  }
  if (cmap < 0) throw new Error(`${fontFile}: no cmap table`);

  const points = new Set();
  const subtables = buf.readUInt16BE(cmap + 2);
  for (let i = 0; i < subtables; i += 1) {
    const offset = cmap + buf.readUInt32BE(cmap + 4 + i * 8 + 4);
    const format = buf.readUInt16BE(offset);
    if (format === 4) readFormat4(buf, offset, points);
    if (format === 12) readFormat12(buf, offset, points);
  }
  return points;
}

function readFormat4(buf, offset, points) {
  const segCount = buf.readUInt16BE(offset + 6) / 2;
  const ends = offset + 14;
  const starts = ends + segCount * 2 + 2;
  const deltas = starts + segCount * 2;
  const rangeOffsets = deltas + segCount * 2;
  for (let s = 0; s < segCount; s += 1) {
    const end = buf.readUInt16BE(ends + s * 2);
    const start = buf.readUInt16BE(starts + s * 2);
    const delta = buf.readInt16BE(deltas + s * 2);
    const rangeOffsetPos = rangeOffsets + s * 2;
    const rangeOffset = buf.readUInt16BE(rangeOffsetPos);
    for (let c = start; c <= end && c !== 0xffff; c += 1) {
      let glyph;
      if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
      else {
        const raw = buf.readUInt16BE(rangeOffsetPos + rangeOffset + (c - start) * 2);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyph !== 0) points.add(c);
    }
  }
}

function readFormat12(buf, offset, points) {
  const groups = buf.readUInt32BE(offset + 12);
  for (let g = 0; g < groups; g += 1) {
    const rec = offset + 16 + g * 12;
    const start = buf.readUInt32BE(rec);
    const end = buf.readUInt32BE(rec + 4);
    const startGlyph = buf.readUInt32BE(rec + 8);
    for (let c = start; c <= end; c += 1) if (startGlyph + (c - start) !== 0) points.add(c);
  }
}
