// Local memory, adapted from wordmark's utils/storage/memoryStorage.ts as
// pure functions — smoketest keeps persisted state in React (app/page.tsx).

export const MEMORY_TEXT_MAX_LENGTH = 600;
export const DEFAULT_MEMORY_LIMIT = 25;

export type MemoryConfig = { enabled: boolean; limit: number };

export function restoreMemoryConfig(saved: unknown): MemoryConfig {
  const config: MemoryConfig = { enabled: false, limit: DEFAULT_MEMORY_LIMIT };
  if (saved && typeof saved === "object") {
    const value = saved as { enabled?: unknown; limit?: unknown };
    if (typeof value.enabled === "boolean") config.enabled = value.enabled;
    if (typeof value.limit === "number" && Number.isFinite(value.limit))
      config.limit = clampMemoryLimit(value.limit);
  }
  return config;
}

export function restoreMemoryList(saved: unknown): string[] {
  if (!Array.isArray(saved)) return [];
  return saved.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

export function clampMemoryLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MEMORY_LIMIT;
  return Math.max(1, Math.floor(value));
}

export function trimMemoryText(text: string): string {
  return text.trim().slice(0, MEMORY_TEXT_MAX_LENGTH);
}

// FIFO eviction past the limit.
export function withMemoryAdded(
  memories: string[],
  text: string,
  limit: number,
): string[] {
  const trimmed = trimMemoryText(text);
  if (!trimmed) return memories;
  const next = [...memories, trimmed];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function withMemoryRemovedAt(
  memories: string[],
  index: number,
): string[] {
  if (index < 0 || index >= memories.length) return memories;
  return memories.filter((_, current) => current !== index);
}

export function withMemoryLimitApplied(
  memories: string[],
  limit: number,
): string[] {
  return memories.length > limit
    ? memories.slice(memories.length - limit)
    : memories;
}

export type MemoryMatch = { index: number; memory: string };

export function findMemoryMatches(
  memories: string[],
  keyword: string,
): MemoryMatch[] {
  const lower = keyword.trim().toLowerCase();
  if (!lower) return [];
  return memories
    .map((memory, index) => ({ memory, index }))
    .filter(({ memory }) => memory.toLowerCase().includes(lower));
}

export function memoriesForPrompt(memories: string[]): string {
  if (!memories.length) return "";
  const bullets = memories.map((memory) => `  - ${memory}`).join("\n");
  return `\nDetails remembered about the user (use these only if relevant to the conversation):\n${bullets}\n`;
}

export type MemoryToolResult = { output: string; memories: string[] };

// Executes a `remember`/`forget` call from the model against the current
// list, returning the function_call_output string plus the resulting list.
export function runMemoryToolCall(
  name: string,
  rawArguments: string,
  memories: string[],
  limit: number,
): MemoryToolResult {
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(rawArguments || "{}");
    if (parsed && typeof parsed === "object")
      args = parsed as Record<string, unknown>;
  } catch {
    // Malformed arguments are treated as an empty object below.
  }

  if (name === "remember") {
    const text = typeof args.memory === "string" ? args.memory : "";
    const trimmed = trimMemoryText(text);
    if (!trimmed) {
      return {
        output: JSON.stringify({ ok: false, message: "Empty memory" }),
        memories,
      };
    }
    const next = withMemoryAdded(memories, trimmed, limit);
    return {
      output: JSON.stringify({ ok: true, stored: trimmed, total: next.length }),
      memories: next,
    };
  }

  if (name === "forget") {
    const keyword = typeof args.keyword === "string" ? args.keyword.trim() : "";
    if (!keyword) {
      return {
        output: JSON.stringify({ ok: false, message: "Missing keyword" }),
        memories,
      };
    }
    const matches = findMemoryMatches(memories, keyword);
    if (!matches.length) {
      return {
        output: JSON.stringify({
          ok: false,
          message: "No matching memory found",
          keyword,
          matches: [],
        }),
        memories,
      };
    }
    const [{ index, memory: removed }] = matches;
    const next = withMemoryRemovedAt(memories, index);
    return {
      output: JSON.stringify({
        ok: true,
        keyword,
        removed,
        removed_index: index,
        matches,
        remaining: next.length,
      }),
      memories: next,
    };
  }

  return {
    output: JSON.stringify({ ok: false, message: `Unknown tool: ${name}` }),
    memories,
  };
}
