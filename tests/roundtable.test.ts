import { describe, expect, it } from "vitest";
import {
  canAcceptReady,
  directlyAddressedParticipant,
  discussionLines,
  effectiveToolRequest,
  forceAnotherTurn,
  initialProgress,
  latestDiscussionWindow,
  leastRecentlyHeard,
  moderatorPrompt,
  parseModeratorDecision,
  participantPrompt,
  recordModeratorFailure,
  recordModeratorSuccess,
  recordParticipantTurn,
  shouldPauseAfterModeratorFailure,
} from "../lib/roundtable";
import type { Message, ProviderConfig } from "../lib/types";
import type { RoundtableParticipant } from "../lib/roundtable/types";

const participants: RoundtableParticipant[] = [
  {
    id: "architect",
    name: "Architect",
    perspective: "System boundaries",
    color: "#b54a2f",
    toolKeys: ["webSearch", "fileSearch", "mcp"],
  },
  {
    id: "security",
    name: "Security Reviewer",
    perspective: "Abuse cases",
    color: "#7653b7",
    toolKeys: ["xSearch", "codeInterpreter"],
  },
];

const settings: ProviderConfig = {
  apiKey: "key",
  model: "model",
  priorityProcessing: false,
  webSearch: true,
  xSearch: true,
  codeInterpreter: false,
  fileSearch: true,
  vectorStoreId: "vs_1, vs_2",
  localRag: false,
  embeddingModel: "",
};

describe("roundtable moderator routing", () => {
  it("parses strict NEXT and READY responses", () => {
    expect(parseModeratorDecision("NEXT:architect", participants)).toEqual({
      type: "next",
      participantId: "architect",
    });
    expect(
      parseModeratorDecision("READY: Coverage is sufficient", participants),
    ).toEqual({ type: "ready", reason: "Coverage is sufficient" });
    expect(parseModeratorDecision("NEXT:unknown", participants)).toEqual({
      type: "invalid",
    });
    expect(
      parseModeratorDecision("Here is NEXT:architect", participants),
    ).toEqual({
      type: "invalid",
    });
  });

  it("routes a message naming exactly one participant directly", () => {
    expect(
      directlyAddressedParticipant("Architect, what changes?", participants)
        ?.id,
    ).toBe("architect");
    expect(
      directlyAddressedParticipant(
        "@Security Reviewer please challenge this",
        participants,
      )?.id,
    ).toBe("security");
    expect(
      directlyAddressedParticipant(
        "Architect and Security Reviewer, compare notes",
        participants,
      ),
    ).toBeUndefined();
    expect(
      directlyAddressedParticipant("architecture concerns", participants),
    ).toBeUndefined();
  });

  it("falls back to the least recently heard participant", () => {
    let progress = initialProgress();
    expect(leastRecentlyHeard(participants, progress).id).toBe("architect");
    progress = recordParticipantTurn(progress, "architect");
    expect(leastRecentlyHeard(participants, progress).id).toBe("security");
  });

  it("pauses only after three consecutive moderator failures", () => {
    let progress = initialProgress();
    progress = recordModeratorFailure(progress);
    progress = recordModeratorFailure(progress);
    expect(shouldPauseAfterModeratorFailure(progress)).toBe(false);
    progress = recordModeratorFailure(progress);
    expect(shouldPauseAfterModeratorFailure(progress)).toBe(true);
    expect(recordParticipantTurn(progress, "architect").moderatorFailures).toBe(
      3,
    );
    expect(recordModeratorSuccess(progress).moderatorFailures).toBe(0);
  });
});

describe("roundtable readiness", () => {
  it("rejects READY until every participant has spoken", () => {
    let progress = recordParticipantTurn(initialProgress(), "architect");
    expect(canAcceptReady(progress, participants)).toBe(false);
    progress = recordParticipantTurn(progress, "security");
    expect(canAcceptReady(progress, participants)).toBe(true);
  });

  it("Continue forces at least one additional turn", () => {
    let progress = recordParticipantTurn(initialProgress(), "architect");
    progress = recordParticipantTurn(progress, "security");
    progress = forceAnotherTurn(progress);
    expect(canAcceptReady(progress, participants)).toBe(false);
    progress = recordParticipantTurn(progress, "architect");
    expect(canAcceptReady(progress, participants)).toBe(true);
  });
});

describe("roundtable tool access", () => {
  const servers = [
    { label: "repo", url: "https://example.com/mcp", enabled: true },
    { label: "off", url: "https://example.com/off", enabled: false },
  ];

  it("intersects grants, enabled tools, and OpenAI support", () => {
    expect(
      effectiveToolRequest(participants[0], "openai", settings, servers),
    ).toEqual({
      webSearch: true,
      xSearch: false,
      codeInterpreter: false,
      fileSearch: true,
      vectorStoreIds: ["vs_1", "vs_2"],
      mcpServers: [{ label: "repo", url: "https://example.com/mcp" }],
    });
    expect(
      effectiveToolRequest(participants[1], "openai", settings, servers),
    ).toEqual({
      webSearch: false,
      xSearch: false,
      codeInterpreter: false,
      fileSearch: false,
      vectorStoreIds: [],
      mcpServers: [],
    });
  });

  it("keeps xAI-only grants effective and drops every provider tool locally", () => {
    expect(
      effectiveToolRequest(
        participants[1],
        "xai",
        { ...settings, codeInterpreter: true },
        servers,
      ),
    ).toMatchObject({ xSearch: true, codeInterpreter: true });
    expect(
      effectiveToolRequest(participants[0], "lmstudio", settings, servers),
    ).toEqual({
      webSearch: false,
      xSearch: false,
      codeInterpreter: false,
      fileSearch: false,
      vectorStoreIds: [],
      mcpServers: [],
    });
    expect(
      effectiveToolRequest(participants[0], "ollama", settings, servers),
    ).toEqual({
      webSearch: false,
      xSearch: false,
      codeInterpreter: false,
      fileSearch: false,
      vectorStoreIds: [],
      mcpServers: [],
    });
  });
});

describe("roundtable prompt context", () => {
  const messages: Message[] = Array.from({ length: 14 }, (_, index) => ({
    id: String(index),
    role: index % 2 ? "assistant" : "user",
    content: `line ${index}`,
    createdAt: index,
    roundtableRunId: "run",
    displayName: index % 2 ? "Architect" : "Pat",
    participantId: index % 2 ? "architect" : undefined,
  }));

  it("bounds participant and moderator discussion context to 12 lines", () => {
    const window = latestDiscussionWindow(messages, "run");
    expect(window).toHaveLength(12);
    expect(window[0]).toContain("line 2");
    const participant = participantPrompt("Ship it", window, "--- app.ts ---");
    expect(participant).toContain("Ship it");
    expect(participant).toContain("--- app.ts ---");
    expect(participant).not.toContain("Pat: line 0");
    expect(participant).not.toContain("Architect: line 1\n");
    const moderator = moderatorPrompt(
      { participants },
      "Ship it",
      window,
      false,
    );
    expect(moderator).toContain("READY is not allowed");
    expect(moderator).not.toContain("--- app.ts ---");
  });

  it("keeps the full transcript available for synthesis", () => {
    expect(discussionLines(messages, "run")).toHaveLength(14);
  });
});
