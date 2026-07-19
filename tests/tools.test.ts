import { describe, expect, it } from "vitest";
import {
  buildTools,
  isMcpUrlAllowedForProvider,
  isMemoryToolName,
  isSkillToolName,
} from "../lib/tools";
import { toolActivity } from "../lib/stream";

describe("provider tool building", () => {
  const everything = {
    webSearch: true,
    xSearch: true,
    codeInterpreter: true,
    fileSearch: true,
    vectorStoreIds: ["vs_123"],
    mcpServers: [{ label: "workspace", url: "https://mcp.example.com/mcp" }],
  };

  it("allows MCP for LM Studio and drops all tools for Ollama", () => {
    expect(buildTools("lmstudio", everything)).toEqual([
      {
        type: "mcp",
        server_label: "workspace",
        server_url: "https://mcp.example.com/mcp",
        require_approval: "never",
      },
    ]);
    expect(buildTools("ollama", everything)).toEqual([]);
  });

  it("allows plain http:// MCP servers for local providers only", () => {
    const local = {
      mcpServers: [{ label: "workspace", url: "http://localhost:9404/mcp" }],
    };
    expect(buildTools("lmstudio", local)).toEqual([
      {
        type: "mcp",
        server_label: "workspace",
        server_url: "http://localhost:9404/mcp",
        require_approval: "never",
      },
    ]);
    // Cloud providers run MCP calls from their own infrastructure and can
    // never reach a plain http:// (usually localhost/LAN) server.
    expect(buildTools("openai", local)).toEqual([]);
    expect(buildTools("xai", local)).toEqual([]);
  });

  it("exposes the provider gate used to filter the MCP server list", () => {
    expect(
      isMcpUrlAllowedForProvider("http://localhost:9404/mcp", "lmstudio"),
    ).toBe(true);
    expect(
      isMcpUrlAllowedForProvider("http://localhost:9404/mcp", "openai"),
    ).toBe(false);
    expect(
      isMcpUrlAllowedForProvider("https://mcp.example.com/mcp", "openai"),
    ).toBe(true);
    expect(isMcpUrlAllowedForProvider("not a url", "lmstudio")).toBe(false);
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
      mcpServers: [{ label: "workspace", url: "https://mcp.example.com/mcp" }],
    });
    expect(mcp).toEqual({
      type: "mcp",
      server_label: "workspace",
      server_url: "https://mcp.example.com/mcp",
      require_approval: "never",
    });
    expect(
      buildTools("openai", {
        mcpServers: [{ label: "bad label!", url: "https://x/mcp" }],
      }),
    ).toEqual([]);
    expect(
      buildTools("openai", {
        mcpServers: [{ label: "ok", url: "ftp://x/mcp" }],
      }),
    ).toEqual([]);
  });

  it("appends the memory tools for every provider when requested", () => {
    for (const provider of ["openai", "xai", "lmstudio", "ollama"] as const) {
      const tools = buildTools(provider, { memory: true });
      expect(tools.map((tool) => tool.name)).toEqual(["remember", "forget"]);
      expect(tools.every((tool) => tool.type === "function")).toBe(true);
    }
    expect(buildTools("openai", { memory: false })).toEqual([]);
    expect(buildTools("openai", {})).toEqual([]);
  });

  it("recognizes only the memory tool names", () => {
    expect(isMemoryToolName("remember")).toBe(true);
    expect(isMemoryToolName("forget")).toBe(true);
    expect(isMemoryToolName("other")).toBe(false);
    expect(isMemoryToolName(42)).toBe(false);
  });

  it("appends the skill tools for every provider when requested", () => {
    for (const provider of ["openai", "xai", "lmstudio", "ollama"] as const) {
      const withoutResources = buildTools(provider, { skills: true });
      expect(withoutResources.map((tool) => tool.name)).toEqual([
        "activate_skill",
      ]);
      const withResources = buildTools(provider, {
        skills: true,
        skillResources: true,
      });
      expect(withResources.map((tool) => tool.name)).toEqual([
        "activate_skill",
        "read_skill_resource",
      ]);
      expect(withResources.every((tool) => tool.type === "function")).toBe(
        true,
      );
    }
    expect(buildTools("openai", { skills: false })).toEqual([]);
    expect(
      buildTools("openai", { skills: false, skillResources: true }),
    ).toEqual([]);
  });

  it("recognizes only the skill tool names", () => {
    expect(isSkillToolName("activate_skill")).toBe(true);
    expect(isSkillToolName("read_skill_resource")).toBe(true);
    expect(isSkillToolName("other")).toBe(false);
    expect(isSkillToolName(42)).toBe(false);
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

  it("labels memory tool calls", () => {
    expect(
      toolActivity({
        type: "response.output_item.added",
        item: { id: "fc_1", type: "function_call", name: "remember" },
      }),
    ).toEqual({ id: "fc_1", label: "Remember" });
    expect(
      toolActivity({
        type: "response.output_item.added",
        item: { id: "fc_2", type: "function_call", name: "forget" },
      }),
    ).toEqual({ id: "fc_2", label: "Forget" });
    expect(
      toolActivity({
        type: "response.output_item.added",
        item: { id: "fc_3", type: "function_call", name: "other_tool" },
      }),
    ).toEqual({ id: "fc_3", label: "Function: other_tool" });
  });

  it("labels skill tool calls", () => {
    expect(
      toolActivity({
        type: "response.output_item.added",
        item: { id: "fc_4", type: "function_call", name: "activate_skill" },
      }),
    ).toEqual({ id: "fc_4", label: "Activate skill" });
    expect(
      toolActivity({
        type: "response.output_item.added",
        item: {
          id: "fc_5",
          type: "function_call",
          name: "read_skill_resource",
        },
      }),
    ).toEqual({ id: "fc_5", label: "Read skill resource" });
  });
});
