import { describe, expect, it } from "vitest";
import { exportFilename, renderExport } from "../lib/export";
import type { Thread } from "../lib/types";

const thread: Thread = {
  id: "t1",
  title: "Fix the parser!",
  createdAt: 1752000000000,
  updatedAt: 1752000600000,
  messages: [
    {
      id: "m1",
      role: "user",
      content: 'Why does this "crash"?',
      createdAt: 1752000000000,
      mode: "ask",
    },
    {
      id: "m2",
      role: "assistant",
      content: "Because of <script>alert(1)</script>\nline two",
      createdAt: 1752000300000,
      model: "gpt-5.6",
      provider: "openai",
    },
    { id: "m3", role: "assistant", content: "   ", createdAt: 1752000400000 },
  ],
};

describe("session export", () => {
  it("renders markdown with speakers and skips empty messages", () => {
    const output = renderExport(thread, "md");
    expect(output).toContain("# Fix the parser!");
    expect(output).toContain("## You");
    expect(output).toContain("## smoketest (gpt-5.6)");
    expect(output.match(/^## /gm)).toHaveLength(2);
  });

  it("escapes HTML content", () => {
    const output = renderExport(thread, "html");
    expect(output).toContain("&lt;script&gt;");
    expect(output).not.toContain("<script>alert");
  });

  it("escapes CSV quotes and keeps newlines quoted", () => {
    const output = renderExport(thread, "csv");
    expect(output).toContain('"Why does this ""crash""?"');
    expect(output.split("\n")[0]).toBe(
      "timestamp,role,provider,model,mode,content",
    );
  });

  it("round-trips JSON", () => {
    const parsed = JSON.parse(renderExport(thread, "json")) as {
      title: string;
      messages: unknown[];
    };
    expect(parsed.title).toBe("Fix the parser!");
    expect(parsed.messages).toHaveLength(2);
  });

  it("builds a safe filename", () => {
    expect(exportFilename(thread, "md")).toBe("fix-the-parser.md");
  });
});
