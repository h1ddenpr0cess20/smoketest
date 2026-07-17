"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, memo, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  eventErrorMessage,
  eventText,
  finalResponseText,
  incompleteReason,
  isErrorEvent,
  outputTextFromJson,
  parseSseBlock,
} from "@/lib/stream";
import { PROVIDERS, PROVIDER_IDS, serviceSupportsReasoning, type ProviderId } from "@/lib/providers";
import type { Attachment, Message, Mode, ProviderSettings, Thread } from "@/lib/types";

const STORAGE = {
  threads: "smoketest.threads.v1",
  settings: "smoketest.providers.v1",
  provider: "smoketest.provider.v1",
  mode: "smoketest.mode.v1",
  theme: "smoketest.theme.v1",
} as const;

const MODE_COPY: Record<Mode, { label: string; mark: string; description: string; instructions: string }> = {
  ask: {
    label: "Ask",
    mark: "?",
    description: "Understand code and explore options",
    instructions:
      "You are smoketest, a precise senior software engineer. Answer questions about the supplied code and context. Be candid about uncertainty. Prefer concise explanations and concrete examples. Do not claim to have changed or executed files.",
  },
  plan: {
    label: "Plan",
    mark: "◇",
    description: "Design a change before implementation",
    instructions:
      "You are smoketest in planning mode. Analyze the request and supplied code, then propose an implementation plan. Include affected files, key decisions, risks, and validation. Do not implement the change yet. Call out missing context explicitly.",
  },
  build: {
    label: "Build",
    mark: "↗",
    description: "Produce implementation-ready changes",
    instructions:
      "You are smoketest in build mode, a pragmatic coding assistant. Produce implementation-ready guidance and complete code or unified diffs where useful. Preserve the project's conventions, handle edge cases, and end with focused validation steps. Never claim you ran commands or modified files unless the user provided tool results proving it.",
  },
};

const STARTERS = [
  { eyebrow: "REVIEW", text: "Find the risky edge cases in this code" },
  { eyebrow: "DEBUG", text: "Trace this failure and propose the smallest fix" },
  { eyebrow: "BUILD", text: "Turn this requirement into an implementation" },
];

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function blankThread(): Thread {
  const now = Date.now();
  return { id: id(), title: "Untitled session", createdAt: now, updatedAt: now, messages: [] };
}

function defaultSettings(): ProviderSettings {
  return Object.fromEntries(
    PROVIDER_IDS.map((provider) => [provider, { apiKey: "", model: PROVIDERS[provider].defaultModel }]),
  ) as ProviderSettings;
}

// Stored state is untrusted: older shapes or hand-edited values must never
// crash the render, so restore field by field on top of the defaults.
function restoreSettings(saved: unknown): ProviderSettings {
  const merged = defaultSettings();
  if (saved && typeof saved === "object") {
    for (const provider of PROVIDER_IDS) {
      const entry = (saved as Record<string, { apiKey?: unknown; model?: unknown }>)[provider];
      if (!entry || typeof entry !== "object") continue;
      if (typeof entry.apiKey === "string") merged[provider].apiKey = entry.apiKey;
      if (typeof entry.model === "string") merged[provider].model = entry.model;
    }
  }
  return merged;
}

function restoreThreads(saved: unknown): Thread[] {
  if (!Array.isArray(saved)) return [blankThread()];
  const threads = saved
    .filter(
      (thread): thread is Thread =>
        Boolean(thread) &&
        typeof thread === "object" &&
        typeof (thread as Thread).id === "string" &&
        typeof (thread as Thread).title === "string" &&
        Array.isArray((thread as Thread).messages),
    )
    .map((thread) => ({
      ...thread,
      messages: thread.messages.filter(
        (message) =>
          Boolean(message) &&
          typeof message === "object" &&
          typeof message.content === "string" &&
          (message.role === "user" || message.role === "assistant"),
      ),
    }));
  return threads.length ? threads : [blankThread()];
}

function shortTitle(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 38 ? `${clean.slice(0, 38).trim()}…` : clean || "Untitled session";
}

function timeLabel(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function transcript(messages: Message[], next: string, attachments: Attachment[]) {
  const history = messages
    .filter((message) => message.content.trim())
    .map((message) => `${message.role === "user" ? "USER" : "ASSISTANT"}:\n${message.content}`)
    .join("\n\n");
  const files = attachments
    .map((file) => `--- ${file.name} ---\n${file.content}\n--- end ${file.name} ---`)
    .join("\n\n");
  return [history, files ? `ATTACHED CODE CONTEXT:\n${files}` : "", `USER:\n${next}`]
    .filter(Boolean)
    .join("\n\n");
}

function Icon({ name, size = 18 }: { name: "plus" | "settings" | "paperclip" | "send" | "stop" | "menu" | "trash" | "refresh" | "close"; size?: number }) {
  const paths: Record<typeof name, React.ReactNode> = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    paperclip: <path d="m20.5 11.5-8.8 8.8a6 6 0 0 1-8.5-8.5l9.5-9.5a4 4 0 0 1 5.7 5.7l-9.6 9.5A2 2 0 0 1 6 14.7l8.8-8.8" />,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2 5" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

// Memoized so a streaming update to one message doesn't re-render (and
// re-parse the markdown of) every other message in the conversation.
const MessageView = memo(function MessageView({ message, fallbackProvider }: { message: Message; fallbackProvider: ProviderId }) {
  const messageProvider = PROVIDERS[message.provider ?? fallbackProvider] ?? PROVIDERS[fallbackProvider];
  return (
    <article className={`message ${message.role} ${message.error ? "message-error" : ""}`}>
      <div className="message-rail">
        <span className="avatar">{message.role === "user" ? "YOU" : messageProvider.shortName}</span>
        <span className="rail-line" />
      </div>
      <div className="message-body">
        <div className="message-meta">
          <strong>{message.role === "user" ? "You" : "smoketest"}</strong>
          <span>{timeLabel(message.createdAt)}</span>
          {message.role === "assistant" && <><span>·</span><span>{message.model}</span></>}
        </div>
        {message.attachments?.length ? (
          <div className="message-files">{message.attachments.map((file) => <span key={file.id}>⌘ {file.name}</span>)}</div>
        ) : null}
        {message.content ? (
          <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
        ) : (
          <div className="thinking"><span /><span /><span /><small>reading the smoke</small></div>
        )}
      </div>
    </article>
  );
});

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState("");
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [settings, setSettings] = useState<ProviderSettings>(defaultSettings);
  const [mode, setMode] = useState<Mode>("ask");
  const [theme, setTheme] = useState<"smoke" | "ember">("smoke");
  const [reasoning, setReasoning] = useState("medium");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelStatus, setModelStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeId) ?? threads[0],
    [threads, activeId],
  );
  const currentProvider = PROVIDERS[provider];
  const currentSettings = settings[provider];

  useEffect(() => {
    const restoredThreads = (() => {
      try {
        return restoreThreads(JSON.parse(localStorage.getItem(STORAGE.threads) || "null"));
      } catch {
        return [blankThread()];
      }
    })();
    let restoredSettings: ProviderSettings | null = null;
    let restoredProvider: ProviderId | null = null;
    let restoredMode: Mode | null = null;
    let restoredTheme: "smoke" | "ember" | null = null;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.settings) || "null") as unknown;
      if (saved) restoredSettings = restoreSettings(saved);
      const savedProvider = localStorage.getItem(STORAGE.provider);
      if (savedProvider && PROVIDER_IDS.includes(savedProvider as ProviderId)) restoredProvider = savedProvider as ProviderId;
      const savedMode = localStorage.getItem(STORAGE.mode);
      if (savedMode && ["ask", "plan", "build"].includes(savedMode)) restoredMode = savedMode as Mode;
      const savedTheme = localStorage.getItem(STORAGE.theme);
      if (savedTheme === "smoke" || savedTheme === "ember") restoredTheme = savedTheme;
    } catch {
      // Invalid local state falls back to defaults.
    }
    queueMicrotask(() => {
      if (restoredSettings) setSettings(restoredSettings);
      if (restoredProvider) setProvider(restoredProvider);
      if (restoredMode) setMode(restoredMode);
      if (restoredTheme) setTheme(restoredTheme);
      setThreads(restoredThreads);
      setActiveId(restoredThreads[0].id);
      setHydrated(true);
    });
  }, []);

  // Threads change on every streamed delta; serializing them (attachments
  // included) to localStorage on each one froze the tab. Debounce the write and
  // never let a quota error escape into React.
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE.threads, JSON.stringify(threads));
      } catch {
        // Quota exceeded or storage unavailable — keep the in-memory state.
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [threads, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
      localStorage.setItem(STORAGE.provider, provider);
      localStorage.setItem(STORAGE.mode, mode);
      localStorage.setItem(STORAGE.theme, theme);
    } catch {
      // Storage unavailable — settings stay in memory for this session.
    }
  }, [settings, provider, mode, theme, hydrated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth" });
  }, [activeThread?.messages, streaming]);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
  }, [draft]);

  function createThread() {
    const thread = blankThread();
    setThreads((current) => [thread, ...current]);
    setActiveId(thread.id);
    setDraft("");
    setAttachments([]);
    setSidebarOpen(false);
  }

  function deleteThread(threadId: string) {
    if (streaming) return;
    const next = threads.filter((thread) => thread.id !== threadId);
    if (!next.length) {
      const replacement = blankThread();
      setThreads([replacement]);
      setActiveId(replacement.id);
      return;
    }
    setThreads(next);
    if (threadId === activeId) setActiveId(next[0].id);
  }

  function updateProviderSettings(patch: Partial<{ apiKey: string; model: string }>) {
    setSettings((current) => ({
      ...current,
      [provider]: { ...current[provider], ...patch },
    }));
  }

  async function discoverModels() {
    setModelStatus("Checking connection…");
    setModels([]);
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: currentSettings.apiKey }),
      });
      const body = (await response.json()) as { models?: string[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Connection failed");
      const available = body.models ?? [];
      setModels(available);
      setModelStatus(available.length ? `${available.length} models available` : "Connected — no models reported");
      if (!currentSettings.model && available[0]) updateProviderSettings({ model: available[0] });
    } catch (error) {
      setModelStatus(error instanceof Error ? error.message : "Connection failed");
    }
  }

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const next: Attachment[] = [];
    for (const file of files.slice(0, 8 - attachments.length)) {
      if (file.size > 200_000) continue;
      next.push({ id: id(), name: file.name, size: file.size, content: await file.text() });
    }
    setAttachments((current) => [...current, ...next].slice(0, 8));
    event.target.value = "";
  }

  function patchMessage(threadId: string, messageId: string, patch: Partial<Message>) {
    setThreads((current) =>
      current.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              updatedAt: Date.now(),
              messages: thread.messages.map((message) =>
                message.id === messageId ? { ...message, ...patch } : message,
              ),
            }
          : thread,
      ),
    );
  }

  async function submit(value = draft) {
    const prompt = value.trim();
    if (!prompt || streaming || !activeThread) return;
    if (!currentSettings.model.trim() || (currentProvider.apiKeyRequired && !currentSettings.apiKey.trim())) {
      setSettingsOpen(true);
      return;
    }

    const threadId = activeThread.id;
    const userMessage: Message = {
      id: id(),
      role: "user",
      content: prompt,
      createdAt: Date.now(),
      attachments,
      mode,
    };
    const assistantId = id();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      provider,
      model: currentSettings.model,
      mode,
    };
    const requestInput = transcript(activeThread.messages, prompt, attachments);
    const isFirst = activeThread.messages.length === 0;
    setThreads((current) =>
      current.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              title: isFirst ? shortTitle(prompt) : thread.title,
              updatedAt: Date.now(),
              messages: [...thread.messages, userMessage, assistantMessage],
            }
          : thread,
      ),
    );
    setDraft("");
    setAttachments([]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let streamedOutput = "";
    let lastFlush = 0;
    // Rendering every SSE delta re-parses the whole conversation's markdown and
    // re-renders the tree; at provider token rates that locked up the browser.
    // Cap UI updates to ~12/s and force a final flush when the stream settles.
    const flush = (force = false) => {
      const now = Date.now();
      if (!force && now - lastFlush < 80) return;
      lastFlush = now;
      patchMessage(threadId, assistantId, { content: streamedOutput });
    };

    try {
      const response = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          provider,
          apiKey: currentSettings.apiKey,
          model: currentSettings.model,
          input: requestInput,
          instructions: MODE_COPY[mode].instructions,
          reasoningEffort: reasoning,
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${currentProvider.name} returned ${response.status}.`);
      }

      if (contentType.includes("application/json")) {
        const body = (await response.json()) as unknown;
        const text = outputTextFromJson(body);
        patchMessage(threadId, assistantId, { content: text || "The provider returned no text output." });
      } else {
        if (!response.body) throw new Error("The provider returned an empty stream.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalText = "";
        let truncatedReason = "";
        const handleEvent = (event: ReturnType<typeof parseSseBlock>) => {
          if (!event) return;
          if (isErrorEvent(event)) {
            throw new Error(eventErrorMessage(event) || "The provider failed while generating.");
          }
          const fromFinal = finalResponseText(event);
          if (fromFinal) finalText = fromFinal;
          const reason = incompleteReason(event);
          if (reason) truncatedReason = reason;
          const delta = eventText(event);
          if (delta) {
            streamedOutput += delta;
            flush();
          }
        };
        while (true) {
          const { done, value: chunk } = await reader.read();
          buffer += decoder.decode(chunk, { stream: !done });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() ?? "";
          for (const block of blocks) handleEvent(parseSseBlock(block));
          if (done) break;
        }
        if (buffer.trim()) handleEvent(parseSseBlock(buffer));
        // Some providers only deliver text in the final response payload.
        if (!streamedOutput && finalText) streamedOutput = finalText;
        if (truncatedReason) {
          streamedOutput += `${streamedOutput ? "\n\n" : ""}_Response incomplete (${truncatedReason})._`;
        }
        if (streamedOutput) flush(true);
        else patchMessage(threadId, assistantId, { content: "The provider completed without text output." });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        // Keep whatever streamed before the stop, including the throttled tail.
        patchMessage(threadId, assistantId, {
          content: streamedOutput ? `${streamedOutput}\n\n_Generation stopped._` : "Generation stopped.",
        });
      } else {
        const message = error instanceof Error ? error.message : "Something went wrong.";
        patchMessage(threadId, assistantId, {
          content: streamedOutput ? `${streamedOutput}\n\n${message}` : message,
          error: true,
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  const canSend = Boolean(draft.trim() && currentSettings.model.trim() && !streaming);

  return (
    <main className="app-shell" data-theme={theme}>
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><strong>smoketest</strong><small>coding assistant</small></div>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><Icon name="close" /></button>
        </div>

        <button className="new-thread" onClick={createThread}><Icon name="plus" size={16} /> New session</button>

        <div className="sidebar-label"><span>SESSIONS</span><span>{threads.length}</span></div>
        <nav className="thread-list" aria-label="Sessions">
          {threads
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((thread) => (
              <div className={`thread-row ${thread.id === activeThread?.id ? "active" : ""}`} key={thread.id}>
                <button onClick={() => { setActiveId(thread.id); setSidebarOpen(false); }}>
                  <span className="thread-dot" />
                  <span className="thread-copy"><strong>{thread.title}</strong><small>{timeLabel(thread.updatedAt)}</small></span>
                </button>
                <button className="thread-delete" onClick={() => deleteThread(thread.id)} aria-label={`Delete ${thread.title}`}><Icon name="trash" size={14} /></button>
              </div>
            ))}
        </nav>

        <div className="provider-stack">
          <div className="sidebar-label"><span>PROVIDER</span><span className={`status-dot ${currentProvider.local ? "local" : "cloud"}`} /></div>
          <div className="provider-grid">
            {PROVIDER_IDS.map((item) => (
              <button
                key={item}
                className={provider === item ? "selected" : ""}
                style={{ "--provider": PROVIDERS[item].accent } as React.CSSProperties}
                onClick={() => { setProvider(item); setModels([]); setModelStatus(""); }}
                title={PROVIDERS[item].name}
              >
                <span>{PROVIDERS[item].shortName}</span>
                <small>{PROVIDERS[item].name}</small>
              </button>
            ))}
          </div>
          <button className="settings-button" onClick={() => setSettingsOpen(true)}>
            <Icon name="settings" size={16} /> Provider settings
            <span className={currentSettings.model ? "configured" : "needs-config"}>{currentSettings.model ? "Ready" : "Set up"}</span>
          </button>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}

      <section className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>
          <div className="session-heading">
            <span className="topbar-kicker">SESSION</span>
            <strong>{activeThread?.title ?? "Loading…"}</strong>
          </div>
          <div className="mode-switch" aria-label="Assistant mode">
            {(Object.keys(MODE_COPY) as Mode[]).map((item) => (
              <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>
                <span>{MODE_COPY[item].mark}</span>{MODE_COPY[item].label}
              </button>
            ))}
          </div>
          <div className="theme-switch" aria-label="Color theme">
            <button className={theme === "smoke" ? "active" : ""} onClick={() => setTheme("smoke")} title="Smoke light theme"><span>○</span> Smoke</button>
            <button className={theme === "ember" ? "active" : ""} onClick={() => setTheme("ember")} title="Ember dark theme"><span>●</span> Ember</button>
          </div>
          <button className="model-pill" onClick={() => setSettingsOpen(true)} style={{ "--provider": currentProvider.accent } as React.CSSProperties}>
            <span>{currentProvider.shortName}</span>
            <span className="model-pill-copy"><strong>{currentProvider.name}</strong><small>{currentSettings.model || "Choose model"}</small></span>
            <span className="chevron">⌄</span>
          </button>
        </header>

        <div className="conversation">
          {!activeThread?.messages.length ? (
            <div className="empty-state">
              <div className="smoke-orbit" aria-hidden="true"><i /><i /><i /></div>
              <p className="overline">RESPONSES API · FOUR PROVIDERS · ONE WORKSPACE</p>
              <h1>Make the change.<br /><em>Keep the signal.</em></h1>
              <p className="empty-copy">Attach code, choose how you want to work, and route the same focused session through OpenAI, xAI, LM Studio, or Ollama.</p>
              <div className="starter-grid">
                {STARTERS.map((starter) => (
                  <button key={starter.eyebrow} onClick={() => { setDraft(starter.text); textareaRef.current?.focus(); }}>
                    <span>{starter.eyebrow}</span><p>{starter.text}</p><b>↗</b>
                  </button>
                ))}
              </div>
              <div className="empty-foot"><span /><p><b>{MODE_COPY[mode].label} mode</b> · {MODE_COPY[mode].description}</p><span /></div>
            </div>
          ) : (
            <div className="message-list">
              {activeThread.messages.map((message) => (
                <MessageView key={message.id} message={message} fallbackProvider={provider} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="composer-zone">
          {attachments.length > 0 && (
            <div className="attachment-strip">
              {attachments.map((file) => (
                <span key={file.id}>⌘ {file.name}<button onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))} aria-label={`Remove ${file.name}`}>×</button></span>
              ))}
            </div>
          )}
          <form className="composer" onSubmit={onSubmit}>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={`Message ${currentSettings.model || currentProvider.name}…`}
              rows={1}
              aria-label="Message"
            />
            <div className="composer-actions">
              <div>
                <input ref={fileRef} type="file" multiple hidden onChange={(event) => void onFiles(event)} />
                <button type="button" className="attach-button" onClick={() => fileRef.current?.click()} title="Attach code files"><Icon name="paperclip" size={17} /> Attach</button>
                <span className="context-note">8 files · 200 KB each</span>
              </div>
              {streaming ? (
                <button type="button" className="send-button stop" onClick={() => abortRef.current?.abort()}><Icon name="stop" size={15} /> Stop</button>
              ) : (
                <button className="send-button" disabled={!canSend}><span>Send</span><Icon name="send" size={15} /></button>
              )}
            </div>
          </form>
          <p className="composer-foot">Keys and sessions stay in this browser. Requests pass through the local app server without persistence.</p>
        </div>
      </section>

      {settingsOpen && (
        <div className="dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-head">
              <div><span className="overline">CONNECTION</span><h2 id="settings-title">Provider settings</h2></div>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><Icon name="close" /></button>
            </div>
            <div className="settings-providers">
              {PROVIDER_IDS.map((item) => (
                <button key={item} className={provider === item ? "active" : ""} onClick={() => { setProvider(item); setModels([]); setModelStatus(""); }} style={{ "--provider": PROVIDERS[item].accent } as React.CSSProperties}>
                  <span>{PROVIDERS[item].shortName}</span><div><strong>{PROVIDERS[item].name}</strong><small>{PROVIDERS[item].hint}</small></div>
                </button>
              ))}
            </div>
            <div className="settings-form">
              <label>Responses API base URL<input value={currentProvider.baseUrl} readOnly /><small>Fixed preset for safer request routing.</small></label>
              <label>
                API key {currentProvider.apiKeyRequired ? <b>required</b> : <em>optional</em>}
                <input type="password" autoComplete="off" value={currentSettings.apiKey} onChange={(event) => updateProviderSettings({ apiKey: event.target.value })} placeholder={currentProvider.apiKeyRequired ? "Paste a provider key" : "Leave blank for local server"} />
                <small>Stored only in this browser&apos;s local storage.</small>
              </label>
              <label>
                Model
                <input list="available-models" value={currentSettings.model} onChange={(event) => updateProviderSettings({ model: event.target.value })} placeholder="Model identifier" />
                <datalist id="available-models">{models.map((model) => <option key={model} value={model} />)}</datalist>
              </label>
              <label>
                Reasoning effort
                <select value={reasoning} disabled={!serviceSupportsReasoning(provider)} onChange={(event) => setReasoning(event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
                <small>{serviceSupportsReasoning(provider) ? "Sent when the model accepts the standard reasoning parameter." : "xAI's Responses endpoint rejects the reasoning parameter, so it is not sent."}</small>
              </label>
            </div>
            <div className="connection-row">
              <button className="test-button" onClick={() => void discoverModels()}><Icon name="refresh" size={15} /> Test & discover models</button>
              <p className={modelStatus.toLowerCase().includes("could not") || modelStatus.toLowerCase().includes("failed") || modelStatus.toLowerCase().includes("requires") ? "bad" : ""}>{modelStatus}</p>
            </div>
            <div className="settings-note"><span>i</span><p><strong>Responses API only.</strong> smoketest sends the same <code>/v1/responses</code> request shape to every provider. Chat Completions and provider-specific SDKs are intentionally excluded.</p></div>
            <button className="save-settings" onClick={() => setSettingsOpen(false)} disabled={!currentSettings.model.trim() || (currentProvider.apiKeyRequired && !currentSettings.apiKey.trim())}>Use {currentProvider.name}</button>
          </section>
        </div>
      )}
    </main>
  );
}
