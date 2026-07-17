import type { Mode } from "./types";

export type CommandAction =
  | { type: "new" }
  | { type: "effort"; effort: "low" | "medium" | "high" | null }
  | { type: "mode"; mode: Mode; prompt: string }
  | { type: "unknown"; command: string };

const MODE_COMMANDS: Record<string, Mode> = {
  "/ask": "ask",
  "/plan": "plan",
  "/build": "build",
};

export function parseCommand(input: string): CommandAction | null {
  const text = input.trim();
  if (!text.startsWith("/")) return null;
  const separator = text.search(/\s/);
  const rawCommand = separator === -1 ? text : text.slice(0, separator);
  const command = rawCommand.toLowerCase();
  // Keep the remainder verbatim so multi-line prompts after /plan survive.
  const remainder = separator === -1 ? "" : text.slice(separator).trim();

  if (command === "/new") return { type: "new" };
  if (command === "/effort") {
    return {
      type: "effort",
      effort:
        remainder === "low" || remainder === "medium" || remainder === "high" ? remainder : null,
    };
  }
  const mode = MODE_COMMANDS[command];
  if (mode) return { type: "mode", mode, prompt: remainder };
  return { type: "unknown", command };
}
