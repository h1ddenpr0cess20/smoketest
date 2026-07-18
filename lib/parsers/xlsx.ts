/**
 * XLSX text extraction (no external dependency).
 *
 * @remarks
 * XLSX is a ZIP whose `xl/worksheets/sheetN.xml` parts reference shared strings
 * in `xl/sharedStrings.xml`. Each sheet becomes a tab-separated block, with
 * cells placed by their column reference so columns stay aligned.
 */

import { readZip, type ZipArchive } from "./zip";

const SML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function sheetNumber(name: string): number {
  const m = name.match(/sheet(\d+)\.xml$/);
  return m ? parseInt(m[1], 10) : 0;
}

function columnIndex(cellRef: string | null): number {
  if (!cellRef) return -1;
  const letters = cellRef.match(/^[A-Z]+/i)?.[0];
  if (!letters) return -1;
  let index = 0;
  for (const ch of letters.toUpperCase()) {
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return index - 1;
}

async function readSharedStrings(zip: ZipArchive): Promise<string[]> {
  const file = zip.file("xl/sharedStrings.xml");
  if (!file) return [];
  const xml = await file.async("string");
  const dom = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(dom.getElementsByTagNameNS(SML_NS, "si")).map((si) => {
    let s = "";
    for (const t of Array.from(si.getElementsByTagNameNS(SML_NS, "t"))) {
      s += t.textContent || "";
    }
    return s;
  });
}

function cellText(cell: Element, shared: string[]): string {
  const type = cell.getAttribute("t");
  if (type === "s") {
    const v = cell.getElementsByTagNameNS(SML_NS, "v")[0];
    const idx = v ? parseInt(v.textContent || "", 10) : NaN;
    return !isNaN(idx) && shared[idx] !== undefined ? shared[idx] : "";
  }
  if (type === "inlineStr") {
    const is = cell.getElementsByTagNameNS(SML_NS, "is")[0];
    let s = "";
    if (is) {
      for (const t of Array.from(is.getElementsByTagNameNS(SML_NS, "t"))) {
        s += t.textContent || "";
      }
    }
    return s;
  }
  const v = cell.getElementsByTagNameNS(SML_NS, "v")[0];
  return v ? v.textContent || "" : "";
}

/**
 * Extracts the cell values of an XLSX workbook, one tab-separated block per sheet.
 *
 * @param arrayBuffer - The raw XLSX bytes.
 * @throws If no readable text is found.
 */
export async function extractXlsxText(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = readZip(arrayBuffer);
  const shared = await readSharedStrings(zip);

  const sheetNames = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => sheetNumber(a) - sheetNumber(b));

  const sheets: string[] = [];
  for (const name of sheetNames) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    const dom = new DOMParser().parseFromString(xml, "application/xml");

    const rows: string[] = [];
    for (const row of Array.from(dom.getElementsByTagNameNS(SML_NS, "row"))) {
      const cols: string[] = [];
      let nextCol = 0;
      for (const cell of Array.from(row.getElementsByTagNameNS(SML_NS, "c"))) {
        const col = columnIndex(cell.getAttribute("r"));
        const target = col >= 0 ? col : nextCol;
        while (cols.length < target) cols.push("");
        cols[target] = cellText(cell, shared);
        nextCol = target + 1;
      }
      if (cols.some((c) => c !== "")) rows.push(cols.join("\t"));
    }

    if (rows.length) sheets.push(rows.join("\n"));
  }

  const text = sheets.join("\n\n").trim();
  if (!text) throw new Error("No readable text found in XLSX");
  return text;
}
