import { describe, expect, it } from "vitest";
import { exportFilename, exportMime, renderExport } from "../lib/export";
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
    expect(output).toContain("### You");
    expect(output).toContain("### smoketest (gpt-5.6)");
    expect(output.match(/^### /gm)).toHaveLength(2);
  });

  it("escapes HTML content", () => {
    const output = renderExport(thread, "html");
    expect(output).toContain("&lt;script&gt;");
    expect(output).not.toContain("<script>alert");
    expect(output).toContain('class="message user"');
    expect(output).toContain('class="content"');
  });

  it("renders markdown and the selected theme in HTML", () => {
    const markdownThread: Thread = {
      ...thread,
      messages: [
        {
          ...thread.messages[0],
          content: "## Heading\n\n**bold** and `code`\n\n- one\n- two",
        },
      ],
    };
    const output = renderExport(markdownThread, "html", "ember");
    expect(output).toContain("<h2>Heading</h2>");
    expect(output).toContain("<strong>bold</strong>");
    expect(output).toContain("<code>code</code>");
    expect(output).toContain("<li>one</li>");
    expect(output).toContain("--page:#0c0e0d");
  });

  it("sanitizes links and images and renders attachment metadata", () => {
    const richThread: Thread = {
      ...thread,
      messages: [
        {
          ...thread.messages[1],
          model: undefined,
          content:
            '[docs](https://example.com "Reference") [unsafe](javascript:alert(1))\n\n![diagram](https://example.com/logo.png "Logo") ![unsafe image](javascript:alert(2))',
          attachments: [
            {
              id: "a1",
              name: "notes <final>.md",
              content: "notes",
              size: 5,
            },
          ],
        },
      ],
    };
    const output = renderExport(richThread, "html");
    expect(output).toContain(
      '<a href="https://example.com" title="Reference">docs</a>',
    );
    expect(output).not.toContain('href="javascript:');
    expect(output).toContain(
      '<img src="https://example.com/logo.png" alt="diagram" title="Logo">',
    );
    expect(output).not.toContain('src="javascript:');
    expect(output).toContain("smoketest</span>");
    expect(output).toContain("notes &lt;final&gt;.md");
  });

  it("escapes CSV quotes and keeps newlines quoted", () => {
    const output = renderExport(thread, "csv");
    expect(output).toContain('"Why does this ""crash""?"');
    expect(output.split("\n")[0]).toBe(
      "timestamp,role,provider,model,mode,content",
    );
  });

  it("neutralizes spreadsheet formulas in CSV", () => {
    const formulaThread: Thread = {
      ...thread,
      messages: [{ ...thread.messages[0], content: "=SUM(A1:A2)" }],
    };
    expect(renderExport(formulaThread, "csv")).toContain('"\'=SUM(A1:A2)"');
  });

  it("round-trips JSON", () => {
    const parsed = JSON.parse(renderExport(thread, "json")) as {
      title: string;
      messages: unknown[];
    };
    expect(parsed.title).toBe("Fix the parser!");
    expect(parsed.messages).toHaveLength(2);
  });

  it("includes attachments in text, markdown, and JSON exports", () => {
    const attachedThread: Thread = {
      ...thread,
      messages: [
        {
          ...thread.messages[0],
          attachments: [
            { id: "a1", name: "context.txt", content: "context", size: 7 },
          ],
        },
      ],
    };
    expect(renderExport(attachedThread, "txt")).toContain(
      "Attachments: context.txt",
    );
    expect(renderExport(attachedThread, "md")).toContain(
      "> Attached: context.txt",
    );
    const json = JSON.parse(renderExport(attachedThread, "json")) as {
      messages: { attachments?: string[] }[];
    };
    expect(json.messages[0].attachments).toEqual(["context.txt"]);
  });

  it("builds a safe filename", () => {
    expect(exportFilename(thread, "md")).toBe("fix-the-parser.md");
    expect(exportFilename({ ...thread, title: "!!!" }, "txt")).toBe(
      "session.txt",
    );
    expect(exportMime("html")).toBe("text/html");
  });
});
