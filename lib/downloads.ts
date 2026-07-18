function basename(value: string) {
  return (
    value
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\u0000-\u001f\u007f]/g, "")
      .trim() || ""
  );
}

/** Extracts a safe filename from an HTTP Content-Disposition header. */
export function contentDispositionFilename(
  value: string | null,
): string | null {
  if (!value) return null;
  const encoded = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i
    .exec(value)?.[1]
    ?.trim()
    .replace(/^"|"$/g, "");
  if (encoded) {
    try {
      const decoded = basename(decodeURIComponent(encoded));
      if (decoded) return decoded;
    } catch {
      // Fall through to the plain filename form.
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(value);
  const filename = basename((plain?.[1] || plain?.[2] || "").trim());
  return filename || null;
}

/** Chooses the annotation name, response header name, or file id. */
export function generatedFileDownloadName(
  annotationFilename: string | null,
  contentDisposition: string | null,
  fileId: string,
) {
  return (
    basename(annotationFilename || "") ||
    contentDispositionFilename(contentDisposition) ||
    basename(fileId) ||
    "download"
  );
}
