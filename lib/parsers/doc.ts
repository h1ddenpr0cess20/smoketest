/**
 * Legacy Office binary (`.doc` / `.xls` / `.ppt`) best-effort text extraction.
 *
 * @remarks
 * Scans for UTF-16LE printable runs (how Word 97-2003 and other CFB-based Office
 * formats store text), falling back to ASCII runs when little is found. Used
 * only when the file is not actually an OOXML/ZIP file.
 */

const MIN_RUN = 12;

/**
 * Extracts readable text from a legacy binary Office file.
 *
 * @param arrayBuffer - The raw `.doc` / `.xls` / `.ppt` bytes.
 * @throws If no readable text can be recovered.
 */
export function extractLegacyOfficeText(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.length;
  let text = "";

  let run = "";
  let i = 0;
  while (i + 1 < len) {
    const lo = bytes[i];
    const hi = bytes[i + 1];
    if (hi === 0x00 && lo >= 0x20 && lo < 0x7f) {
      run += String.fromCharCode(lo);
      i += 2;
    } else if (hi === 0x00 && lo === 0x0d) {
      if (run.length >= MIN_RUN) text += run + "\n";
      run = "";
      i += 2;
    } else {
      if (run.length >= MIN_RUN) text += run + "\n";
      run = "";
      i += 2;
    }
  }
  if (run.length >= MIN_RUN) text += run + "\n";

  const utf16Text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (utf16Text.length > 100) return utf16Text;

  let ascii = "";
  let asciiRun = "";
  for (let j = 0; j < len; j++) {
    const c = bytes[j];
    if (c >= 0x20 && c < 0x7f) {
      asciiRun += String.fromCharCode(c);
    } else {
      if (asciiRun.length >= 40) ascii += asciiRun + "\n";
      asciiRun = "";
    }
  }
  if (asciiRun.length >= 40) ascii += asciiRun;

  const asciiText = ascii.replace(/\n{3,}/g, "\n\n").trim();
  if (!asciiText) throw new Error("No readable text extracted from legacy Office file");
  return asciiText;
}
