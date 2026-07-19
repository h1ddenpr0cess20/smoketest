import { NextRequest } from "next/server";
import {
  authorizationHeaders,
  isProviderId,
  providerEndpoint,
  PROVIDERS,
} from "@/lib/providers";
import {
  buildTools,
  isMemoryToolName,
  isValidMcpUrl,
  MCP_LABEL_PATTERN,
  type ToolRequest,
} from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  provider?: unknown;
  apiKey?: unknown;
  model?: unknown;
  input?: unknown;
  instructions?: unknown;
  reasoningEffort?: unknown;
  priorityProcessing?: unknown;
  tools?: unknown;
};

const MAX_MCP_SERVERS = 8;
const MAX_VECTOR_STORES = 5;

// Only well-formed toggles, vector-store ids, and MCP endpoints survive;
// the tools array itself is always constructed server-side by buildTools.
function sanitizeToolRequest(value: unknown): ToolRequest {
  if (!value || typeof value !== "object") return {};
  const raw = value as {
    webSearch?: unknown;
    xSearch?: unknown;
    codeInterpreter?: unknown;
    fileSearch?: unknown;
    vectorStoreIds?: unknown;
    mcpServers?: unknown;
    memory?: unknown;
  };
  const vectorStoreIds = Array.isArray(raw.vectorStoreIds)
    ? raw.vectorStoreIds
        .filter(
          (id): id is string => typeof id === "string" && Boolean(id.trim()),
        )
        .slice(0, MAX_VECTOR_STORES)
    : [];
  const mcpServers = Array.isArray(raw.mcpServers)
    ? raw.mcpServers
        .filter(
          (server): server is { label: string; url: string } =>
            Boolean(server) &&
            typeof server === "object" &&
            typeof (server as { label?: unknown }).label === "string" &&
            MCP_LABEL_PATTERN.test((server as { label: string }).label) &&
            typeof (server as { url?: unknown }).url === "string" &&
            isValidMcpUrl((server as { url: string }).url),
        )
        .map(({ label, url }) => ({ label, url }))
        .slice(0, MAX_MCP_SERVERS)
    : [];
  return {
    webSearch: raw.webSearch === true,
    xSearch: raw.xSearch === true,
    codeInterpreter: raw.codeInterpreter === true,
    fileSearch: raw.fileSearch === true,
    vectorStoreIds,
    mcpServers,
    memory: raw.memory === true,
  };
}

type InputMessage = { role: "user" | "assistant"; content: string };
// The two extra item shapes a memory tool round-trip appends to `input`.
type FunctionCallInput = {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
};
type FunctionCallOutputInput = {
  type: "function_call_output";
  call_id: string;
  output: string;
};
type InputItem = InputMessage | FunctionCallInput | FunctionCallOutputInput;

const MAX_FUNCTION_CALL_FIELD_LENGTH = 8_000;

function sanitizeFunctionCallItem(
  item: Record<string, unknown>,
): InputItem | null {
  const callId = item.call_id;
  if (
    item.type === "function_call" &&
    typeof callId === "string" &&
    callId &&
    isMemoryToolName(item.name) &&
    typeof item.arguments === "string" &&
    item.arguments.length <= MAX_FUNCTION_CALL_FIELD_LENGTH
  ) {
    return {
      type: "function_call",
      call_id: callId,
      name: item.name,
      arguments: item.arguments,
    };
  }
  if (
    item.type === "function_call_output" &&
    typeof callId === "string" &&
    callId &&
    typeof item.output === "string" &&
    item.output.length <= MAX_FUNCTION_CALL_FIELD_LENGTH
  ) {
    return {
      type: "function_call_output",
      call_id: callId,
      output: item.output,
    };
  }
  return null;
}

// `input` is a plain string, or a role-tagged message array that may also
// carry function_call/function_call_output items from a memory tool round trip.
function sanitizeInput(value: unknown): string | InputItem[] | null {
  if (typeof value === "string") return value.trim() || null;
  if (!Array.isArray(value) || !value.length) return null;
  const items: InputItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    if (
      record.type === "function_call" ||
      record.type === "function_call_output"
    ) {
      const sanitized = sanitizeFunctionCallItem(record);
      if (!sanitized) return null;
      items.push(sanitized);
      continue;
    }
    const { role, content } = record as { role?: unknown; content?: unknown };
    if (
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string"
    )
      return null;
    items.push({ role, content });
  }
  return items;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isProviderId(body.provider)) {
    return Response.json({ error: "Unsupported provider." }, { status: 400 });
  }

  const provider = body.provider;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const input = sanitizeInput(body.input);
  const instructions =
    typeof body.instructions === "string" ? body.instructions.trim() : "";

  if (PROVIDERS[provider].apiKeyRequired && !apiKey.trim()) {
    return Response.json(
      { error: `${PROVIDERS[provider].name} requires an API key.` },
      { status: 400 },
    );
  }
  if (!model)
    return Response.json({ error: "Choose a model first." }, { status: 400 });
  if (!input)
    return Response.json(
      { error: "Input is empty or malformed." },
      { status: 400 },
    );

  const upstreamBody: Record<string, unknown> = {
    model,
    input,
    stream: true,
  };
  if (instructions) upstreamBody.instructions = instructions;
  // Priority processing is an OpenAI-only, per-request service tier. Ignore
  // spoofed values for every compatible provider rather than forwarding an
  // option they may reject or interpret differently.
  if (provider === "openai" && body.priorityProcessing === true) {
    upstreamBody.service_tier = "priority";
  }
  const effort = String(body.reasoningEffort);
  if (["low", "medium", "high"].includes(effort)) {
    upstreamBody.reasoning = { effort };
  }
  const tools = buildTools(provider, sanitizeToolRequest(body.tools));
  if (tools.length) upstreamBody.tools = tools;
  // OpenAI omits Code Interpreter outputs unless they are explicitly
  // requested. They carry the generated file/container ids used by the
  // download UI. xAI rejects this OpenAI-only include field.
  if (
    provider === "openai" &&
    tools.some((tool) => tool.type === "code_interpreter")
  ) {
    upstreamBody.include = ["code_interpreter_call.outputs"];
  }
  // The transcript is re-sent in full every turn, so server-side response
  // storage is never used. Only OpenAI documents `store`; leave others alone.
  if (provider === "openai") upstreamBody.store = false;

  let upstream: Response;
  try {
    upstream = await fetch(providerEndpoint(provider, "responses"), {
      method: "POST",
      headers: {
        ...authorizationHeaders(provider, apiKey),
        Accept: "text/event-stream",
      },
      body: JSON.stringify(upstreamBody),
      signal: request.signal,
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Connection failed";
    return Response.json(
      {
        error: PROVIDERS[provider].local
          ? `Could not reach ${PROVIDERS[provider].name}. Make sure its local server is running. ${detail}`
          : `Could not reach ${PROVIDERS[provider].name}. ${detail}`,
      },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const raw = await upstream.text();
    let message = raw;
    try {
      const parsed = JSON.parse(raw) as {
        error?: { message?: string } | string;
        message?: string;
      };
      message =
        typeof parsed.error === "string"
          ? parsed.error
          : parsed.error?.message || parsed.message || raw;
    } catch {
      // Keep the provider's plain-text response.
    }
    return Response.json(
      {
        error:
          message || `${PROVIDERS[provider].name} returned ${upstream.status}.`,
      },
      { status: upstream.status },
    );
  }

  if (!upstream.body) {
    return Response.json(
      { error: "Provider returned an empty response." },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ||
        "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
