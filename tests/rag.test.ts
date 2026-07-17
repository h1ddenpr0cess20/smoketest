import { describe, expect, it } from "vitest";
import {
  buildReferenceBlock,
  buildRetrievalQuery,
  chunkText,
  cosineSim,
  isDocumentInventoryQuery,
  rankChunks,
  resolveEmbeddingModel,
  type RagChunk,
} from "../lib/rag";

describe("chunking", () => {
  it("keeps short text as a single chunk", () => {
    expect(chunkText("hello world")).toEqual(["hello world"]);
  });

  it("prefers paragraph boundaries and overlaps chunks", () => {
    const paragraph = `${"alpha ".repeat(200)}\n\n${"beta ".repeat(200)}`;
    const chunks = chunkText(paragraph, 800, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].endsWith("alpha") || chunks[0].endsWith("alpha ")).toBe(true);
  });
});

describe("embedding model resolution", () => {
  it("prefers the override, then nomic, then any known embedder", () => {
    expect(resolveEmbeddingModel("custom-embed", ["nomic-embed-text"])).toBe("custom-embed");
    expect(resolveEmbeddingModel("", ["qwen3:8b", "mxbai-embed-large", "nomic-embed-text"])).toBe("nomic-embed-text");
    expect(resolveEmbeddingModel("", ["qwen3:8b", "bge-m3"])).toBe("bge-m3");
    expect(resolveEmbeddingModel("", ["qwen3:8b", "llama3.2"])).toBeNull();
  });
});

describe("retrieval queries", () => {
  it("detects inventory questions", () => {
    expect(isDocumentInventoryQuery("what files are attached?")).toBe(true);
    expect(isDocumentInventoryQuery("explain the parser")).toBe(false);
  });

  it("prepends recent user turns for follow-ups, keeping the current message last", () => {
    const query = buildRetrievalQuery(["tell me about the billing module", "and the retry logic?"], "what about its tests?");
    expect(query.endsWith("what about its tests?")).toBe(true);
    expect(query).toContain("billing module");
  });

  it("keeps inventory questions self-contained", () => {
    expect(buildRetrievalQuery(["earlier context"], "list all documents")).toBe("list all documents");
  });
});

describe("ranking", () => {
  const chunk = (name: string, text: string, vector: number[]): RagChunk => ({ name, text, vector, model: "m" });

  it("ranks by cosine similarity and respects the character budget", () => {
    const chunks = [
      chunk("a.ts", "close match", [1, 0]),
      chunk("b.ts", "far match", [0, 1]),
    ];
    const ranked = rankChunks(chunks, [1, 0], "close match please", 2, 10_000);
    expect(ranked[0].name).toBe("a.ts");
  });

  it("boosts chunks whose filename appears in the query when dense scores tie", () => {
    const chunks = [
      chunk("other.ts", "some text here", [0, 1]),
      chunk("parser.ts", "some text here", [0, 1]),
    ];
    const ranked = rankChunks(chunks, [1, 0], "explain parser.ts", 1, 10_000);
    expect(ranked[0].name).toBe("parser.ts");
  });

  it("returns nothing for an empty index or query", () => {
    expect(rankChunks([], [1, 0], "query")).toEqual([]);
    expect(rankChunks([chunk("a", "text", [1, 0])], [1, 0], "  ")).toEqual([]);
  });
});

describe("reference block", () => {
  it("labels retrieved excerpts as untrusted", () => {
    const block = buildReferenceBlock([{ name: "a.ts", text: "excerpt" }], ["a.ts"], "explain a.ts");
    expect(block).toContain("<reference-documents>");
    expect(block).toContain("untrusted reference material");
    expect(block).toContain("--- a.ts ---");
  });

  it("includes the source inventory for inventory questions", () => {
    const block = buildReferenceBlock([], ["a.ts", "b.md"], "which files are attached?");
    expect(block).toContain("Attached sources:");
    expect(block).toContain("- b.md");
  });

  it("returns empty when nothing was retrieved or indexed", () => {
    expect(buildReferenceBlock([], [], "question")).toBe("");
  });
});

describe("cosine", () => {
  it("handles orthogonal and identical vectors", () => {
    expect(cosineSim([1, 0], [0, 1])).toBe(0);
    expect(cosineSim([1, 2], [1, 2])).toBeCloseTo(1);
  });
});
