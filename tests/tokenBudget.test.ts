import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET,
  DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET,
  estimateMessageTokens,
  estimateTokens,
  historyTokenBudgetFor,
  windowMessagesByTokenBudget,
} from "../lib/tokenBudget";
import type { Message } from "../lib/types";

function message(id: string, content: string): Message {
  return { id, role: "user", content, createdAt: 0 };
}

describe("estimateTokens", () => {
  it("uses a ~4-chars-per-token heuristic", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(41))).toBe(11);
  });
});

describe("estimateMessageTokens", () => {
  it("adds a small fixed overhead to the content estimate", () => {
    expect(estimateMessageTokens(message("1", "abcd"))).toBe(5);
    expect(estimateMessageTokens(message("2", ""))).toBe(4);
  });
});

describe("historyTokenBudgetFor", () => {
  it("gives local providers wordmark's smaller default", () => {
    expect(historyTokenBudgetFor("lmstudio")).toBe(
      DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET,
    );
    expect(historyTokenBudgetFor("ollama")).toBe(
      DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET,
    );
  });

  it("gives cloud providers the larger default", () => {
    expect(historyTokenBudgetFor("openai")).toBe(
      DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET,
    );
    expect(historyTokenBudgetFor("xai")).toBe(
      DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET,
    );
  });
});

describe("windowMessagesByTokenBudget", () => {
  it("returns everything when the budget is 0 or negative", () => {
    const messages = [message("1", "a".repeat(100))];
    expect(windowMessagesByTokenBudget(messages, 0)).toEqual(messages);
    expect(windowMessagesByTokenBudget(messages, -1)).toEqual(messages);
  });

  it("keeps the newest messages and drops the oldest first", () => {
    const messages = [
      message("1", "a".repeat(400)),
      message("2", "b".repeat(400)),
      message("3", "c".repeat(400)),
    ];
    // Each message costs ~104 tokens; a 150 budget fits only the latest one.
    const windowed = windowMessagesByTokenBudget(messages, 150);
    expect(windowed.map((m) => m.id)).toEqual(["3"]);
  });

  it("always keeps the latest message even if it alone exceeds the budget", () => {
    const messages = [message("1", "a".repeat(5000))];
    expect(windowMessagesByTokenBudget(messages, 10).map((m) => m.id)).toEqual([
      "1",
    ]);
  });

  it("preserves original order in the trimmed result", () => {
    const messages = [
      message("1", "a".repeat(40)),
      message("2", "b".repeat(40)),
      message("3", "c".repeat(40)),
    ];
    const windowed = windowMessagesByTokenBudget(messages, 1000);
    expect(windowed.map((m) => m.id)).toEqual(["1", "2", "3"]);
  });
});
