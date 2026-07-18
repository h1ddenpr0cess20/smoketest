import { beforeEach, describe, expect, it, vi } from "vitest";

const loadDocChunks = vi.fn<(threadId: string) => Promise<never[]>>();

vi.mock("../lib/docChunkStorage", () => ({
  loadDocChunks: (threadId: string) => loadDocChunks(threadId),
  saveDocChunks: vi.fn().mockResolvedValue(undefined),
  deleteDocChunks: vi.fn().mockResolvedValue(undefined),
  getCachedFileChunks: vi.fn().mockResolvedValue(null),
  saveCachedFileChunks: vi.fn().mockResolvedValue(undefined),
}));

import { deleteLocalDocIndex, restoreLocalDocIndex } from "../lib/localRag";

describe("restoreLocalDocIndex", () => {
  beforeEach(() => {
    loadDocChunks.mockReset();
    loadDocChunks.mockResolvedValue([]);
  });

  it("does not re-hit storage for a thread that already restored to empty", async () => {
    const threadId = "thread-no-attachments";
    await restoreLocalDocIndex(threadId);
    await restoreLocalDocIndex(threadId);
    await restoreLocalDocIndex(threadId);

    expect(loadDocChunks).toHaveBeenCalledTimes(1);
    expect(loadDocChunks).toHaveBeenCalledWith(threadId);
  });

  it("shares one storage read across concurrent restores", async () => {
    const threadId = "thread-concurrent";
    await Promise.all([
      restoreLocalDocIndex(threadId),
      restoreLocalDocIndex(threadId),
      restoreLocalDocIndex(threadId),
    ]);

    expect(loadDocChunks).toHaveBeenCalledTimes(1);
  });

  it("restores again after the index is deleted", async () => {
    const threadId = "thread-deleted";
    await restoreLocalDocIndex(threadId);
    await deleteLocalDocIndex(threadId);
    await restoreLocalDocIndex(threadId);

    expect(loadDocChunks).toHaveBeenCalledTimes(2);
  });
});
