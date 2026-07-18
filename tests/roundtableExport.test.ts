import { describe, expect, it } from "vitest";
import { renderExport } from "../lib/export";
import type { Thread } from "../lib/types";

describe("roundtable export", () => {
  const thread: Thread = {
    id: "roundtable-thread",
    title: "Plan a parser",
    createdAt: 1752000000000,
    updatedAt: 1752000300000,
    messages: [
      {
        id: "participant-turn",
        role: "assistant",
        content: "Check the trust boundary.",
        createdAt: 1752000300000,
        model: "test-model",
        roundtableRunId: "run-1",
        participantId: "security",
        displayName: "Security Reviewer",
        participantColor: "#7653b7",
      },
    ],
  };

  it("preserves participant identity in human-readable and JSON exports", () => {
    expect(renderExport(thread, "md")).toContain(
      "### Security Reviewer (test-model)",
    );
    expect(JSON.parse(renderExport(thread, "json")).messages[0]).toMatchObject({
      roundtableRunId: "run-1",
      participantId: "security",
      displayName: "Security Reviewer",
      participantColor: "#7653b7",
    });
  });
});
