import { describe, expect, it } from "vitest";
import {
  authorizationHeaders,
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
