import type { Mode } from "./types";

export type CommandAction =
  | { type: "new" }
  | { type: "mcp" }
  | { type: "compact" }
  | { type: "search"; enabled: boolean | null }
  | { type: "effort"; effort: "low" | "medium" | "high" | null }
  | { type: "mode"; mode: Mode; prompt: string }
  | { type: "unknown"; command: string };

const MODE_COMMANDS: Record<string, Mode> = {
  "/ask": "ask",
  "/plan": "plan",
  "/build": "build",
};

// Shown in the composer command menu and the unknown-command notice.
export const COMMANDS: { command: string; hint: string }[] = [
  { command: "/ask", hint: "Switch to Ask mode (optionally with a prompt)" },
  { command: "/plan", hint: "Switch to Plan mode (optionally with a prompt)" },
  {
    command: "/build",
    hint: "Switch to Build mode (optionally with a prompt)",
  },
  { command: "/new", hint: "Start a new session" },
  { command: "/effort", hint: "Set reasoning effort: low, medium, or high" },
  { command: "/search", hint: "Toggle web search: on, off, or blank to flip" },
  { command: "/mcp", hint: "Open provider settings at the tool configuration" },
  {
    command: "/compact",
    hint: "Summarize older turns to free up history budget",
  },
];

export function parseCommand(input: string): CommandAction | null {
  const text = input.trim();
  if (!text.startsWith("/")) return null;
  const separator = text.search(/\s/);
  const rawCommand = separator === -1 ? text : text.slice(0, separator);
  const command = rawCommand.toLowerCase();
  // Keep the remainder verbatim so multi-line prompts after /plan survive.
  const remainder = separator === -1 ? "" : text.slice(separator).trim();

  if (command === "/new") return { type: "new" };
  if (command === "/mcp") return { type: "mcp" };
  if (command === "/compact") return { type: "compact" };
  if (command === "/search") {
    // `null` asks the caller to flip the current setting, matching brainworm.
    return {
      type: "search",
      enabled: remainder === "on" ? true : remainder === "off" ? false : null,
    };
  }
  if (command === "/effort") {
    return {
      type: "effort",
      effort:
        remainder === "low" || remainder === "medium" || remainder === "high"
          ? remainder
          : null,
    };
  }
  const mode = MODE_COMMANDS[command];
  if (mode) return { type: "mode", mode, prompt: remainder };
  return { type: "unknown", command };
}
