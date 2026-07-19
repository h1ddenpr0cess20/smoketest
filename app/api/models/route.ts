import { NextRequest } from "next/server";
import {
  authorizationHeaders,
  isChatModel,
  isProviderId,
  providerEndpoint,
  PROVIDERS,
} from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    provider?: unknown;
    apiKey?: unknown;
  } | null;
  if (!body || !isProviderId(body.provider)) {
    return Response.json({ error: "Unsupported provider." }, { status: 400 });
  }

  const provider = body.provider;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  if (PROVIDERS[provider].apiKeyRequired && !apiKey.trim()) {
    return Response.json(
      { error: `${PROVIDERS[provider].name} requires an API key.` },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(providerEndpoint(provider, "models"), {
      headers: authorizationHeaders(provider, apiKey),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const raw = await response.text();
    if (!response.ok) {
      let message = raw;
      try {
        const parsed = JSON.parse(raw) as {
          error?: { message?: string };
          message?: string;
        };
        message = parsed.error?.message || parsed.message || raw;
      } catch {
        // Keep plain text.
      }
      return Response.json(
        { error: message || `Model discovery failed (${response.status}).` },
        { status: response.status },
      );
    }

    const parsed = JSON.parse(raw) as { data?: Array<{ id?: unknown }> };
    const models = (parsed.data ?? [])
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string")
      .filter((modelId) => isChatModel(provider, modelId))
      .sort((a, b) => a.localeCompare(b));
    return Response.json({ models });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Connection failed";
    return Response.json(
      {
        error: PROVIDERS[provider].local
          ? `Could not reach ${PROVIDERS[provider].name}. Start its local server and try again.`
          : `Could not reach ${PROVIDERS[provider].name}. ${detail}`,
      },
      { status: 502 },
    );
  }
}
