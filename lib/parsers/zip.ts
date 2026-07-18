/**
 * Minimal in-browser ZIP reader (no external dependency).
 *
 * @remarks
 * Reads the central directory and inflates entries on demand. Handles Stored
 * (method 0) and Deflate (method 8) entries via the browser's
 * {@link DecompressionStream}. Used by the DOCX/EPUB/ODT parsers, which are all
 * ZIP containers.
 */

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  uncompSize: number;
  localHeaderOffset: number;
  buffer: ArrayBuffer;
}

/** Lazy accessor for a single ZIP entry's decompressed contents. */
export interface ZipFileHandle {
  async(type: "string"): Promise<string>;
  async(type: "arraybuffer"): Promise<ArrayBuffer>;
  async(type: "uint8array"): Promise<Uint8Array>;
}

/** A parsed ZIP archive exposing its entries by name. */
export interface ZipArchive {
  files: Record<string, ZipEntry>;
  file(name: string): ZipFileHandle | null;
}

/**
 * Parses a ZIP archive's central directory.
 *
 * @param arrayBuffer - The raw archive bytes.
 * @returns An archive whose entries can be read lazily via {@link ZipArchive.file}.
 * @throws If the End of Central Directory record cannot be found.
 */
export function readZip(arrayBuffer: ArrayBuffer): ZipArchive {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  const eocd = findEOCD(view, bytes.length);
  if (eocd === null) throw new Error("Invalid ZIP: EOCD not found");

  const cdOffset = view.getUint32(eocd + 16, true);
  const entryCount = view.getUint16(eocd + 10, true);

  const files: Record<string, ZipEntry> = {};
  let offset = cdOffset;

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;

    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const uncompSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLen);
    const name = new TextDecoder().decode(nameBytes);

    offset += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue;

    files[name] = { name, method, compSize, uncompSize, localHeaderOffset, buffer: arrayBuffer };
  }

  return {
    files,
    file(name: string): ZipFileHandle | null {
      const entry = files[name];
      if (!entry) return null;
      return {
        async async(type: "string" | "arraybuffer" | "uint8array"): Promise<never> {
          const data = await extractEntry(entry);
          if (type === "string") return new TextDecoder().decode(data) as never;
          if (type === "arraybuffer") {
            return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as never;
          }
          return data as never;
        },
      };
    },
  };
}

/** Scans backwards for the End of Central Directory signature (0x06054b50). */
function findEOCD(view: DataView, length: number): number | null {
  const minPos = Math.max(0, length - 65557);
  for (let i = length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return null;
}

async function extractEntry(entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(entry.buffer);
  const localOff = entry.localHeaderOffset;

  if (view.getUint32(localOff, true) !== 0x04034b50) {
    throw new Error(`Invalid local header for ${entry.name}`);
  }

  const localNameLen = view.getUint16(localOff + 26, true);
  const localExtraLen = view.getUint16(localOff + 28, true);
  const dataStart = localOff + 30 + localNameLen + localExtraLen;

  const compData = new Uint8Array(entry.buffer, dataStart, entry.compSize);

  if (entry.method === 0) return compData;
  if (entry.method === 8) return inflateRaw(compData);

  throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
}

async function inflateRaw(compData: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  const writeDone = writer.write(compData).then(() => writer.close()).catch(() => {});

  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  await writeDone;

  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}
