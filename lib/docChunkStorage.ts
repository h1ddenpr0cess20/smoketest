// Local document chunk storage backed by IndexedDB, ported from wordmark's
// docChunkStorage. Persists the extracted text chunks (and their embedding
// vectors) that back local-provider retrieval, keyed by thread id. Storing the
// text lets the index be rebuilt after a reload, and re-embedded when the
// embedding model changes, without re-uploading the original files. A second
// store caches chunks by file content hash + model so re-attaching the same
// file (in any thread) reuses its embeddings.

const CHUNK_DB_NAME = "smoketest-doc-chunks";
const CHUNK_DB_VERSION = 1;
const CHUNK_STORE_NAME = "chunks";
const FILE_CACHE_STORE_NAME = "fileCache";
// Sized for directory uploads: one entry per file, and eviction never touches
// entries referenced by a thread record.
const FILE_CACHE_LIMIT = 500;

/** One persisted retrieval chunk: source path, text, and its embedding. */
export interface StoredDocChunk {
  name: string;
  text: string;
  vector: number[];
  model: string;
  cacheKey?: string | null;
}

/** One file in a thread's record: a cache reference, or inlined chunks. */
export interface StoredFileRef {
  cacheKey: string | null;
  name: string;
  chunks: StoredDocChunk[] | null;
}

/** A thread's indexed files. */
export interface DocChunkRecord {
  threadId: string;
  updated: string;
  files: StoredFileRef[];
}

/** Cached chunks for one file, keyed by content hash + embedding model. */
export interface CachedFileRecord {
  key: string;
  name: string;
  updated: string;
  chunks: StoredDocChunk[];
}

let chunkDb: IDBDatabase | null = null;

function openChunkDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || window.indexedDB === undefined) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = window.indexedDB.open(CHUNK_DB_NAME, CHUNK_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHUNK_STORE_NAME)) {
        db.createObjectStore(CHUNK_STORE_NAME, { keyPath: "threadId" });
      }
      if (!db.objectStoreNames.contains(FILE_CACHE_STORE_NAME)) {
        db.createObjectStore(FILE_CACHE_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function withChunkDb<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
  if (chunkDb) return run(chunkDb);
  return openChunkDb().then((db) => {
    chunkDb = db;
    return run(db);
  });
}

/**
 * Groups flat chunks into a thread record. Chunks whose file content was
 * hashed become cache references; the rest are inlined.
 */
export function buildDocChunkRecord(
  threadId: string,
  chunks: StoredDocChunk[],
): DocChunkRecord {
  const files: StoredFileRef[] = [];
  const refByKeyAndSource = new Map<string, StoredFileRef>();

  for (const chunk of chunks) {
    if (chunk.cacheKey) {
      // The same bytes may legitimately appear at multiple paths. Each source
      // needs its own reference even though both resolve the same cached chunks.
      const refKey = `${chunk.cacheKey}\u0000${chunk.name}`;
      if (!refByKeyAndSource.has(refKey)) {
        const ref: StoredFileRef = {
          cacheKey: chunk.cacheKey,
          name: chunk.name,
          chunks: null,
        };
        refByKeyAndSource.set(refKey, ref);
        files.push(ref);
      }
      continue;
    }
    const last = files[files.length - 1];
    if (last && !last.cacheKey && last.name === chunk.name) {
      last.chunks!.push(chunk);
    } else {
      files.push({ cacheKey: null, name: chunk.name, chunks: [chunk] });
    }
  }

  return { threadId, updated: new Date().toISOString(), files };
}

/**
 * Persists the chunks for a thread, replacing any existing record.
 * An empty chunk list deletes the record instead.
 */
export function saveDocChunks(
  threadId: string,
  chunks: StoredDocChunk[],
): Promise<void> {
  if (chunks.length === 0) return deleteDocChunks(threadId);
  const record = buildDocChunkRecord(threadId, chunks);
  return withChunkDb(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([CHUNK_STORE_NAME], "readwrite");
        transaction.objectStore(CHUNK_STORE_NAME).put(record);
        transaction.onabort = () =>
          reject(transaction.error || new Error("Doc chunk save aborted"));
        transaction.oncomplete = () => resolve();
      }),
  );
}

function getDocChunkRecord(
  threadId: string,
): Promise<DocChunkRecord | undefined> {
  return withChunkDb(
    (db) =>
      new Promise<DocChunkRecord | undefined>((resolve, reject) => {
        const request = db
          .transaction([CHUNK_STORE_NAME], "readonly")
          .objectStore(CHUNK_STORE_NAME)
          .get(threadId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () =>
          resolve(request.result as DocChunkRecord | undefined);
      }),
  );
}

/**
 * Loads the stored chunks for a thread, resolving cache references back into
 * chunks. Referenced files evicted from the cache are dropped.
 */
export async function loadDocChunks(
  threadId: string,
): Promise<StoredDocChunk[]> {
  const record = await getDocChunkRecord(threadId);
  if (!record || !Array.isArray(record.files)) return [];

  const chunks: StoredDocChunk[] = [];
  for (const file of record.files) {
    if (!file.cacheKey) {
      chunks.push(...(file.chunks || []));
      continue;
    }
    const cached = await getCachedFileChunks(file.cacheKey).catch(() => null);
    if (cached) {
      chunks.push(
        ...cached.map((chunk) => ({
          ...chunk,
          name: file.name,
          cacheKey: file.cacheKey,
        })),
      );
    } else {
      console.warn(
        `Document cache entry is missing for stored source: ${file.name}`,
      );
    }
  }
  return chunks;
}

/** Deletes the stored chunks for a thread. */
export function deleteDocChunks(threadId: string): Promise<void> {
  return withChunkDb(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([CHUNK_STORE_NAME], "readwrite");
        transaction.objectStore(CHUNK_STORE_NAME).delete(threadId);
        transaction.onabort = () =>
          reject(transaction.error || new Error("Doc chunk delete aborted"));
        transaction.oncomplete = () => resolve();
      }),
  );
}

/**
 * Looks up cached chunks for a file by its cache key.
 *
 * @param key - `<content-hash>:<embedding-model>` cache key.
 * @returns The cached chunks, or `null` on a cache miss.
 */
export function getCachedFileChunks(
  key: string,
): Promise<StoredDocChunk[] | null> {
  return withChunkDb(
    (db) =>
      new Promise<StoredDocChunk[] | null>((resolve, reject) => {
        const request = db
          .transaction([FILE_CACHE_STORE_NAME], "readonly")
          .objectStore(FILE_CACHE_STORE_NAME)
          .get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const record = request.result as CachedFileRecord | undefined;
          resolve(
            Array.isArray(record?.chunks) && record.chunks.length > 0
              ? record.chunks
              : null,
          );
        };
      }),
  );
}

/**
 * Caches a file's chunks under its cache key, evicting the oldest entries once
 * the cache exceeds {@link FILE_CACHE_LIMIT} files. Entries still referenced by
 * a thread record are never evicted.
 */
export function saveCachedFileChunks(
  key: string,
  name: string,
  chunks: StoredDocChunk[],
): Promise<void> {
  return withChunkDb(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          [CHUNK_STORE_NAME, FILE_CACHE_STORE_NAME],
          "readwrite",
        );
        const store = transaction.objectStore(FILE_CACHE_STORE_NAME);
        const record: CachedFileRecord = {
          key,
          name,
          updated: new Date().toISOString(),
          chunks,
        };
        store.put(record);

        const refsRequest = transaction.objectStore(CHUNK_STORE_NAME).getAll();
        refsRequest.onsuccess = () => {
          const referenced = new Set<string>();
          for (const thread of refsRequest.result as DocChunkRecord[]) {
            for (const file of thread.files || []) {
              if (file.cacheKey) referenced.add(file.cacheKey);
            }
          }

          const allRequest = store.getAll();
          allRequest.onsuccess = () => {
            const evictable = (allRequest.result as CachedFileRecord[])
              .filter((r) => r.key !== key && !referenced.has(r.key))
              .sort((a, b) => a.updated.localeCompare(b.updated));
            const excess = allRequest.result.length - FILE_CACHE_LIMIT;
            for (const stale of evictable.slice(0, Math.max(0, excess))) {
              store.delete(stale.key);
            }
          };
        };

        transaction.onabort = () =>
          reject(transaction.error || new Error("File cache save aborted"));
        transaction.oncomplete = () => resolve();
      }),
  );
}
