import { describe, expect, it } from "vitest";
import {
  normalizeDocumentPath,
  shouldIgnoreDirectoryPath,
} from "../lib/docPaths";
import {
  buildDocChunkRecord,
  type StoredDocChunk,
} from "../lib/docChunkStorage";

describe("document paths", () => {
  it("normalizes separators and strips traversal segments", () => {
    expect(normalizeDocumentPath("src\\lib\\rag.ts")).toBe("src/lib/rag.ts");
    expect(normalizeDocumentPath("./src/../src/app.ts")).toBe("src/src/app.ts");
    expect(normalizeDocumentPath(" src / lib /a.ts ")).toBe("src/lib/a.ts");
    expect(normalizeDocumentPath("a\r\nb/c.txt")).toBe("a  b/c.txt");
  });

  it("ignores dependency, VCS, and generated noise in directory uploads", () => {
    expect(shouldIgnoreDirectoryPath("repo/node_modules/react/index.js")).toBe(
      true,
    );
    expect(shouldIgnoreDirectoryPath("repo/.git/HEAD")).toBe(true);
    expect(shouldIgnoreDirectoryPath("repo/.next/server/x.js")).toBe(true);
    expect(shouldIgnoreDirectoryPath("repo/dist/bundle.min.js")).toBe(true);
    expect(shouldIgnoreDirectoryPath("repo/app/bundle.js.map")).toBe(true);
    expect(shouldIgnoreDirectoryPath("repo/package-lock.json")).toBe(true);
    expect(shouldIgnoreDirectoryPath("repo/src/index.ts")).toBe(false);
    expect(shouldIgnoreDirectoryPath("repo/README.md")).toBe(false);
  });
});

describe("doc chunk records", () => {
  const chunk = (
    name: string,
    text: string,
    cacheKey: string | null,
  ): StoredDocChunk => ({
    name,
    text,
    vector: [1, 0],
    model: "nomic",
    cacheKey,
  });

  it("collapses hashed chunks into one cache reference per source", () => {
    const record = buildDocChunkRecord("t1", [
      chunk("a.ts", "one", "h1:nomic"),
      chunk("a.ts", "two", "h1:nomic"),
      chunk("b.ts", "three", "h2:nomic"),
    ]);
    expect(record.threadId).toBe("t1");
    expect(record.files).toEqual([
      { cacheKey: "h1:nomic", name: "a.ts", chunks: null },
      { cacheKey: "h2:nomic", name: "b.ts", chunks: null },
    ]);
  });

  it("keeps a reference per path when identical content lives at two paths", () => {
    const record = buildDocChunkRecord("t1", [
      chunk("a.ts", "one", "h1:nomic"),
      chunk("copy/a.ts", "one", "h1:nomic"),
    ]);
    expect(record.files.map((file) => file.name)).toEqual([
      "a.ts",
      "copy/a.ts",
    ]);
  });

  it("inlines chunks that could not be hashed", () => {
    const record = buildDocChunkRecord("t1", [
      chunk("a.ts", "one", null),
      chunk("a.ts", "two", null),
    ]);
    expect(record.files).toHaveLength(1);
    expect(record.files[0].cacheKey).toBeNull();
    expect(record.files[0].chunks).toHaveLength(2);
  });
});
