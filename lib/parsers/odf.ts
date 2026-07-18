/**
 * OpenDocument (ODT / ODS / ODP / ODG) text extraction (no external dependency).
 *
 * @remarks
 * All ODF files are ZIPs whose `content.xml` holds the body under `office:body`.
 * A structural walk emits paragraph and heading breaks, tabs, table row/cell
 * separators, and blank lines between presentation/drawing pages, so the same
 * parser serves documents, spreadsheets, presentations, and drawings.
 */

import { readZip } from "./zip";

function walk(node: Node): string {
  let out = "";
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      out += child.nodeValue || "";
      continue;
    }
    if (child.nodeType !== 1) continue;

    const local = (child as Element).localName;
    if (local === "tab") {
      out += "\t";
    } else if (local === "line-break") {
      out += "\n";
    } else if (local === "s") {
      out += " ";
    } else if (local === "table-cell") {
      out +=
        walk(child)
          .replace(/\s*\n\s*/g, " ")
          .trim() + "\t";
    } else {
      out += walk(child);
      if (local === "p" || local === "h" || local === "table-row") {
        out += "\n";
      } else if (local === "page") {
        out += "\n\n";
      }
    }
  }
  return out;
}

/**
 * Extracts the body text of any OpenDocument file.
 *
 * @param arrayBuffer - The raw ODF bytes.
 * @throws If `content.xml` is missing or no text is found.
 */
export async function extractOdfText(
  arrayBuffer: ArrayBuffer,
): Promise<string> {
  const zip = readZip(arrayBuffer);

  const contentFile = zip.file("content.xml");
  if (!contentFile) throw new Error("content.xml not found in ODF file");

  const xml = await contentFile.async("string");
  const dom = new DOMParser().parseFromString(xml, "application/xml");

  const body =
    dom.getElementsByTagNameNS(
      "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
      "body",
    )[0] || dom.documentElement;
  if (!body)
    throw new Error("office:body element not found in ODF content.xml");

  const text = walk(body)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) throw new Error("No readable text found");
  return text;
}
