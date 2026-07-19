import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEMORY_LIMIT,
  MEMORY_TEXT_MAX_LENGTH,
  clampMemoryLimit,
  findMemoryMatches,
  memoriesForPrompt,
  restoreMemoryConfig,
  restoreMemoryList,
  runMemoryToolCall,
  trimMemoryText,
  withMemoryAdded,
  withMemoryLimitApplied,
  withMemoryRemovedAt,
} from "../lib/memory";

describe("restoreMemoryConfig", () => {
  it("falls back to disabled/default limit for invalid input", () => {
    expect(restoreMemoryConfig(null)).toEqual({
      enabled: false,
      limit: DEFAULT_MEMORY_LIMIT,
    });
    expect(restoreMemoryConfig("nonsense")).toEqual({
      enabled: false,
      limit: DEFAULT_MEMORY_LIMIT,
    });
  });

  it("restores well-formed fields and clamps a bad limit", () => {
    expect(restoreMemoryConfig({ enabled: true, limit: 10 })).toEqual({
      enabled: true,
      limit: 10,
    });
    expect(restoreMemoryConfig({ enabled: true, limit: -5 })).toEqual({
      enabled: true,
      limit: 1,
    });
    expect(restoreMemoryConfig({ enabled: "yes", limit: "10" })).toEqual({
      enabled: false,
      limit: DEFAULT_MEMORY_LIMIT,
    });
  });
});

describe("restoreMemoryList", () => {
  it("keeps only non-blank strings", () => {
    expect(
      restoreMemoryList(["likes dogs", "", "  ", 5, null, "vegetarian"]),
    ).toEqual(["likes dogs", "vegetarian"]);
  });

  it("rejects non-array input", () => {
    expect(restoreMemoryList(null)).toEqual([]);
    expect(restoreMemoryList({ 0: "x" })).toEqual([]);
  });
});

describe("clampMemoryLimit", () => {
  it("floors, requires a minimum of 1, and falls back on NaN", () => {
    expect(clampMemoryLimit(10.7)).toBe(10);
    expect(clampMemoryLimit(0)).toBe(1);
    expect(clampMemoryLimit(-3)).toBe(1);
    expect(clampMemoryLimit(NaN)).toBe(DEFAULT_MEMORY_LIMIT);
  });
});

describe("trimMemoryText", () => {
  it("trims whitespace and caps at MEMORY_TEXT_MAX_LENGTH", () => {
    expect(trimMemoryText("  likes dogs  ")).toBe("likes dogs");
    expect(trimMemoryText("a".repeat(700))).toHaveLength(
      MEMORY_TEXT_MAX_LENGTH,
    );
  });
});

describe("withMemoryAdded", () => {
  it("appends a trimmed memory", () => {
    expect(withMemoryAdded(["a"], "  b  ", 10)).toEqual(["a", "b"]);
  });

  it("drops blank entries without mutating the list", () => {
    expect(withMemoryAdded(["a"], "   ", 10)).toEqual(["a"]);
  });

  it("evicts the oldest entries once the limit is exceeded (FIFO)", () => {
    expect(withMemoryAdded(["a", "b", "c"], "d", 3)).toEqual(["b", "c", "d"]);
  });
});

describe("withMemoryRemovedAt", () => {
  it("removes the entry at the given index", () => {
    expect(withMemoryRemovedAt(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("is a no-op for an out-of-range index", () => {
    expect(withMemoryRemovedAt(["a"], 5)).toEqual(["a"]);
    expect(withMemoryRemovedAt(["a"], -1)).toEqual(["a"]);
  });
});

describe("withMemoryLimitApplied", () => {
  it("trims the oldest entries down to the new limit", () => {
    expect(withMemoryLimitApplied(["a", "b", "c"], 2)).toEqual(["b", "c"]);
  });

  it("leaves a list under the limit untouched", () => {
    expect(withMemoryLimitApplied(["a"], 5)).toEqual(["a"]);
  });
});

describe("findMemoryMatches", () => {
  it("matches case-insensitively by substring, reporting every hit", () => {
    const memories = ["Likes dogs", "vegetarian", "has a dog named Rex"];
    expect(findMemoryMatches(memories, "DOG")).toEqual([
      { index: 0, memory: "Likes dogs" },
      { index: 2, memory: "has a dog named Rex" },
    ]);
  });

  it("returns no matches for a blank keyword", () => {
    expect(findMemoryMatches(["a"], "  ")).toEqual([]);
  });
});

describe("memoriesForPrompt", () => {
  it("formats memories as a bullet list", () => {
    expect(memoriesForPrompt(["likes dogs", "vegetarian"])).toBe(
      "\nDetails remembered about the user (use these only if relevant to the conversation):\n  - likes dogs\n  - vegetarian\n",
    );
  });

  it("returns an empty string for no memories", () => {
    expect(memoriesForPrompt([])).toBe("");
  });
});

describe("runMemoryToolCall", () => {
  it("stores a memory via remember", () => {
    const result = runMemoryToolCall(
      "remember",
      JSON.stringify({ memory: "likes dogs" }),
      [],
      25,
    );
    expect(result.memories).toEqual(["likes dogs"]);
    expect(JSON.parse(result.output)).toEqual({
      ok: true,
      stored: "likes dogs",
      total: 1,
    });
  });

  it("reports failure when remember gets an empty memory", () => {
    const result = runMemoryToolCall(
      "remember",
      JSON.stringify({ memory: "  " }),
      [],
      25,
    );
    expect(result.memories).toEqual([]);
    expect(JSON.parse(result.output)).toEqual({
      ok: false,
      message: "Empty memory",
    });
  });

  it("removes the first match via forget and reports every match", () => {
    const result = runMemoryToolCall(
      "forget",
      JSON.stringify({ keyword: "dog" }),
      ["likes dogs", "vegetarian", "has a dog"],
      25,
    );
    expect(result.memories).toEqual(["vegetarian", "has a dog"]);
    expect(JSON.parse(result.output)).toEqual({
      ok: true,
      keyword: "dog",
      removed: "likes dogs",
      removed_index: 0,
      matches: [
        { index: 0, memory: "likes dogs" },
        { index: 2, memory: "has a dog" },
      ],
      remaining: 2,
    });
  });

  it("reports failure when forget finds no match", () => {
    const result = runMemoryToolCall(
      "forget",
      JSON.stringify({ keyword: "cats" }),
      ["likes dogs"],
      25,
    );
    expect(result.memories).toEqual(["likes dogs"]);
    expect(JSON.parse(result.output)).toEqual({
      ok: false,
      message: "No matching memory found",
      keyword: "cats",
      matches: [],
    });
  });

  it("tolerates malformed JSON arguments", () => {
    const result = runMemoryToolCall("remember", "{not json", [], 25);
    expect(JSON.parse(result.output)).toEqual({
      ok: false,
      message: "Empty memory",
    });
  });

  it("rejects an unknown tool name", () => {
    const result = runMemoryToolCall("wipe", "{}", ["a"], 25);
    expect(result.memories).toEqual(["a"]);
    expect(JSON.parse(result.output)).toEqual({
      ok: false,
      message: "Unknown tool: wipe",
    });
  });
});
