export type ResponseStreamEvent = {
  type?: string;
  delta?: unknown;
  text?: string;
  message?: string;
  item_id?: string;
  response?: {
    output_text?: unknown;
    output?: unknown[];
    error?: { message?: string };
    incomplete_details?: { reason?: string };
  };
  error?: { message?: string };
  item?: {
    id?: string;
    type?: string;
    name?: string;
    server_label?: string;
    query?: unknown;
    queries?: unknown;
    action?: { query?: unknown; queries?: unknown; url?: unknown };
  };
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
  if (event.type === "response.output_text.delta")
    return deltaText(event.delta);
  if (event.type === "response.refusal.delta") return deltaText(event.delta);
  return "";
}

// The id of the output item a text delta belongs to, so callers can tell a
// new message part started (a response can stream several — e.g. text
// interleaved with tool calls) and separate it instead of running the two
// parts' text together.
export function eventTextItemId(event: ResponseStreamEvent): string {
  if (
    event.type === "response.output_text.delta" ||
    event.type === "response.refusal.delta"
  )
    return event.item_id || "";
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
  if (
    event.type !== "response.completed" &&
    event.type !== "response.incomplete"
  )
    return "";
  return outputTextFromJson(event.response);
}

export function incompleteReason(event: ResponseStreamEvent): string {
  if (event.type !== "response.incomplete") return "";
  return event.response?.incomplete_details?.reason || "unknown reason";
}

function joinQueries(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter(
      (query): query is string =>
        typeof query === "string" && query.trim().length > 0,
    )
    .map((query) => query.trim())
    .join(", ");
}

// Provider-managed search calls carry their query in the item's `action`
// object on output_item.added/.done (`queries` is the populated field; `query`
// is deprecated), per wordmark's extractSearchQueryFromItem.
function searchQueryFromItem(
  item: NonNullable<ResponseStreamEvent["item"]>,
): string {
  const action = item.action;
  if (action) {
    const fromQueries = joinQueries(action.queries);
    if (fromQueries) return fromQueries;
    if (typeof action.query === "string" && action.query.trim())
      return action.query.trim();
    if (typeof action.url === "string" && action.url.trim())
      return action.url.trim();
  }
  const fromItemQueries = joinQueries(item.queries);
  if (fromItemQueries) return fromItemQueries;
  if (typeof item.query === "string" && item.query.trim())
    return item.query.trim();
  return "";
}

export type ToolActivity = { id: string; label: string };

// A human-readable label for a provider-managed tool call surfaced by an
// output_item event, or null for events that aren't tool activity.
export function toolActivity(event: ResponseStreamEvent): ToolActivity | null {
  if (
    event.type !== "response.output_item.added" &&
    event.type !== "response.output_item.done"
  )
    return null;
  const item = event.item;
  if (!item?.type) return null;
  const id = item.id || item.type;
  const query = searchQueryFromItem(item);
  switch (item.type) {
    case "web_search_call":
      return { id, label: query ? `Web search: ${query}` : "Web search" };
    case "x_search_call":
      return { id, label: query ? `X search: ${query}` : "X search" };
    case "code_interpreter_call":
      return { id, label: "Code interpreter" };
    case "file_search_call":
      return { id, label: query ? `File search: ${query}` : "File search" };
    case "mcp_call":
      return { id, label: `MCP · ${item.name || item.server_label || "tool"}` };
    default:
      return null;
  }
}

/** A file produced provider-side (code interpreter), downloadable by id. */
export type GeneratedFile = {
  fileId: string;
  containerId: string | null;
  filename: string | null;
};

// Container files cite ids like "cfile_..."; classic files use "file-...".
const FILE_ID_RE = /^c?file[-_][A-Za-z0-9_-]{4,}$/;

// Collects files produced by code interpreter from a final response payload:
// container_file_citation annotations on message content plus file/container
// ids inside code_interpreter_call items — wordmark's extractor, trimmed to
// the Responses shapes smoketest speaks.
export function generatedFilesFromResponse(value: unknown): GeneratedFile[] {
  const found = new Map<string, GeneratedFile>();
  const push = (fileId: unknown, containerId: unknown, filename: unknown) => {
    if (typeof fileId !== "string" || !FILE_ID_RE.test(fileId)) return;
    const existing = found.get(fileId);
    found.set(fileId, {
      fileId,
      containerId:
        typeof containerId === "string" && containerId
          ? containerId
          : (existing?.containerId ?? null),
      filename:
        typeof filename === "string" && filename
          ? filename
          : (existing?.filename ?? null),
    });
  };

  const scan = (node: unknown, containerId: string | null, depth: number) => {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) {
      for (const item of node) scan(item, containerId, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    const ownContainer =
      typeof record.container_id === "string"
        ? record.container_id
        : containerId;
    push(record.file_id, ownContainer, record.filename ?? record.name);
    for (const child of Object.values(record))
      scan(child, ownContainer, depth + 1);
  };

  if (!value || typeof value !== "object") return [];
  const output = (value as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type === "code_interpreter_call") {
      scan(record, null, 0);
      continue;
    }
    if (record.type === "message" && Array.isArray(record.content)) {
      for (const part of record.content) {
        const annotations = (part as { annotations?: unknown[] } | null)
          ?.annotations;
        if (!Array.isArray(annotations)) continue;
        for (const annotation of annotations) {
          const cited = annotation as Record<string, unknown> | null;
          if (cited?.type === "container_file_citation")
            push(cited.file_id, cited.container_id, cited.filename);
        }
      }
    }
  }
  return [...found.values()];
}

// Generated files ride the final payload, like finalResponseText.
export function generatedFilesFromEvent(
  event: ResponseStreamEvent,
): GeneratedFile[] {
  if (
    event.type !== "response.completed" &&
    event.type !== "response.incomplete"
  )
    return [];
  return generatedFilesFromResponse(event.response);
}

export function outputTextFromJson(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const response = value as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  if (Array.isArray(response.output_text)) {
    return response.output_text
      .filter((part): part is string => typeof part === "string")
      .join("\n\n");
  }
  // A response can carry several output items (e.g. text interleaved with
  // tool calls, or more than one message) — join their text parts with a
  // paragraph break instead of running them together.
  return (response.output ?? [])
    .flatMap((item) => item?.content ?? [])
    .filter(
      (part) =>
        (part?.type === "output_text" || part?.type === "refusal") &&
        typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n\n");
}
