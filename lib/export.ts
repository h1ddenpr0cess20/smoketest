import type { Message, Thread } from "./types";

export type ExportFormatKey = "md" | "txt" | "html" | "json" | "csv";

export const EXPORT_FORMATS: { key: ExportFormatKey; label: string; mime: string }[] = [
  { key: "md", label: "Markdown", mime: "text/markdown" },
  { key: "txt", label: "Plain text", mime: "text/plain" },
  { key: "html", label: "HTML", mime: "text/html" },
  { key: "json", label: "JSON", mime: "application/json" },
  { key: "csv", label: "CSV", mime: "text/csv" },
];

function speaker(message: Message) {
  return message.role === "user" ? "You" : `smoketest${message.model ? ` (${message.model})` : ""}`;
}

function exportableMessages(thread: Thread) {
  return thread.messages.filter((message) => message.content.trim());
}

function stamp(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderExport(thread: Thread, format: ExportFormatKey): string {
  const messages = exportableMessages(thread);

  if (format === "json") {
    return JSON.stringify(
      {
        title: thread.title,
        createdAt: stamp(thread.createdAt),
        updatedAt: stamp(thread.updatedAt),
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
          model: message.model,
          provider: message.provider,
          mode: message.mode,
          createdAt: stamp(message.createdAt),
          attachments: message.attachments?.map((file) => file.name),
        })),
      },
      null,
      2,
    );
  }

  if (format === "csv") {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [["timestamp", "role", "provider", "model", "mode", "content"].join(",")];
    for (const message of messages) {
      rows.push(
        [stamp(message.createdAt), message.role, message.provider ?? "", message.model ?? "", message.mode ?? "", message.content]
          .map(escape)
          .join(","),
      );
    }
    return rows.join("\n");
  }

  if (format === "txt") {
    return [
      `${thread.title}\n${"=".repeat(Math.max(thread.title.length, 1))}`,
      ...messages.map(
        (message) => `${speaker(message)} — ${new Date(message.createdAt).toLocaleString()}\n${message.content}`,
      ),
    ].join("\n\n");
  }

  if (format === "html") {
    const body = messages
      .map(
        (message) =>
          `<article class="${message.role}"><h2>${escapeHtml(speaker(message))}</h2><time>${stamp(message.createdAt)}</time><pre>${escapeHtml(message.content)}</pre></article>`,
      )
      .join("\n");
    return [
      "<!doctype html>",
      '<html lang="en"><head><meta charset="utf-8" />',
      `<title>${escapeHtml(thread.title)}</title>`,
      "<style>body{max-width:820px;margin:2rem auto;padding:0 1rem;font-family:ui-sans-serif,system-ui,sans-serif;color:#242724;background:#f4f3ed}h1{font-family:Georgia,serif;font-weight:400}article{margin:1.5rem 0;padding:1rem;border:1px solid #d3d4ce;border-radius:8px;background:#fdfcf6}article.user{background:#efeee8}h2{margin:0;font-size:.85rem}time{color:#7c817b;font-size:.7rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;margin:.6rem 0 0}</style>",
      "</head><body>",
      `<h1>${escapeHtml(thread.title)}</h1>`,
      body,
      "</body></html>",
    ].join("\n");
  }

  return [
    `# ${thread.title}`,
    ...messages.map((message) => {
      const attachments = message.attachments?.length
        ? `\n\n> Attached: ${message.attachments.map((file) => file.name).join(", ")}`
        : "";
      return `## ${speaker(message)}\n\n${message.content}${attachments}`;
    }),
  ].join("\n\n");
}

export function exportFilename(thread: Thread, format: ExportFormatKey) {
  const slug =
    thread.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "session";
  return `${slug}.${format}`;
}

export function exportMime(format: ExportFormatKey) {
  return EXPORT_FORMATS.find((item) => item.key === format)?.mime ?? "text/plain";
}
