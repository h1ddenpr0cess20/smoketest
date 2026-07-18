/**
 * PPTX text extraction (no external dependency).
 *
 * @remarks
 * PPTX is a ZIP whose `ppt/slides/slideN.xml` parts hold text in DrawingML
 * `<a:t>` elements grouped by `<a:p>` paragraphs. Slides are emitted in numeric
 * order.
 */

import { readZip } from "./zip";

const DML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";

function slideNumber(name: string): number {
  const m = name.match(/slide(\d+)\.xml$/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Extracts the text of a PPTX presentation, one block per slide.
 *
 * @param arrayBuffer - The raw PPTX bytes.
 * @throws If no readable text is found.
 */
export async function extractPptxText(
  arrayBuffer: ArrayBuffer,
): Promise<string> {
  const zip = readZip(arrayBuffer);

  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const slides: string[] = [];
  for (const name of slideNames) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    const dom = new DOMParser().parseFromString(xml, "application/xml");

    const lines: string[] = [];
    for (const p of Array.from(dom.getElementsByTagNameNS(DML_NS, "p"))) {
      let line = "";
      for (const t of Array.from(p.getElementsByTagNameNS(DML_NS, "t"))) {
        line += t.textContent || "";
      }
      if (line.trim()) lines.push(line);
    }

    if (lines.length) slides.push(lines.join("\n"));
  }

  const text = slides
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) throw new Error("No readable text found in PPTX");
  return text;
}
