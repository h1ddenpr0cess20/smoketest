import { describe, expect, it } from "vitest";
import {
  authorizationHeaders,
  isChatModel,
  isProviderId,
  providerEndpoint,
} from "../lib/providers";

describe("provider registry", () => {
  it("accepts only supported providers", () => {
    expect(isProviderId("openai")).toBe(true);
    expect(isProviderId("ollama")).toBe(true);
    expect(isProviderId("anthropic")).toBe(false);
    expect(isProviderId(null)).toBe(false);
  });

  it("pins provider endpoints", () => {
    expect(providerEndpoint("xai", "responses")).toBe(
      "https://api.x.ai/v1/responses",
    );
    expect(providerEndpoint("lmstudio", "models")).toBe(
      "http://127.0.0.1:1234/v1/models",
    );
  });

  it("uses harmless placeholder auth for local servers", () => {
    expect(authorizationHeaders("ollama", "").Authorization).toBe(
      "Bearer ollama",
    );
    expect(authorizationHeaders("openai", "sk-test").Authorization).toBe(
      "Bearer sk-test",
    );
    expect(authorizationHeaders("lmstudio", "").Authorization).toBe(
      "Bearer lm-studio",
    );
    expect(authorizationHeaders("openai", "").Authorization).toBeUndefined();
  });
});

describe("isChatModel", () => {
  it("keeps OpenAI chat and reasoning models", () => {
    expect(isChatModel("openai", "gpt-4.1")).toBe(true);
    expect(isChatModel("openai", "gpt-3.5-turbo")).toBe(true);
    expect(isChatModel("openai", "o3")).toBe(true);
    expect(isChatModel("openai", "o3-mini")).toBe(true);
  });

  it("drops OpenAI image, audio, and other specialized models", () => {
    expect(isChatModel("openai", "dall-e-3")).toBe(false);
    expect(isChatModel("openai", "gpt-image-1")).toBe(false);
    expect(isChatModel("openai", "whisper-1")).toBe(false);
    expect(isChatModel("openai", "tts-1")).toBe(false);
    expect(isChatModel("openai", "text-embedding-3-small")).toBe(false);
    expect(isChatModel("openai", "omni-moderation-latest")).toBe(false);
    expect(isChatModel("openai", "gpt-4o-realtime-preview")).toBe(false);
    expect(isChatModel("openai", "computer-use-preview")).toBe(false);
  });

  it("drops OpenAI dated snapshot variants", () => {
    expect(isChatModel("openai", "gpt-4-turbo-2024-04-09")).toBe(false);
  });

  it("keeps xAI grok chat models and drops media variants", () => {
    expect(isChatModel("xai", "grok-4.5")).toBe(true);
    expect(isChatModel("xai", "grok-2-image")).toBe(false);
    expect(isChatModel("xai", "grok-2-vision-1212")).toBe(false);
    expect(isChatModel("xai", "not-grok")).toBe(false);
  });

  it("drops embedding models for local providers only", () => {
    expect(isChatModel("lmstudio", "nomic-embed-text")).toBe(false);
    expect(isChatModel("lmstudio", "llama-3.1-8b")).toBe(true);
    expect(isChatModel("ollama", "mxbai-embed-large:latest")).toBe(false);
    expect(isChatModel("ollama", "qwen3:8b")).toBe(true);
  });
});
