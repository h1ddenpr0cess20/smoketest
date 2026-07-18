// History-window trimming, ported from wordmark's tokenBudget module and
// adapted for smoketest's string-only message content. Every send resends
// the thread's full transcript (see buildInput in app/page.tsx), so an
// unbounded thread would keep growing the request payload and cost forever;
// this caps it to the most recent messages that fit a token budget.

import type { Message } from "./types";
import type { ProviderId } from "./providers";
import { PROVIDERS } from "./providers";

/** Estimates the token count of a string using a ~4-chars-per-token heuristic. */
export function estimateTokens(text: string | undefined | null): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Token cost of one message, including a small fixed role/structure overhead. */
export function estimateMessageTokens(message: Message): number {
  return estimateTokens(message.content) + 4;
}

// Local servers (LM Studio / Ollama) are usually loaded with far smaller
// context windows than hosted models, so local history stays close to
// wordmark's original default. Cloud providers (OpenAI, xAI) commonly expose
// context windows well above 128k tokens, so history can run much longer
// before trimming kicks in.
export const DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET = 16_384;
export const DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET = 128_000;

/** The history token budget to apply for a given provider. */
export function historyTokenBudgetFor(provider: ProviderId): number {
  return PROVIDERS[provider].local
    ? DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET
    : DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET;
}

/**
 * Trims a message list to fit within a token budget, keeping the most recent
 * messages and dropping the oldest first. The latest message is always
 * retained even if it alone exceeds the budget. A budget of 0 or less
 * disables trimming (the full list is returned).
 */
export function windowMessagesByTokenBudget(
  messages: Message[],
  budget: number,
): Message[] {
  if (!budget || budget <= 0) return messages.slice();
  const kept: Message[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateMessageTokens(messages[i]);
    if (kept.length > 0 && total + cost > budget) break;
    kept.unshift(messages[i]);
    total += cost;
  }
  return kept;
}
