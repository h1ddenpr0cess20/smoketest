const HOST_LIKE_URL =
  /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?(?:[/?#]|$)/i;

/**
 * Markdown treats a destination without a scheme as a relative path. Provider
 * responses commonly omit that scheme, which would otherwise send users to
 * the same path on the smoketest origin instead of the intended website.
 */
export function normalizeChatHref(href: string | undefined) {
  if (!href) return href;
  const value = href.trim();
  if (value.startsWith("//")) return `https:${value}`;
  if (!HOST_LIKE_URL.test(value)) return value;
  const scheme = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::|\/|$)/i.test(value)
    ? "http"
    : "https";
  return `${scheme}://${value}`;
}
