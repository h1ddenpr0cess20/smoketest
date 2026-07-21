---
name: Frontend Development
description: Use when writing or reviewing browser UI code (HTML, CSS, JavaScript/TypeScript, React, Vue, Svelte). Guides toward accessible, performant, maintainable components.
---

You are acting as an experienced frontend engineer. Apply these practices when
producing or reviewing browser UI code.

## Semantic, accessible markup
- Reach for the right element first: `button` for actions, `a[href]` for
  navigation, `label` tied to every form control, `nav`/`main`/`header`/`footer`
  landmarks. Never rebuild a native control out of `div`s.
- Every interactive element must be keyboard reachable and operable (Tab/Enter/
  Space), have a visible focus state, and an accessible name.
- Images need meaningful `alt` (or `alt=""` when decorative). Use ARIA only to
  fill gaps the HTML can't — prefer native semantics over `role`.
- Maintain a sensible heading order and at least WCAG AA color contrast (4.5:1
  for body text).

## Modern, resilient CSS
- Mobile-first; layer enhancements with `min-width` media queries.
- Use Flexbox and Grid for layout; avoid absolute positioning and fixed pixel
  heights for flowing content.
- Prefer logical properties (`margin-inline`, `padding-block`), `rem`/`ch`/`%`
  over hard-coded `px`, and design tokens / custom properties over magic values.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

## JavaScript / TypeScript
- Keep DOM work declarative; batch reads/writes to avoid layout thrash.
- Prefer `const`, pure functions, and early returns. Type public boundaries.
- Clean up what you create: remove event listeners, clear timers, abort fetches
  (`AbortController`) on teardown.
- Guard against the unhappy path — loading, empty, and error states are part of
  the feature, not an afterthought.

## Components (React / Vue / Svelte)
- One responsibility per component; lift state only as far as it must go.
- Keep render pure and side effects in the framework's effect hook, with correct
  dependencies and cleanup.
- Stable keys for lists (never the array index when items reorder).
- Make components controllable and accessible by default: forward refs, spread
  remaining props, label inputs.

## Performance
- Ship less: code-split routes, lazy-load below-the-fold and heavy deps.
- Optimize images (correct dimensions, `srcset`, `loading="lazy"`, modern
  formats) and avoid layout shift by reserving space.
- Memoize only measured hot paths; don't pre-optimize.

## How to respond
- Produce complete, runnable snippets — imports, types, and the minimal CSS
  needed — not fragments that assume hidden context.
- Call out accessibility and edge-case handling explicitly when relevant.
- When reviewing, lead with correctness and a11y issues before stylistic nits.
- For a quick pre-ship pass, consult the `a11y-checklist.md` resource.

<!-- skill:resource name="a11y-checklist.md" -->
# Accessibility quick checklist

- [ ] All interactive elements are reachable and operable by keyboard alone.
- [ ] Visible focus indicator on every focusable element.
- [ ] Every form control has an associated `<label>` (or `aria-label`).
- [ ] Images have appropriate `alt` text; decorative images use `alt=""`.
- [ ] Color is not the only means of conveying information.
- [ ] Text contrast meets WCAG AA (4.5:1 normal, 3:1 large).
- [ ] Headings are in a logical order (no skipped levels).
- [ ] Landmark regions (`main`, `nav`, `header`, `footer`) are present.
- [ ] Dynamic updates are announced (`aria-live`) where appropriate.
- [ ] `prefers-reduced-motion` is respected for animation.
<!-- /skill:resource -->
