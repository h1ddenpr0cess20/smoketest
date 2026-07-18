import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/responses/route";

afterEach(() => vi.restoreAllMocks());

describe("Responses proxy Code Interpreter shaping", () => {
  it("requests OpenAI Code Interpreter outputs", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    await POST(
      new NextRequest("http://localhost/api/responses", {
        method: "POST",
        body: JSON.stringify({
          provider: "openai",
          apiKey: "key",
          model: "gpt-test",
          input: "make a csv",
          priorityProcessing: true,
          tools: { codeInterpreter: true },
        }),
      }),
    );

    const body = JSON.parse(String(upstream.mock.calls[0][1]?.body)) as Record<
      string,
      unknown
    >;
    expect(body.include).toEqual(["code_interpreter_call.outputs"]);
    expect(body.service_tier).toBe("priority");
    expect(body.tools).toEqual([
      { type: "code_interpreter", container: { type: "auto", file_ids: [] } },
    ]);
  });

  it("does not send OpenAI include fields or container config to xAI", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    await POST(
      new NextRequest("http://localhost/api/responses", {
        method: "POST",
        body: JSON.stringify({
          provider: "xai",
          apiKey: "key",
          model: "grok-test",
          input: "make a csv",
          priorityProcessing: true,
          tools: { codeInterpreter: true },
        }),
      }),
    );

    const body = JSON.parse(String(upstream.mock.calls[0][1]?.body)) as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty("include");
    expect(body).not.toHaveProperty("service_tier");
    expect(body.tools).toEqual([{ type: "code_interpreter" }]);
  });
});
