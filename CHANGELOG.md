# Changelog

All notable changes to smoketest will be documented in this file.

## Unreleased

This is an early work-in-progress release. Basic happy-path testing indicates that the implemented features work as intended, but the full provider, model, browser, and deployment matrix has not been exhaustively tested.

### Added

- Cross-provider Ask, Plan, and Build sessions for OpenAI, xAI, LM Studio, and Ollama.
- Provider-managed tools, local retrieval, document parsing, exports, and streamed tool activity.
- OpenAI Code Interpreter output discovery and proxied container-file downloads.
- An OpenAI-only Fast mode toggle backed by Priority processing.
- CI checks, coverage, dependency auditing, a production container, health checks, and tagged Docker publishing.

### Fixed

- xAI Code Interpreter now uses its implicit container form instead of OpenAI's expanded auto-container object, avoiding `Argument not supported: non-auto container` errors on Grok models.

### Known limitations

- This project is not intended to provide the autonomous repository access or mature workflow surface of Claude Code.
- Generated-file downloads depend on provider response metadata and temporary provider-side file availability.
- OpenAI generated-file downloads are the primary supported path; xAI artifacts are best-effort, and local providers have no compatible files API in smoketest.
- Provider APIs and supported tool shapes can change independently of this project.

### Origin

- Builds on the author's earlier wordmark and darkwords projects. Grok Build was then open-sourced and adapted to that existing work to create smoketest; brainworm came afterward and informed later refinements.
