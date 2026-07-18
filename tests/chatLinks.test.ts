import { describe, expect, it } from "vitest";
import { normalizeChatHref } from "../lib/chatLinks";

describe("chat links", () => {
  it("keeps fully qualified and non-web links unchanged", () => {
    expect(normalizeChatHref("https://example.com/docs")).toBe(
      "https://example.com/docs",
    );
    expect(normalizeChatHref("mailto:hello@example.com")).toBe(
      "mailto:hello@example.com",
    );
    expect(normalizeChatHref("#section")).toBe("#section");
    expect(normalizeChatHref(undefined)).toBeUndefined();
  });

  it("adds https to host-like markdown destinations", () => {
    expect(normalizeChatHref("example.com/docs?q=1")).toBe(
      "https://example.com/docs?q=1",
    );
    expect(normalizeChatHref("//example.com/docs")).toBe(
      "https://example.com/docs",
    );
  });

  it("uses http for local development hosts", () => {
    expect(normalizeChatHref("localhost:3000/health")).toBe(
      "http://localhost:3000/health",
    );
    expect(normalizeChatHref("127.0.0.1:11434/api/tags")).toBe(
      "http://127.0.0.1:11434/api/tags",
    );
  });

  it("leaves bare filenames alone even when the extension is a real TLD", () => {
    expect(normalizeChatHref("README.md")).toBe("README.md");
    expect(normalizeChatHref("package.json")).toBe("package.json");
    expect(normalizeChatHref("build.sh")).toBe("build.sh");
    expect(normalizeChatHref("lib.rs")).toBe("lib.rs");
  });

  it("preserves intentional relative paths", () => {
    expect(normalizeChatHref("docs/getting-started")).toBe(
      "docs/getting-started",
    );
    expect(normalizeChatHref("/api/health")).toBe("/api/health");
  });
});
