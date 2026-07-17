export type ResponseStreamEvent = {
  type?: string;
  delta?: unknown;
  text?: string;
  message?: string;
  response?: {
    output_text?: unknown;
    output?: unknown[];
    error?: { message?: string };
    incomplete_details?: { reason?: string };
  };
  error?: { message?: string };
};

export function parseSseBlock(block: string): ResponseStreamEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data || data === "[DONE]") return null;
  try {
    return JSON.parse(data) as ResponseStreamEvent;
  } catch {
    return null;
  }
}

// The API emits deltas as a string, an array of strings, or `{ text }`
// depending on provider and event; normalize them all to plain text.
function deltaText(delta: unknown): string {
  if (typeof delta === "string") return delta;
  if (Array.isArray(delta)) {
    return delta.map((item) => (typeof item === "string" ? item : "")).join("");
  }
  if (delta && typeof delta === "object") {
    const text = (delta as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "";
}

export function eventText(event: ResponseStreamEvent): string {
  if (event.type === "response.output_text.delta") return deltaText(event.delta);
  if (event.type === "response.refusal.delta") return deltaText(event.delta);
  return "";
}

export function isErrorEvent(event: ResponseStreamEvent): boolean {
  return event.type === "error" || event.type === "response.failed";
}

// `error` events carry `message` at the top level; `response.failed` nests it
// under `response.error`. Check every location a provider might use.
export function eventErrorMessage(event: ResponseStreamEvent): string {
  return (
    event.error?.message ||
    event.message ||
    event.response?.error?.message ||
    ""
  );
}

// Final payload text from `response.completed` / `response.incomplete`, used as
// a fallback when no deltas were received (some providers only send the final
// response object).
export function finalResponseText(event: ResponseStreamEvent): string {
  if (event.type !== "response.completed" && event.type !== "response.incomplete") return "";
  return outputTextFromJson(event.response);
}

export function incompleteReason(event: ResponseStreamEvent): string {
  if (event.type !== "response.incomplete") return "";
  return event.response?.incomplete_details?.reason || "unknown reason";
}

export function outputTextFromJson(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const response = value as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  if (Array.isArray(response.output_text)) {
    return response.output_text.filter((part): part is string => typeof part === "string").join("");
  }
  return (response.output ?? [])
    .flatMap((item) => item?.content ?? [])
    .filter((part) => (part?.type === "output_text" || part?.type === "refusal") && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}
