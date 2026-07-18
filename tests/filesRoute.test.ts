import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/files/route";

afterEach(() => vi.restoreAllMocks());

describe("generated file proxy", () => {
  it("downloads container file content without exposing the API key in the URL", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("a,b\n1,2", {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="result.csv"',
        },
      }),
    );
    const response = await POST(
      new NextRequest("http://localhost/api/files", {
        method: "POST",
        body: JSON.stringify({
          provider: "openai",
          apiKey: "secret-key",
          fileId: "cfile_result",
          containerId: "cntr_result",
        }),
      }),
    );

    expect(upstream).toHaveBeenCalledOnce();
    expect(upstream.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/containers/cntr_result/files/cfile_result/content",
    );
    expect(JSON.stringify(upstream.mock.calls[0][0])).not.toContain(
      "secret-key",
    );
    expect(
      (upstream.mock.calls[0][1]?.headers as Record<string, string>)
        .Authorization,
    ).toBe("Bearer secret-key");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="result.csv"',
    );
    expect(await response.text()).toBe("a,b\n1,2");
  });

  it("rejects malformed identifiers before calling the provider", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new NextRequest("http://localhost/api/files", {
        method: "POST",
        body: JSON.stringify({
          provider: "openai",
          apiKey: "key",
          fileId: "../secret",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
