import { describe, expect, it } from "vitest";
import { authorizationHeaders, isProviderId, providerEndpoint, supportsReasoning } from "../lib/providers";

describe("provider registry", () => {
  it("accepts only supported providers", () => {
    expect(isProviderId("openai")).toBe(true);
    expect(isProviderId("ollama")).toBe(true);
    expect(isProviderId("anthropic")).toBe(false);
  });

  it("pins provider endpoints", () => {
    expect(providerEndpoint("xai", "responses")).toBe("https://api.x.ai/v1/responses");
    expect(providerEndpoint("lmstudio", "models")).toBe("http://127.0.0.1:1234/v1/models");
  });

  it("uses harmless placeholder auth for local servers", () => {
    expect(authorizationHeaders("ollama", "").Authorization).toBe("Bearer ollama");
    expect(authorizationHeaders("openai", "sk-test").Authorization).toBe("Bearer sk-test");
  });

  it("gates reasoning effort by provider and model", () => {
    expect(supportsReasoning("xai", "grok-4.5")).toBe(false);
    expect(supportsReasoning("openai", "gpt-4.1")).toBe(false);
    expect(supportsReasoning("openai", "gpt-5.6")).toBe(true);
    expect(supportsReasoning("ollama", "qwen3:8b")).toBe(true);
    expect(supportsReasoning("lmstudio", "")).toBe(true);
  });
});
