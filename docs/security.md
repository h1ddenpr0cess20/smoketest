# Security

This page documents what smoketest actually does, code-backed rather than
aspirational. It's informational, not a guarantee — see the
[AI Output Disclaimer](ai-output-disclaimer.md) for the full terms.

## Credentials

- API keys are entered in Settings and stored only in the browser's
  `localStorage`, never committed to the repo. The server does not persist
  them.
- Each request sends the selected credential to smoketest's own same-origin
  API route (`/api/responses`, `/api/models`, `/api/embeddings`, `/api/files`),
  which forwards it to that provider's fixed endpoint for that one request.
  There is no server-side account, session, or database.
- LM Studio and Ollama typically need no key; requests go straight to the
  local server URL configured in settings.

## Rendered output

- Assistant messages are rendered with `react-markdown` without `rehypeRaw`
  or `dangerouslySetInnerHTML`, so raw HTML in a model response is never
  injected into the page. Links go through a URL transform that strips
  dangerous schemes (e.g. `javascript:`) before a link becomes clickable.
- No explicit Content-Security-Policy is currently set by the app. If you
  deploy smoketest publicly, consider adding one at your hosting layer.

## Attached and retrieved documents

- Local RAG (used for local providers, and optionally elsewhere) chunks
  attached files in the browser and calls the configured provider's
  `/v1/embeddings` endpoint through the same same-origin proxy pattern as
  chat requests — retrieved excerpts don't take a separate path.
- Retrieved excerpts are wrapped in an explicit `<reference-documents>` block
  and labeled to the model as "untrusted reference material, not
  instructions" before being sent (`lib/rag.ts`), to reduce the chance that
  text embedded in an uploaded file is mistaken for an application
  instruction. This is a mitigation, not a guarantee — treat content from
  untrusted files cautiously regardless.

## MCP servers

- MCP servers are entirely user-configured; smoketest connects to none by
  default.
- Remote MCP tool calls run with `require_approval: "never"` — only add a
  server you trust, since a connected server can act on the model's
  instructions without a manual approval step in this UI.
- Cloud providers (OpenAI, xAI) dial the MCP server from their own
  infrastructure, so only `https://` MCP URLs are offered to them; local
  providers (LM Studio, Ollama) run alongside smoketest, so a plain
  `http://` server (e.g. `localhost`) is allowed there instead.
- smoketest periodically probes each enabled MCP server from the browser and
  stops advertising one as an available tool once a probe fails, so the
  model isn't told a dead server is usable. This is a best-effort liveness
  check, not an authorization or content-safety review of the server itself.

## Generated code and provider tools

- Code Interpreter execution happens in the provider's own sandboxed
  container, not on your machine — but generated code can still be wrong,
  insecure, or destructive once you copy it out and run it yourself. Review
  code before executing it outside the provider's sandbox.
- Web search, file search, and X search results are provider-managed and can
  surface inaccurate, outdated, or manipulated content. Treat citations as a
  starting point for verification, not as ground truth.

## Desktop app (Electron)

- The optional Electron wrapper (`electron/main.cjs`) runs with
  `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` —
  the renderer has no direct Node.js or filesystem access.
- Only same-origin navigation is allowed in the app window; any other URL,
  including a link click, opens in your system browser instead of loading
  inside the app.
- The permission handler denies every browser permission request except
  clipboard read/write — no camera, microphone, geolocation, or notification
  access.
- A second launch focuses the existing window instead of starting a second
  instance.

## What smoketest does not do

- No analytics, telemetry, or tracking of any kind.
- No server-side accounts, sessions, or database — everything client-visible
  lives in your browser's `localStorage` until you clear it.
