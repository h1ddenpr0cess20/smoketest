/**
 * In-browser PDF text extraction (no external dependency).
 *
 * @remarks
 * Handles the most common PDF text encodings: FlateDecode (zlib/deflate)
 * compressed streams, uncompressed streams, the Tj/TJ/'/" text operators, and
 * both hex (`<4865...>`) and literal (`(...)`) strings. Image XObjects and font
 * programs are skipped. Scanned/image-only PDFs yield no text.
 */

const NON_TEXT_FILTERS = new Set([
  "DCTDecode",
  "JPXDecode",
  "CCITTFaxDecode",
  "JBIG2Decode",
  "LZWDecode",
]);

function isNonTextStream(dictText: string): boolean {
  if (/\/Subtype\s*\/Image/.test(dictText)) return true;
  if (/\/FontFile\d*\s/.test(dictText)) return true;
  for (const f of NON_TEXT_FILTERS) {
    if (dictText.includes("/" + f)) return true;
  }
  return false;
}

/**
 * Extracts text from a PDF's content streams.
 *
 * @param arrayBuffer - The raw PDF bytes.
 * @returns The extracted text (empty string for image-only PDFs).
 */
export async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(arrayBuffer);
  const text = new TextDecoder("latin1").decode(bytes);

  const pages: string[] = [];
  const streamRegex = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(text)) !== null) {
    const streamStart = match.index + match[0].length;

    const endIdx = text.indexOf("endstream", streamStart);
    if (endIdx === -1) continue;

    const dictText = text.slice(Math.max(0, match.index - 2000), match.index);
    if (isNonTextStream(dictText)) continue;

    const isFlate = dictText.includes("/FlateDecode");
    const isAscii85 = dictText.includes("/ASCII85Decode") || dictText.includes("/A85");
    let streamBytes = bytes.slice(streamStart, endIdx);

    let decoded: string;
    try {
      if (isAscii85) streamBytes = ascii85Decode(streamBytes);
      decoded = isFlate
        ? await decompressFlate(streamBytes)
        : new TextDecoder("latin1").decode(streamBytes);
    } catch {
      continue;
    }

    const extracted = extractTextFromStream(decoded);
    if (extracted.trim()) pages.push(extracted.trim());
  }

  return pages.join("\n");
}

function ascii85Decode(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  const tuple: number[] = [];
  let started = false;
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (!started && c === 0x3c && data[i + 1] === 0x7e) { i++; started = true; continue; }
    if (c === 0x7e) break;
    if (c <= 0x20) continue;
    if (c === 0x7a && tuple.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    if (c < 0x21 || c > 0x75) continue;
    tuple.push(c - 0x21);
    if (tuple.length === 5) {
      let value = 0;
      for (const t of tuple) value = value * 85 + t;
      out.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
      tuple.length = 0;
    }
  }
  if (tuple.length > 0) {
    const n = tuple.length;
    while (tuple.length < 5) tuple.push(84);
    let value = 0;
    for (const t of tuple) value = value * 85 + t;
    const bytes = [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
    for (let k = 0; k < n - 1; k++) out.push(bytes[k]);
  }
  return new Uint8Array(out);
}

async function decompressFlate(data: Uint8Array<ArrayBuffer>): Promise<string> {
  for (const format of ["deflate", "deflate-raw"] as const) {
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    try {
      const ds = new DecompressionStream(format);
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();

      const writeDone = writer.write(data).then(() => writer.close()).catch(() => {});

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLen += value.length;
      }

      await writeDone;
    } catch {}

    if (totalLen === 0) continue;

    const result = new Uint8Array(totalLen);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }
    return new TextDecoder("latin1").decode(result);
  }

  return new TextDecoder("latin1").decode(data);
}

/** Decodes a PDF hex string `<4865...>` to text. */
function decodePdfHexString(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  let s = "";
  for (let i = 0; i + 1 <= clean.length; i += 2) {
    const byte = parseInt(clean.slice(i, i + 2), 16);
    if (!isNaN(byte)) s += String.fromCharCode(byte);
  }
  return s;
}

interface TJPart {
  str: string;
  kernBefore: number;
}

/** Parses a TJ array's inner content into string tokens with preceding kern. */
function parseTJInner(inner: string): TJPart[] {
  const parts: TJPart[] = [];
  let i = 0;
  let lastKern = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch === "(") {
      let j = i + 1;
      while (j < inner.length) {
        if (inner[j] === "\\") { j += 2; continue; }
        if (inner[j] === ")") break;
        j++;
      }
      parts.push({ str: decodePdfString(inner.slice(i + 1, j)), kernBefore: lastKern });
      lastKern = 0;
      i = j + 1;
    } else if (ch === "<") {
      const end = inner.indexOf(">", i + 1);
      if (end === -1) break;
      parts.push({ str: decodePdfHexString(inner.slice(i + 1, end)), kernBefore: lastKern });
      lastKern = 0;
      i = end + 1;
    } else {
      const numMatch = inner.slice(i).match(/^-?\d+(?:\.\d+)?/);
      if (numMatch) {
        lastKern = parseFloat(numMatch[0]);
        i += numMatch[0].length;
      } else {
        i++;
      }
    }
  }
  return parts;
}

function extractTextFromStream(content: string): string {
  const lines: string[] = [];
  let current = "";

  const tokenRe =
    /BT|ET|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+T[dD]|T\*|\[([^\]]*)\]\s*TJ|(<[^>]*>|\([^)\\]*(?:\\.[^)\\]*)*\))\s*Tj|(<[^>]*>|\([^)\\]*(?:\\.[^)\\]*)*\))\s*'/g;
  let m: RegExpExecArray | null;

  while ((m = tokenRe.exec(content)) !== null) {
    const tok = m[0];

    if (tok === "BT" || tok === "ET" || tok === "T*") {
      if (current.trim()) { lines.push(current.trim()); current = ""; }
    } else if (m[1] !== undefined) {
      const y = parseFloat(m[2]);
      if (Math.abs(y) > 1 && current.trim()) { lines.push(current.trim()); current = ""; }
    } else if (m[3] !== undefined) {
      for (const { str, kernBefore } of parseTJInner(m[3])) {
        if (kernBefore < -100) current += " ";
        current += str;
      }
    } else if (m[4] !== undefined) {
      const raw = m[4];
      current += raw[0] === "<"
        ? decodePdfHexString(raw.slice(1, raw.lastIndexOf(">")))
        : decodePdfString(raw.slice(1, raw.lastIndexOf(")")));
    } else if (m[5] !== undefined) {
      if (current.trim()) { lines.push(current.trim()); current = ""; }
      const raw = m[5];
      current += raw[0] === "<"
        ? decodePdfHexString(raw.slice(1, raw.lastIndexOf(">")))
        : decodePdfString(raw.slice(1, raw.lastIndexOf(")")));
    }
  }
  if (current.trim()) lines.push(current.trim());

  return lines.join("\n");
}

/** Resolves PDF literal-string escape sequences. */
function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}
