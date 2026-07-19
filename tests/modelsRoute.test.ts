import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/models/route";

afterEach(() => vi.restoreAllMocks());

describe("model discovery proxy", () => {
  it("filters non-chat models out of the OpenAI list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-4.1" },
            { id: "dall-e-3" },
            { id: "whisper-1" },
            { id: "text-embedding-3-small" },
            { id: "o3" },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    const response = await POST(
      new NextRequest("http://localhost/api/models", {
        method: "POST",
        body: JSON.stringify({ provider: "openai", apiKey: "key" }),
      }),
    );
    const body = (await response.json()) as { models: string[] };
    expect(body.models).toEqual(["gpt-4.1", "o3"]);
  });

  it("filters embedding models out of the Ollama list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "qwen3:8b" }, { id: "nomic-embed-text:latest" }],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    const response = await POST(
      new NextRequest("http://localhost/api/models", {
        method: "POST",
        body: JSON.stringify({ provider: "ollama" }),
      }),
    );
    const body = (await response.json()) as { models: string[] };
    expect(body.models).toEqual(["qwen3:8b"]);
  });
});
