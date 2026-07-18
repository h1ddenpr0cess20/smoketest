// In-browser semantic retrieval over attached documents for local providers —
// the stateful half of the wordmark port (lib/rag.ts holds the pure ranking).
//
// Local servers (LM Studio / Ollama) have no files API or vector store, so
// attached documents are indexed client-side: each file is extracted to text,
// split into chunks, and embedded via the provider's /v1/embeddings endpoint.
// At send time the user's question is embedded and the most similar chunks are
// returned, so only the relevant passages reach the model rather than every
// file's full text. The index is per-thread: it is persisted to IndexedDB
// (text + vectors) so a reloaded thread keeps its documents, and chunks are
// re-embedded from the stored text when the embedding model changes.
// Embeddings are also cached by content hash, so attaching the same file again
// (in any thread) reuses them instead of re-embedding.

import {
  chunkText,
  rankChunks,
  DEFAULT_RETRIEVAL_TOP_K,
  DEFAULT_RETRIEVAL_CHARACTER_BUDGET,
} from "./rag";
import {
  deleteDocChunks,
  getCachedFileChunks,
  loadDocChunks,
  saveCachedFileChunks,
  saveDocChunks,
  type StoredDocChunk,
} from "./docChunkStorage";

/** Fetches embedding vectors for a batch of texts, one vector per input. */
export type EmbedFn = (
  texts: string[],
  signal?: AbortSignal,
) => Promise<number[][]>;

type ThreadIndex = {
  chunks: StoredDocChunk[];
  /**
   * Monotonic token for index restores. A restore captures it before awaiting
   * IndexedDB and bails out if it changed, so a slow load for a previously
   * opened thread can't dump its chunks into the thread that is now active
   * (which the next save would then persist under the wrong id).
   */
  restoreToken: number;
  activeRestore: Promise<number> | null;
};

const indexes = new Map<string, ThreadIndex>();

function getIndex(threadId: string): ThreadIndex {
  let index = indexes.get(threadId);
  if (!index) {
    index = { chunks: [], restoreToken: 0, activeRestore: null };
    indexes.set(threadId, index);
  }
  return index;
}

/** Sorted source paths currently represented in a thread's index. */
export function getIndexedDocumentNames(threadId: string): string[] {
  return [
    ...new Set(getIndex(threadId).chunks.map((chunk) => chunk.name)),
  ].sort((a, b) => a.localeCompare(b));
}

/** Counts both chunks and distinct source paths for user-facing diagnostics. */
export function getLocalDocIndexStats(threadId: string): {
  chunks: number;
  documents: number;
} {
  const index = getIndex(threadId);
  return {
    chunks: index.chunks.length,
    documents: getIndexedDocumentNames(threadId).length,
  };
}

/** Drops a thread's in-memory index and its persisted record. */
export async function deleteLocalDocIndex(threadId: string): Promise<void> {
  const index = getIndex(threadId);
  index.restoreToken++;
  index.activeRestore = null;
  index.chunks = [];
  indexes.delete(threadId);
  try {
    await deleteDocChunks(threadId);
  } catch {
    // Storage unavailable — the in-memory drop is the important part.
  }
}

/** Persists a thread's index so its documents survive reloads. */
async function persistLocalDocIndex(threadId: string): Promise<void> {
  const index = getIndex(threadId);
  if (index.chunks.length === 0) return;
  try {
    await saveDocChunks(threadId, index.chunks);
  } catch (error) {
    console.error("Failed to persist document index:", error);
  }
}

/**
 * Loads the persisted chunks for a thread into memory (a no-op once loaded or
 * when a restore is already in flight). Returns the restored chunk count.
 */
export function restoreLocalDocIndex(threadId: string): Promise<number> {
  const index = getIndex(threadId);
  if (index.activeRestore) return index.activeRestore;
  if (index.chunks.length > 0) return Promise.resolve(index.chunks.length);

  const token = ++index.restoreToken;
  const operation = (async () => {
    let chunks: StoredDocChunk[] = [];
    try {
      chunks = await loadDocChunks(threadId);
    } catch (error) {
      console.error("Failed to restore document index:", error);
    }
    if (token !== index.restoreToken) return index.chunks.length;
    index.chunks = chunks;
    return index.chunks.length;
  })();
  index.activeRestore = operation;
  void operation.finally(() => {
    if (index.activeRestore === operation) index.activeRestore = null;
  });
  return operation;
}

/** Copies a thread's index to a new thread id (used when branching a session). */
export async function branchLocalDocIndex(
  sourceThreadId: string,
  targetThreadId: string,
): Promise<void> {
  await restoreLocalDocIndex(sourceThreadId).catch(() => 0);
  const source = getIndex(sourceThreadId);
  if (source.chunks.length === 0) return;
  const target = getIndex(targetThreadId);
  target.chunks = source.chunks.map((chunk) => ({ ...chunk }));
  await persistLocalDocIndex(targetThreadId);
}

/** SHA-256 of the text as hex, or `null` when hashing is unavailable. */
async function hashText(text: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    return Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return null;
  }
}

export type IndexResult = {
  indexed: number;
  chunks: number;
  cached: number;
  failed: string[];
};

/**
 * Chunks and embeds the given documents (already extracted to text), adding
 * them to the thread's index and persisting it. Content that was embedded
 * before (same text, same model) is served from the cache without re-embedding.
 * Re-indexing a path that is already present replaces its old chunks. On
 * failure the index is rolled back and the error rethrown.
 */
export async function indexDocuments(
  threadId: string,
  documents: { name: string; text: string }[],
  model: string,
  embed: EmbedFn,
  signal?: AbortSignal,
): Promise<IndexResult> {
  await restoreLocalDocIndex(threadId).catch(() => 0);
  const index = getIndex(threadId);
  const originalChunks = [...index.chunks];
  const pending: {
    name: string;
    text: string;
    cacheKey: string | null;
    vectorKey: string;
  }[] = [];
  const failed: string[] = [];
  let indexed = 0;
  let cachedFiles = 0;
  let cachedChunks = 0;

  const removeSource = (name: string) => {
    index.chunks = index.chunks.filter((chunk) => chunk.name !== name);
  };

  try {
    for (const document of documents) {
      const name = document.name;
      if (!document.text.trim()) {
        failed.push(name);
        continue;
      }
      const hash = await hashText(document.text);
      const cacheKey = hash ? `${hash}:${model}` : null;

      if (cacheKey) {
        const cached = await getCachedFileChunks(cacheKey).catch(() => null);
        if (cached) {
          removeSource(name);
          index.chunks.push(
            ...cached.map((chunk) => ({ ...chunk, name, cacheKey })),
          );
          indexed++;
          cachedFiles++;
          cachedChunks += cached.length;
          continue;
        }
      }

      const chunks = chunkText(document.text);
      if (chunks.length === 0) {
        failed.push(name);
        continue;
      }
      for (const chunk of chunks) {
        // Identical content at multiple paths shares one embedding request
        // while retaining a distinct source entry in the retrieval index.
        const vectorKey = `${cacheKey || name}\u0000${chunk}`;
        pending.push({ name, text: chunk, cacheKey, vectorKey });
      }
      indexed++;
    }

    if (pending.length === 0) {
      if (cachedFiles > 0) await persistLocalDocIndex(threadId);
      return { indexed, chunks: cachedChunks, cached: cachedFiles, failed };
    }

    const uniqueInputs = new Map<string, string>();
    for (const item of pending) uniqueInputs.set(item.vectorKey, item.text);
    const inputEntries = [...uniqueInputs.entries()];
    const vectors = await embed(
      inputEntries.map(([, text]) => text),
      signal,
    );
    const vectorByKey = new Map(
      inputEntries.map(([key], i) => [key, vectors[i]]),
    );

    const byCacheKey = new Map<string, StoredDocChunk[]>();
    const replacedSources = new Set<string>();
    for (const item of pending) {
      if (!replacedSources.has(item.name)) {
        removeSource(item.name);
        replacedSources.add(item.name);
      }
      const chunk: StoredDocChunk = {
        name: item.name,
        text: item.text,
        vector: vectorByKey.get(item.vectorKey)!,
        model,
        cacheKey: item.cacheKey,
      };
      index.chunks.push(chunk);
      if (item.cacheKey) {
        // The cache stores one source-neutral copy; loadDocChunks applies the
        // thread's source path when resolving each reference.
        const group = byCacheKey.get(item.cacheKey);
        if (!group) {
          byCacheKey.set(item.cacheKey, [chunk]);
        } else if (group[0].name === item.name) {
          group.push(chunk);
        }
      }
    }

    // The thread record must be persisted BEFORE the cache entries: its
    // references are what protect them from eviction. In the old order a
    // directory upload larger than the cache limit evicted its own earlier
    // entries save by save, and the record then pointed at missing keys —
    // the index looked whole until a reload gutted it.
    await persistLocalDocIndex(threadId);
    let cacheWriteFailed = false;
    for (const [cacheKey, chunks] of byCacheKey) {
      try {
        await saveCachedFileChunks(cacheKey, chunks[0].name, chunks);
      } catch (error) {
        // Cache references without a committed cache record cannot be
        // restored. Inline these chunks in thread storage instead.
        console.error("Failed to cache file chunks:", error);
        for (const chunk of index.chunks) {
          if (chunk.cacheKey === cacheKey) chunk.cacheKey = null;
        }
        cacheWriteFailed = true;
      }
    }
    if (cacheWriteFailed) await persistLocalDocIndex(threadId);
    return {
      indexed,
      chunks: cachedChunks + pending.length,
      cached: cachedFiles,
      failed,
    };
  } catch (error) {
    index.chunks = originalChunks;
    throw error;
  }
}

/**
 * Re-embeds every indexed chunk's stored text with `model`, updating the index
 * in place. Called when the embedding model no longer matches the stored
 * vectors (e.g. after a provider or model switch).
 *
 * @returns The re-embedded chunks, or the empty array if embedding failed.
 */
async function reembedIndex(
  threadId: string,
  model: string,
  embed: EmbedFn,
  signal?: AbortSignal,
): Promise<StoredDocChunk[]> {
  const index = getIndex(threadId);
  try {
    const vectors = await embed(
      index.chunks.map((chunk) => chunk.text),
      signal,
    );
    const byCacheKey = new Map<string, StoredDocChunk[]>();
    for (let i = 0; i < index.chunks.length; i++) {
      const chunk = index.chunks[i];
      chunk.vector = vectors[i];
      chunk.model = model;
      const oldKey = chunk.cacheKey;
      if (oldKey) {
        const hash = oldKey.slice(0, oldKey.indexOf(":"));
        chunk.cacheKey = `${hash}:${model}`;
        const group = byCacheKey.get(chunk.cacheKey);
        if (!group) {
          byCacheKey.set(chunk.cacheKey, [chunk]);
        } else if (group[0].name === chunk.name) {
          group.push(chunk);
        }
      }
    }
    // Same ordering rule as indexDocuments: the record's references guard
    // the cache entries from eviction, so it goes first.
    await persistLocalDocIndex(threadId);
    let cacheWriteFailed = false;
    for (const [cacheKey, chunks] of byCacheKey) {
      try {
        await saveCachedFileChunks(cacheKey, chunks[0].name, chunks);
      } catch (error) {
        console.error("Failed to cache re-embedded chunks:", error);
        for (const chunk of chunks) chunk.cacheKey = null;
        cacheWriteFailed = true;
      }
    }
    if (cacheWriteFailed) await persistLocalDocIndex(threadId);
    return [...index.chunks];
  } catch (error) {
    console.error("Failed to re-embed document index:", error);
    return [];
  }
}

/**
 * Returns the chunks most relevant to `query` from a thread's index, using
 * hybrid semantic/lexical ranking (see lib/rag.ts). Waits for a pending
 * restore, and transparently re-embeds the index when `model` doesn't match
 * the stored vectors.
 */
export async function retrieveRelevantChunks(
  threadId: string,
  query: string,
  model: string,
  embed: EmbedFn,
  signal?: AbortSignal,
  topK = DEFAULT_RETRIEVAL_TOP_K,
  characterBudget = DEFAULT_RETRIEVAL_CHARACTER_BUDGET,
): Promise<{ name: string; text: string }[]> {
  const index = getIndex(threadId);
  if (index.activeRestore) await index.activeRestore;
  if (index.chunks.length === 0 || !query.trim()) return [];

  let scorable = index.chunks.filter((chunk) => chunk.model === model);
  if (scorable.length < index.chunks.length) {
    const reembedded = await reembedIndex(threadId, model, embed, signal);
    if (reembedded.length > 0) scorable = reembedded;
    if (scorable.length === 0) return [];
  }

  const [queryVector] = await embed([query], signal);
  return rankChunks(scorable, queryVector, query, topK, characterBudget).map(
    (chunk) => ({
      name: chunk.name,
      text: chunk.text,
    }),
  );
}
