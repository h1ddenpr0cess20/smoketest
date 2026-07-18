/**
 * Client-side document text extraction.
 *
 * @remarks
 * Dispatches a {@link File} to the appropriate in-browser parser and returns its
 * plain text. Used as a fallback for providers that cannot ingest documents
 * natively (local LM Studio / Ollama servers), so uploads still reach the model
 * as text. All parsers are dependency-free and run entirely in the browser.
 *
 * Known binary document formats have dedicated parsers; everything else is read
 * as UTF-8 text, so any code, config, or data file works without an allowlist.
 */

import { extractPdfText } from "./pdf";
import { extractDocxText } from "./docx";
import { extractLegacyOfficeText } from "./doc";
import { extractEpubText } from "./epub";
import { extractOdfText } from "./odf";
import { extractRtfText } from "./rtf";
import { extractMobiText } from "./mobi";
import { extractPptxText } from "./pptx";
import { extractXlsxText } from "./xlsx";
import { readZip } from "./zip";

const BINARY_DOC_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "odg",
  "rtf",
  "epub",
  "mobi",
  "azw",
  "azw3",
  "zip",
]);

const UNSUPPORTED_BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "ico",
  "heic",
  "heif",
  "avif",
  "psd",
  "ai",
  "mp3",
  "wav",
  "flac",
  "ogg",
  "oga",
  "m4a",
  "aac",
  "opus",
  "mp4",
  "m4v",
  "mov",
  "avi",
  "mkv",
  "webm",
  "wmv",
  "flv",
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "o",
  "lib",
  "obj",
  "class",
  "jar",
  "war",
  "wasm",
  "node",
  "pyc",
  "pyo",
  "7z",
  "rar",
  "gz",
  "bz2",
  "xz",
  "zst",
  "br",
  "tar",
  "tgz",
  "tbz",
  "cab",
  "iso",
  "dmg",
  "apk",
  "deb",
  "rpm",
  "ttf",
  "otf",
  "woff",
  "woff2",
  "eot",
  "sqlite",
  "db",
  "dat",
]);

function getExt(name: string): string {
  const base = name.split("/").pop() || name;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : base.toLowerCase();
}

/**
 * Whether {@link extractDocumentText} can extract text from this file. Known
 * binary document formats and any non-binary (text/code/data) file qualify;
 * images, media, executables, and unhandled archives do not.
 *
 * @param name - The file name (or path).
 */
export function isExtractableDocument(name: string): boolean {
  const ext = getExt(name);
  if (BINARY_DOC_EXTENSIONS.has(ext)) return true;
  return !UNSUPPORTED_BINARY_EXTENSIONS.has(ext);
}

function looksBinary(text: string): boolean {
  const n = Math.min(text.length, 8192);
  for (let i = 0; i < n; i++) {
    if (text.charCodeAt(i) === 0) return true;
  }
  return false;
}

function isZipContainer(buffer: ArrayBuffer): boolean {
  const head = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  return head[0] === 0x50 && head[1] === 0x4b;
}

function decodeText(buffer: ArrayBuffer, label: string): string {
  const text = new TextDecoder("utf-8").decode(new Uint8Array(buffer));
  if (looksBinary(text)) throw new Error(`Cannot extract text from ${label}`);
  return text.trim();
}

async function extractFromBuffer(
  ext: string,
  buffer: ArrayBuffer,
  name: string,
): Promise<string> {
  switch (ext) {
    case "pdf":
      return extractPdfText(buffer);
    case "docx":
      return extractDocxText(buffer);
    case "xlsx":
      return extractXlsxText(buffer);
    case "pptx":
      return extractPptxText(buffer);
    case "doc":
      return isZipContainer(buffer)
        ? extractDocxText(buffer)
        : extractLegacyOfficeText(buffer);
    case "xls":
      return isZipContainer(buffer)
        ? extractXlsxText(buffer)
        : extractLegacyOfficeText(buffer);
    case "ppt":
      return isZipContainer(buffer)
        ? extractPptxText(buffer)
        : extractLegacyOfficeText(buffer);
    case "odt":
    case "ods":
    case "odp":
    case "odg":
      return extractOdfText(buffer);
    case "rtf":
      return extractRtfText(
        new TextDecoder("latin1").decode(new Uint8Array(buffer)),
      );
    case "epub":
      return (await extractEpubText(buffer)).text;
    case "mobi":
    case "azw":
    case "azw3":
      return extractMobiText(buffer);
    case "zip":
      return extractZipContainer(buffer);
    default:
      return decodeText(buffer, name);
  }
}

async function extractZipContainer(buffer: ArrayBuffer): Promise<string> {
  const zip = readZip(buffer);
  const parts: string[] = [];
  for (const name of Object.keys(zip.files).sort()) {
    const ext = getExt(name);
    if (ext === "zip" || !isExtractableDocument(name)) continue;
    const file = zip.file(name);
    if (!file) continue;
    try {
      const text = (
        await extractFromBuffer(ext, await file.async("arraybuffer"), name)
      ).trim();
      if (text) parts.push(`[${name}]\n${text}`);
    } catch {
      continue;
    }
  }
  const out = parts.join("\n\n").trim();
  if (!out) throw new Error("No readable text found in archive");
  return out;
}

/**
 * Extracts plain text from a document file.
 *
 * @param file - The file to extract.
 * @returns The extracted text.
 * @throws If the file is a binary type with no readable text.
 */
export async function extractDocumentText(file: File): Promise<string> {
  const ext = getExt(file.name);

  if (!BINARY_DOC_EXTENSIONS.has(ext)) {
    const text = await file.text();
    if (looksBinary(text))
      throw new Error(`Cannot extract text from ${file.name}`);
    return text.trim();
  }

  return extractFromBuffer(ext, await file.arrayBuffer(), file.name);
}
