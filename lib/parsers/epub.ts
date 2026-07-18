/**
 * EPUB text extraction (no external dependency).
 *
 * @remarks
 * EPUB is a ZIP of XHTML chapters ordered by the OPF spine. Falls back to all
 * HTML entries sorted alphabetically when the OPF cannot be read.
 */

import { readZip } from "./zip";

/**
 * Extracts the reading-order text of an EPUB.
 *
 * @param arrayBuffer - The raw EPUB bytes.
 * @returns The concatenated chapter text and the chapter count.
 * @throws If no readable text is found.
 */
export async function extractEpubText(
  arrayBuffer: ArrayBuffer,
): Promise<{ text: string; chapterCount: number }> {
  const zip = readZip(arrayBuffer);

  let htmlFiles: string[] = [];
  const opfEntry = Object.keys(zip.files).find((n) => n.endsWith(".opf"));

  if (opfEntry) {
    const opfFile = zip.file(opfEntry);
    if (opfFile) {
      const opfText = await opfFile.async("string");
      const basePath = opfEntry.includes("/")
        ? opfEntry.slice(0, opfEntry.lastIndexOf("/") + 1)
        : "";

      const opf = new DOMParser().parseFromString(opfText, "application/xml");
      const idrefs = [...opf.querySelectorAll("spine itemref")].map((el) =>
        el.getAttribute("idref"),
      );
      const manifest: Record<string, string | null> = {};
      opf.querySelectorAll("manifest item").forEach((el) => {
        const id = el.getAttribute("id");
        if (id) manifest[id] = el.getAttribute("href");
      });
      htmlFiles = idrefs
        .map((id) => (id ? manifest[id] : null))
        .filter((href): href is string => Boolean(href))
        .map((href) => basePath + href);
    }
  }

  if (!htmlFiles.length) {
    htmlFiles = Object.keys(zip.files)
      .filter((n) => /\.(xhtml|html|htm)$/i.test(n))
      .sort();
  }

  let text = "";
  for (const path of htmlFiles) {
    const zf = zip.file(path) || zip.file(decodeURIComponent(path));
    if (!zf) continue;
    const html = await zf.async("string");
    const dom = new DOMParser().parseFromString(html, "text/html");
    dom.querySelectorAll("script,style").forEach((el) => el.remove());
    text +=
      (dom.body?.textContent || "").replace(/\n{3,}/g, "\n\n").trim() + "\n\n";
  }

  text = text.trim();
  if (!text) throw new Error("No readable text found in EPUB");

  return { text, chapterCount: htmlFiles.length };
}
