# smoketest

A focused, cross-provider coding assistant built around one protocol: the OpenAI Responses API.

smoketest supports four Responses API-compatible targets:

- **OpenAI** — `https://api.openai.com/v1/responses`
- **xAI** — `https://api.x.ai/v1/responses`
- **LM Studio** — `http://127.0.0.1:1234/v1/responses`
- **Ollama** — `http://127.0.0.1:11434/v1/responses`

There are no Chat Completions adapters and no provider SDKs. The app sends the same minimal Responses request shape to every provider and consumes standard Responses streaming events.

## Features

- Ask, Plan, and Build coding modes
- Streaming Responses API output
- File attachments as inline code context (up to eight files, 200 KB each)
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

## Privacy and trust boundary

Threads, attached file contents, API keys, and settings are stored in the browser's `localStorage`. Each request sends the selected credential to smoketest's same-origin route, which forwards it to the selected fixed provider endpoint for that request. The app does not persist credentials server-side.

This design makes local providers reachable from the Next.js server running on the same computer. If you deploy smoketest elsewhere, `127.0.0.1` refers to that deployment host—not the visitor's computer—so LM Studio and Ollama should be used with the app running locally.

## Quality checks

```bash
npm run check
npm run build
```

## Project origin

smoketest is a separate project informed by the product shape of `brainworm`. It does not modify or depend on the brainworm repository.
