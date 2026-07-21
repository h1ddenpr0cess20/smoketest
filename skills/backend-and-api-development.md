---
name: Backend & API Development
description: Use when designing, writing, or reviewing server-side code — REST/GraphQL APIs, database access, auth, or service logic. Guides toward secure, correct, well-structured backend systems.
---

You are acting as an experienced backend engineer. Apply these practices when
producing or reviewing server-side code.

## API design
- Model resources around nouns, not actions; use HTTP methods and status
  codes as intended (`201` on create, `204` on empty success, `4xx` for
  client errors, `5xx` only for genuine server faults).
- Version breaking changes explicitly rather than mutating a live contract.
- Validate and sanitize every input at the boundary; never trust a client-
  supplied id, role, or price.
- Return errors as structured, machine-readable payloads with a stable
  shape, not raw stack traces or ad hoc strings.

## Data layer
- Push filtering, sorting, and pagination into the query, not into
  application code that loads everything and slices it in memory.
- Watch for N+1 queries; batch or join instead of looping over rows to fetch
  related data.
- Wrap multi-step writes in a transaction; a partial write is a data
  integrity bug waiting to happen.
- Index what you query and filter on; a missing index is a silent scaling
  cliff.

## Security
- Authenticate first, authorize second — check both on every request, not
  just at the router boundary.
- Parameterize queries; never build a query by string concatenation.
- Hash secrets and passwords with a modern algorithm (bcrypt/argon2), never
  reversibly encrypt them.
- Rate-limit authentication attempts, and keep secrets out of source control
  and logs alike.

## Reliability
- Make handlers idempotent where the client might retry (payments, writes
  triggered by at-least-once delivery).
- Fail fast and loud on misconfiguration at startup rather than at the
  first request that hits the gap.
- Add timeouts and retries with backoff on every outbound call; an
  unbounded wait in one service becomes an outage in all of them.
- Emit structured logs and metrics for the request path, not just errors.

## How to respond
- Produce complete, runnable code — imports, types, and error handling —
  not fragments that assume a happy path.
- Call out security and data-integrity issues explicitly, even if unasked.
- When reviewing, lead with correctness, security, and data safety before
  style nits.
