import { marked, Renderer } from "marked";
import type { Message, Thread } from "./types";

export type ExportFormatKey = "md" | "txt" | "html" | "json" | "csv";
export type ExportTheme = "smoke" | "ember";

export const EXPORT_FORMATS: {
  key: ExportFormatKey;
  label: string;
  mime: string;
}[] = [
  { key: "md", label: "Markdown", mime: "text/markdown" },
  { key: "txt", label: "Plain text", mime: "text/plain" },
  { key: "html", label: "HTML", mime: "text/html" },
  { key: "json", label: "JSON", mime: "application/json" },
  { key: "csv", label: "CSV", mime: "text/csv" },
];

const EXPORT_THEMES: Record<ExportTheme, Record<string, string>> = {
  smoke: {
    "--page": "#e6e5dd",
    "--surface": "#faf9f3",
    "--surface-alt": "#ecebe4",
    "--line": "#d8d8d0",
    "--ink": "#242724",
    "--muted": "#6e746e",
    "--accent": "#3e745b",
    "--accent-rgb": "62, 116, 91",
    "--warm": "#9b5b32",
    "--user-bg": "#e5ebe5",
    "--code-bg": "#23261f",
    "--code-ink": "#e6e3d5",
    "--code-line": "#3c4139",
  },
  ember: {
    "--page": "#0c0e0d",
    "--surface": "#181b19",
    "--surface-alt": "#131514",
    "--line": "#2d332f",
    "--ink": "#e8e7df",
    "--muted": "#969a91",
    "--accent": "#ff9b63",
    "--accent-rgb": "255, 155, 99",
    "--warm": "#ffd09a",
    "--user-bg": "#29231e",
    "--code-bg": "#101311",
    "--code-ink": "#ced5cf",
    "--code-line": "#2d332f",
  },
};

function speaker(message: Message) {
  const name =
    message.displayName || (message.role === "user" ? "You" : "smoketest");
  return `${name}${message.role === "assistant" && message.model ? ` (${message.model})` : ""}`;
}

function exportableMessages(thread: Thread) {
  return thread.messages.filter((message) => message.content.trim());
}

function stamp(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeExportUrl(value: string) {
  const url = value.trim();
  return /^(?:https?:|mailto:|#|\/(?!\/)|\.\.?\/)/i.test(url) ? url : "";
}

// Marked provides the same rich export structure as Wordmark. Raw HTML stays
// text, and unsafe link/image protocols are dropped from the standalone file.
function renderMarkdown(value: string) {
  const renderer = new Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  renderer.link = function ({ href, title, tokens }) {
    const label = this.parser.parseInline(tokens);
    const safeHref = safeExportUrl(href);
    if (!safeHref) return label;
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(safeHref)}"${titleAttribute}>${label}</a>`;
  };
  renderer.image = ({ href, title, text }) => {
    const safeHref = safeExportUrl(href);
    if (!safeHref) return escapeHtml(text);
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(text)}"${titleAttribute}>`;
  };
  return marked.parse(value, {
    async: false,
    gfm: true,
    renderer,
  }) as string;
}

function themeRoot(theme: ExportTheme) {
  const variables = EXPORT_THEMES[theme] ?? EXPORT_THEMES.smoke;
  return Object.entries(variables)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

function attachmentHtml(message: Message) {
  if (!message.attachments?.length) return "";
  const files = message.attachments
    .map((file) => `<li>${escapeHtml(file.name)}</li>`)
    .join("");
  return `<div class="attachments"><strong>Attachments</strong><ul>${files}</ul></div>`;
}

function htmlExport(thread: Thread, messages: Message[], theme: ExportTheme) {
  const messageSections = messages
    .map((message) => {
      const label = speaker(message);
      const initial = (
        message.displayName || (message.role === "user" ? "Y" : "S")
      )
        .slice(0, 1)
        .toUpperCase();
      return `<article class="message ${message.role}">
        <div class="avatar" aria-hidden="true">${initial}</div>
        <div class="bubble">
          <div class="meta"><span class="sender">${escapeHtml(label)}</span><time datetime="${stamp(message.createdAt)}">${stamp(message.createdAt)}</time></div>
          <div class="content">${renderMarkdown(message.content)}</div>
          ${attachmentHtml(message)}
        </div>
      </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="${theme === "ember" ? "dark" : "light"}">
  <title>${escapeHtml(thread.title)}</title>
  <style>
    :root{${themeRoot(theme)}}
    *{box-sizing:border-box}
    body{margin:0;padding:32px 16px;background:var(--page);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;line-height:1.65}
    .export{max-width:880px;margin:0 auto}
    header{margin-bottom:28px;padding-bottom:17px;border-bottom:1px solid var(--line)}
    header h1{margin:0 0 3px;font:italic 500 1.7rem Georgia,"Times New Roman",serif;overflow-wrap:anywhere}
    header p{margin:0;color:var(--muted);font-size:.82rem}
    .chat{display:flex;flex-direction:column;gap:16px}
    .message{display:flex;align-items:flex-start;align-self:flex-start;gap:12px;max-width:88%}
    .message.user{flex-direction:row-reverse;align-self:flex-end}
    .avatar{display:flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;margin-top:4px;border-radius:50%;background:var(--accent);color:var(--surface);font-size:.78rem;font-weight:750}
    .assistant .avatar{background:var(--warm);color:var(--page)}
    .bubble{min-width:0;padding:14px 18px;border:1px solid var(--line);border-radius:4px 14px 14px;background:var(--surface);box-shadow:0 2px 9px rgba(0,0,0,.1)}
    .user .bubble{border-radius:14px 4px 14px 14px;background:var(--user-bg)}
    .meta{display:flex;align-items:baseline;gap:9px;margin-bottom:7px}
    .user .meta{flex-direction:row-reverse}
    .sender{font-size:.84rem;font-weight:700}
    time{color:var(--muted);font-size:.68rem}
    .content{overflow-wrap:anywhere}
    .content>:first-child{margin-top:0}.content>:last-child{margin-bottom:0}
    .content p{margin:0 0 12px}
    .content h1,.content h2,.content h3,.content h4,.content h5,.content h6{margin:18px 0 8px;font-family:Georgia,"Times New Roman",serif;font-weight:500;line-height:1.3}
    .content h1{font-size:1.5rem}.content h2{font-size:1.3rem}.content h3{font-size:1.12rem}
    .content ul,.content ol{margin:8px 0 14px;padding-left:24px}.content li{margin-bottom:5px}.content li::marker{color:var(--accent)}
    .content blockquote{margin:14px 0;padding:8px 16px;border-left:3px solid var(--warm);border-radius:0 9px 9px 0;background:rgba(var(--accent-rgb),.07);color:var(--muted)}
    .content a{color:var(--accent);text-underline-offset:3px}
    .content hr{margin:18px 0;border:0;border-top:1px solid var(--line)}
    .content pre{max-width:100%;margin:11px 0;padding:14px 16px;overflow-x:auto;border:1px solid var(--code-line);border-radius:9px;background:var(--code-bg);color:var(--code-ink)}
    .content pre code{padding:0;border:0;background:transparent;color:inherit;font-size:.87rem;white-space:pre}
    .content code{padding:.12em .36em;border:1px solid var(--line);border-radius:5px;background:var(--surface-alt);font:0.88em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .content table{display:block;max-width:100%;margin:10px 0 14px;overflow-x:auto;border-collapse:collapse;font-size:.9rem}
    .content th,.content td{padding:8px 12px;border:1px solid var(--line);text-align:left;vertical-align:top}.content th{background:var(--surface-alt)}
    .content img{display:block;max-width:100%;height:auto;margin:12px 0;border-radius:8px}
    .attachments{margin-top:13px;padding-top:10px;border-top:1px solid var(--line);color:var(--muted);font-size:.76rem}.attachments strong{letter-spacing:.06em;text-transform:uppercase}.attachments ul{display:flex;flex-wrap:wrap;gap:6px;margin:7px 0 0;padding:0;list-style:none}.attachments li{padding:3px 7px;border:1px solid var(--line);border-radius:5px;background:var(--surface-alt)}
    footer{margin-top:28px;text-align:center;color:var(--muted);font-size:.76rem}
    @media(max-width:640px){body{padding:20px 10px}.message{max-width:96%}.bubble{padding:12px 14px}.avatar{display:none}}
    @media print{body{padding:0;background:#fff;color:#111}.bubble{box-shadow:none}.message{max-width:94%}footer{display:none}}
  </style>
</head>
<body>
  <div class="export">
    <header><h1>${escapeHtml(thread.title)}</h1><p>Exported ${stamp(thread.updatedAt)}</p></header>
    <main class="chat">${messageSections}</main>
    <footer>Generated by smoketest</footer>
  </div>
</body>
</html>`;
}

function csvValue(value: string) {
  const guarded =
    /^[=+\-@\t\r]/.test(value) && !/^-?\d/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function renderExport(
  thread: Thread,
  format: ExportFormatKey,
  theme: ExportTheme = "smoke",
): string {
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
          roundtableRunId: message.roundtableRunId,
          participantId: message.participantId,
          displayName: message.displayName,
          participantColor: message.participantColor,
          createdAt: stamp(message.createdAt),
          attachments: message.attachments?.map((file) => file.name),
        })),
      },
      null,
      2,
    );
  }

  if (format === "csv") {
    const rows = [
      ["timestamp", "role", "provider", "model", "mode", "content"].join(","),
    ];
    for (const message of messages) {
      rows.push(
        [
          stamp(message.createdAt),
          message.role,
          message.provider ?? "",
          message.model ?? "",
          message.mode ?? "",
          message.content,
        ]
          .map(csvValue)
          .join(","),
      );
    }
    return rows.join("\n");
  }

  if (format === "txt") {
    return [
      `${thread.title}\nExported ${stamp(thread.updatedAt)}`,
      ...messages.map((message) => {
        const attachments = message.attachments?.length
          ? `\nAttachments: ${message.attachments.map((file) => file.name).join(", ")}`
          : "";
        return `${speaker(message)}:\n${message.content}${attachments}`;
      }),
    ].join("\n\n");
  }

  if (format === "html") return htmlExport(thread, messages, theme);

  return [
    `# ${thread.title}`,
    `_Exported ${stamp(thread.updatedAt)}_`,
    ...messages.map((message) => {
      const attachments = message.attachments?.length
        ? `\n\n> Attached: ${message.attachments.map((file) => file.name).join(", ")}`
        : "";
      return `### ${speaker(message)}\n\n_${stamp(message.createdAt)}_\n\n${message.content}${attachments}`;
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
  return (
    EXPORT_FORMATS.find((item) => item.key === format)?.mime ?? "text/plain"
  );
}
