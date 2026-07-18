import { describe, expect, it } from "vitest";
import {
  directlyAddressedParticipant,
  discussionLines,
  effectiveToolRequest,
  initialProgress,
  latestDiscussionWindow,
  leastRecentlyHeard,
  moderatorInstructions,
  moderatorPrompt,
  parseModeratorDecision,
  participantInstructions,
  participantPrompt,
  recordParticipantTurn,
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
  it("parses strict NEXT responses and rejects attempts to end the chat", () => {
    expect(parseModeratorDecision("NEXT:architect", participants)).toEqual({
      type: "next",
      participantId: "architect",
    });
    expect(
      parseModeratorDecision("READY: Coverage is sufficient", participants),
    ).toEqual({ type: "invalid" });
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

  it("limits the moderator to routing instead of ending the discussion", () => {
    const instructions = moderatorInstructions();
    expect(instructions).toContain("You only route turns");
    expect(instructions).toContain(
      "Never end, pause, summarize, or synthesize",
    );
    expect(instructions).not.toContain("READY:");
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

  it("bounds participant and moderator discussion context to 6 chat turns", () => {
    const window = latestDiscussionWindow(messages, "run");
    expect(window).toHaveLength(6);
    expect(window[0]).toContain("line 8");
    const participant = participantPrompt("Ship it", window, "--- app.ts ---");
    expect(participant).toContain("Ship it");
    expect(participant).toContain("--- app.ts ---");
    expect(participant).not.toContain("Pat: line 6");
    expect(participant).not.toContain("Architect: line 7\n");
    const moderator = moderatorPrompt({ participants }, "Ship it", window);
    expect(moderator).toContain("Select the participant");
    expect(moderator).not.toContain("READY");
    expect(moderator).not.toContain("--- app.ts ---");
  });

  it("asks for chat turns rather than per-speaker reports", () => {
    const instructions = participantInstructions(participants[0]);
    expect(instructions).toContain("group chat");
    expect(instructions).toContain("one to three short paragraphs");
    expect(instructions).toContain("Go longer only when");
    expect(instructions).toContain("Do not use headings");
    expect(instructions).toContain("do not cram all of these into every turn");
  });

  it("keeps the full transcript available for synthesis", () => {
    expect(discussionLines(messages, "run")).toHaveLength(14);
  });
});
