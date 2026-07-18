/**
 * MOBI / AZW / AZW3 text extraction (no external dependency).
 *
 * @remarks
 * Parses the PalmDB record structure, decompresses PalmDOC-compressed text
 * records, and extracts text from the resulting HTML. Huffman-compressed files
 * are not supported.
 */

function readStr(bytes: Uint8Array, offset: number, len: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + len));
}

function decompressPalmDoc(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const c = data[i++];
    if (c === 0x00) {
      out.push(0);
    } else if (c <= 0x08) {
      for (let j = 0; j < c && i < data.length; j++) out.push(data[i++]);
    } else if (c <= 0x7f) {
      out.push(c);
    } else if (c <= 0xbf) {
      if (i >= data.length) break;
      const b = data[i++];
      const dist = (((c << 8) | b) >> 3) & 0x7ff;
      const len = (b & 0x07) + 3;
      if (dist === 0) {
        for (let j = 0; j < len; j++) out.push(0x20);
      } else {
        const base = out.length - dist;
        for (let j = 0; j < len; j++) {
          const src = base + j;
          out.push(src >= 0 ? out[src] : 0x20);
        }
      }
    } else {
      out.push(0x20);
      out.push(c ^ 0x80);
    }
  }
  return new Uint8Array(out);
}

function countBits(n: number): number {
  let count = 0;
  while (n) { count += n & 1; n >>>= 1; }
  return count;
}

function stripTrailingEntries(data: Uint8Array<ArrayBuffer>, numEntries: number, hasMultiByte: boolean): Uint8Array<ArrayBuffer> {
  let end = data.length;

  for (let e = 0; e < numEntries; e++) {
    let size = 0;
    let shift = 0;
    let i = end - 1;
    while (i >= 0 && shift < 28) {
      const b = data[i--];
      size |= (b & 0x7f) << shift;
      shift += 7;
      if (b & 0x80) break;
    }
    end -= size;
    if (end < 0) { end = 0; break; }
  }

  if (hasMultiByte && end > 0) {
    end -= (data[end - 1] & 0x03) + 1;
    if (end < 0) end = 0;
  }

  return end < data.length ? data.slice(0, end) : data;
}

/**
 * Extracts text from a MOBI/AZW/AZW3 file.
 *
 * @param arrayBuffer - The raw ebook bytes.
 * @throws If the file is not a valid MOBI, uses Huffman compression, or yields no text.
 */
export function extractMobiText(arrayBuffer: ArrayBuffer): string {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  if (arrayBuffer.byteLength < 78) throw new Error("File too small to be a valid MOBI");
  const dbType = readStr(bytes, 60, 4);
  const dbCreator = readStr(bytes, 64, 4);
  if (dbType !== "BOOK" || dbCreator !== "MOBI") {
    throw new Error("Not a valid MOBI/AZW file");
  }

  const numRecords = view.getUint16(76, false);
  const offsets: number[] = [];
  for (let i = 0; i < numRecords; i++) {
    offsets.push(view.getUint32(78 + i * 8, false));
  }
  offsets.push(arrayBuffer.byteLength);

  const r0 = offsets[0];
  const compression = view.getUint16(r0 + 0, false);
  const textRecordCount = view.getUint16(r0 + 8, false);

  const mobi = r0 + 16;
  if (readStr(bytes, mobi, 4) !== "MOBI") {
    throw new Error("MOBI header signature not found in record 0");
  }

  const mobiHeaderLen = view.getUint32(mobi + 4, false);
  const encoding = view.getUint32(mobi + 12, false);
  const decoder = new TextDecoder(encoding === 65001 ? "utf-8" : "windows-1252");

  if (compression === 17480) {
    throw new Error("Huffman-compressed MOBI is not supported — convert to EPUB with Calibre");
  }
  if (compression !== 1 && compression !== 2) {
    throw new Error(`Unsupported MOBI compression type: ${compression}`);
  }

  let extraDataFlags = 0;
  if (mobiHeaderLen >= 0xc2) {
    extraDataFlags = view.getUint16(mobi + 0xc0, false);
  }
  const trailingEntryCount = countBits(extraDataFlags >> 1);
  const hasMultiByte = (extraDataFlags & 1) !== 0;

  const parts: string[] = [];
  for (let i = 1; i <= textRecordCount && i < offsets.length - 1; i++) {
    let data = bytes.slice(offsets[i], offsets[i + 1]);

    if (compression === 2) {
      data = stripTrailingEntries(data, trailingEntryCount, hasMultiByte);
      data = decompressPalmDoc(data);
    }

    parts.push(decoder.decode(data));
  }

  const raw = parts.join("");

  const dom = new DOMParser().parseFromString(raw, "text/html");
  dom.querySelectorAll("script, style").forEach((el) => el.remove());
  const text = (dom.body?.textContent || "").replace(/\n{3,}/g, "\n\n").trim();

  if (!text || text.length < 20) throw new Error("No readable text extracted");
  return text;
}
