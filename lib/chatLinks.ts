const HOST_LIKE_URL =
  /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?(?:[/?#]|$)/i;

// Bare filenames ("README.md", "package.json") satisfy the host pattern —
// several code-file extensions are real TLDs (.md, .sh, .rs) — but in chat
// they're far more likely file references than domains, so they stay
// untouched.
const FILE_LIKE_NAME =
  /^[\w.-]+\.(?:md|markdown|txt|json|jsonc|yaml|yml|toml|ini|cfg|conf|env|lock|ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|rb|php|cs|sh|bash|zsh|c|h|cpp|hpp|css|scss|html|htm|xml|sql|csv|tsv|log|pdf|png|jpe?g|gif|svg|webp|ico|zip|gz|tar)$/i;

/**
 * Markdown treats a destination without a scheme as a relative path. Provider
 * responses commonly omit that scheme, which would otherwise send users to
 * the same path on the smoketest origin instead of the intended website.
 */
export function normalizeChatHref(href: string | undefined) {
  if (!href) return href;
  const value = href.trim();
  if (value.startsWith("//")) return `https:${value}`;
  if (FILE_LIKE_NAME.test(value)) return value;
  if (!HOST_LIKE_URL.test(value)) return value;
  const scheme = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::|\/|$)/i.test(value)
    ? "http"
    : "https";
  return `${scheme}://${value}`;
}
