import type { ProviderId } from "./providers";

// Which provider-managed tools each Responses endpoint accepts: web_search,
// code_interpreter, and file_search (vector stores) on OpenAI and xAI,
// x_search on xAI only, and remote MCP servers on the cloud providers.
// Local servers run no server-side tools.
export const TOOL_SUPPORT: Record<
  ProviderId,
  {
    webSearch: boolean;
    xSearch: boolean;
    codeInterpreter: boolean;
    fileSearch: boolean;
    mcp: boolean;
  }
> = {
  openai: {
    webSearch: true,
    xSearch: false,
    codeInterpreter: true,
    fileSearch: true,
    mcp: true,
  },
  xai: {
    webSearch: true,
    xSearch: true,
    codeInterpreter: true,
    fileSearch: true,
    mcp: true,
  },
  lmstudio: {
    webSearch: false,
    xSearch: false,
    codeInterpreter: false,
    fileSearch: false,
    mcp: false,
  },
  ollama: {
    webSearch: false,
    xSearch: false,
    codeInterpreter: false,
    fileSearch: false,
    mcp: false,
  },
};

export type ToolRequest = {
  webSearch?: boolean;
  xSearch?: boolean;
  codeInterpreter?: boolean;
  fileSearch?: boolean;
  vectorStoreIds?: string[];
  mcpServers?: { label: string; url: string }[];
};

export const MCP_LABEL_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidMcpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Builds the Responses API `tools` array for a provider, silently dropping
// anything the provider does not support. Tool shapes follow wordmark's
// staticTools definitions. MCP approval is "never" because smoketest has no
// approval round-trip UI.
export function buildTools(
  provider: ProviderId,
  request: ToolRequest,
): Record<string, unknown>[] {
  const support = TOOL_SUPPORT[provider];
  const tools: Record<string, unknown>[] = [];
  if (support.webSearch && request.webSearch)
    tools.push({ type: "web_search" });
  if (support.xSearch && request.xSearch) tools.push({ type: "x_search" });
  if (support.codeInterpreter && request.codeInterpreter) {
    // xAI manages code-execution containers implicitly and rejects OpenAI's
    // expanded auto-container configuration as a non-auto container.
    tools.push(
      provider === "xai"
        ? { type: "code_interpreter" }
        : {
            type: "code_interpreter",
            container: { type: "auto", file_ids: [] },
          },
    );
  }
  const vectorStoreIds = (request.vectorStoreIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);
  if (support.fileSearch && request.fileSearch && vectorStoreIds.length) {
    tools.push({ type: "file_search", vector_store_ids: vectorStoreIds });
  }
  if (support.mcp) {
    for (const server of request.mcpServers ?? []) {
      if (!MCP_LABEL_PATTERN.test(server.label) || !isValidMcpUrl(server.url))
        continue;
      tools.push({
        type: "mcp",
        server_label: server.label,
        server_url: server.url,
        require_approval: "never",
      });
    }
  }
  return tools;
}
