/**
 * DOCX text extraction (no external dependency).
 *
 * @remarks
 * DOCX is a ZIP containing `word/document.xml`, where text lives in `<w:t>`
 * elements grouped by `<w:p>` paragraphs.
 */

import { readZip } from "./zip";

const WML_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/**
 * Extracts the body text of a DOCX file, preserving paragraph, tab, and break
 * structure.
 *
 * @param arrayBuffer - The raw DOCX bytes.
 * @throws If `word/document.xml` is missing.
 */
export async function extractDocxText(
  arrayBuffer: ArrayBuffer,
): Promise<string> {
  const zip = readZip(arrayBuffer);

  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("word/document.xml not found in DOCX");

  const xml = await docFile.async("string");
  const dom = new DOMParser().parseFromString(xml, "application/xml");

  const paragraphs = dom.getElementsByTagNameNS(WML_NS, "p");

  const lines: string[] = [];
  for (const p of Array.from(paragraphs)) {
    const runs = p.getElementsByTagNameNS(WML_NS, "r");

    let paraText = "";
    for (const r of Array.from(runs)) {
      if (r.getElementsByTagNameNS(WML_NS, "tab").length) paraText += "\t";
      if (r.getElementsByTagNameNS(WML_NS, "br").length) paraText += "\n";
      for (const t of Array.from(r.getElementsByTagNameNS(WML_NS, "t"))) {
        paraText += t.textContent || "";
      }
    }

    lines.push(paraText);
  }

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
