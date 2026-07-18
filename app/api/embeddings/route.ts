import { NextRequest } from "next/server";
import {
  authorizationHeaders,
  isProviderId,
  providerEndpoint,
  PROVIDERS,
} from "@/lib/providers";
import { EMBEDDING_BATCH_SIZE } from "@/lib/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_CHARS = 8_000;

// Local RAG support: forwards embedding requests to the local provider's
// fixed /v1/embeddings endpoint. Cloud providers are rejected — they use
// provider-side file_search instead of the in-browser index.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    provider?: unknown;
    apiKey?: unknown;
    model?: unknown;
    input?: unknown;
  } | null;
  if (!body || !isProviderId(body.provider)) {
    return Response.json({ error: "Unsupported provider." }, { status: 400 });
  }

  const provider = body.provider;
  if (!PROVIDERS[provider].local) {
    return Response.json(
      { error: "Local RAG embeddings are only available for local providers." },
      { status: 400 },
    );
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model)
    return Response.json(
      { error: "Choose an embedding model first." },
      { status: 400 },
    );

  const input = Array.isArray(body.input)
    ? body.input.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];
  if (
    !input.length ||
    input.length !== (body.input as unknown[]).length ||
    input.length > EMBEDDING_BATCH_SIZE
  ) {
    return Response.json(
      { error: `Input must be 1–${EMBEDDING_BATCH_SIZE} non-empty strings.` },
      { status: 400 },
    );
  }
  if (input.some((item) => item.length > MAX_INPUT_CHARS)) {
    return Response.json(
      { error: "Embedding inputs are too large." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(providerEndpoint(provider, "embeddings"), {
      method: "POST",
      headers: authorizationHeaders(provider, apiKey),
      body: JSON.stringify({ model, input }),
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
    });
    const raw = await upstream.text();
    if (!upstream.ok) {
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
            message.slice(0, 300) ||
            `Embeddings request failed (${upstream.status}).`,
        },
        { status: upstream.status },
      );
    }
    return new Response(raw, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Connection failed";
    return Response.json(
      {
        error: `Could not reach ${PROVIDERS[provider].name} for embeddings. ${detail}`,
      },
      { status: 502 },
    );
  }
}
