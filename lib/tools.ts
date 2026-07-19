import { PROVIDERS, type ProviderId } from "./providers";

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
    mcp: true,
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
  memory?: boolean;
  skills?: boolean;
  skillResources?: boolean;
};

// Client-side function tools, executed locally by app/page.tsx's
// streamAssistant rather than provider-managed like TOOL_SUPPORT above.
export const MEMORY_TOOL_NAMES = ["remember", "forget"] as const;
export type MemoryToolName = (typeof MEMORY_TOOL_NAMES)[number];

export function isMemoryToolName(value: unknown): value is MemoryToolName {
  return (
    typeof value === "string" &&
    (MEMORY_TOOL_NAMES as readonly string[]).includes(value)
  );
}

const MEMORY_TOOL_DEFINITIONS: Record<string, unknown>[] = [
  {
    type: "function",
    name: "remember",
    description:
      "Store a brief memory to personalize future responses. Use when the user specifically asks to remember a detail, or clearly implies they want it remembered. Do not overuse.",
    parameters: {
      type: "object",
      properties: {
        memory: {
          type: "string",
          description:
            "A concise summary of the memory (a few words to one or two sentences at most).",
        },
      },
      required: ["memory"],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "forget",
    description:
      "Forget a stored memory that matches a given keyword (case-insensitive substring). Use when the user asks to forget something.",
    parameters: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description:
            "Keyword to match against saved memories (case-insensitive substring).",
        },
      },
      required: ["keyword"],
      additionalProperties: false,
    },
    strict: false,
  },
];

// Skill tools: activate_skill loads a matching skill, read_skill_resource reads its bundled files.
export const SKILL_TOOL_NAMES = [
  "activate_skill",
  "read_skill_resource",
] as const;
export type SkillToolName = (typeof SKILL_TOOL_NAMES)[number];

export function isSkillToolName(value: unknown): value is SkillToolName {
  return (
    typeof value === "string" &&
    (SKILL_TOOL_NAMES as readonly string[]).includes(value)
  );
}

const SKILL_TOOL_DEFINITIONS: Record<string, unknown>[] = [
  {
    type: "function",
    name: "activate_skill",
    description:
      "Load the full instructions for one of the available skills before using it. Call this when a user's request matches a skill listed in the system prompt, then follow the returned instructions for the rest of your reply.",
    parameters: {
      type: "object",
      properties: {
        skill_id: {
          type: "string",
          description:
            "The id of the skill to activate, exactly as listed in the available skills.",
        },
      },
      required: ["skill_id"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "read_skill_resource",
    description:
      "Read a named reference file bundled with an activated skill. Call this only after activate_skill lists one or more resources for the skill.",
    parameters: {
      type: "object",
      properties: {
        skill_id: {
          type: "string",
          description: "The id of the skill that owns the resource.",
        },
        resource_name: {
          type: "string",
          description:
            "The exact name of the resource to read, as listed by activate_skill.",
        },
      },
      required: ["skill_id", "resource_name"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export const MCP_LABEL_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidMcpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Cloud providers (OpenAI, xAI) dial the MCP server from their own
// infrastructure, so a plain http:// URL — almost always localhost or a LAN
// address meant for a provider running on the same machine — is never
// reachable from there. Local providers run on the user's machine alongside
// smoketest, so http:// is fine for them. Gate on scheme rather than on the
// hostname since providers can't resolve the user's private network either
// way, and requiring https keeps the request itself encrypted in transit.
export function isMcpUrlAllowedForProvider(
  value: string,
  provider: ProviderId,
) {
  if (!isValidMcpUrl(value)) return false;
  if (PROVIDERS[provider].local) return true;
  return new URL(value).protocol === "https:";
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
      if (
        !MCP_LABEL_PATTERN.test(server.label) ||
        !isMcpUrlAllowedForProvider(server.url, provider)
      )
        continue;
      tools.push({
        type: "mcp",
        server_label: server.label,
        server_url: server.url,
        require_approval: "never",
      });
    }
  }
  if (request.memory) tools.push(...MEMORY_TOOL_DEFINITIONS);
  if (request.skills) {
    tools.push(SKILL_TOOL_DEFINITIONS[0]);
    if (request.skillResources) tools.push(SKILL_TOOL_DEFINITIONS[1]);
  }
  return tools;
}
