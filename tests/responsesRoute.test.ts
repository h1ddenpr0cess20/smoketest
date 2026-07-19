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

describe("Responses proxy memory tool round trip", () => {
  it("appends the memory tools when requested", async () => {
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
          input: "remember I like dogs",
          tools: { memory: true },
        }),
      }),
    );
    const body = JSON.parse(String(upstream.mock.calls[0][1]?.body)) as Record<
      string,
      unknown
    >;
    expect(
      (body.tools as Array<{ name?: string }>).map((tool) => tool.name),
    ).toEqual(["remember", "forget"]);
  });

  it("accepts a function_call/function_call_output round trip in input", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    const response = await POST(
      new NextRequest("http://localhost/api/responses", {
        method: "POST",
        body: JSON.stringify({
          provider: "openai",
          apiKey: "key",
          model: "gpt-test",
          input: [
            { role: "user", content: "remember I like dogs" },
            {
              type: "function_call",
              call_id: "call_1",
              name: "remember",
              arguments: '{"memory":"likes dogs"}',
            },
            {
              type: "function_call_output",
              call_id: "call_1",
              output: '{"ok":true}',
            },
          ],
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = JSON.parse(String(upstream.mock.calls[0][1]?.body)) as Record<
      string,
      unknown
    >;
    expect(body.input).toEqual([
      { role: "user", content: "remember I like dogs" },
      {
        type: "function_call",
        call_id: "call_1",
        name: "remember",
        arguments: '{"memory":"likes dogs"}',
      },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: '{"ok":true}',
      },
    ]);
  });

  it("rejects a function_call item with an unknown tool name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    const response = await POST(
      new NextRequest("http://localhost/api/responses", {
        method: "POST",
        body: JSON.stringify({
          provider: "openai",
          apiKey: "key",
          model: "gpt-test",
          input: [
            {
              type: "function_call",
              call_id: "call_1",
              name: "delete_everything",
              arguments: "{}",
            },
          ],
        }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
