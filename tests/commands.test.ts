import { describe, expect, it } from "vitest";
import { COMMANDS, parseCommand } from "../lib/commands";

describe("composer commands", () => {
  it("ignores plain messages", () => {
    expect(parseCommand("explain this function")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });

  it("parses /new", () => {
    expect(parseCommand("/new")).toEqual({ type: "new" });
  });

  it("parses mode switches with an optional inline prompt", () => {
    expect(parseCommand("/plan")).toEqual({
      type: "mode",
      mode: "plan",
      prompt: "",
    });
    expect(parseCommand("/build add retry logic")).toEqual({
      type: "mode",
      mode: "build",
      prompt: "add retry logic",
    });
    expect(parseCommand("/ASK what does this do")).toEqual({
      type: "mode",
      mode: "ask",
      prompt: "what does this do",
    });
  });

  it("keeps multi-line prompts after a mode command", () => {
    expect(parseCommand("/plan refactor this:\nline two")).toEqual({
      type: "mode",
      mode: "plan",
      prompt: "refactor this:\nline two",
    });
  });

  it("parses /effort levels and rejects junk", () => {
    expect(parseCommand("/effort high")).toEqual({
      type: "effort",
      effort: "high",
    });
    expect(parseCommand("/effort turbo")).toEqual({
      type: "effort",
      effort: null,
    });
  });

  it("flags unknown commands", () => {
    expect(parseCommand("/wat now")).toEqual({
      type: "unknown",
      command: "/wat",
    });
  });

  it("parses /mcp", () => {
    expect(parseCommand("/mcp")).toEqual({ type: "mcp" });
  });

  it("parses /search on, off, and bare toggle", () => {
    expect(parseCommand("/search on")).toEqual({
      type: "search",
      enabled: true,
    });
    expect(parseCommand("/search off")).toEqual({
      type: "search",
      enabled: false,
    });
    expect(parseCommand("/search")).toEqual({ type: "search", enabled: null });
    expect(parseCommand("/search maybe")).toEqual({
      type: "search",
      enabled: null,
    });
  });

  it("keeps the command menu list in sync with the parser", () => {
    for (const item of COMMANDS) {
      const parsed = parseCommand(item.command);
      expect(parsed, item.command).not.toBeNull();
      expect(parsed?.type, item.command).not.toBe("unknown");
    }
  });
});
