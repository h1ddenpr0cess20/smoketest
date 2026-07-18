// Path helpers shared by directory attachment ingestion and local retrieval,
// ported from wordmark's documentPaths.

/** A File tagged with the relative path recovered from a directory drop. */
export type FileWithRelativePath = File & { _relativePath?: string };

/** Dependency, VCS, and generated-cache folders that add noise to codebase RAG. */
const IGNORED_DIRECTORY_SEGMENTS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".cache",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".venv",
  "venv",
  ".next",
  "dist",
  "build",
  "coverage",
  "node_modules",
  "__pycache__",
]);

/** Generated files that are large, low-signal retrieval sources. */
const IGNORED_FILE_PATTERNS = [
  /(?:^|\/)\.DS_Store$/i,
  /(?:^|\/)package-lock\.json$/i,
  /\.map$/i,
  /\.min\.(?:css|js)$/i,
];

/** Normalizes a browser or drag/drop relative path for display and indexing. */
export function normalizeDocumentPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/[\r\n\t]/g, " ")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join("/")
    .trim();
}

/** Returns the most specific source path available for a file. */
export function getDocumentSourceName(file: File): string {
  const tagged = file as FileWithRelativePath;
  return normalizeDocumentPath(file.webkitRelativePath || tagged._relativePath || file.name) || file.name;
}

/**
 * Whether a directory-upload entry is dependency/cache/generated noise.
 * Individual file uploads are never filtered by this helper.
 */
export function shouldIgnoreDirectoryPath(path: string): boolean {
  const normalized = normalizeDocumentPath(path);
  const segments = normalized.split("/");
  if (segments.some((segment) => IGNORED_DIRECTORY_SEGMENTS.has(segment.toLowerCase()))) {
    return true;
  }
  return IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(normalized));
}
