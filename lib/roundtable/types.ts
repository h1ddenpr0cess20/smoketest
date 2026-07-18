export const ROUNDTABLE_TOOL_KEYS = [
  "webSearch",
  "xSearch",
  "codeInterpreter",
  "fileSearch",
  "mcp",
] as const;

export type RoundtableToolKey = (typeof ROUNDTABLE_TOOL_KEYS)[number];

export type RoundtableParticipant = {
  id: string;
  name: string;
  perspective: string;
  color: string;
  toolKeys: RoundtableToolKey[];
};

export type RoundtableConfig = {
  participants: RoundtableParticipant[];
  userDisplayName?: string;
};

export type RoundtableStatus =
  | "off"
  | "running"
  | "pausing"
  | "paused"
  | "ready"
  | "stopped"
  | "synthesizing";

export type RoundtableProgress = {
  spokenParticipantIds: string[];
  lastSpokenTurn: Record<string, number>;
  turnCount: number;
  readySignals: number;
};
