// Manual and automatic history compaction. Rather than silently letting the
// oldest turns fall out of the token-budget window (lib/tokenBudget.ts),
// compaction folds them into a running summary that travels in the system
// prompt instead. Each compaction combines whatever summary already exists
// with every message since the last compaction, so the model asked to write
// the new summary sees the full conversation to date rather than just the
// latest slice — otherwise repeated compactions would each forget what the
// previous one had already condensed.

import { estimateMessageTokens, estimateTokens } from "./tokenBudget";
import type { Message } from "./types";

/** The messages not yet folded into the thread's compacted summary. */
export function uncompactedMessages(
  messages: Message[],
  compactedThroughId: string | undefined,
): Message[] {
  if (!compactedThroughId) return messages;
  const index = messages.findIndex((m) => m.id === compactedThroughId);
  return index === -1 ? messages : messages.slice(index + 1);
}

/** Estimated tokens still in play for a thread: summary plus uncompacted tail. */
export function estimateActiveHistoryTokens(
  messages: Message[],
  compactedSummary: string | undefined,
  compactedThroughId: string | undefined,
): number {
  const tail = uncompactedMessages(messages, compactedThroughId).filter(
    (message) => message.content.trim() && !message.error,
  );
  const tailTokens = tail.reduce(
    (sum, message) => sum + estimateMessageTokens(message),
    0,
  );
  return estimateTokens(compactedSummary) + tailTokens;
}

export const COMPACTION_SYSTEM_INSTRUCTIONS =
  "You write concise, factual summaries of conversations for context management. Respond with only the summary text — no preamble, no address to the user, no mention that this is a summary.";

/**
 * The user-turn content sent to the model to (re)generate a compacted
 * summary: the existing summary (if any) plus the transcript of every
 * message since the last compaction, so the result covers the whole
 * conversation rather than only the newly-folded slice.
 */
export function buildCompactionRequestContent(
  existingSummary: string | undefined,
  tail: Message[],
): string {
  const sections: string[] = [];
  if (existingSummary?.trim()) {
    sections.push(
      `Existing summary of earlier parts of this conversation:\n${existingSummary.trim()}`,
    );
  }
  const transcript = tail
    .filter((message) => message.content.trim() && !message.error)
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`,
    )
    .join("\n\n");
  if (transcript) {
    sections.push(`Conversation since then:\n${transcript}`);
  }
  sections.push(
    existingSummary?.trim()
      ? "Write one updated summary that combines the existing summary with the conversation since then, covering the full conversation to date."
      : "Summarize this conversation into a compact recap that preserves the key facts, decisions, and open threads a continuation would need.",
  );
  return sections.join("\n\n");
}
