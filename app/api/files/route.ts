import { NextRequest } from "next/server";
import { authorizationHeaders, isProviderId, PROVIDERS } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

// Downloads a provider-side file produced by code interpreter: container files
// via /containers/{id}/files/{fileId}/content, classic ids via
// /files/{fileId}/content (wordmark's downloadFileContent, proxied so the API
// key stays out of browser-visible URLs).
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    provider?: unknown;
    apiKey?: unknown;
    fileId?: unknown;
    containerId?: unknown;
  } | null;
  if (!body || !isProviderId(body.provider)) {
    return Response.json({ error: "Unsupported provider." }, { status: 400 });
  }
  const provider = body.provider;
  if (PROVIDERS[provider].local) {
    return Response.json(
      { error: "Local providers have no files API." },
      { status: 400 },
    );
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  if (PROVIDERS[provider].apiKeyRequired && !apiKey.trim()) {
    return Response.json(
      { error: `${PROVIDERS[provider].name} requires an API key.` },
      { status: 400 },
    );
  }
  const fileId = typeof body.fileId === "string" ? body.fileId : "";
  const containerId =
    typeof body.containerId === "string" ? body.containerId : "";
  if (
    !ID_PATTERN.test(fileId) ||
    (containerId && !ID_PATTERN.test(containerId))
  ) {
    return Response.json(
      { error: "Invalid file identifier." },
      { status: 400 },
    );
  }

  const base = PROVIDERS[provider].baseUrl;
  const url = containerId
    ? `${base}/containers/${containerId}/files/${fileId}/content`
    : `${base}/files/${fileId}/content`;

  try {
    const upstream = await fetch(url, {
      headers: authorizationHeaders(provider, apiKey),
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
    });
    if (!upstream.ok) {
      const raw = await upstream.text();
      return Response.json(
        {
          error:
            raw.slice(0, 300) || `File download failed (${upstream.status}).`,
        },
        { status: upstream.status },
      );
    }
    const headers: Record<string, string> = {
      "Content-Type":
        upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, no-store",
    };
    const disposition = upstream.headers.get("content-disposition");
    if (disposition) headers["Content-Disposition"] = disposition;
    const length = upstream.headers.get("content-length");
    if (length) headers["Content-Length"] = length;
    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Connection failed";
    return Response.json(
      {
        error: `Could not download the file from ${PROVIDERS[provider].name}. ${detail}`,
      },
      { status: 502 },
    );
  }
}
