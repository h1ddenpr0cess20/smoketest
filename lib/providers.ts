export const PROVIDER_IDS = ["openai", "xai", "lmstudio", "ollama"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderDefinition = {
  id: ProviderId;
  name: string;
  shortName: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyRequired: boolean;
  local: boolean;
  accent: string;
  hint: string;
};

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    shortName: "OA",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.6",
    apiKeyRequired: true,
    local: false,
    accent: "#7ce4bb",
    hint: "Cloud · API key required",
  },
  xai: {
    id: "xai",
    name: "xAI",
    shortName: "xAI",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4.5",
    apiKeyRequired: true,
    local: false,
    accent: "#d8f076",
    hint: "Cloud · API key required",
  },
  lmstudio: {
    id: "lmstudio",
    name: "LM Studio",
    shortName: "LM",
    baseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "",
    apiKeyRequired: false,
    local: true,
    accent: "#d3a6ff",
    hint: "Local · port 1234",
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    shortName: "OL",
    baseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "qwen3:8b",
    apiKeyRequired: false,
    local: true,
    accent: "#ffb36b",
    hint: "Local · port 11434",
  },
};

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && PROVIDER_IDS.includes(value as ProviderId);
}

export function providerEndpoint(provider: ProviderId, resource: "responses" | "models") {
  return `${PROVIDERS[provider].baseUrl}/${resource}`;
}

// xAI's Responses endpoint rejects the `reasoning` parameter outright; every
// other supported provider accepts it (subject to the model-level check below).
export function serviceSupportsReasoning(provider: ProviderId) {
  return provider !== "xai";
}

// GPT-4-era models reject a reasoning-effort parameter; Grok models accept it
// only on "fast" variants; everything else accepts it.
export function modelSupportsReasoningEffort(model: string) {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith("gpt-4")) return false;
  if (normalized.startsWith("grok")) return normalized.includes("fast");
  return true;
}

export function supportsReasoning(provider: ProviderId, model: string) {
  return serviceSupportsReasoning(provider) && modelSupportsReasoningEffort(model);
}

export function authorizationHeaders(provider: ProviderId, apiKey: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  else if (provider === "ollama") headers.Authorization = "Bearer ollama";
  else if (provider === "lmstudio") headers.Authorization = "Bearer lm-studio";
  return headers;
}
