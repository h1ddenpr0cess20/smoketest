# smoketest

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./public/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./public/logo-light.svg">
  <img alt="smoketest — cross-provider coding assistant" src="./public/logo-light.svg">
</picture>

A focused, cross-provider coding assistant built around one protocol: the OpenAI Responses API.

> [!IMPORTANT]
> **Work in progress.** smoketest has received basic happy-path testing and the implemented features appear to work as intended, but it is still early software. Expect rough edges, provider API drift, and incomplete workflows. This is a small Responses API workbench—not a replacement for a mature coding agent such as Claude Code.

smoketest supports four Responses API-compatible targets:

- **OpenAI** — `https://api.openai.com/v1/responses`
- **xAI** — `https://api.x.ai/v1/responses`
- **LM Studio** — `http://127.0.0.1:1234/v1/responses`
- **Ollama** — `http://127.0.0.1:11434/v1/responses`

There are no Chat Completions adapters and no provider SDKs. The app sends the same minimal Responses request shape to every provider and consumes standard Responses streaming events.

## Features

- Ask, Plan, and Build coding modes
- Streaming Responses API output
- Switch providers while keeping the conversation transcript, making it possible to plan with one model and execute with another
- File and directory attachments as inline context, with browser-side parsing and local retrieval for larger document sets
- OpenAI and xAI provider tools, including web search, Code Interpreter, file search, and remote MCP; xAI also exposes X search
- Download buttons for provider-generated Code Interpreter files when the response contains usable file metadata
- OpenAI **Fast mode**, which sends Priority processing (`service_tier: "priority"`) when enabled
- Browser-local sessions, API keys, models, and preferences
- Provider model discovery through `GET /v1/models`
- Fixed provider endpoints to avoid arbitrary server-side request routing
- Responsive desktop and mobile workspace
- Smoke light theme and Ember dark theme
- Request cancellation and provider-aware error handling

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), choose a provider, and open **Provider settings**.

For LM Studio, start the local server from the Developer tab. For Ollama, make sure Ollama is running and the model entered in settings is installed.

## Cross-provider planning and execution

A useful experimental workflow is to use xAI or a local model for the **Plan** and/or **Build** stages, then switch the same session to OpenAI for Code Interpreter:

1. Develop the plan or draft with Grok, LM Studio, or Ollama.
2. Open **Provider settings**, switch to OpenAI, and enable **Code interpreter**.
3. Ask OpenAI to follow the plan, run the necessary code, and package the deliverables into a ZIP file.
4. If the response exposes the generated artifact, use its download button.

The transcript is sent again on each turn, so OpenAI can use the earlier plan. Code Interpreter only sees the conversation and files included in the request; it does not gain direct access to your local repository or filesystem. Attach any source material it needs, and explicitly ask it to create and link the ZIP.

## Generated-file caveats

Generated-file handling is provider-dependent and should be considered experimental.

- OpenAI Code Interpreter output collection and container-file downloads are wired through a same-origin proxy so API keys are not placed in browser-visible download URLs.
- A download button only appears when the provider returns a file ID or container-file citation that smoketest can identify. A model mentioning a filename in prose is not enough.
- Provider files can be temporary and tied to the API account or container that created them. Download important artifacts promptly and keep using the credential that generated them.
- xAI Code Interpreter is sent the smaller tool shape its API expects, avoiding the `non-auto container` error. Code execution may work while downloadable artifact metadata or file endpoints differ from OpenAI; xAI downloads are therefore best-effort.
- LM Studio and Ollama do not expose a compatible provider files API here, so they cannot produce download buttons through this mechanism.
- ZIP creation is performed by the selected model's Code Interpreter, not by smoketest itself. Ask for a ZIP explicitly when you want a single downloadable package.

## OpenAI Fast mode

The OpenAI-only **Fast mode** toggle requests Priority processing by adding `service_tier: "priority"` to send and regenerate requests. It requires eligible OpenAI API access and uses Priority processing pricing. The server ignores this setting for xAI and local providers.

## Privacy and trust boundary

Threads, attached file contents, API keys, and settings are stored in the browser's `localStorage`. Each request sends the selected credential to smoketest's same-origin route, which forwards it to the selected fixed provider endpoint for that request. The app does not persist credentials server-side.

This design makes local providers reachable from the Next.js server running on the same computer. If you deploy smoketest elsewhere, `127.0.0.1` refers to that deployment host—not the visitor's computer—so LM Studio and Ollama should be used with the app running locally.

## Quality checks

```bash
npm run check
npm run build
```

The automated suite covers request shaping, streaming event parsing, generated-file metadata and download proxying, document handling, retrieval, exports, and provider helpers. Basic manual smoke testing has also been performed, but the provider matrix has not been exhaustively tested across every model, account tier, tool combination, browser, or deployment topology.

## Docker

```bash
docker build -t smoketest .
docker run --rm -p 3000:3000 smoketest
```

The container exposes a health check at `/api/health`. Remember that local-provider URLs resolve from inside the container; reaching LM Studio or Ollama on the host may require platform-specific host networking or URL changes that smoketest does not currently expose.

## Project origin

smoketest grows out of the author's earlier **wordmark** and **darkwords** projects. After **Grok Build** was open-sourced, its codebase was adapted to that existing work to create **brainworm**, and then the next day, smoketest.
