import { NextRequest } from "next/server";
import {
  authorizationHeaders,
  isProviderId,
  providerEndpoint,
  PROVIDERS,
} from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  provider?: unknown;
  apiKey?: unknown;
  model?: unknown;
  input?: unknown;
  instructions?: unknown;
  reasoningEffort?: unknown;
};

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
  const input = typeof body.input === "string" ? body.input.trim() : "";
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";

  if (PROVIDERS[provider].apiKeyRequired && !apiKey.trim()) {
    return Response.json({ error: `${PROVIDERS[provider].name} requires an API key.` }, { status: 400 });
  }
  if (!model) return Response.json({ error: "Choose a model first." }, { status: 400 });
  if (!input) return Response.json({ error: "Input cannot be empty." }, { status: 400 });

  const upstreamBody: Record<string, unknown> = {
    model,
    input,
    stream: true,
  };
  if (instructions) upstreamBody.instructions = instructions;
  if (provider !== "ollama" && ["low", "medium", "high"].includes(String(body.reasoningEffort))) {
    upstreamBody.reasoning = { effort: body.reasoningEffort };
  }

  let upstream: Response;
  try {
    upstream = await fetch(providerEndpoint(provider, "responses"), {
      method: "POST",
      headers: authorizationHeaders(provider, apiKey),
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
