import { describe, expect, it } from "vitest";
import {
  buildCompactionRequestContent,
  estimateActiveHistoryTokens,
  uncompactedMessages,
} from "../lib/compaction";
import type { Message } from "../lib/types";

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
  error = false,
): Message {
  return { id, role, content, createdAt: 0, error };
}

describe("uncompactedMessages", () => {
  it("returns everything when nothing has been compacted", () => {
    const messages = [
      message("1", "user", "hi"),
      message("2", "assistant", "hello"),
    ];
    expect(uncompactedMessages(messages, undefined)).toBe(messages);
  });

  it("returns only messages after the compaction marker", () => {
    const messages = [
      message("1", "user", "a"),
      message("2", "assistant", "b"),
      message("3", "user", "c"),
    ];
    expect(uncompactedMessages(messages, "2").map((m) => m.id)).toEqual(["3"]);
  });

  it("returns everything when the marker id is no longer present", () => {
    const messages = [
      message("1", "user", "a"),
      message("2", "assistant", "b"),
    ];
    expect(uncompactedMessages(messages, "stale-id")).toBe(messages);
  });
});

describe("estimateActiveHistoryTokens", () => {
  it("counts only the summary when everything has been compacted", () => {
    const messages = [message("1", "user", "a".repeat(400))];
    const tokens = estimateActiveHistoryTokens(messages, "abcd", "1");
    expect(tokens).toBe(1);
  });

  it("counts the summary plus the uncompacted tail", () => {
    const messages = [
      message("1", "user", "a".repeat(400)),
      message("2", "assistant", "b".repeat(40)),
    ];
    const withoutSummary = estimateActiveHistoryTokens(
      [messages[1]],
      undefined,
      undefined,
    );
    const combined = estimateActiveHistoryTokens(messages, "abcd", "1");
    expect(combined).toBe(1 + withoutSummary);
  });

  it("ignores empty and error messages in the tail", () => {
    const messages = [
      message("1", "user", "   "),
      message("2", "assistant", "real content", true),
    ];
    expect(estimateActiveHistoryTokens(messages, undefined, undefined)).toBe(0);
  });
});

describe("buildCompactionRequestContent", () => {
  it("asks for a fresh summary when none exists yet", () => {
    const tail = [message("1", "user", "hello there")];
    const content = buildCompactionRequestContent(undefined, tail);
    expect(content).toContain("User: hello there");
    expect(content).toContain("Summarize this conversation");
    expect(content).not.toContain("Existing summary");
  });

  it("combines the existing summary with the new tail", () => {
    const tail = [message("2", "assistant", "follow-up reply")];
    const content = buildCompactionRequestContent("prior recap", tail);
    expect(content).toContain("Existing summary of earlier parts");
    expect(content).toContain("prior recap");
    expect(content).toContain("Assistant: follow-up reply");
    expect(content).toContain("Write one updated summary");
  });

  it("omits empty and error messages from the transcript", () => {
    const tail = [
      message("1", "user", "   "),
      message("2", "assistant", "broken", true),
      message("3", "user", "kept"),
    ];
    const content = buildCompactionRequestContent(undefined, tail);
    expect(content).toContain("User: kept");
    expect(content).not.toContain("broken");
  });
});
