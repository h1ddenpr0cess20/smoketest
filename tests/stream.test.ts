import { describe, expect, it } from "vitest";
import {
  eventErrorMessage,
  eventText,
  eventTextItemId,
  finalResponseText,
  generatedFilesFromEvent,
  generatedFilesFromResponse,
  incompleteReason,
  isErrorEvent,
  outputTextFromJson,
  parseSseBlock,
} from "../lib/stream";

describe("Responses API stream parsing", () => {
  it("parses output text deltas", () => {
    const event = parseSseBlock(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hello"}',
    );
    expect(event && eventText(event)).toBe("hello");
  });

  it("normalizes array and object delta shapes", () => {
    expect(
      eventText({ type: "response.output_text.delta", delta: ["a", "b"] }),
    ).toBe("ab");
    expect(
      eventText({ type: "response.output_text.delta", delta: { text: "c" } }),
    ).toBe("c");
  });

  it("ignores terminal sentinels", () => {
    expect(parseSseBlock("data: [DONE]")).toBeNull();
  });

  it("extracts non-streaming output text", () => {
    expect(
      outputTextFromJson({
        output: [{ content: [{ type: "output_text", text: "done" }] }],
      }),
    ).toBe("done");
  });

  it("separates text from multiple output items with a paragraph break", () => {
    expect(
      outputTextFromJson({
        output: [
          { content: [{ type: "output_text", text: "first part" }] },
          { type: "reasoning" },
          { content: [{ type: "output_text", text: "second part" }] },
        ],
      }),
    ).toBe("first part\n\nsecond part");
    expect(outputTextFromJson({ output_text: ["first", "second"] })).toBe(
      "first\n\nsecond",
    );
  });

  it("reads the owning item id off text deltas only", () => {
    expect(
      eventTextItemId({
        type: "response.output_text.delta",
        item_id: "msg_1",
        delta: "hi",
      }),
    ).toBe("msg_1");
    expect(
      eventTextItemId({ type: "response.output_item.done", item_id: "msg_1" }),
    ).toBe("");
  });

  it("reads error messages from every location providers use", () => {
    expect(eventErrorMessage({ type: "error", message: "top-level" })).toBe(
      "top-level",
    );
    expect(
      eventErrorMessage({ type: "error", error: { message: "nested" } }),
    ).toBe("nested");
    expect(
      eventErrorMessage({
        type: "response.failed",
        response: { error: { message: "in response" } },
      }),
    ).toBe("in response");
  });

  it("flags error events", () => {
    expect(isErrorEvent({ type: "error" })).toBe(true);
    expect(isErrorEvent({ type: "response.failed" })).toBe(true);
    expect(isErrorEvent({ type: "response.completed" })).toBe(false);
  });

  it("falls back to the final response payload text", () => {
    const event = {
      type: "response.completed",
      response: {
        output: [{ content: [{ type: "output_text", text: "final" }] }],
      },
    };
    expect(finalResponseText(event)).toBe("final");
    expect(
      finalResponseText({ type: "response.output_text.delta", delta: "x" }),
    ).toBe("");
  });

  it("reports why a response was cut short", () => {
    expect(
      incompleteReason({
        type: "response.incomplete",
        response: { incomplete_details: { reason: "max_output_tokens" } },
      }),
    ).toBe("max_output_tokens");
    expect(incompleteReason({ type: "response.completed" })).toBe("");
  });

  it("extracts and merges generated Code Interpreter files", () => {
    expect(
      generatedFilesFromResponse({
        output: [
          {
            type: "code_interpreter_call",
            container_id: "cntr_123",
            outputs: [
              { type: "file", file_id: "cfile_report", name: "report.csv" },
            ],
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                annotations: [
                  {
                    type: "container_file_citation",
                    file_id: "cfile_report",
                    container_id: "cntr_123",
                    filename: "final-report.csv",
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        fileId: "cfile_report",
        containerId: "cntr_123",
        filename: "final-report.csv",
      },
    ]);
  });

  it("only extracts generated files from terminal stream events", () => {
    const response = {
      output: [
        {
          type: "message",
          content: [
            {
              annotations: [
                {
                  type: "container_file_citation",
                  file_id: "cfile_data",
                  container_id: "cntr_data",
                  filename: "data.json",
                },
              ],
            },
          ],
        },
      ],
    };
    expect(
      generatedFilesFromEvent({ type: "response.completed", response }),
    ).toHaveLength(1);
    expect(
      generatedFilesFromEvent({ type: "response.output_item.done", response }),
    ).toEqual([]);
  });
});
