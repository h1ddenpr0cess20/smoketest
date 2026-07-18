import type { ProviderId } from "../providers";
import { TOOL_SUPPORT, type ToolRequest } from "../tools";
import type { Message, ProviderConfig } from "../types";
import type {
  RoundtableConfig,
  RoundtableParticipant,
  RoundtableProgress,
  RoundtableToolKey,
} from "./types";

export type ModeratorDecision =
  | { type: "next"; participantId: string }
  | { type: "ready"; reason: string }
  | { type: "invalid" };

export const DISCUSSION_WINDOW_LINES = 12;

export function validParticipant(participant: RoundtableParticipant) {
  return Boolean(participant.name.trim() && participant.perspective.trim());
}

export function validRoundtableConfig(config: RoundtableConfig) {
  return config.participants.filter(validParticipant).length >= 2;
}

export function initialProgress(): RoundtableProgress {
  return {
    spokenParticipantIds: [],
    lastSpokenTurn: {},
    turnCount: 0,
    moderatorFailures: 0,
    readyEligibleAfterTurn: 0,
  };
}

export function parseModeratorDecision(
  text: string,
  participants: RoundtableParticipant[],
): ModeratorDecision {
  const value = text.trim();
  const next = /^NEXT\s*:\s*([^\s]+)\s*$/i.exec(value);
  if (next) {
    const participant = participants.find((item) => item.id === next[1]);
    return participant
      ? { type: "next", participantId: participant.id }
      : { type: "invalid" };
  }
  const ready = /^READY\s*:\s*([\s\S]+)$/i.exec(value);
  if (ready?.[1].trim()) return { type: "ready", reason: ready[1].trim() };
  return { type: "invalid" };
}

export function hasEveryoneSpoken(
  progress: RoundtableProgress,
  participants: RoundtableParticipant[],
) {
  const spoken = new Set(progress.spokenParticipantIds);
  return participants.every((participant) => spoken.has(participant.id));
}

export function canAcceptReady(
  progress: RoundtableProgress,
  participants: RoundtableParticipant[],
) {
  return (
    hasEveryoneSpoken(progress, participants) &&
    progress.turnCount >= progress.readyEligibleAfterTurn
  );
}

export function recordParticipantTurn(
  progress: RoundtableProgress,
  participantId: string,
): RoundtableProgress {
  const turnCount = progress.turnCount + 1;
  return {
    ...progress,
    turnCount,
    moderatorFailures: 0,
    spokenParticipantIds: progress.spokenParticipantIds.includes(participantId)
      ? progress.spokenParticipantIds
      : [...progress.spokenParticipantIds, participantId],
    lastSpokenTurn: {
      ...progress.lastSpokenTurn,
      [participantId]: turnCount,
    },
  };
}

export function forceAnotherTurn(
  progress: RoundtableProgress,
): RoundtableProgress {
  return {
    ...progress,
    readyEligibleAfterTurn: progress.turnCount + 1,
  };
}

export function recordModeratorFailure(progress: RoundtableProgress) {
  return { ...progress, moderatorFailures: progress.moderatorFailures + 1 };
}

export function shouldPauseAfterModeratorFailure(progress: RoundtableProgress) {
  return progress.moderatorFailures >= 3;
}

export function leastRecentlyHeard(
  participants: RoundtableParticipant[],
  progress: RoundtableProgress,
) {
  return [...participants].sort((left, right) => {
    const leftTurn = progress.lastSpokenTurn[left.id] ?? -1;
    const rightTurn = progress.lastSpokenTurn[right.id] ?? -1;
    return leftTurn - rightTurn;
  })[0];
}

function escapedName(name: string) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function directlyAddressedParticipant(
  text: string,
  participants: RoundtableParticipant[],
) {
  const mentioned = participants.filter((participant) => {
    const name = participant.name.trim();
    if (!name) return false;
    return new RegExp(`(^|\\W)@?${escapedName(name)}(?=$|\\W)`, "i").test(text);
  });
  return mentioned.length === 1 ? mentioned[0] : undefined;
}

export function effectiveToolRequest(
  participant: RoundtableParticipant,
  provider: ProviderId,
  settings: ProviderConfig,
  mcpServers: { label: string; url: string; enabled: boolean }[],
): ToolRequest {
  const granted = new Set<RoundtableToolKey>(participant.toolKeys);
  const support = TOOL_SUPPORT[provider];
  const enabled = (key: Exclude<RoundtableToolKey, "mcp">) =>
    granted.has(key) && support[key] && settings[key];
  return {
    webSearch: enabled("webSearch"),
    xSearch: enabled("xSearch"),
    codeInterpreter: enabled("codeInterpreter"),
    fileSearch: enabled("fileSearch"),
    vectorStoreIds: enabled("fileSearch")
      ? settings.vectorStoreId
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [],
    mcpServers:
      granted.has("mcp") && support.mcp
        ? mcpServers
            .filter((server) => server.enabled)
            .map(({ label, url }) => ({ label, url }))
        : [],
  };
}

export function discussionLines(messages: Message[], runId: string) {
  return messages
    .filter(
      (message) =>
        message.roundtableRunId === runId &&
        message.content.trim() &&
        !message.error,
    )
    .map(
      (message) =>
        `${message.displayName || (message.role === "user" ? "User" : "Participant")}: ${message.content.replace(/\s+/g, " ").trim()}`,
    );
}

export function latestDiscussionWindow(messages: Message[], runId: string) {
  return discussionLines(messages, runId).slice(-DISCUSSION_WINDOW_LINES);
}

export function participantInstructions(participant: RoundtableParticipant) {
  return [
    `You are ${participant.name}, participating in a coding-planning roundtable.`,
    `Your perspective: ${participant.perspective}`,
    "Deliberate only; do not provide full implementation patches or claim to edit files.",
    "Ground claims in supplied code context, expose assumptions, critique proposals, and identify concrete files, existing utilities, risks, and tests.",
    "Respond with a focused contribution to the discussion. Do not impersonate another participant or decide that the roundtable is complete.",
  ].join("\n");
}

export function participantPrompt(
  objective: string,
  lines: string[],
  sharedContext = "",
) {
  return [
    `ROUNDTABLE OBJECTIVE:\n${objective}`,
    sharedContext ? `SHARED REPOSITORY CONTEXT:\n${sharedContext}` : "",
    lines.length
      ? `LATEST DISCUSSION (${DISCUSSION_WINDOW_LINES}-line maximum):\n${lines.join("\n")}`
      : "LATEST DISCUSSION: No participant has spoken yet.",
    "Add the most useful next planning contribution.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function moderatorInstructions() {
  return [
    "You are a neutral moderator routing a coding-planning roundtable.",
    "Return exactly NEXT:<participant-id> to choose the most useful next speaker, or READY:<brief reason> when the discussion has sufficient coverage for synthesis.",
    "Do not add markdown or any other text.",
  ].join("\n");
}

export function moderatorPrompt(
  config: RoundtableConfig,
  objective: string,
  lines: string[],
  readyAllowed: boolean,
) {
  const roster = config.participants
    .filter(validParticipant)
    .map(
      (participant) =>
        `${participant.id}: ${participant.name} — ${participant.perspective}`,
    )
    .join("\n");
  return [
    `ROSTER:\n${roster}`,
    `OBJECTIVE:\n${objective}`,
    lines.length
      ? `LATEST DISCUSSION:\n${lines.join("\n")}`
      : "LATEST DISCUSSION: none",
    readyAllowed
      ? "READY is currently allowed."
      : "READY is not allowed yet; select NEXT.",
  ].join("\n\n");
}

export function synthesisInstructions() {
  return [
    "You are a neutral senior editor. Synthesize the completed planning roundtable into exactly one coherent implementation plan.",
    "Include Context, Recommended approach, Critical files, Existing utilities to reuse, Risks, Verification, Open questions, and Unresolved dissent.",
    "Preserve material disagreements instead of silently resolving them. Do not implement the change or produce full patches.",
  ].join("\n");
}

export function synthesisPrompt(objective: string, transcript: string[]) {
  return `OBJECTIVE:\n${objective}\n\nFULL ROUNDTABLE TRANSCRIPT:\n${transcript.join("\n\n")}`;
}
