export type ResponseStreamEvent = {
  type?: string;
  delta?: string;
  text?: string;
  response?: { output_text?: string; output?: unknown[] };
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

export function eventText(event: ResponseStreamEvent): string {
  if (event.type === "response.output_text.delta") return event.delta ?? "";
  if (event.type === "response.refusal.delta") return event.delta ?? "";
  if (event.type === "response.output_text.done") return "";
  return "";
}

export function outputTextFromJson(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const response = value as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}
