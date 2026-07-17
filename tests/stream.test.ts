import { describe, expect, it } from "vitest";
import { eventText, outputTextFromJson, parseSseBlock } from "../lib/stream";

describe("Responses API stream parsing", () => {
  it("parses output text deltas", () => {
    const event = parseSseBlock('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hello"}');
    expect(event && eventText(event)).toBe("hello");
  });

  it("ignores terminal sentinels", () => {
    expect(parseSseBlock("data: [DONE]")).toBeNull();
  });

  it("extracts non-streaming output text", () => {
    expect(outputTextFromJson({ output: [{ content: [{ type: "output_text", text: "done" }] }] })).toBe("done");
  });
});
