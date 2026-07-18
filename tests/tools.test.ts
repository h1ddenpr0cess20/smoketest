import { describe, expect, it } from "vitest";
import { buildTools } from "../lib/tools";
import { toolActivity } from "../lib/stream";

describe("provider tool building", () => {
  const everything = {
    webSearch: true,
    xSearch: true,
    codeInterpreter: true,
    fileSearch: true,
    vectorStoreIds: ["vs_123"],
    mcpServers: [{ label: "workspace", url: "http://localhost:9404/mcp" }],
  };

  it("drops all tools for local providers", () => {
    expect(buildTools("lmstudio", everything)).toEqual([]);
    expect(buildTools("ollama", everything)).toEqual([]);
  });

  it("builds the OpenAI set (no x_search, file_search needs store ids)", () => {
    const tools = buildTools("openai", everything);
    const types = tools.map((tool) => tool.type);
    expect(types).toEqual([
      "web_search",
      "code_interpreter",
      "file_search",
      "mcp",
    ]);
    expect(tools.find((tool) => tool.type === "code_interpreter")).toEqual({
      type: "code_interpreter",
      container: { type: "auto", file_ids: [] },
    });
    const withoutStores = buildTools("openai", {
      ...everything,
      vectorStoreIds: [],
    }).map((tool) => tool.type);
    expect(withoutStores).not.toContain("file_search");
  });

  it("builds the xAI set (x_search included)", () => {
    const tools = buildTools("xai", everything);
    const types = tools.map((tool) => tool.type);
    expect(types).toEqual([
      "web_search",
      "x_search",
      "code_interpreter",
      "file_search",
      "mcp",
    ]);
    expect(tools.find((tool) => tool.type === "code_interpreter")).toEqual({
      type: "code_interpreter",
    });
  });

  it("emits MCP servers with approval disabled and rejects bad entries", () => {
    const [mcp] = buildTools("openai", {
      mcpServers: [{ label: "workspace", url: "http://localhost:9404/mcp" }],
    });
    expect(mcp).toEqual({
      type: "mcp",
      server_label: "workspace",
      server_url: "http://localhost:9404/mcp",
      require_approval: "never",
    });
    expect(
      buildTools("openai", {
        mcpServers: [{ label: "bad label!", url: "http://x/mcp" }],
      }),
    ).toEqual([]);
    expect(
      buildTools("openai", {
        mcpServers: [{ label: "ok", url: "ftp://x/mcp" }],
      }),
    ).toEqual([]);
  });
});

describe("tool activity extraction", () => {
  it("labels search calls with their queries", () => {
    expect(
      toolActivity({
        type: "response.output_item.added",
        item: {
          id: "ws_1",
          type: "web_search_call",
          action: { queries: ["next.js 16", "webpack"] },
        },
      }),
    ).toEqual({ id: "ws_1", label: "Web search: next.js 16, webpack" });
  });

  it("labels MCP calls with the tool name", () => {
    expect(
      toolActivity({
        type: "response.output_item.done",
        item: {
          id: "mcp_1",
          type: "mcp_call",
          name: "read_file",
          server_label: "workspace",
        },
      }),
    ).toEqual({ id: "mcp_1", label: "MCP · read_file" });
  });

  it("ignores plain message items and other events", () => {
    expect(
      toolActivity({
        type: "response.output_item.added",
        item: { id: "m1", type: "message" },
      }),
    ).toBeNull();
    expect(
      toolActivity({ type: "response.output_text.delta", delta: "x" }),
    ).toBeNull();
  });
});
