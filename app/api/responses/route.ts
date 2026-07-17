import { NextRequest } from "next/server";
import {
  authorizationHeaders,
  isProviderId,
  providerEndpoint,
  PROVIDERS,
} from "@/lib/providers";
import { buildTools, isValidMcpUrl, MCP_LABEL_PATTERN, type ToolRequest } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  provider?: unknown;
  apiKey?: unknown;
  model?: unknown;
  input?: unknown;
  instructions?: unknown;
  reasoningEffort?: unknown;
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
  };
  const vectorStoreIds = Array.isArray(raw.vectorStoreIds)
    ? raw.vectorStoreIds
        .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
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
  };
}

type InputMessage = { role: "user" | "assistant"; content: string };

// `input` is either a plain string or a role-tagged message array. Anything
// else (or an empty value) is rejected before it reaches the provider.
function sanitizeInput(value: unknown): string | InputMessage[] | null {
  if (typeof value === "string") return value.trim() || null;
  if (!Array.isArray(value) || !value.length) return null;
  const messages: InputMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    messages.push({ role, content });
  }
  return messages;
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
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";

  if (PROVIDERS[provider].apiKeyRequired && !apiKey.trim()) {
    return Response.json({ error: `${PROVIDERS[provider].name} requires an API key.` }, { status: 400 });
  }
  if (!model) return Response.json({ error: "Choose a model first." }, { status: 400 });
  if (!input) return Response.json({ error: "Input is empty or malformed." }, { status: 400 });

  const upstreamBody: Record<string, unknown> = {
    model,
    input,
    stream: true,
  };
  if (instructions) upstreamBody.instructions = instructions;
  const effort = String(body.reasoningEffort);
  if (["low", "medium", "high"].includes(effort)) {
    upstreamBody.reasoning = { effort };
  }
  const tools = buildTools(provider, sanitizeToolRequest(body.tools));
  if (tools.length) upstreamBody.tools = tools;
  // The transcript is re-sent in full every turn, so server-side response
  // storage is never used. Only OpenAI documents `store`; leave others alone.
  if (provider === "openai") upstreamBody.store = false;

  let upstream: Response;
  try {
    upstream = await fetch(providerEndpoint(provider, "responses"), {
      method: "POST",
      headers: { ...authorizationHeaders(provider, apiKey), Accept: "text/event-stream" },
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
      const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
      message =
        typeof parsed.error === "string"
          ? parsed.error
          : parsed.error?.message || parsed.message || raw;
    } catch {
      // Keep the provider's plain-text response.
    }
    return Response.json(
      { error: message || `${PROVIDERS[provider].name} returned ${upstream.status}.` },
      { status: upstream.status },
    );
  }

  if (!upstream.body) {
    return Response.json({ error: "Provider returned an empty response." }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
